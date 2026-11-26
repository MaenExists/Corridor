"""Recovery access map: where people in Kerala are far from de-addiction help.

The map is precise about services and places, never about people:

* service points: registered de-addiction centres from the Kerala State
  Mental Health Authority register (with de-addiction beds) and the 14
  government Vimukthi centres,
* a 1 km population grid (WorldPop 2020) clipped to Kerala,
* for every cell, the distance to the nearest centre and the de-addiction beds
  within reach per 100,000 people competing for them (a two-step catchment),
* ranked priority places: named localities where the most people live beyond
  reach of a centre, for services planning outreach or new capacity,
* district context: latest recorded Excise NDPS cases and yearly history,
  labelled as enforcement records rather than a measure of people affected.

It contains no record about any person and no layer that labels where people
who use drugs live. Centre locations use the PIN-code centroid or the matched
town, so they are approximate to a few kilometres and are labelled as such.
"""

import argparse
import csv
from datetime import date
import io
import json
import math
from pathlib import Path
import re
import zipfile

import numpy as np

from ml.data.public_intake import ROOT

GEO = ROOT / "geo"
REGISTER = ROOT / "health" / "registered.pdf"
VIMUKTHI = ROOT / "recovery_directory.csv"
POPULATION = GEO / "ind_ppp_2020_1km_Aggregated.tif"
POSTAL = GEO / "IN_postal.zip"
STATE = Path("web/public/geography/kerala-state.geojson")
GAZETTEER = Path("web/public/geography/kerala-places.json")
OUTPUT = ROOT / "prepared" / "recovery"
SERVED = Path("web/public/generated/recovery")

REACH_KM = 25.0  # catchment for beds within reach
FAR_KM = 10.0  # straight-line distance beyond which travel burden counts
REG_NO = re.compile(r"\b[A-Z]/\d+/20\d{2}/SMHA\b")
PIN = re.compile(r"\b(6[789]\d)\s?(\d{3})\b")
DISTRICT_FROM_POSTAL = {
    "Thiruvananthapuram": "Thiruvananthapuram", "Kollam": "Kollam", "Pathanamthitta": "Pathanamthitta",
    "Alappuzha": "Alappuzha", "Kottayam": "Kottayam", "Idukki": "Idukki", "Ernakulam": "Ernakulam",
    "Thrissur": "Thrissur", "Palakkad": "Palakkad", "Malappuram": "Malappuram", "Kozhikode": "Kozhikode",
    "Wayanad": "Wayanad", "Kannur": "Kannur", "Kasargod": "Kasaragod", "Kasaragod": "Kasaragod",
}


def haversine(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def postal_centroids():
    with zipfile.ZipFile(POSTAL) as archive:
        rows = [row for row in csv.reader(io.TextIOWrapper(archive.open("IN.txt"), "utf-8"), delimiter="\t")
                if row[3] == "Kerala" and row[9] and row[10]]
    groups = {}
    for row in rows:
        groups.setdefault(row[1], []).append((float(row[9]), float(row[10]), DISTRICT_FROM_POSTAL.get(row[5])))
    return {pin: (float(np.mean([v[0] for v in values])), float(np.mean([v[1] for v in values])),
                  next((v[2] for v in values if v[2]), None)) for pin, values in groups.items()}


def parse_register(text):
    """Registered de-addiction centres: name, registration, PIN and bed counts as printed."""
    lines = text.splitlines()
    starts = [i for i, line in enumerate(lines) if re.match(r"\s*\d{2,3}\s+\S", line)
              and any(REG_NO.search(candidate) for candidate in lines[i:i + 3])]
    centres = []
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else min(len(lines), start + 14)
        block = lines[start:end]
        reg_line = next(line for line in block if REG_NO.search(line))
        registration = REG_NO.search(reg_line)[0]
        after = re.sub(r"\d{2}[./]\d{2}[./]\d{4}", " ", reg_line[REG_NO.search(reg_line).end():])
        numbers = [int(value) for value in re.findall(r"(?<![\w.])\d{1,4}(?![\w.])", after)]
        first = re.sub(r"^\s*\d{2,3}\s+", lambda m: " " * len(m[0]), block[0])
        segment = re.search(r"\S.*?(?=\s{2,}|$)", first)
        left, right = (segment.start(), segment.end()) if segment else (0, 20)
        name_parts = []
        for line in block[:5]:
            line = re.sub(r"^\s*\d{2,3}\s+", lambda m: " " * len(m[0]), line)
            piece = re.match(r"\s*(\S.*?)(?=\s{2,}|$)", line)
            if not piece or abs(piece.start(1) - left) > 4:
                break
            text = piece[1].strip()
            if re.search(r"Ph|@|P\.?\s?O|\d{3}", text):
                break
            name_parts.append(text)
        pin = next((match[1] + match[2] for line in block for match in [PIN.search(line)] if match), None)
        name = re.sub(r"\s+", " ", " ".join(name_parts))
        name = re.split(r"\b(?:The (?:Director|Secretary|Managing|Administrator|Superintendent|Medical|Chief|Consultant|"
                        r"President|Manager|Principal|Mother|Executive|Proprietor)|Dr\.?\s?[A-Z]|Managing)", name)[0]
        words = name.split()
        half = len(words) // 2
        if half and words[:half] == words[half:2 * half]:
            name = " ".join(words[:half])
        centres.append({
            "name": name.strip(" ,-") or registration,
            "registration": registration,
            "pin": pin,
            # Rows print either a male/female/child/de-addiction/total split or one establishment figure.
            "deaddiction_beds": numbers[3] if len(numbers) >= 4 else (numbers[0] if numbers else None),
            "bed_figure": "deaddiction_split" if len(numbers) >= 4 else ("establishment_total" if numbers else "none"),
            "register_category": (re.findall(r"\b([A-F])\s*$", reg_line) or [None])[0],
            "total_beds": numbers[-1] if numbers else None,
            "kind": "registered_deaddiction_centre",
        })
    unique = {}
    for centre in centres:
        unique.setdefault(centre["registration"], centre)
    return list(unique.values())


def kerala_mask(lats, lons):
    """Even-odd point-in-polygon test of grid cell centres against the Kerala outline."""
    geometry = json.loads(STATE.read_text())["geometry"]
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    inside = np.zeros(lats.shape, bool)
    for polygon in polygons:
        for ring in polygon:
            ring = np.asarray(ring)
            x1, y1 = ring[:-1, 0], ring[:-1, 1]
            x2, y2 = ring[1:, 0], ring[1:, 1]
            for a, b, c, d in zip(x1, y1, x2, y2):
                crosses = ((b > lats) != (d > lats)) & (lons < (c - a) * (lats - b) / ((d - b) or 1e-12) + a)
                inside ^= crosses
    return inside


def population_grid():
    import tifffile
    with tifffile.TiffFile(POPULATION) as tiff:
        page = tiff.pages[0]
        tags = {tag.name: tag.value for tag in page.tags.values()}
        data = page.asarray()
    scale_x, scale_y, _ = tags["ModelPixelScaleTag"]
    _, _, _, origin_x, origin_y, _ = tags["ModelTiepointTag"]
    rows = slice(int((origin_y - 12.85) / scale_y), int((origin_y - 8.15) / scale_y))
    cols = slice(int((74.85 - origin_x) / scale_x), int((77.45 - origin_x) / scale_x))
    block = np.where(data[rows, cols] < 0, 0, data[rows, cols]).astype(float)
    lat = origin_y - (np.arange(rows.start, rows.stop) + 0.5) * scale_y
    lon = origin_x + (np.arange(cols.start, cols.stop) + 0.5) * scale_x
    lats, lons = np.meshgrid(lat, lon, indexing="ij")
    keep = kerala_mask(lats, lons) & (block > 0)
    return lats[keep], lons[keep], block[keep], float(scale_x)


def district_name(value):
    from ml.data.real_input import DISTRICT
    text = re.sub(r"(?i)\s+district$", "", str(value or "")).strip()
    aliases = {"pattanamtitta": "Pathanamthitta", "kasargod": "Kasaragod", "trivandrum": "Thiruvananthapuram"}
    return DISTRICT.get(text.casefold()) or aliases.get(text.casefold())


def plain(text):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)).casefold()


GEOCODE_CACHE = GEO / "geocode_cache.json"


def geocode(query):
    """Public OpenStreetMap geocoder for a town and district name only, cached locally."""
    cache = json.loads(GEOCODE_CACHE.read_text()) if GEOCODE_CACHE.exists() else {}
    if query not in cache:
        import time
        from urllib.parse import urlencode
        from urllib.request import Request, urlopen
        url = "https://nominatim.openstreetmap.org/search?" + urlencode({"q": query, "format": "json", "limit": 1})
        with urlopen(Request(url, headers={"User-Agent": "NarcoTrace public research client"}), timeout=60) as response:
            found = json.loads(response.read())
        cache[query] = [float(found[0]["lat"]), float(found[0]["lon"])] if found else None
        GEOCODE_CACHE.write_text(json.dumps(cache, indent=1))
        time.sleep(1.2)
    return cache[query]


def gazetteer():
    data = json.loads(GAZETTEER.read_text())
    return [place for place in data["places"] if place.get("lat") and place.get("lon")]


def locate_vimukthi(places):
    """Match each Vimukthi hospital to its named town in the gazetteer."""
    centres = []
    with VIMUKTHI.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            stop = {"district", "hospital", "general", "government", "taluk", "head", "quarters", "town", "beach",
                    "medical", "college", "centre", "center", "memorial", "specialty", "tribal", "rama", "rao", "ramarao"}
            words = [word for word in re.findall(r"[A-Za-z]+", row["facility"]) if word.lower() not in stop]
            district = row["district"]
            match = None
            for word in words:
                candidates = [place for place in places if plain(place["name"]) == plain(word)
                              or plain(word) in plain(str(place.get("aliases", ""))).split()]
                candidates.sort(key=lambda place: district_name(place.get("district")) != district)
                if candidates:
                    match = candidates[0]
                    break
            if match is None and words:
                located = geocode(f"{words[0]}, {district}, Kerala, India")
                if located:
                    match = {"lat": located[0], "lon": located[1], "name": f"{words[0]} (OpenStreetMap geocoder)"}
            centres.append({"name": row["facility"], "district": district, "kind": "vimukthi_government_centre",
                            "lat": match["lat"] if match else None, "lon": match["lon"] if match else None,
                            "location_basis": f"town: {match['name']}" if match else "unlocated",
                            "deaddiction_beds": None, "listed_on": row["listed_on"]})
    return centres


def two_step_access(cell_lat, cell_lon, population, centre_lat, centre_lon, beds):
    """Beds within reach per 100,000 people, sharing each centre's beds among everyone within reach."""
    access = np.zeros(len(cell_lat))
    for lat, lon, capacity in zip(centre_lat, centre_lon, beds):
        if not capacity:
            continue
        distance = haversine(cell_lat, cell_lon, lat, lon)
        near = distance <= REACH_KM
        demand = population[near].sum()
        if demand > 0:
            access[near] += capacity / demand * 100000
    return access


def nearest_places(lats, lons, coords, batch=2000):
    """Index of the nearest gazetteer locality for each point."""
    output = np.empty(len(lats), int)
    for start in range(0, len(lats), batch):
        a, b = lats[start:start + batch, None], lons[start:start + batch, None]
        output[start:start + batch] = np.argmin(haversine(a, b, coords[None, :, 0], coords[None, :, 1]), axis=1)
    return output


def district_context():
    panel_path = ROOT / "excise_enforcement_monthly.csv"
    live_path = ROOT / "excise_live_months.csv"
    context = {}
    if panel_path.exists():
        with panel_path.open(encoding="utf-8", newline="") as stream:
            for row in csv.DictReader(stream):
                year = row["period_start"][:4]
                yearly = context.setdefault(row["district"], {"yearly_ndps_cases": {}})["yearly_ndps_cases"]
                yearly[year] = yearly.get(year, 0) + int(row["ndps_cases"])
    if live_path.exists():
        with live_path.open(encoding="utf-8", newline="") as stream:
            rows = list(csv.DictReader(stream))
        latest = max(row["period_start"] for row in rows)
        for row in rows:
            if row["period_start"] == latest:
                context.setdefault(row["district"], {"yearly_ndps_cases": {}})["latest_month"] = {
                    "month": latest[:7], "ndps_cases": int(row["count"]), "retrieved_on": row["available_on"]}
    return context


def build():
    places = gazetteer()
    coords = np.array([[place["lat"], place["lon"]] for place in places])
    postal = postal_centroids()
    from subprocess import check_output
    register = parse_register(check_output(["pdftotext", "-layout", str(REGISTER), "-"], text=True))
    for centre in register:
        located = postal.get(centre["pin"] or "")
        centre.update({"lat": located[0] if located else None, "lon": located[1] if located else None,
                       "district": located[2] if located else None,
                       "location_basis": f"PIN {centre['pin']} centroid" if located else "unlocated"})
    centres = [centre for centre in register + locate_vimukthi(places) if centre["lat"] is not None]
    unlocated = len(register) + 14 - len(centres)

    lats, lons, population, step = population_grid()
    centre_lat = np.array([centre["lat"] for centre in centres])
    centre_lon = np.array([centre["lon"] for centre in centres])
    nearest = np.full(len(lats), np.inf)
    for lat, lon in zip(centre_lat, centre_lon):
        nearest = np.minimum(nearest, haversine(lats, lons, lat, lon))
    beds = [centre["deaddiction_beds"] or 0 for centre in centres]
    access = two_step_access(lats, lons, population, centre_lat, centre_lon, beds)

    # Priority places: group far-from-help cells by their nearest named locality.
    far = nearest > FAR_KM
    locality = nearest_places(lats, lons, coords)
    groups = {}
    for index, people, distance in zip(locality[far], population[far], nearest[far]):
        place = places[index]
        key = place["id"]
        entry = groups.setdefault(key, {"place": place["name"], "taluk": place.get("subdistrict"),
                                        "district": district_name(place.get("district")),
                                        "lat": place["lat"], "lon": place["lon"], "people_far_from_help": 0.0,
                                        "distance_weighted": 0.0})
        entry["people_far_from_help"] += people
        entry["distance_weighted"] += people * distance
        entry["burden"] = entry.get("burden", 0.0) + people * (distance - FAR_KM)
    # Rank by people-kilometres beyond reach, so remote and populous places both count.
    priority = sorted(groups.values(), key=lambda entry: -entry["burden"])
    for entry in priority:
        entry["mean_distance_km"] = round(entry.pop("distance_weighted") / entry["people_far_from_help"], 1)
        entry["people_far_from_help"] = int(round(entry["people_far_from_help"], -2))
        entry["burden_people_km"] = int(round(entry.pop("burden"), -3))
    priority = [entry for entry in priority if entry["people_far_from_help"] >= 1000][:40]

    by_district = {}
    district_of_cell = [district_name(places[index].get("district")) for index in locality]
    for district, people, distance, reach in zip(district_of_cell, population, nearest, access):
        entry = by_district.setdefault(district, {"population": 0.0, "far": 0.0, "low_access": 0.0})
        entry["population"] += people
        entry["far"] += people * (distance > FAR_KM)
        entry["far20"] = entry.get("far20", 0.0) + people * (distance > 20)
        entry["low_access"] += people * (reach < 5)
    context = district_context()
    districts = {}
    for district, entry in by_district.items():
        if not district:
            continue
        own = [centre for centre in centres if centre.get("district") == district]
        beds_per_100k = sum(centre["deaddiction_beds"] or 0 for centre in own) / entry["population"] * 100000
        districts[district] = {
            "population_2020": int(round(entry["population"], -3)),
            "share_over_10km_from_centre": round(entry["far"] / entry["population"], 3),
            "share_over_20km_from_centre": round(entry["far20"] / entry["population"], 3),
            "share_under_5_beds_per_100k_within_reach": round(entry["low_access"] / entry["population"], 3),
            "centres": len(own), "deaddiction_beds_listed": int(sum(centre["deaddiction_beds"] or 0 for centre in own)),
            "listed_beds_per_100k": round(beds_per_100k, 1),
            **context.get(district, {}),
        }

    today = date.today().isoformat()
    meta = {
        "built_on": today,
        "freshness": {
            **(json.loads(FRESHNESS.read_text()) if FRESHNESS.exists() else {}),
            "population": "WorldPop 2020, 1 km, unconstrained",
            "vimukthi_listed_on": next((c.get("listed_on") for c in centres if c.get("listed_on")), None),
        },
        "reach_km": REACH_KM, "far_km": FAR_KM, "cell_degrees": step,
        "centres_located": len(centres), "centres_unlocated": unlocated,
        "location_precision": "PIN-code centroid or matched town; approximate to a few kilometres",
        "limits": [
            "Distances are straight-line, not travel time.",
            "Beds are as printed in the register; some rows omit a de-addiction bed split.",
            "Enforcement counts show where cases were recorded, not where people who need help live.",
            "No layer estimates where people who use drugs live.",
        ],
    }
    cells = [[round(float(a), 4), round(float(b), 4), int(round(p)), round(float(d), 1), round(float(r), 1)]
             for a, b, p, d, r in zip(lats, lons, population, nearest, access)]
    result = {"meta": meta, "centres": centres, "priority_places": priority, "districts": districts,
              "cells_columns": ["lat", "lon", "population", "km_to_nearest_centre", "beds_per_100k_within_reach"],
              "cells": cells}
    for folder in (OUTPUT, SERVED):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "access_map.json").write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    total = population.sum()
    print(f"{len(centres)} centres located ({unlocated} unlocated). {len(lats)} grid cells, population {total / 1e6:.1f} million. "
          f"{population[far].sum() / total:.1%} live over {FAR_KM:.0f} km from a centre. "
          f"Top priority place: {priority[0]['place']} ({priority[0]['district']}).")
    return result


REGISTER_URL = "https://www.ksmha.org/Documents/Registered%20MHE.pdf"
DIRECTORY_URL = "https://mayangillakeralam.kerala.gov.in/de-addiction-centres"
FRESHNESS = OUTPUT / "source_freshness.json"


def refresh():
    """Fetch the latest public register, centre directory and Excise month, keeping dated copies."""
    from bs4 import BeautifulSoup
    from hashlib import sha256
    from ml.data.excise_enforcement import fetch, snapshot
    from ml.data.public_intake import service_directory, write_csv

    today = date.today().isoformat()
    freshness = json.loads(FRESHNESS.read_text()) if FRESHNESS.exists() else {}
    register = fetch(REGISTER_URL)
    if register[:5] == b"%PDF-":
        digest = sha256(register).hexdigest()
        if not REGISTER.exists() or sha256(REGISTER.read_bytes()).hexdigest() != digest:
            REGISTER.write_bytes(register)
        freshness["registered_centres"] = {"checked_on": today, "sha256": digest, "url": REGISTER_URL}
    page = fetch(DIRECTORY_URL).decode("utf-8", "replace")
    (ROOT / "health" / "vimukthi.html").write_text(page, encoding="utf-8")
    rows = service_directory(BeautifulSoup(page, "html.parser"), today)
    if len(rows) >= 14:
        write_csv(VIMUKTHI, ("district", "facility", "source", "listed_on"), rows)
        freshness["vimukthi_centres"] = {"checked_on": today, "centres": len(rows), "url": DIRECTORY_URL}
    snapshot()
    freshness["enforcement_context"] = {"checked_on": today}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    FRESHNESS.write_text(json.dumps(freshness, indent=1))


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true", help="fetch the latest public sources before building")
    if parser.parse_args().refresh:
        refresh()
    build()


if __name__ == "__main__":
    main()
