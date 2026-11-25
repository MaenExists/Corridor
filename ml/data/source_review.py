"""Prepare a private review queue of possible dated seizures and documented district links."""

import calendar
from collections import Counter, defaultdict
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from bs4 import BeautifulSoup

from ml.data.real_input import DISTRICTS, private_write
from ml.data.source_api import DISTRICT_ALIASES, DISTRICT_ML, ROOT, START, cutoff_today, write_rows

ENFORCEMENT = re.compile(
    r"\b(?:seiz\w+|recover\w+|intercept\w+|transport\w*|carry\w*|carrying|"
    r"smuggl\w+|possess\w+|contraband)\b|പിടികൂടി|പിടിച്ചെടുത്തു|കടത്ത|കൊണ്ടുപോയ", re.I,
)
DATE_PATTERN = re.compile(r"\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b")
MONTH_NAMES = {name.casefold(): month
               for month in range(1, 13)
               for name in (calendar.month_name[month], calendar.month_abbr[month])}
MONTH_NAMES.update({name: month for month, name in enumerate((
    "ജനുവരി", "ഫെബ്രുവരി", "മാർച്ച്", "ഏപ്രിൽ", "മേയ്", "ജൂൺ", "ജൂലൈ", "ഓഗസ്റ്റ്",
    "സെപ്റ്റംബർ", "ഒക്ടോബർ", "നവംബർ", "ഡിസംബർ",
), 1)})
MONTH_WORD = "(?:" + "|".join(re.escape(name) for name in sorted(MONTH_NAMES, key=len, reverse=True)) + ")"
DAY_FIRST = re.compile(rf"(?<!\w)(\d{{1,2}})(?:st|nd|rd|th)?\s+({MONTH_WORD})\s*,?\s*(20\d{{2}})\b")
MONTH_FIRST = re.compile(rf"(?<!\w)({MONTH_WORD})\s+(\d{{1,2}})(?:st|nd|rd|th)?\s*,?\s*(20\d{{2}})\b")
MALAYALAM_DIGITS = str.maketrans("൦൧൨൩൪൫൬൭൮൯", "0123456789")
MOVEMENT = re.compile(r"\b(?:transport\w*|carry\w*|carried|smuggl\w+|travel\w+)\b", re.I)
ROUTE = re.compile(r"\bfrom\s+([^,;.!?]{1,45}?)\s+to\s+([^,;.!?]{1,45})", re.I)


def normalize(text):
    return unicodedata.normalize("NFC", text or "").casefold()


def place_pattern(district):
    names = normalize("|".join(re.escape(name) for name in (
        district, DISTRICT_ML[district], *DISTRICT_ALIASES.get(district, ()),
    )))
    return re.compile(rf"(?<!\w)(?:{names})(?!\w)")


PLACES = {district: place_pattern(district) for district in DISTRICTS}


def districts_mentioned(text):
    text = normalize(text)
    return {district for district, pattern in PLACES.items() if pattern.search(text)}


def build_locality_patterns():
    geography = Path("web/public/geography/kerala-places.json")
    places = json.loads(geography.read_text(encoding="utf-8"))["places"]
    mapped = {}
    for place in places:
        district = place["district"]
        if district not in PLACES:
            continue
        for name in (place["name"], place["localName"], *place["alternativeNames"]):
            if name and len(name.strip()) >= 6:
                mapped.setdefault(normalize(name.strip()), set()).add(district)
    # An alias can match only when every occurrence in the local gazetteer
    # points to the same revenue district.
    unique = {name: next(iter(districts)) for name, districts in mapped.items() if len(districts) == 1}
    alternatives = "|".join(re.escape(name) for name in sorted(unique, key=len, reverse=True))
    return re.compile(rf"(?<!\w)(?:{alternatives})(?!\w)"), unique


LOCALITY_PATTERN, LOCALITY_DISTRICTS = build_locality_patterns()


def place_candidates(text):
    normalized = normalize(text)
    places = {LOCALITY_DISTRICTS[match[0]] for match in LOCALITY_PATTERN.finditer(normalized)}
    return districts_mentioned(normalized) | places


def dates_mentioned(text):
    text = normalize(text).translate(MALAYALAM_DIGITS)
    components = [(day, int(month), year) for day, month, year in DATE_PATTERN.findall(text)]
    components.extend((day, MONTH_NAMES[month], year) for day, month, year in DAY_FIRST.findall(text))
    components.extend((day, MONTH_NAMES[month], year) for month, day, year in MONTH_FIRST.findall(text))
    dates = set()
    limit = cutoff_today()
    for day, month, year in components:
        try:
            candidate = date(int(year), month, int(day))
        except ValueError:
            continue
        if START <= candidate <= limit:
            dates.add(candidate.isoformat())
    return dates


def court_clauses(html):
    soup = BeautifulSoup(html, "html.parser")
    for node in soup.find_all(["script", "style"]):
        node.decompose()
    paragraphs = soup.find_all(["p", "pre", "blockquote"])
    if paragraphs:
        blocks = (node.get_text(" ", strip=True) for node in paragraphs)
    else:
        blocks = (soup.get_text(" ", strip=True),)
    for block in blocks:
        yield from re.split(r"(?<=[!?])\s+|(?<=[A-Za-z]\.)(?=\s+[A-Z])\s+", block)


def exact_endpoints(clause):
    pairs = set()
    if not MOVEMENT.search(clause):
        return pairs
    for left, right in ROUTE.findall(clause):
        origin = place_candidates(left)
        destination = place_candidates(right)
        if len(origin) == len(destination) == 1 and origin != destination:
            pairs.add((next(iter(origin)), next(iter(destination))))
    return pairs


def find_candidates(clauses):
    possible = []
    for clause in clauses:
        if not ENFORCEMENT.search(clause):
            continue
        areas = place_candidates(clause)
        dates = dates_mentioned(clause)
        pairs = exact_endpoints(clause)
        if areas:
            possible.append({
                "place_mentions": sorted(areas), "date_mentions": sorted(dates),
                "directional_phrases": [list(pair) for pair in sorted(pairs)],
            })
    return possible


def read_court_documents(root):
    for path in sorted((root / "responses").glob("*.json")):
        entry = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(entry.get("doc"), str) and entry["doc"].strip():
            yield path.stem, entry


def article_key(story):
    parsed = urlsplit(story["url"])
    query = [
        (key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.casefold().startswith("utm_") and key.casefold() not in {"fbclid", "gclid"}
    ]
    return urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path.rstrip("/"), urlencode(query), ""))


def query_districts(story):
    names = set()
    for query in story.get("query_memberships", []):
        fields = query.split("|")
        if len(fields) != 4:
            continue
        lane, district, _, _ = fields
        if lane == "district_archive" and district in DISTRICTS:
            names.add(district)
    return names


def deduplicate_articles(stories):
    by_url = {}
    for story in stories:
        key = article_key(story)
        existing = by_url.get(key)
        if existing is None:
            by_url[key] = dict(story, query_memberships=list(story.get("query_memberships", [])))
        else:
            existing["query_memberships"] = sorted(set(existing["query_memberships"]).union(
                story.get("query_memberships", []),
            ))
    return by_url.values()


def balanced_news_sample(stories):
    groups = defaultdict(list)
    mentions = Counter()
    articles = deduplicate_articles(stories)
    named = 0
    for story in articles:
        title = story.get("title") or ""
        locations = place_candidates(title)
        named += bool(locations)
        mentions.update(locations)
        if not ENFORCEMENT.search(title):
            continue
        # Keep the search hint distinct from a place appearing in the title.
        hints = query_districts(story)
        if len(locations) == 1:
            district = next(iter(locations))
            basis = "headline_mention"
        elif not locations and len(hints) == 1:
            district = next(iter(hints))
            basis = "district_query_only"
        else:
            continue
        published = date.fromisoformat(story["publish_date"][:10])
        quarter = (published.month - 1) // 3 + 1
        groups[(district, published.year, quarter)].append((basis, story))

    sample = []
    for (district, year, quarter), leads in sorted(groups.items()):
        by_source = defaultdict(list)
        for basis, story in leads:
            source = story.get("media_name") or urlsplit(story["url"]).hostname or ""
            by_source[source].append((basis, story))
        ranked = sorted(by_source, key=lambda name: (
            not any(basis == "headline_mention" for basis, _ in by_source[name]),
            len(by_source[name]), name,
        ))
        for source in ranked[:2]:
            basis, choice = min(by_source[source], key=lambda lead: (
                lead[0] != "headline_mention", sha256(str(lead[1]["id"]).encode()).hexdigest(),
            ))
            sample.append({
                "story_reference": choice["id"], "review_district": district, "district_basis": basis,
                "district_mention": district if basis == "headline_mention" else None,
                "publication_year": year, "publication_quarter": quarter,
                "review_status": "pending", "reported_incident_date": None,
                "confirmed_seizure_district": None, "confirmed_movement_endpoints": None,
            })
    return sample, mentions, named, len(articles)


def write_news_coverage(root, stories, sample):
    headline_sources = Counter()
    date_range = set()
    for story in deduplicate_articles(stories):
        posted = date.fromisoformat(story["publish_date"][:10])
        date_range.add(posted.year)
        for district in place_candidates(story.get("title")):
            headline_sources[(district, posted.year)] += 1
    queued = Counter((row["review_district"], row["publication_year"], row["district_basis"]) for row in sample)
    if not date_range:
        return
    write_rows(root / "news_review_coverage.csv",
               ("district", "publication_year", "district_headline_urls",
                "headline_review_candidates", "district_query_review_candidates", "observation"),
               [
                   (district, year, headline_sources[(district, year)],
                    queued[(district, year, "headline_mention")],
                    queued[(district, year, "district_query_only")],
                    "headline_support" if headline_sources[(district, year)] else "headline_gap")
                   for district in DISTRICTS for year in range(min(date_range), max(date_range) + 1)
               ])


def review_sources(root=ROOT):
    rows = []
    court_stats = Counter()
    for cache_ref, document in read_court_documents(root / "kanoon_pilot"):
        candidates = find_candidates(court_clauses(document["doc"]))
        court_stats["full_documents"] += 1
        court_stats["documents_with_place_and_date_candidates"] += any(c["date_mentions"] for c in candidates)
        court_stats["documents_with_directional_phrase_candidates"] += any(c["directional_phrases"] for c in candidates)
        if candidates:
            rows.append({"source": "indian_kanoon", "protected_cache_reference": cache_ref,
                         "review_status": "pending", "reported_incident_date": None,
                         "confirmed_seizure_district": None, "confirmed_movement_endpoints": None,
                         "clause_candidates": candidates})

    news_path = root / "news_pilot" / "story_candidates.json"
    stories = json.loads(news_path.read_text(encoding="utf-8")) if news_path.is_file() else []
    news_sample, by_district, named, distinct_urls = balanced_news_sample(stories)
    private_write(root / "news_review_queue.json", json.dumps(news_sample, ensure_ascii=False))
    write_news_coverage(root, stories, news_sample)
    private_write(root / "court_review_queue.json", json.dumps(rows, ensure_ascii=False))
    write_rows(root / "headline_mentions.csv", ("district", "index_records_with_headline_mention"),
               [(name, by_district[name]) for name in DISTRICTS])
    print(f"Court review: {court_stats['full_documents']} readable documents, "
          f"{court_stats['documents_with_place_and_date_candidates']} with spatial/date candidates, "
          f"{court_stats['documents_with_directional_phrase_candidates']} with directional candidates.")
    sample_districts = len({row["review_district"] for row in news_sample})
    print(f"Review bins: {len(rows)} court documents in queue; "
          f"{named} of {distinct_urls} distinct article URLs have a district or locality in the title.")
    print(f"Stratified news review: {len(news_sample)} candidate articles across {sample_districts} districts; "
          "all incident claims are pending review.")


if __name__ == "__main__":
    review_sources()
