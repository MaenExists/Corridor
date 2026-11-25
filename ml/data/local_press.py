"""Sample matched government releases from a district-stratified public search manifest."""

from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from hashlib import sha256
import json
from urllib.parse import urlsplit
from urllib.request import Request, build_opener

from bs4 import BeautifulSoup

from ml.data.real_input import DISTRICTS, private_write
from ml.data.source_api import IST, ROOT, KeepCredentialOnHost, write_rows
from ml.data.source_review import ENFORCEMENT, find_candidates

KEYWORDS = ("ndps", "narcotic", "ganja", "cannabis", "mdma", "heroin", "contraband",
            "ലഹരി", "മയക്കുമരുന്ന്", "കഞ്ചാവ്", "എംഡിഎംഎ")
MAX_HTML_BYTES = 5 * 1024 * 1024


def public_release_url(url):
    parsed = urlsplit(url)
    hostname = parsed.hostname or ""
    allowed = any(hostname == suffix or hostname.endswith("." + suffix)
                  for suffix in ("prd.kerala.gov.in", "keralapolice.gov.in"))
    return parsed.scheme == "https" and allowed and not (parsed.query or parsed.username)


def published_marker(soup):
    for attribute in (
        ("meta[property='article:published_time']", "content"),
        ("time[datetime]", "datetime"),
        ("meta[name='dcterms.date']", "content"),
    ):
        selector, field = attribute
        element = soup.select_one(selector)
        if element and element.get(field):
            return element[field]
    return None


def retrieve(root, url):
    cache = root / (sha256(url.encode()).hexdigest() + ".html")
    if cache.exists():
        html = cache.read_text(encoding="utf-8")
    else:
        opener = build_opener(KeepCredentialOnHost())
        request = Request(url, headers={"User-Agent": "Corridor research collection/1.0"})
        try:
            with opener.open(request, timeout=18) as response:
                if "html" not in response.headers.get("Content-Type", ""):
                    return {"status": "not_html"}
                data = response.read(MAX_HTML_BYTES + 1)
        except OSError:
            return {"status": "request_failed"}
        if len(data) > MAX_HTML_BYTES:
            return {"status": "size_cap"}
        html = data.decode("utf-8", errors="replace")
        private_write(cache, html)
    soup = BeautifulSoup(html, "html.parser")
    article = soup.select_one("article") or soup.select_one("main")
    if article is None:
        return {"status": "article_unavailable"}
    title = article.select_one("h1") or soup.select_one("h1")
    paragraphs = [node.get_text(" ", strip=True) for node in article.find_all("p")]
    body = " ".join(paragraphs).casefold()
    if not any(term in body for term in KEYWORDS) or not ENFORCEMENT.search(body):
        return {"status": "not_a_keyword_candidate"}
    checked = datetime.fromtimestamp(cache.stat().st_mtime, IST).date().isoformat()
    return {
        "status": "keyword_candidate", "query_review_required": True,
        "checked_on": checked, "source_date_marker": published_marker(soup),
        "title": title.get_text(" ", strip=True) if title else None,
        "clause_candidates": find_candidates(paragraphs),
    }


def main():
    root = ROOT / "official_local"
    manifest = json.loads((root / "web_discovery.json").read_text(encoding="utf-8"))
    districts = defaultdict(set)
    for district, url in manifest:
        if district in DISTRICTS and public_release_url(url):
            districts[url].add(district)
    cache = root / "responses"
    cache.mkdir(parents=True, exist_ok=True, mode=0o700)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda url: retrieve(cache, url), districts))
    candidates, coverage = [], defaultdict(Counter)
    for (url, matched_queries), result in zip(districts.items(), results, strict=True):
        for district in matched_queries:
            coverage[district][result["status"]] += 1
        if result["status"] == "keyword_candidate":
            candidates.append(dict(result, source_url=url, district_queries=sorted(matched_queries)))
    private_write(root / "review_candidates.json", json.dumps(candidates, ensure_ascii=False))
    statuses = ("keyword_candidate", "not_a_keyword_candidate", "article_unavailable", "request_failed",
                "not_html", "size_cap")
    write_rows(root / "coverage.csv", ("district_queried", *statuses),
               [(district, *(coverage[district][key] for key in statuses)) for district in DISTRICTS])
    print(f"Government district search: {len(districts)} distinct URLs checked, "
          f"{len(candidates)} local report candidates.", flush=True)


if __name__ == "__main__":
    main()
