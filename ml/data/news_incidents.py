"""Dated, located drug-seizure incidents from public news sitemaps.

Two publishers expose machine-readable sitemaps that robots.txt points
crawlers to:

* The New Indian Express: one sitemap per day back to 2009, with the
  publication date in each article path and Kerala sections
  (states/kerala, cities/kochi, cities/thiruvananthapuram).
* The Times of India: monthly city sitemaps with a timestamp per article and
  the Kerala city sections kochi, thiruvananthapuram and kozhikode.

Only sitemap metadata is read: article URL, timestamp and section. Seizure
stories are selected from the URL slug, and the place comes from slug words
matched to the GeoNames Kerala gazetteer. Article text is not retrieved or
kept. Raw sitemaps and the incident table stay local and gitignored.

News is a selected sample of enforcement activity, not a census: a seizure
appears only when it was reported, and reporting favours big hauls and city
desks. The table therefore measures *reported* seizures and is labelled so.
"""

import argparse
import csv
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
import gzip
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ml.data.public_intake import ROOT

RAW = ROOT / "news" / "sitemaps"
CANDIDATES = ROOT / "news" / "seizure_candidates.csv"
INCIDENTS = ROOT / "news" / "seizure_incidents.csv"
GAZETTEER = Path("web/public/geography/kerala-places.json")
AGENT = "Mozilla/5.0 (compatible; public-research-sitemap-reader)"
FIRST_DAY = date(2016, 1, 1)
MONTHS = ("January February March April May June July August September October November December").split()

NIE_DAILY = "https://www.newindianexpress.com/sitemap/sitemap-daily-{day}.xml"
NIE_SECTIONS = re.compile(r"newindianexpress\.com/(states/kerala|cities/kochi|cities/thiruvananthapuram)/")
TOI_INDEX = "https://timesofindia.indiatimes.com/staticsitemap/toi/category/city/sitemap-index.xml"
TOI_SECTIONS = re.compile(r"indiatimes\.com/city/(kochi|thiruvananthapuram|kozhikode)/")
ASIANET_YEAR = "https://www.asianetnews.com/sitemap/{year}/index.xml"
ASIANET_SECTIONS = re.compile(r"asianetnews\.com/(kerala-news|local-news)/")
ASIANET_FIRST_YEAR = 2022
N18_DAILY = "https://malayalam.news18.com/commonfeeds/v1/mal/sitemap/daily/{day}.xml"
N18_SECTION = re.compile(r"malayalam\.news18\.com/news/(kerala|crime)/")
N18_FIRST_DAY = date(2018, 1, 1)  # earliest daily sitemap the publisher serves
ONM_SITEMAPS = ["https://www.onmanorama.com/kerala.sitemaplist1.xml", "https://www.onmanorama.com/kerala.sitemaplist2.xml",
                *[f"https://www.onmanorama.com/archive-sitemaplist{n}.xml" for n in range(1, 5)]]
ONM_PATH = re.compile(r"onmanorama\.com/news/kerala/(20\d{2})/(\d{2})/(\d{2})/[^/]+\.html$")
NIE_DATE = re.compile(r"/(20\d{2})/([A-Z][a-z]{2})/(\d{1,2})/")
# Madhyamam (Malayalam daily): district local news, Kerala, crime and metro sitemaps, English slugs.
MAD_INDEX = "https://www.madhyamam.com/sitemap/sitemap-index.xml"
MAD_CATEGORIES = {"12", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "1509", "1639"}
MAD_DISTRICT = {"trivandrum": "thiruvananthapuram", "kasarkode": "kasaragod", "kasargod": "kasaragod"}

DRUG = re.compile(r"(?<![a-z])(ganja|mdma|hashish|hash-oil|cannabis|heroin|brown-sugar|charas|lsd|methamphetamine|"
                  r"meth|cocaine|opium|narcotic|narcotics|ndps|drugs?|synthetic-drugs?|nitrazepam|tramadol|"
                  r"ecstasy|amphetamine|weed|marijuana|psychotropic)(?![a-z])")
SEIZURE = re.compile(r"(?<![a-z])(seized?|seizes|seizure|held|arrested|arrests?|nabbed|nab|caught|recovered|"
                     r"haul|bust|busted|confiscated|intercepted|detained|grab|apprehended|caught|"
                     r"rounded-up|in-custody|smuggl\w*|peddl\w*|raid\w*|crackdown|"
                     r"\d+(kg|g|gm|grams?|kilos?|kilograms?)|kg|grams?)(?![a-z])")
NOT_EVENT = re.compile(r"(?<![a-z])(hc|court|bail|verdict|acquit\w*|sentenced?|convicted|awareness|campaign|"
                       r"seminar|film|movie|cinema|editorial|opinion|column|survey|study|report-card|"
                       r"rehab\w*|de-addiction|deaddiction|pharma\w*|medicine|vaccine|covid|"
                       r"price|shortage|policy|bill|assembly|minister|cm|governor|ncrb|statistics)(?![a-z])")


def fetch(url, retries=4):
    for attempt in range(retries):
        try:
            with urlopen(Request(url, headers={"User-Agent": AGENT, "Accept-Encoding": "identity"}),
                         timeout=90) as response:
                return response.read()
        except HTTPError as error:
            if error.code == 404:
                return b""
            time.sleep(3 * (attempt + 1))
        except (URLError, TimeoutError, ConnectionError, OSError):
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"could not fetch {url}")


def cached(path, url, refresh=False):
    if path.exists() and not refresh:
        return gzip.decompress(path.read_bytes())
    body = fetch(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(body))
    time.sleep(0.3)
    return body


ENTRY = re.compile(rb"<url>(.*?)</url>", re.S)
LOC = re.compile(rb"<loc>\s*(.*?)\s*</loc>", re.S)
LASTMOD = re.compile(rb"<lastmod>\s*(.*?)\s*</lastmod>", re.S)


def entries(body):
    for block in ENTRY.findall(body):
        loc = LOC.search(block)
        mod = LASTMOD.search(block)
        if loc:
            yield loc.group(1).decode("utf-8", "replace"), mod.group(1).decode() if mod else ""


def nie_rows(day, refresh=False):
    body = cached(RAW / "nie" / f"{day}.xml.gz", NIE_DAILY.format(day=day), refresh)
    for url, _ in entries(body):
        section = NIE_SECTIONS.search(url)
        found = NIE_DATE.search(url)
        if not section or not found:
            continue
        published = datetime.strptime(" ".join(found.groups()), "%Y %b %d").date()
        yield {"source": "nie", "section": section.group(1).split("/")[-1], "published": published.isoformat(),
               "url": url}


def toi_sitemaps(refresh=False):
    body = cached(RAW / "toi" / "index.xml.gz", TOI_INDEX, refresh)
    names = [loc.decode() for loc in LOC.findall(body)]
    keep = []
    for url in names:
        found = re.search(r"/(20\d{2})-([A-Za-z]+)-(\d+)\.xml$", url)
        if found and date(int(found.group(1)), MONTHS.index(found.group(2)) + 1, 1) >= FIRST_DAY:
            keep.append(url)
    return keep


def toi_rows(url, refresh=False):
    name = url.rsplit("/", 1)[-1]
    current = name.startswith(str(date.today().year)) and MONTHS[date.today().month - 1] in name
    body = cached(RAW / "toi" / f"{name}.gz", url, refresh or current)
    for loc, mod in entries(body):
        section = TOI_SECTIONS.search(loc)
        if section and mod:
            yield {"source": "toi", "section": section.group(1), "published": mod[:10], "url": loc}


def asianet_days(refresh_year=True):
    days = []
    for year in range(ASIANET_FIRST_YEAR, date.today().year + 1):
        body = cached(RAW / "asianet" / f"index-{year}.xml.gz", ASIANET_YEAR.format(year=year),
                      refresh_year and year == date.today().year)
        days += [loc.decode() for loc in LOC.findall(body)]
    return days


def asianet_rows(url, refresh=False):
    found = re.search(r"/sitemap/(\d{4})/(\d{2})/(\d{2})/", url)
    day = "-".join(found.groups())
    body = cached(RAW / "asianet" / f"{day}.xml.gz", url, refresh or (date.today() - date.fromisoformat(day)).days < 3)
    if body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    for loc, _ in entries(body):
        section = ASIANET_SECTIONS.search(loc)
        if section:
            yield {"source": "asianet", "section": section.group(1), "published": day, "url": loc}


def n18_rows(day, refresh=False):
    """News18 Malayalam: Malayalam stories with English slugs that often name the town."""
    body = cached(RAW / "n18" / f"{day}.xml.gz", N18_DAILY.format(day=day), refresh)
    for loc in re.findall(rb"<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</loc>", body):
        url = loc.decode("utf-8", "replace")
        if N18_SECTION.search(url):
            yield {"source": "n18", "section": "kerala", "published": day.isoformat(), "url": url}


def onm_rows(refresh=True):
    """Onmanorama keeps only recent weeks in its sitemaps: a freshness feed, re-read on every harvest."""
    for url in ONM_SITEMAPS:
        stamp = date.today().isoformat()
        body = cached(RAW / "onm" / f"{stamp}-{url.rsplit('/', 1)[-1]}.gz", url, refresh)
        for loc, _ in entries(body):
            found = ONM_PATH.search(loc)
            if found and ".amp." not in loc:
                yield {"source": "onm", "section": "kerala", "published": "-".join(found.groups()), "url": loc}


def madhyamam_rows(refresh=True):
    """Madhyamam category sitemaps (5,000 stories a page). The first page of each category is re-read on every
    harvest; the stories' own publish times come from their pages when they are described."""
    index = cached(RAW / "madhyamam" / "sitemap-index.xml.gz", MAD_INDEX, refresh).decode("utf-8", "replace")
    pages = sorted({(c, int(p)) for c, p in re.findall(r"news-(\d+)-(\d+)-sitemap\.xml", index) if c in MAD_CATEGORIES})
    for category, page in pages:
        url = f"https://www.madhyamam.com/sitemap/news-{category}-{page}-sitemap.xml"
        body = cached(RAW / "madhyamam" / f"news-{category}-{page}.xml.gz", url, refresh and page == 1)
        for block in ENTRY.findall(body):
            loc = re.search(rb"<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</loc>", block, re.S)
            mod = LASTMOD.search(block)
            if not loc or not mod:
                continue
            story = loc.group(1).decode("utf-8", "replace")
            parts = story.split("/")[3:-1]
            district = ""
            if "local-news" in parts and parts.index("local-news") + 1 < len(parts):
                district = parts[parts.index("local-news") + 1]
            elif len(parts) >= 2 and parts[0] == "kerala" and parts[1] in SECTION_DISTRICT:
                district = parts[1]
            district = MAD_DISTRICT.get(district, district)
            yield {"source": "madhyamam", "section": district if district in SECTION_DISTRICT else (parts[0] if parts else ""),
                   "published": mod.group(1).decode()[:10], "url": story}


def slug(url):
    path = url.split("?")[0].rstrip("/")
    if "indiatimes.com" in path:
        return path.split("/articleshow/")[0].rsplit("/", 1)[-1]
    if "news18.com" in path:
        return re.sub(r"(-[a-z]{1,4})*-\d{4,}\.html$", "", path.rsplit("/", 1)[-1])
    if "madhyamam.com" in path:
        return re.sub(r"-\d{5,}$", "", path.rsplit("/", 1)[-1])
    if "asianetnews.com" in path:
        return re.sub(r"-[a-z0-9]{2,4}-[a-z0-9]{6}$", "", path.rsplit("/", 1)[-1])
    return re.sub(r"-\d{5,}\.html$|\.html$", "", path.rsplit("/", 1)[-1])


def is_seizure(text):
    return bool(DRUG.search(text) and SEIZURE.search(text) and not NOT_EVENT.search(text))


def harvest(refresh_recent=7, workers=6):
    """Read every sitemap since FIRST_DAY and keep Kerala drug-seizure candidates."""
    today = date.today()
    days = [FIRST_DAY + timedelta(n) for n in range((today - FIRST_DAY).days + 1)]
    rows = []
    with ThreadPoolExecutor(workers) as pool:
        for found in pool.map(lambda d: list(nie_rows(d, refresh=(today - d).days < refresh_recent)), days):
            rows.extend(found)
        for found in pool.map(lambda u: list(toi_rows(u)), toi_sitemaps(refresh=True)):
            rows.extend(found)
        for found in pool.map(lambda u: list(asianet_rows(u)), asianet_days()):
            rows.extend(found)
        n18_days = [d for d in days if d >= N18_FIRST_DAY]
        for found in pool.map(lambda d: list(n18_rows(d, refresh=(today - d).days < refresh_recent)), n18_days):
            rows.extend(found)
    rows.extend(onm_rows())
    rows.extend(madhyamam_rows())
    seen, kept = set(), []
    for row in rows:
        row["slug"] = slug(row["url"])
        if row["url"] in seen or not is_seizure(row["slug"]):
            continue
        seen.add(row["url"])
        kept.append(row)
    kept.sort(key=lambda r: (r["published"], r["url"]))
    CANDIDATES.parent.mkdir(parents=True, exist_ok=True)
    with CANDIDATES.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, ["source", "section", "published", "slug", "url"])
        writer.writeheader()
        writer.writerows(kept)
    return len(rows), len(kept)


# ---------------------------------------------------------------- places

MALAYALAM_TEXT = re.compile("[\u0D00-\u0D7F]")
MALAYALAM_DRUG = re.compile("ലഹരി|കഞ്ചാവ്|എംഡിഎംഎ|മയക്കുമരുന്ന്|ഹാഷിഷ്|മെത്താംഫെറ്റമിൻ|രാസലഹരി")
SECTION_DISTRICT = {"kochi": "Ernakulam", "thiruvananthapuram": "Thiruvananthapuram", "kozhikode": "Kozhikode",
                    "kollam": "Kollam", "pathanamthitta": "Pathanamthitta", "alappuzha": "Alappuzha", "kottayam": "Kottayam",
                    "idukki": "Idukki", "ernakulam": "Ernakulam", "thrissur": "Thrissur", "palakkad": "Palakkad",
                    "malappuram": "Malappuram", "wayanad": "Wayanad", "kannur": "Kannur", "kasaragod": "Kasaragod"}
DISTRICT_WORDS = {
    "thiruvananthapuram": "Thiruvananthapuram", "trivandrum": "Thiruvananthapuram", "kollam": "Kollam",
    "pathanamthitta": "Pathanamthitta", "alappuzha": "Alappuzha", "alleppey": "Alappuzha",
    "kottayam": "Kottayam", "idukki": "Idukki", "ernakulam": "Ernakulam", "kochi": "Ernakulam",
    "cochin": "Ernakulam", "thrissur": "Thrissur", "trichur": "Thrissur", "palakkad": "Palakkad",
    "palghat": "Palakkad", "malappuram": "Malappuram", "kozhikode": "Kozhikode", "calicut": "Kozhikode",
    "wayanad": "Wayanad", "kannur": "Kannur", "kasaragod": "Kasaragod", "kasargod": "Kasaragod",
}
# Words that are also Kerala place names in the gazetteer but usually mean something else in a headline.
STOP = set("""
police excise youth youths man men woman women held arrested seized drug drugs ganja mdma two three four five
six seven eight nine ten kg g gm grams worth lakh crore rs from with in at of the and a an for near on to by
city rural district kerala state station railway bus stand airport road beach market town new old west east
north south hill lake river college school student students gang raid case cases accused worth hashish oil
kochi-metro natives native migrant workers worker bengal odisha tamil nadu karnataka andhra bihar assam goa
""".split())


def plain(text):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)).casefold()


def district_of(value):
    text = plain(str(value or "")).replace(" district", "").strip()
    return DISTRICT_WORDS.get(text) or next((d for d in set(DISTRICT_WORDS.values()) if d.casefold() == text), None)


SUFFIXES = ("am", "u", "e", "a")


def fold(word):
    """Spelling-tolerant key: Manjeswaram, Manjeshwar and Manjeshwaram fold together."""
    word = re.sub(r"[^a-z]", "", plain(word))
    for old, new in (("zh", "l"), ("sh", "s"), ("th", "t"), ("dh", "d"), ("kh", "k"), ("ph", "p"), ("bh", "b"),
                     ("w", "v"), ("ee", "i"), ("oo", "u"), ("aa", "a"), ("y", "i"), ("tt", "t"), ("ll", "l"),
                     ("nn", "n"), ("pp", "p"), ("kk", "k"), ("mm", "m"), ("rr", "r")):
        word = word.replace(old, new)
    if len(word) >= 7:
        for suffix in SUFFIXES:
            if word.endswith(suffix):
                return word[:-len(suffix)]
    return word


def _postal_places():
    from ml.recovery.access_map import POSTAL, DISTRICT_FROM_POSTAL
    import io
    import zipfile
    with zipfile.ZipFile(POSTAL) as archive:
        for row in csv.reader(io.TextIOWrapper(archive.open("IN.txt"), "utf-8"), delimiter="\t"):
            if row[3] == "Kerala" and row[9] and row[10]:
                name = re.sub(r"\s+(B\.?O|S\.?O|H\.?O|G\.?P\.?O)\.?$", "", row[2]).strip()
                yield {"name": name, "district": DISTRICT_FROM_POSTAL.get(row[5]), "lat": float(row[9]),
                       "lon": float(row[10]), "population": 0, "feature": "POSTAL"}


def place_index():
    """Folded place-name n-grams -> candidate places, from GeoNames localities and post offices."""
    data = json.loads(GAZETTEER.read_text())
    index = {}

    def add(name, entry):
        words = [fold(w) for w in re.split(r"[^A-Za-z]+", plain(name)) if w]
        key = " ".join(w for w in words if w)
        if len(key.replace(" ", "")) < 4 or key in FOLDED_STOP:
            return
        index.setdefault(key, []).append(entry)

    for place in data["places"]:
        if not place.get("lat"):
            continue
        entry = {"name": place["name"], "district": district_of(place.get("district")), "lat": place["lat"],
                 "lon": place["lon"], "population": place.get("population") or 0,
                 "feature": place.get("featureCode", "")}
        for name in {place["name"], *place.get("alternativeNames", [])}:
            add(name, entry)
    for entry in _postal_places():
        add(entry["name"], entry)
    return index


OUTSIDE = {fold(w) for w in """bengaluru bangalore chennai mangaluru mangalore coimbatore mumbai delhi goa hyderabad
mysuru mysore udupi madurai salem visakhapatnam vizag odisha andhra kuwait dubai uae qatar oman saudi""".split()}
FOLDED_STOP = {fold(w) for w in STOP} | {fold(w) for w in """sunday monday tuesday wednesday thursday friday
saturday january february march april may june july august september october november december india indian
customs dri ncb rpf officials officers team squad special worth seized arrested excise police""".split()}
STRONG_BEFORE = {"at", "in", "near", "from", "of"}
STRONG_AFTER = {"police", "excise", "station", "town", "junction", "railway", "bus", "native", "range"}


def text_words(text):
    return [w for w in re.split(r"[^a-z]+", plain(text)) if w]


def locate(slug_text, section, index, description=""):
    """The most specific Kerala locality named in the headline or summary.

    Candidates are folded n-grams found in the gazetteer. A place right after
    "at/in/near/from" or right before "police/excise/station" outranks a
    bare mention; a district word or the city desk resolves names shared by
    several districts; names only of districts give district precision.
    """
    head = text_words(slug_text.replace("-", " "))
    words = head + ["."] + text_words(description)
    folded = [fold(w) for w in words]
    headline_district = next((DISTRICT_WORDS[w] for w in head if w in DISTRICT_WORDS), None)
    hint = headline_district or next((DISTRICT_WORDS[w] for w in words if w in DISTRICT_WORDS), None) \
        or SECTION_DISTRICT.get(section)
    if any(fold(w) in OUTSIDE for w in head):
        return None  # headline about a seizure outside Kerala
    best = None
    for size in (3, 2, 1):
        for start in range(len(folded) - size + 1):
            key = " ".join(folded[start:start + size])
            if key not in index or "." in words[start:start + size]:
                continue
            raw = " ".join(words[start:start + size])
            in_headline = start + size <= len(head)
            options = index[key]
            local = [o for o in options if hint and o["district"] == hint]
            if headline_district and not local and raw not in DISTRICT_WORDS:
                continue  # the headline names another district: this word is not the seizure place
            options = local or options
            if len({o["district"] for o in options}) > 1:
                continue
            choice = max(options, key=lambda o: (o["population"], o["feature"].startswith("PPLA"),
                                                 o["feature"] != "POSTAL"))
            before = words[start - 1] if start else ""
            after = words[start + size] if start + size < len(words) else ""
            context = (before in STRONG_BEFORE) + (after in STRONG_AFTER)
            if not in_headline and not context and not local:
                continue  # a bare word in the summary may be a person's name
            is_district = raw in DISTRICT_WORDS
            rank = (not is_district, context, bool(local), in_headline, size, -start)
            if best is None or rank > best[0]:
                best = (rank, raw, choice)
    if best is None:
        if hint:
            return {"place": hint, "district": hint, "precision": "district_or_desk", "lat": None, "lon": None}
        return None
    _, raw, choice = best
    if raw in DISTRICT_WORDS:
        district = DISTRICT_WORDS[raw]
        return {"place": district, "district": district, "precision": "district_or_desk", "lat": None, "lon": None}
    return {"place": choice["name"], "district": choice["district"] or hint, "precision": "locality",
            "lat": choice["lat"], "lon": choice["lon"]}


DESCRIPTIONS = ROOT / "news" / "descriptions.jsonl"
PUBLISHED = re.compile(rb'<meta[^>]+property="article:published_time"[^>]+content="(\d{4}-\d{2}-\d{2})')
META = re.compile(rb'<meta[^>]+(?:name|property)="(description|og:description|og:title)"[^>]+content="([^"]*)"', re.I)


def describe(urls, workers=4):
    """Fetch the publisher's own short summary (meta description) for each candidate, cached locally."""
    import html
    cache = {}
    if DESCRIPTIONS.exists():
        for line in DESCRIPTIONS.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            cache[row["url"]] = row
    todo = [url for url in urls if url not in cache]

    def one(url):
        try:
            body = fetch(url, retries=2)[:400_000]
        except RuntimeError:
            return {"url": url, "description": "", "status": "failed"}
        found = {}
        for name, content in META.findall(body):
            found.setdefault(name.decode().lower(), html.unescape(content.decode("utf-8", "replace")))
        time.sleep(0.25)
        text = max((found.get("og:description", ""), found.get("description", "")), key=len)
        stamp = PUBLISHED.search(body)
        return {"url": url, "description": text, "title": found.get("og:title", ""), "status": "ok",
                "published_time": stamp.group(1).decode()[:10] if stamp else ""}

    with ThreadPoolExecutor(workers) as pool, DESCRIPTIONS.open("a", encoding="utf-8") as stream:
        for count, row in enumerate(pool.map(one, todo), 1):
            cache[row["url"]] = row
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")
            if count % 200 == 0:
                stream.flush()
                print(f"described {count}/{len(todo)}", flush=True)
    return cache


SYNTHETIC = re.compile(r"(?<![a-z])(mdma|meth\w*|amphetamine|lsd|ecstasy|cocaine|heroin|brown sugar|synthetic|"
                       r"nitrazepam|tramadol|ketamine|hybrid ganja)(?![a-z])")
CANNABIS = re.compile(r"(?<![a-z])(ganja|cannabis|hashish|hash oil|charas|weed|marijuana)(?![a-z])")
QUANTITY = re.compile(r"(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|kilograms?|g|gm|gms|grams?)(?![a-z])")


def drug_and_quantity(slug_text, description):
    """Drug family and the largest stated quantity in grams, from the headline and summary."""
    text = plain(description + " " + slug_text.replace("-", " "))
    drug = ("synthetic" if SYNTHETIC.search(text) else "cannabis" if CANNABIS.search(text) else "other")
    grams = []
    for number, unit in QUANTITY.findall(text.replace(",", "")):
        value = float(number) * (1000 if unit.startswith("k") else 1)
        if 0 < value < 5_000_000:
            grams.append(value)
    return drug, (max(grams) if grams else None)


def dedupe(rows, days=2):
    """One incident per place within a short window: syndicated and follow-up stories collapse."""
    rows = sorted(rows, key=lambda r: (r["place"], r["published"]))
    kept = []
    for row in rows:
        last = kept[-1] if kept else None
        if (last and last["place"] == row["place"] and
                (date.fromisoformat(row["published"]) - date.fromisoformat(last["published"])).days <= days):
            last["reports"] += 1
            continue
        kept.append({**row, "reports": 1})
    return sorted(kept, key=lambda r: (r["published"], r["place"]))


def build(fetch_descriptions=False):
    from ml.data.malayalam_places import locate_malayalam
    index = place_index()
    with CANDIDATES.open(encoding="utf-8", newline="") as stream:
        candidates = list(csv.DictReader(stream))
    summaries = describe([row["url"] for row in candidates]) if fetch_descriptions else (
        {json.loads(line)["url"]: json.loads(line) for line in DESCRIPTIONS.read_text(encoding="utf-8").splitlines()}
        if DESCRIPTIONS.exists() else {})
    located = []
    for row in candidates:
        description = summaries.get(row["url"], {}).get("description", "")
        latin = sum(c.isascii() for c in description) >= 0.8 * len(description)
        drug_words = DRUG.search(plain(description).replace(" ", "-")) or MALAYALAM_DRUG.search(description)
        if description and latin and not drug_words:
            continue  # the summary shows the story is not about a drug seizure
        where = locate(row["slug"], row["section"], index, description)
        if (not where or where["precision"] != "locality") and MALAYALAM_TEXT.search(description):
            # Malayalam summaries name the place in an inflected form the English reader cannot see.
            found = locate_malayalam(description, (where["district"] if where else None) or SECTION_DISTRICT.get(row["section"]))
            if found:
                where = {k: v for k, v in found.items() if k != "via"} | {"geocoder": found["via"]}
        if not where:
            continue
        where.setdefault("geocoder", "english")
        drug, grams = drug_and_quantity(row["slug"], description)
        if row["source"] == "madhyamam":
            stamp = summaries.get(row["url"], {}).get("published_time")
            if not stamp:
                continue  # sitemap dates are last-modified stamps; without the page's own date the story is not dated
            row["published"] = stamp
        located.append({"published": row["published"], "source": row["source"], "section": row["section"],
                        "slug": row["slug"], "drug": drug, "quantity_g": grams, **where})
    incidents = dedupe(located)
    fields = ["published", "place", "district", "precision", "lat", "lon", "reports", "drug", "quantity_g", "source",
              "section", "slug", "geocoder"]
    with INCIDENTS.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(incidents)
    summary = {"candidates": len(candidates), "located": len(located), "incidents": len(incidents),
               "locality_incidents": sum(r["precision"] == "locality" for r in incidents)}
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--harvest", action="store_true", help="read publisher sitemaps (network)")
    parser.add_argument("--describe", action="store_true", help="fetch candidate summaries (network)")
    args = parser.parse_args()
    if args.harvest:
        total, kept = harvest()
        print(f"sitemap rows in Kerala sections: {total}; seizure candidates: {kept}")
    print(json.dumps(build(fetch_descriptions=args.describe), indent=1))


if __name__ == "__main__":
    main()
