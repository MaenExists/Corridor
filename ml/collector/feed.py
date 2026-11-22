"""Parse and seed only local fictional RSS/Atom; never fetches a feed URL."""
from datetime import date, datetime
from email.utils import parsedate_to_datetime
from hashlib import sha256
from pathlib import Path
from urllib.request import Request, urlopen
import json
import os
import re
from xml.etree import ElementTree
from ml.data.real_input import DISTRICTS
from ml.local_api import local_api

ATOM = "{http://www.w3.org/2005/Atom}"
COR = "{urn:corridor:fixture}"
BASE_PATH = "/api/review-queue"
FIXTURES = (Path("ml/collector/fixtures/demo.rss"), Path("ml/collector/fixtures/demo.atom"))


def tokens(title):
    return set(re.findall(r"[a-z0-9]+", title.casefold())) - {"fictional", "a", "to", "the", "in", "with"}


def day(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            return parsedate_to_datetime(value).date().isoformat()


def parse(raw):
    if len(raw) > 200_000 or re.search(br"<!DOCTYPE|<!ENTITY", raw, re.I):
        raise ValueError("Unsupported local feed document")
    root = ElementTree.fromstring(raw)
    if root.tag == "rss":
        items, prefix, channel = root.findall("./channel/item"), "", root.find("channel")
    elif root.tag == ATOM + "feed":
        items, prefix, channel = root.findall(ATOM + "entry"), ATOM, root
    else:
        raise ValueError("Only RSS and Atom metadata is accepted")
    source = channel.findtext(prefix + "title", "") if channel is not None else ""
    for item in items:
        title = item.findtext(prefix + "title", "").strip()
        link = item.find(prefix + "link")
        url = "" if link is None else (link.get("href") or link.text or "").strip()
        publication = day(item.findtext(ATOM + "published") if prefix else item.findtext("pubDate"))
        event = day(item.findtext(COR + "event_date"))
        district = item.findtext(COR + "district")
        if not (title.startswith("[FICTIONAL] ") and re.fullmatch(r"Fictional [a-zA-Z ]{3,42}", source)
                and publication and district in DISTRICTS and re.fullmatch(r"https://fixture.invalid/[A-Za-z0-9/_-]+", url)):
            raise ValueError("Only labeled fictional fixture metadata is accepted")
        yield {"synthetic": True, "id": "fx-" + sha256(url.encode()).hexdigest()[:18], "title": title,
               "title_hash": sha256(" ".join(sorted(tokens(title))).encode()).hexdigest(),
               "source": source, "district": district, "source_ref": url, "event_date": event, "publication_date": publication}


def find_duplicate(item, others):
    a = tokens(item["title"])
    for prior in others:
        if prior["id"] == item["id"] or prior["district"] != item["district"]:
            continue
        if abs((date.fromisoformat(item["publication_date"]) - date.fromisoformat(prior["publication_date"])).days) > 4:
            continue
        b = tokens(prior["title"])
        if len(a & b) >= 4 and len(a & b) / max(1, len(a | b)) >= .65:
            return prior.get("duplicate_of") or prior["id"]
    return None


def run():
    key = os.environ.get("CORRIDOR_REVIEW_KEY")
    if not key:
        raise SystemExit("Set CORRIDOR_REVIEW_KEY to the local key printed by make demo.")
    base = local_api(BASE_PATH)
    with urlopen(base, timeout=5) as f:
        current = json.load(f)["items"]
    known = {r["id"] for r in current}
    new = []
    for row in sorted((r for p in FIXTURES for r in parse(p.read_bytes())), key=lambda r:(r["publication_date"],r["id"])):
        if row["id"] in known:
            continue
        row["duplicate_of"] = find_duplicate(row, current + new)
        request = Request(base, data=json.dumps(row).encode(), method="POST",
                          headers={"X-Corridor-Review-Key": key, "Content-Type": "application/json"})
        with urlopen(request, timeout=5) as f:
            result = json.load(f)
        if result.get("synthetic") is not True:
            raise SystemExit("Unexpected fixture API track.")
        new.append(row)
    print(f"SYNTHETIC inbox: {len(new)} new fixture items, {sum(bool(r['duplicate_of']) for r in new)} possible duplicates.")


if __name__ == "__main__":
    run()
