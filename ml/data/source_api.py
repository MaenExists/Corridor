"""Retrieve documented Kerala court and news candidates into the local private archive."""

import argparse
import calendar
import csv
from datetime import date, datetime, timedelta
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import stat
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

from ml.data.real_input import DISTRICTS, private_write

ROOT = Path("ml/data/real/public_sources/api")
KAN = "https://api.indiankanoon.org"
MEDIA = "https://search.mediacloud.org/api"
START = date(2020, 1, 1)
IST = ZoneInfo("Asia/Kolkata")
DISTRICT_ML = dict(zip(DISTRICTS, (
    "കാസർഗോഡ്", "കണ്ണൂർ", "വയനാട്", "കോഴിക്കോട്", "മലപ്പുറം", "പാലക്കാട്", "തൃശ്ശൂർ",
    "എറണാകുളം", "ഇടുക്കി", "കോട്ടയം", "ആലപ്പുഴ", "പത്തനംതിട്ട", "കൊല്ലം", "തിരുവനന്തപുരം",
), strict=True))
DISTRICT_ALIASES = {
    "Kasaragod": ("Kasargod", "കാസർകോട്"),
    "Kozhikode": ("Calicut",),
    "Thiruvananthapuram": ("Trivandrum",),
    "Alappuzha": ("Alleppey",),
    "Ernakulam": ("Kochi", "കൊച്ചി"),
    "Palakkad": ("Palghat",),
    "Thrissur": ("Trichur", "തൃശൂർ"),
}
ENGLISH_TERMS = 'NDPS OR ((drug OR narcotic OR ganja OR cannabis OR MDMA OR heroin) AND (seized OR seizure OR bust OR arrested))'
MALAYALAM_TERMS = '(ലഹരിമരുന്ന് OR മയക്കുമരുന്ന് OR കഞ്ചാവ് OR എംഡിഎംഎ OR ഹാഷിഷ്) AND (പിടികൂടി OR പിടിച്ചെടുത്തു OR അറസ്റ്റിൽ)'


class KeepCredentialOnHost(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def credential(name):
    token = os.environ.get(name)
    if not token:
        secret_file = Path(".env.collection")
        flags = os.O_RDONLY | os.O_NOFOLLOW
        with os.fdopen(os.open(secret_file, flags), encoding="utf-8") as stream:
            mode = os.fstat(stream.fileno()).st_mode
            if not stat.S_ISREG(mode) or stat.S_IMODE(mode) & 0o077:
                raise ValueError("Credential file must be a private regular file.")
            for line in stream:
                key, _, value = line.strip().partition("=")
                if key == name:
                    token = value
                    break
    if not token or not re.fullmatch(r"[A-Za-z0-9._-]+", token):
        raise ValueError("Configured credential is missing or invalid.")
    return token


class Client:
    def __init__(self, base, token, cache, interval):
        self.base = base
        self.token = token
        self.cache = cache
        self.cache.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.opener = build_opener(KeepCredentialOnHost())
        self.interval = interval
        self.last_request = 0.0

    def get(self, path, params=None, method="GET"):
        query = urlencode(params or {})
        cache_name = sha256(f"{method} {path}?{query}".encode()).hexdigest() + ".json"
        target = self.cache / cache_name
        if target.is_file():
            return json.loads(target.read_text(encoding="utf-8"))
        url = f"{self.base}/{path}"
        if query:
            url += "?" + query
        request = Request(url, method=method, headers={
            "Accept": "application/json",
            "User-Agent": "NarcoTrace research collection/1.0",
        })
        request.add_unredirected_header("Authorization", f"Token {self.token}")
        time.sleep(max(0.0, self.interval - (time.monotonic() - self.last_request)))
        self.last_request = time.monotonic()
        with self.opener.open(request, timeout=45) as response:
            raw = response.read(16 * 1024 * 1024 + 1)
        if len(raw) > 16 * 1024 * 1024:
            raise ValueError("Response exceeded the per-request cap.")
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("Unexpected JSON response.")
        private_write(target.with_suffix(".tmp"), json.dumps(data, ensure_ascii=False))
        target.with_suffix(".tmp").replace(target)
        return data


def write_rows(path, header, rows):
    import io

    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    temporary = path.with_suffix(".tmp")
    private_write(temporary, buffer.getvalue())
    temporary.replace(path)


def cutoff_today():
    return datetime.now(IST).date()


def month_windows(start, end):
    current = start.replace(day=1)
    while current <= end:
        last = current.replace(day=calendar.monthrange(current.year, current.month)[1])
        yield max(start, current), min(end, last)
        current = last + timedelta(days=1)


def dated(record, field, start, end):
    try:
        stamp = date.fromisoformat(str(record[field])[:10])
        return start <= stamp <= end
    except (KeyError, ValueError):
        return False


def estimate_found(value):
    values = re.findall(r"[\d,]+", str(value))
    return int(values[-1].replace(",", "")) if values else None


def evenly_spaced(records, limit):
    records = sorted(records, key=lambda row: (row.get("publishdate", ""), row["tid"]))
    if len(records) <= limit:
        return records
    if limit == 1:
        return [records[len(records) // 2]]
    return [records[index * (len(records) - 1) // (limit - 1)] for index in range(limit)]


def http_note(error):
    if isinstance(error, HTTPError):
        return "http_" + str(error.code)
    if isinstance(error, TimeoutError) or isinstance(error, URLError) and isinstance(error.reason, TimeoutError):
        return "timeout"
    return "invalid_response" if isinstance(error, ValueError) else "request_failed"


def kanoon_search(client, start, end, pages, *, first_page=0):
    query = f"NDPS doctypes:kerala fromdate:{start:%d-%m-%Y} todate:{end:%d-%m-%Y}"
    response = client.get("search/", {
        "formInput": query, "pagenum": first_page, "maxpages": pages,
    }, method="POST")
    docs = response.get("docs")
    if not isinstance(docs, list):
        raise ValueError("Court response has no candidate list.")
    return [row for row in docs if str(row.get("tid", "")).isdigit()
            and dated(row, "publishdate", start, end)], estimate_found(response.get("found"))


def collect_kanoon(root, end, pages, doc_limit, months_only):
    client = Client(KAN, credential("INDIAN_KANOON_API_TOKEN"), root / "responses", 0.25)
    windows = list(month_windows(START if not months_only else date(2025, 1, 1), end))
    report = []
    archive = {}
    selected = set()
    for start, stop in windows:
        try:
            records, expected = kanoon_search(client, start, stop, pages)
        except (OSError, ValueError) as error:
            report.append((start, stop, "", "", "", 0, http_note(error)))
            if isinstance(error, HTTPError) and error.code in {401, 402, 429}:
                break
            continue
        unique = {row["tid"]: row for row in records}
        archive.update(unique)
        documents = 0
        for item in evenly_spaced(list(unique.values()), doc_limit) if doc_limit else []:
            index = item["tid"]
            if index in selected:
                continue
            try:
                document = client.get(f"doc/{index}/", method="POST")
            except (OSError, ValueError):
                continue
            if isinstance(document.get("doc"), str) and document["doc"].strip():
                selected.add(index)
                documents += 1
        status = "search_window_capped" if expected is not None and expected > len(records) else "ok"
        report.append((start, stop, expected, len(records), len(unique), documents, status))
        if stop.month in {6, 12} or stop == end:
            print(f"Indian Kanoon collected through {stop:%Y-%m}; {len(archive)} distinct index records.", flush=True)
    write_rows(root / ("coverage_recent.csv" if months_only else "coverage.csv"),
               ("start", "end", "provider_search_estimate", "result_rows_in_range", "distinct_documents",
                "full_documents", "status"), report)
    print(f"Indian Kanoon: {len(archive)} distinct index records and {len(selected)} full documents.", flush=True)

def retry_capped_kanoon(root, end, extra_pages):
    client = Client(KAN, credential("INDIAN_KANOON_API_TOKEN"), root / "responses", 0.8)
    with (root / "coverage.csv").open(encoding="utf-8", newline="") as stream:
        months = [row for row in csv.DictReader(stream)
                  if row["status"] == "search_window_capped" and date.fromisoformat(row["end"]) <= end]

    results = []
    stopped = False
    errors = 0
    for row in reversed(months):
        start, stop = (date.fromisoformat(row[key]) for key in ("start", "end"))
        prior = int(row["distinct_documents"])
        observed = prior
        estimate = int(row["provider_search_estimate"])
        state = "deferred" if stopped else "short"
        if not stopped:
            try:
                baseline, _ = kanoon_search(client, start, stop, 5)
                more, estimate_now = kanoon_search(client, start, stop, extra_pages, first_page=5)
                observed = len({item["tid"] for item in [*baseline, *more]})
                estimate = max(estimate, estimate_now or 0)
                state = "complete_by_estimate" if observed >= estimate else "short"
                errors = 0
            except (OSError, ValueError) as error:
                state = http_note(error)
                errors += 1
                stopped = errors >= 3 or state in {"http_401", "http_402", "http_429"}
        results.append((start, stop, estimate, prior, observed, observed - prior, state))
        write_rows(root / "coverage_retry.csv", (
            "start", "end", "provider_search_estimate", "baseline_documents", "retrieved_documents",
            "added_documents", "status",
        ), sorted(results))

    complete = sum(row[-1] == "complete_by_estimate" for row in results)
    print(f"Court retry: {len(months)} flagged windows, {sum(row[-2] for row in results)} "
          f"additional index records, {complete} reached the provider estimate.", flush=True)


MALAYALAM_SOURCES = "165995,321044,282841,656236,656246,656244,656239,1912665"
ENGLISH_SOURCES = "1569814,656245,973649,22331"
INDIA_NATIONAL = "34412118"


def district_terms(district):
    names = (district, DISTRICT_ML[district], *DISTRICT_ALIASES.get(district, ()))
    return "(" + " OR ".join(f'"{name}"' for name in names) + ")"


def news_windows(end, scope):
    district_names = " OR ".join(district_terms(name) for name in DISTRICTS)
    geo = f'(Kerala OR "കേരളം" OR {district_names})'
    if scope == "archive":
        terms = f'({MALAYALAM_TERMS}) OR ((NDPS OR "drug seizure" OR "ganja seized" OR "MDMA seized") AND Kerala)'
        sources = {"ss": f"{MALAYALAM_SOURCES},{ENGLISH_SOURCES}"}
        for year in (2025, 2026, 2024, 2023, 2022, 2021, 2020):
            if year <= end.year:
                yield "regional_archive", "", date(year, 1, 1), min(end, date(year, 12, 31)), terms, sources
    if scope in {"all", "year"}:
        for year in range(START.year, end.year + 1):
            begin, finish = date(year, 1, 1), min(end, date(year, 12, 31))
            yield "malayalam_publishers", "", begin, finish, MALAYALAM_TERMS, {"ss": MALAYALAM_SOURCES}
            yield "english_publishers", "", begin, finish, f"({ENGLISH_TERMS}) AND {geo}", {"ss": ENGLISH_SOURCES}
    if scope in {"all", "district"}:
        for district in DISTRICTS:
            words = (
                '(NDPS OR "drug seizure" OR "ganja seized" OR "MDMA seized" OR കഞ്ചാവ് OR '
                f'ലഹരിമരുന്ന് OR മയക്കുമരുന്ന്) AND {district_terms(district)}'
            )
            sources = {"ss": f"{MALAYALAM_SOURCES},{ENGLISH_SOURCES}"}
            yield "district_archive", district, START, end, words, sources
    if scope == "national":
        for year in range(START.year, end.year + 1):
            begin, finish = date(year, 1, 1), min(end, date(year, 12, 31))
            yield "india_national", "", begin, finish, f"({ENGLISH_TERMS}) AND {geo}", {"cs": INDIA_NATIONAL}


def media_page(client, params):
    for attempt in range(3):
        try:
            return client.get("search/story-list", params)
        except HTTPError as error:
            if error.code != 429 or attempt == 2:
                raise
            retry = error.headers.get("Retry-After", "")
            wait = int(retry) if retry.isdecimal() else 32
            if wait > 60:
                raise
            print("Media Cloud rate limit reached; waiting to resume collection.", flush=True)
            time.sleep(max(32, wait))


def media_search(client, terms, start, stop, selectors, max_pages):
    params = {"q": terms, "start": start.isoformat(), "end": stop.isoformat(),
              "platform": "onlinenews-mediacloud", **selectors, "page_size": 1000}
    pagination = set()
    stories = {}
    for _ in range(max_pages):
        response = media_page(client, params)
        if not isinstance(response.get("stories"), list):
            raise ValueError("Media response has no story list.")
        for story in response["stories"]:
            if story.get("id") and story.get("url") and dated(story, "publish_date", start, stop):
                stories[story["id"]] = story
        token = response.get("pagination_token")
        if not token:
            return stories, "complete_query"
        if token in pagination:
            return stories, "repeated_cursor"
        pagination.add(token)
        params["pagination_token"] = token
    return stories, "page_cap"


def collect_news(root, end, pages, scope, districts=()):
    client = Client(MEDIA, credential("MEDIACLOUD_API_KEY"), root / "responses", 6.3)
    index = {}
    references = {}
    existing = root / "story_candidates.json"
    if existing.is_file():
        for item in json.loads(existing.read_text(encoding="utf-8")):
            index[item["id"]] = item
            references[item["id"]] = set(item.get("query_memberships", []))
    report = []
    for lane, district, start, stop, terms, selectors in news_windows(end, scope):
        if district and districts and district not in districts:
            continue
        try:
            matches, status = media_search(client, terms, start, stop, selectors, pages)
        except (OSError, ValueError) as error:
            report.append((lane, district, start, stop, "", "", http_note(error)))
            print(f"Media Cloud {lane} through {stop:%Y-%m}: {http_note(error)}.", flush=True)
            if isinstance(error, HTTPError) and error.code in {401, 402, 429}:
                break
            continue
        refs = ("id", "title", "url", "publish_date", "indexed_date", "language", "media_name", "media_url")
        for index_id, story in matches.items():
            index[index_id] = {key: story.get(key) for key in refs}
            references.setdefault(index_id, set()).add(f"{lane}|{district}|{start}|{stop}")
        publishers = len({story.get("media_name") for story in matches.values() if story.get("media_name")})
        report.append((lane, district, start, stop, len(matches), publishers, status))
        label = district or lane
        print(f"Media Cloud {label} through {stop:%Y-%m}: {len(index)} distinct story indexes.", flush=True)

    metadata = [dict(item, query_memberships=sorted(references[identifier])) for identifier, item in index.items()]
    private_write(root / "story_candidates.json", json.dumps(metadata, ensure_ascii=False))
    coverage_id = scope if not districts else scope + "_" + "_".join(name.lower() for name in districts)
    write_rows(root / f"coverage_{coverage_id}.csv",
               ("query_group", "district_queried", "start", "end", "article_hits", "publishers", "status"),
               report)
    print(f"Media Cloud: {len(index)} distinct story indexes saved; {len(report)} query windows attempted in this pass.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("provider", choices=("kanoon", "media"))
    parser.add_argument("--end", type=date.fromisoformat, default=cutoff_today())
    parser.add_argument("--pages", type=int)
    parser.add_argument("--court-documents-per-month", type=int, default=2)
    parser.add_argument("--court-recent-only", action="store_true")
    parser.add_argument("--retry-capped", action="store_true", help="Retrieve two additional pages per capped court month")
    parser.add_argument("--media-scope", choices=("all", "archive", "year", "district", "national"),
                        default="archive")
    parser.add_argument("--district", choices=DISTRICTS, action="append")
    args = parser.parse_args()
    if not START <= args.end <= cutoff_today() or not 0 <= args.court_documents_per_month <= 5:
        parser.error("Invalid cutoff or document cap.")
    if args.retry_capped:
        if args.provider != "kanoon" or args.pages is not None:
            parser.error("--retry-capped uses a fixed two-page budget per court window.")
        retry_capped_kanoon(ROOT / "kanoon_pilot", args.end, 2)
    elif args.provider == "kanoon":
        pages = 5 if args.pages is None else args.pages
        if not 1 <= pages <= 10:
            parser.error("Court pages per request must be between 1 and 10.")
        collect_kanoon(ROOT / "kanoon_pilot", args.end, pages, args.court_documents_per_month, args.court_recent_only)
    else:
        pages = 2 if args.pages is None else args.pages
        if not 1 <= pages <= 4:
            parser.error("Media pages per query must be between 1 and 4.")
        if args.district and args.media_scope != "district":
            parser.error("Use --district with --media-scope district.")
        collect_news(ROOT / "news_pilot", args.end, pages, args.media_scope, tuple(args.district or ()))


if __name__ == "__main__":
    main()
