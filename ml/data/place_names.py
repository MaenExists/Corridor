"""Named places in Kerala for map labels and search, from the local OpenStreetMap extract.

One pass over the Geofabrik southern-zone file (ODbL) keeps named settlements (city, town, village, suburb,
neighbourhood, hamlet, locality, quarter), named junctions and public landmarks people navigate by (stations,
bus stands, colleges, hospitals, police stations, markets, parks, attractions). Single dwellings and farms are
left out on purpose: search should find places, never someone's house.

Each place gets its district by point-in-polygon. Settlements just across the border keep the label without a
district, so the map still reads at the edges. The output is local and gitignored; the frontend serves it for
labels and search, so search queries never leave this machine.

    python -m ml.data.place_names
"""

import json
import math
from datetime import date
from pathlib import Path

import numpy as np

from ml.data.context_layers import BOX, OSM, inside_box

DISTRICTS = Path("web/public/geography/kerala-districts.geojson")
STATE = Path("web/public/geography/kerala-state.geojson")
OUT = Path("web/public/generated/places/kerala_places.json")

SETTLEMENT = {"city": 1, "town": 2, "suburb": 3, "village": 3, "quarter": 4, "neighbourhood": 5, "hamlet": 5,
              "locality": 5}
SETTLEMENT_NAME = {"quarter": "neighbourhood", "locality": "locality"}


def landmark(tags):
    """A short kind label for public landmarks, or None."""
    a, r = tags.get("amenity"), tags.get("railway")
    if r in ("station", "halt") and tags.get("station") not in ("subway",):
        return "railway station"
    if a == "bus_station" or tags.get("highway") == "bus_station":
        return "bus stand"
    if a in ("college", "university"):
        return "college"
    if a == "hospital":
        return "hospital"
    if a == "police":
        return "police station"
    if a == "marketplace":
        return "market"
    if a in ("townhall",):
        return "town hall"
    if tags.get("aeroway") == "aerodrome" and tags.get("aerodrome:type") != "military":
        return "airport"
    if tags.get("harbour") is not None or tags.get("landuse") == "port":
        return "harbour"
    if tags.get("tourism") in ("attraction", "viewpoint", "theme_park"):
        return "attraction"
    if tags.get("leisure") in ("park", "stadium"):
        return tags["leisure"]
    if tags.get("shop") == "mall":
        return "mall"
    if tags.get("junction") or (tags.get("highway") in ("traffic_signals",) and "junction" in tags.get("name", "").lower()):
        return "junction"
    return None


def polygons(path):
    geo = json.loads(path.read_text())
    features = geo["features"] if "features" in geo else [{"properties": {}, "geometry": geo.get("geometry", geo)}]
    out = []
    for f in features:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        name = (f.get("properties") or {}).get("name", "")
        name = name.replace(" district", "").strip()
        out.append((name, [[np.asarray(ring, dtype=float) for ring in poly] for poly in polys]))
    return out


def contains(polys, lon, lat):
    """Even-odd ray casting over every ring of every polygon, vectorised over points."""
    inside = np.zeros(len(lon), dtype=bool)
    for poly in polys:
        hit = np.zeros(len(lon), dtype=bool)
        for ring in poly:
            x1, y1 = ring[:, 0], ring[:, 1]
            x2, y2 = np.roll(x1, -1), np.roll(y1, -1)
            for a, b, c, d in zip(x1, y1, x2, y2):
                cross = ((b > lat) != (d > lat)) & (lon < (c - a) * (lat - b) / ((d - b) or 1e-12) + a)
                hit ^= cross
        inside |= hit
    return inside


def extract():
    import osmium

    keys = ("place", "railway", "amenity", "aeroway", "harbour", "landuse", "tourism", "leisure", "shop", "junction",
            "highway")
    found = []
    processor = osmium.FileProcessor(str(OSM)).with_locations().with_filter(osmium.filter.KeyFilter(*keys))
    for obj in processor:
        tags = {t.k: t.v for t in obj.tags}
        name = tags.get("name:en") or tags.get("name")
        if not name or len(name) > 60:
            continue
        place = tags.get("place")
        if place in SETTLEMENT:
            kind, rank = SETTLEMENT_NAME.get(place, place), SETTLEMENT[place]
        else:
            kind = landmark(tags)
            if not kind:
                continue
            rank = 4 if kind in ("railway station", "bus stand", "airport") else 6
        if obj.is_node():
            if not obj.location.valid():
                continue
            lat, lon = obj.location.lat, obj.location.lon
        elif obj.is_way() and place is None:
            try:
                coords = [(n.location.lat, n.location.lon) for n in obj.nodes if n.location.valid()]
            except osmium.InvalidLocationError:
                continue
            if not coords:
                continue
            lat, lon = sum(c[0] for c in coords) / len(coords), sum(c[1] for c in coords) / len(coords)
        else:
            continue
        if not inside_box(lat, lon):
            continue
        ml = tags.get("name:ml", "")
        if ml == name:
            ml = ""
        found.append([name.strip(), ml.strip(), kind, rank, round(lat, 5), round(lon, 5)])
    return found


POSTAL = Path("ml/data/real/public_sources/geo/IN_postal.zip")  # GeoNames postal codes (CC BY 4.0)
POSTAL_DISTRICT = {"Kasargod": "Kasaragod"}
POSTAL_KINDS = ("post office", "pin code")
SEARCH_ONLY_RANK = 7  # above every map-label rank, so these are found by search but never drawn as labels


def fold(s):
    """Same spelling fold as frontend/lib/placeRules.ts, so duplicates are judged the way search sees them."""
    import re
    import unicodedata
    s = "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9]", "", s).replace("zh", "l")
    s = re.sub(r"([tdkgpbcs])h", r"\1", s).replace("w", "v").replace("ee", "i").replace("oo", "u").replace("y", "i")
    return re.sub(r"(.)\1+", r"\1", s)


def add_postal(places):
    """Post-office localities and PIN codes, so villages missing from OpenStreetMap and PIN searches still resolve.

    GeoNames gives each PIN an approximate point, shared by its post offices, so these are search-only entries:
    good enough to find the nearest centres, never drawn on the map. A post office whose name already exists
    within 5 km is skipped.
    """
    import csv
    import io
    import zipfile

    places = [p for p in places if p[2] not in POSTAL_KINDS]
    with zipfile.ZipFile(POSTAL) as archive:
        rows = [r for r in csv.reader(io.TextIOWrapper(archive.open("IN.txt"), "utf-8"), delimiter="\t")
                if r[3] == "Kerala" and r[9] and r[10]]
    known = {}
    for p in places:
        known.setdefault(fold(p[0]), []).append((p[4], p[5]))
    near = lambda a, b, c, d: math.hypot(a - c, (b - d) * math.cos(math.radians(a))) < 0.045  # about 5 km
    by_pin, added = {}, 0
    for r in rows:
        pin, name, lat, lon = r[1], r[2].strip().title(), float(r[9]), float(r[10])
        district = POSTAL_DISTRICT.get(r[5], r[5])
        by_pin.setdefault(pin, []).append((name, lat, lon, district))
        key = fold(name)
        if not key or any(near(lat, lon, a, b) for a, b in known.get(key, [])):
            continue
        known.setdefault(key, []).append((lat, lon))
        places.append([name, "", "post office", SEARCH_ONLY_RANK, round(lat, 5), round(lon, 5), district])
        added += 1
    for pin, offices in sorted(by_pin.items()):
        lat = sum(o[1] for o in offices) / len(offices)
        lon = sum(o[2] for o in offices) / len(offices)
        places.append([f"{pin} · {offices[0][0]}", "", "pin code", SEARCH_ONLY_RANK, round(lat, 5), round(lon, 5), offices[0][3]])
    return places, {"post_offices_added": added, "pin_codes": len(by_pin)}


def build():
    found = extract()
    lat = np.array([p[4] for p in found])
    lon = np.array([p[5] for p in found])
    district = np.array([""] * len(found), dtype=object)
    for name, polys in polygons(DISTRICTS):
        district[contains(polys, lon, lat) & (district == "")] = name
    in_kerala = district != ""

    # Outside Kerala keep only cities and towns, so border areas still read on the map.
    keep = [i for i, p in enumerate(found) if in_kerala[i] or p[3] <= 2]

    # Drop duplicates: same name and kind within 300 m (a node and an area for the same station, say).
    seen, places = {}, []
    for i in sorted(keep, key=lambda i: found[i][3]):
        p = found[i]
        key = (p[0].casefold(), p[2])
        near = seen.get(key, [])
        if any(math.hypot(p[4] - a, (p[5] - b) * math.cos(math.radians(a))) < 0.0027 for a, b in near):
            continue
        seen.setdefault(key, []).append((p[4], p[5]))
        places.append(p + [district[i]])
    places, postal = add_postal(places)
    write(places)
    return summary(places) | postal


SOURCE = ("OpenStreetMap contributors (ODbL), Geofabrik southern-zone extract; "
          "post offices and PIN codes from GeoNames (CC BY 4.0)")


def write(places):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "built_on": date.today().isoformat(),
        "source": SOURCE,
        "fields": ["name", "name_ml", "kind", "rank", "lat", "lon", "district"],
        "places": places,
    }, ensure_ascii=False, separators=(",", ":")))


def postal_only():
    """Refresh only the post-office and PIN entries in an existing list, without re-reading OpenStreetMap."""
    places, postal = add_postal(json.loads(OUT.read_text())["places"])
    write(places)
    return summary(places) | postal


def summary(places):
    counts = {}
    for p in places:
        counts[p[2]] = counts.get(p[2], 0) + 1
    return {"places": len(places), "in_kerala": int(sum(1 for p in places if p[6])), **dict(sorted(counts.items(), key=lambda kv: -kv[1]))}


if __name__ == "__main__":
    import sys
    print(json.dumps(postal_only() if "--postal-only" in sys.argv else build(), indent=1))
