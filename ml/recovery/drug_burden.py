"""Drug-affected areas for the public map: where recorded drug cases concentrate, and how far help is from them.

The access map (access_map.py) measures distance to a de-addiction centre for
everyone. That answers "who is far from help", not "where help is needed".
This module adds the need side, from official counts only:

1. Recorded NDPS cases a year by district: police (NCRB 2022, police units
   merged to districts) plus Excise (the latest 12 months of the verified
   district panel). These are enforcement records. They follow where officers
   look as well as where drugs are, and they are not a count of people who use
   drugs.
2. Each district's cases are spread over its 1 km squares by a mix of where
   people live and where seizures were reported in the news over the last
   three years. The news share is capped at 60% and shrinks for districts with
   few reports, because news coverage favours city desks.
3. Each square gets the estimated recorded cases a year within 5 km, per
   100,000 people living there (areas with under 30 cases a year nearby are not
   graded). Kerala records cases almost everywhere, so grades are relative:
   among populated squares, the top 10% are "high", the next 10% "elevated"
   and the next 10% "some". Together these are the drug-affected areas; the rest are "lower".
   Lower means fewer recorded cases than most of Kerala, not that an area is
   unaffected.

Served output is coarse: one grade per populated square (5 km smoothing),
place-level estimates rounded to tens, and district figures. No report,
coordinate of a seizure or person-level information leaves this module.
"""

import csv
from datetime import date, timedelta
import json
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from ml.data.public_intake import ROOT
from ml.data.place_names import contains, polygons

ACCESS = Path("web/public/generated/recovery/access_map.json")
DISTRICTS = Path("web/public/geography/kerala-districts.geojson")
PLACES = Path("web/public/generated/places/kerala_places.json")
SETTLEMENTS = ("city", "town", "suburb", "village")
NCRB = ROOT / "ncrb_district_sll_ndps.csv"
EXCISE = ROOT / "excise_enforcement_monthly.csv"
INCIDENTS = ROOT / "news" / "seizure_incidents.csv"
OUTPUT = ROOT / "prepared" / "recovery"
SERVED = Path("web/public/generated/recovery")

NEWS_YEARS = 3
NEWS_CAP = 0.6  # at most this share of a district's cases follows the news
NEWS_SHRINK = 30  # reports at which the news share reaches half its cap
NEWS_SIGMA_KM = 2.0
AREA_KM = 5.0
MIN_AREA_CASES = 30
FAR_KM = 10.0
# Shares of populated squares, most recorded cases nearby first.
GRADES = ((0.10, "high"), (0.20, "elevated"), (0.30, "some"))
LAT0, LON0 = 10.5, 76.3
KX, KY = 111.32 * np.cos(np.radians(LAT0)), 110.57

POLICE_UNIT = {
    "Alapuzha": "Alappuzha", "Ernakulam Commr.": "Ernakulam", "Ernakulam Rural": "Ernakulam", "Idukki": "Idukki",
    "Kannur": "Kannur", "Kannur City": "Kannur", "Kannur Rural": "Kannur", "Kasargod": "Kasaragod",
    "Kollam Commr.": "Kollam", "Kollam Rural": "Kollam", "Kottayam": "Kottayam", "Kozhikode Commr.": "Kozhikode",
    "Kozhikode Rural": "Kozhikode", "Malappuram": "Malappuram", "Palakkad": "Palakkad",
    "Pathanamthitta": "Pathanamthitta", "Thrissur Commr.": "Thrissur", "Thrissur City": "Thrissur",
    "Thrissur Rural": "Thrissur", "Trivandrum Commr.": "Thiruvananthapuram", "Trivandrum Rural": "Thiruvananthapuram",
    "Wayanad": "Wayanad", "Wayanadu": "Wayanad",
}


def to_km(lat, lon):
    return np.column_stack([(np.asarray(lon) - LON0) * KX, (np.asarray(lat) - LAT0) * KY])


def official_cases():
    """Recorded NDPS cases a year by district, police plus Excise, with the periods used."""
    police, year = {}, None
    with NCRB.open(encoding="utf-8", newline="") as stream:
        rows = [r for r in csv.DictReader(stream) if r["scope"] == "reporting_unit"]
    year = max(r["year"] for r in rows)
    for r in rows:
        district = POLICE_UNIT.get(r["police_reporting_unit"])
        if r["year"] == year and district:
            police[district] = police.get(district, 0) + int(r["ndps_cases"])
    with EXCISE.open(encoding="utf-8", newline="") as stream:
        panel = list(csv.DictReader(stream))
    months = sorted({r["period_start"] for r in panel})[-12:]
    excise = {}
    for r in panel:
        if r["period_start"] in months:
            excise[r["district"]] = excise.get(r["district"], 0) + int(r["ndps_cases"] or 0)
    total = {d: police.get(d, 0) + excise.get(d, 0) for d in set(police) | set(excise)}
    period = {"police": f"NCRB {year}", "excise": f"{months[0][:7]} to {months[-1][:7]}"}
    return total, police, excise, period


def news_locations(today):
    """Located seizure reports from the last NEWS_YEARS years (private input; used only as weights)."""
    since = (today - timedelta(days=365 * NEWS_YEARS)).isoformat()
    with INCIDENTS.open(encoding="utf-8", newline="") as stream:
        rows = [r for r in csv.DictReader(stream) if r["precision"] == "locality" and r["lat"] and r["published"] >= since]
    return to_km([float(r["lat"]) for r in rows], [float(r["lon"]) for r in rows]), len(rows)


def cell_districts(lat, lon):
    district = np.array([""] * len(lat), dtype=object)
    for name, polys in polygons(DISTRICTS):
        district[contains(polys, lon, lat) & (district == "")] = name
    missing = district == ""
    if missing.any() and (~missing).any():
        tree = cKDTree(np.column_stack([lat[~missing], lon[~missing]]))
        district[missing] = district[~missing][tree.query(np.column_stack([lat[missing], lon[missing]]))[1]]
    return district


def grade_cells(area, populated):
    """Grade populated squares by their rank in recorded cases nearby; returns grades and the case thresholds."""
    grades = np.array(["low"] * len(area), dtype=object)
    values = np.sort(area[populated])[::-1]
    cuts = {}
    for share, name in reversed(GRADES):
        threshold = float(values[int(share * len(values)) - 1])
        grades[populated & (area >= threshold)] = name
        cuts[name] = round(threshold)
    return grades, cuts


def build(today=None):
    today = today or date.today()
    access = json.loads(ACCESS.read_text())
    cells = np.array(access["cells"], dtype=float)
    lat, lon, population, km = cells[:, 0], cells[:, 1], cells[:, 2], cells[:, 3]
    xy = to_km(lat, lon)
    tree = cKDTree(xy)
    district = cell_districts(lat, lon)
    cases, police, excise, period = official_cases()

    news_xy, news_count = news_locations(today)
    news = np.zeros(len(lat))
    if len(news_xy):
        for point, neighbours in zip(news_xy, tree.query_ball_point(news_xy, 4 * NEWS_SIGMA_KM)):
            if not neighbours:
                continue
            w = np.exp(-((xy[neighbours] - point) ** 2).sum(1) / (2 * NEWS_SIGMA_KM ** 2))
            news[neighbours] += w / w.sum()

    estimate = np.zeros(len(lat))
    shares = {}
    for name in sorted(set(district)):
        inside = district == name
        pop_total = population[inside].sum()
        news_total = news[inside].sum()
        reports = int(round(news_total))
        alpha = NEWS_CAP * reports / (reports + NEWS_SHRINK) if news_total > 0 else 0.0
        weight = (1 - alpha) * population[inside] / max(pop_total, 1)
        if news_total > 0:
            weight = weight + alpha * news[inside] / news_total
        estimate[inside] = cases.get(name, 0) * weight
        shares[name] = round(alpha, 2)

    around = tree.query_ball_point(xy, AREA_KM)
    area = np.array([estimate[n].sum() for n in around])
    area_people = np.array([population[n].sum() for n in around])
    # Rank by cases per 100,000 people nearby, so a busy border town counts as much as a city;
    # areas with under MIN_AREA_CASES a year nearby are too thin to grade.
    rate = np.where(area >= MIN_AREA_CASES, area / np.maximum(area_people, 1) * 1e5, 0.0)
    populated = population > 0
    grades, cuts = grade_cells(rate, populated)
    affected = grades != "low"

    # Places: affected squares far from help, grouped by nearest named locality, ranked by cases times extra distance.
    fields = json.loads(PLACES.read_text())
    places = [dict(zip(fields["fields"], row)) for row in fields["places"] if row[2] in SETTLEMENTS and row[6]]
    place_tree = cKDTree(to_km([p["lat"] for p in places], [p["lon"] for p in places]))
    nearest_place = place_tree.query(xy)[1]
    groups = {}
    for i in np.flatnonzero(affected & (km > FAR_KM)):
        place = places[nearest_place[i]]
        g = groups.setdefault(nearest_place[i], {"place": place["name"], "place_ml": place["name_ml"],
                                            "district": district[i], "lat": place["lat"], "lon": place["lon"],
                                            "cases": 0.0, "people": 0.0, "km": 0.0, "burden": 0.0, "grade": "some"})
        g["cases"] += estimate[i]
        g["people"] += population[i]
        g["km"] += estimate[i] * km[i]
        g["burden"] += estimate[i] * (km[i] - FAR_KM)
        if ("high", "elevated", "some").index(grades[i]) < ("high", "elevated", "some").index(g["grade"]):
            g["grade"] = grades[i]
    ranked = []
    for g in sorted(groups.values(), key=lambda g: -g["burden"]):
        if g["cases"] < 5:
            continue  # too few to show (small-cell threshold five)
        ranked.append({"place": g["place"], "place_ml": g["place_ml"], "district": g["district"], "lat": g["lat"],
                       "lon": g["lon"], "grade": g["grade"], "cases_a_year": int(round(g["cases"], -1)) or 10,
                       "people": int(round(g["people"], -2)), "mean_km": round(g["km"] / g["cases"], 1)})
    ranked = ranked[:40]

    by_district = {}
    for name in sorted(set(district)):
        inside = district == name
        total = estimate[inside].sum()
        pop = population[inside].sum()
        by_district[name] = {
            "cases_a_year": int(cases.get(name, 0)), "police": int(police.get(name, 0)), "excise": int(excise.get(name, 0)),
            "per_100k": round(cases.get(name, 0) / max(pop, 1) * 1e5, 1),
            "share_far": round(float(estimate[inside & (km > FAR_KM)].sum() / max(total, 1e-9)), 3),
            "affected_people": int(round(population[inside & affected].sum(), -3)),
            "affected_far_people": int(round(population[inside & affected & (km > FAR_KM)].sum(), -3)),
            "news_weight": shares[name],
        }
    total_cases = estimate.sum()
    summary = {
        "built_on": today.isoformat(), "periods": period, "news_reports_used": news_count,
        "cases_a_year": int(round(total_cases)),
        "share_cases_far": round(float(estimate[km > FAR_KM].sum() / total_cases), 3),
        "affected_people": int(round(population[affected].sum(), -3)),
        "affected_far_people": int(round(population[affected & (km > FAR_KM)].sum(), -3)),
        "affected_far_share": round(float(population[affected & (km > FAR_KM)].sum() / max(population[affected].sum(), 1)), 3),
        "grades": {name: share for share, name in GRADES}, "cases_per_100k_nearby_at_least": cuts, "min_cases_nearby": MIN_AREA_CASES, "area_km": AREA_KM, "far_km": FAR_KM,
        "limits": [
            "Built from recorded police and Excise drug (NDPS) cases, which follow enforcement effort as well as drug activity.",
            "Within a district, cases are placed by where people live and where seizures were reported in the news.",
            "Grades compare areas within Kerala. Lower means fewer recorded cases than most of Kerala, not free of drugs.",
            "It is not a count of people who use drugs.",
        ],
    }
    result = {"meta": summary, "districts": by_district, "places": ranked,
              "cells_columns": ["grade"], "grades": [g[0] if g != "low" else "-" for g in grades]}
    for folder in (OUTPUT, SERVED):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "need_map.json").write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    counts = {g: int(((grades == g) & populated).sum()) for g in ("high", "elevated", "some", "low")}
    print(json.dumps({k: v for k, v in summary.items() if k != "limits"} | {"squares": counts,
                     "top_places": [p["place"] for p in ranked[:10]]}, indent=1))
    return result


if __name__ == "__main__":
    build()
