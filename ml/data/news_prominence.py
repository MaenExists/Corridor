"""How often each Kerala locality appears in the news at all, from the cached sitemaps (offline).

A located seizure report needs a newsroom that covers the place. Coverage is
uneven: city desks, towns with a stringer and big stations appear daily, most
villages almost never. This module runs the seizure geocoder (the same
`locate`) over the slug of every cached Kerala story since 2016, whatever its
topic, and records the date, the 1 km square the place falls in, and whether
the slug is about crime. The grid model uses running counts before each
forecast date as a coverage signal.

Reads only local files under news/sitemaps; never fetches. Output is local
and gitignored (prepared/hotspot_grid/news_prominence.npz).
"""

from datetime import date, datetime
import gzip
import re

import numpy as np

from ml.data import news_incidents as n
from ml.train import hotspot_grid as g

OUTPUT = g.OUTPUT / "news_prominence.npz"
CRIME = re.compile(r"(?<![a-z])(arrest\w*|held|nabbed|police|excise|seiz\w*|raid\w*|case|accused|custody|remand\w*|"
                   r"murder\w*|attack\w*|theft|robbery|smuggl\w*|ganja|mdma|drug\w*|narcotic\w*|crime\w*)(?![a-z])")


def local_stories():
    """(published, source, section, url) for every cached Kerala story, without network access."""
    raw = n.RAW
    for path in sorted((raw / "nie").glob("20*.xml.gz")):
        for url, _ in n.entries(gzip.decompress(path.read_bytes())):
            section, found = n.NIE_SECTIONS.search(url), n.NIE_DATE.search(url)
            if section and found:
                day = datetime.strptime(" ".join(found.groups()), "%Y %b %d").date()
                yield day, "nie", section.group(1).split("/")[-1], url
    for path in sorted((raw / "toi").glob("20*.xml.gz")):
        for url, mod in n.entries(gzip.decompress(path.read_bytes())):
            section = n.TOI_SECTIONS.search(url)
            if section and mod:
                yield date.fromisoformat(mod[:10]), "toi", section.group(1), url
    for path in sorted((raw / "asianet").glob("20*.xml.gz")):
        body = gzip.decompress(path.read_bytes())
        if body[:2] == b"\x1f\x8b":
            body = gzip.decompress(body)
        day = date.fromisoformat(path.name[:10])
        for url, _ in n.entries(body):
            section = n.ASIANET_SECTIONS.search(url)
            if section:
                yield day, "asianet", section.group(1), url
    for path in sorted((raw / "n18").glob("20*.xml.gz")):
        day = date.fromisoformat(path.name[:10])
        for loc in re.findall(rb"<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</loc>", gzip.decompress(path.read_bytes())):
            url = loc.decode("utf-8", "replace")
            if n.N18_SECTION.search(url):
                yield day, "n18", "kerala", url
    if (raw / "madhyamam" / "sitemap-index.xml.gz").exists():
        # Dated by the sitemap's last-modified stamp: never earlier than publication, so no look-ahead.
        for row in n.madhyamam_rows(refresh=False):
            yield date.fromisoformat(row["published"]), "madhyamam", row["section"], row["url"]
    seen = set()
    for path in sorted((raw / "onm").glob("*.xml.gz")):
        for url, _ in n.entries(gzip.decompress(path.read_bytes())):
            found = n.ONM_PATH.search(url)
            if found and ".amp." not in url and url not in seen:
                seen.add(url)
                yield date(*map(int, found.groups())), "onm", "kerala", url


def build():
    grid = g.Grid()
    index = n.place_index()
    days, cells, crime, located, total = [], [], [], 0, 0
    seen = set()
    for day, source, section, url in local_stories():
        if url in seen:
            continue
        seen.add(url)
        total += 1
        text = n.slug(url).replace("-", " ")
        place = n.locate(text, section, index)
        if not place or place["precision"] != "locality":
            continue
        located += 1
        cell = int(grid.tree.query(g.to_km([place["lat"]], [place["lon"]]))[1][0])
        days.append(g.day_number(day))
        cells.append(cell)
        crime.append(bool(CRIME.search(n.plain(text))))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUTPUT, day=np.array(days, np.int32), cell=np.array(cells, np.int32), crime=np.array(crime))
    print(f"{total} Kerala stories read, {located} located to a locality "
          f"({sum(crime)} crime), {len(set(cells))} distinct squares")


def load():
    data = np.load(OUTPUT)
    return data["day"], data["cell"], data["crime"]


if __name__ == "__main__":
    build()
