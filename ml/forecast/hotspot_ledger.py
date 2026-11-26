"""Forecast ledger: freeze each issued hotspot list, then score it once its four weeks have passed.

This turns the hotspot forecast into a live, checkable prediction. `issue`
records, for an as-of date, exactly which 1 km squares each list flagged:

* grid_ranker: the served four-week forecast (top 1% of squares);
* repeat_locality_1km: the "same locality again" baseline of the same size;
* new_place_watch: the v2 new-place watch list (top 1% of fresh squares);
* population_fresh: the most populous fresh squares, same size (its rival);
* emerging: the v2 emerging-cluster zones.

An entry is never overwritten. `score` checks every entry whose window has
ended (plus a few days for late stories) against located reports published in
that window, and writes totals. The ledger holds square indices and zone
centres; it stays local and gitignored with the other model outputs. The served
summary has counts only.
"""

import argparse
import csv
from datetime import date, datetime, timedelta, timezone
import hashlib
import json

import numpy as np
from scipy.spatial import cKDTree

from ml.train import hotspot_grid as g
from ml.train import hotspot_patterns as p

LEDGER = g.OUTPUT / "ledger"
SERVED = g.SERVED / "ledger.json"
V2 = g.SERVED / "patterns_v2.json"
GRID = g.SERVED / "grid_forecast.json"
MATURE_DAYS = 3
PRE_REGISTERED_START = date(2026, 12, 1)


def inputs_hash(as_of):
    with g.INCIDENTS.open(encoding="utf-8", newline="") as stream:
        rows = sorted(",".join(r.values()) for r in csv.DictReader(stream) if r["published"] < as_of.isoformat())
    return hashlib.sha256("\n".join(rows).encode()).hexdigest(), len(rows)


def issue(as_of, force=False):
    path = LEDGER / f"{as_of}.json"
    if path.exists() and not force:
        print(f"ledger entry for {as_of} exists; not overwritten")
        return json.loads(path.read_text())
    forecast = json.loads(GRID.read_text())
    v2 = json.loads(V2.read_text()) if V2.exists() else None
    if forecast["as_of"] != as_of.isoformat():
        raise SystemExit(f"served grid forecast is for {forecast['as_of']}, not {as_of}; run make hotspot-forecast AS_OF={as_of}")
    grid = g.Grid()
    events = g.load_events()
    origin = g.day_number(as_of)
    n_top = int(round(0.01 * grid.size))
    snap = lambda pts: sorted({int(i) for i in grid.tree.query(g.to_km([q[0] for q in pts], [q[1] for q in pts]))[1]})
    flagged = snap([(c["lat"], c["lon"]) for c in forecast["cells"]])
    repeat = g.density(grid, events, g.location_weights(events, origin), 1.0)
    fresh = p.new_place_mask(events, origin, grid)
    lists = {
        "grid_ranker": flagged,
        "repeat_locality_1km": sorted(int(c) for c in np.lexsort((-grid.population, -repeat))[:n_top]),
        "population_fresh": sorted(int(c) for c in np.argsort(-np.where(fresh, grid.population, -1))[:n_top]),
    }
    for name, file in (("v1_grid_ranker", g.SERVED / "grid_forecast_v1.json"), ("v3_challenger", g.SERVED / "grid_forecast_v3.json")):
        if file.exists():
            other = json.loads(file.read_text())
            if other["as_of"] == as_of.isoformat():
                lists[name] = snap([(c["lat"], c["lon"]) for c in other["cells"]])
    emerging = []
    if v2 and v2["as_of"] == as_of.isoformat():
        lists["new_place_watch"] = snap(v2["new_place_cells"])
        emerging = [{"lat": e["centre"]["lat"], "lon": e["centre"]["lon"], "radius_km": e["radius_km"],
                     "observed": e["observed"], "expected": e["expected"]} for e in v2["emerging"]]
    digest, known = inputs_hash(as_of)
    entry = {"as_of": as_of.isoformat(), "horizon_days": forecast["horizon_days"],
             "issued_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
             "grid_cells": grid.size, "located_reports_known": int((events["t"] < origin).sum()),
             "incident_rows_known": known, "inputs_sha256": digest,
             "models": {"grid": forecast.get("model"), "v2": v2 and v2["decision"]},
             "pre_registered": as_of >= PRE_REGISTERED_START, "lists": lists, "emerging": emerging}
    LEDGER.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(entry))
    print(f"ledger: froze {', '.join(f'{k} {len(v)}' for k, v in lists.items())}, {len(emerging)} emerging zones for {as_of}")
    return entry


def score(today=None):
    today = today or date.today()
    grid = g.Grid()
    events = g.load_events()
    cells = g.event_cells(grid, events)
    latest = int(events["t"].max()) if len(events["t"]) else 0
    rows, pending = [], []
    for path in sorted(LEDGER.glob("20*.json")):
        entry = json.loads(path.read_text())
        as_of = date.fromisoformat(entry["as_of"])
        origin, horizon = g.day_number(as_of), entry["horizon_days"]
        if origin + horizon + MATURE_DAYS > min(g.day_number(today), latest + 1):
            pending.append({"as_of": entry["as_of"], "scored_after": str(as_of + timedelta(horizon + MATURE_DAYS))})
            continue
        inside = np.flatnonzero((events["t"] >= origin) & (events["t"] < origin + horizon))
        seen = set(events["loc"][events["t"] < origin])
        fresh = p.new_place_mask(events, origin, grid)
        new = [i for i in inside if events["loc"][i] not in seen and fresh[cells[i]]]
        row = {"as_of": entry["as_of"], "pre_registered": entry["pre_registered"], "reports": int(len(inside)),
               "new_place_reports_in_fresh_squares": len(new)}
        for name, flagged in entry["lists"].items():
            hit = set(flagged)
            row[name] = sum(cells[i] in hit for i in (new if name in ("new_place_watch", "population_fresh") else inside))
        if entry["emerging"]:
            xy = events["locations_xy"][events["loc"][inside]]
            centres = g.to_km([z["lat"] for z in entry["emerging"]], [z["lon"] for z in entry["emerging"]])
            row["emerging_zones"] = len(centres)
            row["emerging_reports"] = int(sum((np.hypot(*(xy - c).T) <= z["radius_km"]).sum()
                                              for c, z in zip(centres, entry["emerging"]))) if len(xy) else 0
        rows.append(row)
    keys = ("reports", "new_place_reports_in_fresh_squares", "grid_ranker", "repeat_locality_1km", "new_place_watch",
            "population_fresh", "v1_grid_ranker", "v3_challenger")
    official = [r for r in rows if r["pre_registered"]]
    total = {k: sum(r.get(k, 0) for r in official) for k in keys}
    summary = {"updated": today.isoformat(), "pre_registered_from": str(PRE_REGISTERED_START),
               "issues_scored": len(rows), "issues_scored_pre_registered": len(official),
               "issues_pending": len(pending), "next_due": pending[0]["scored_after"] if pending else None,
               "first_issue": rows[0]["as_of"] if rows else (pending[0]["as_of"] if pending else None),
               "total_pre_registered": total, "by_issue": rows}
    LEDGER.mkdir(parents=True, exist_ok=True)
    (LEDGER / "scores.json").write_text(json.dumps(summary, indent=1))
    SERVED.parent.mkdir(parents=True, exist_ok=True)
    SERVED.write_text(json.dumps(summary))
    print(json.dumps({k: v for k, v in summary.items() if k != "by_issue"}, indent=1))
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("action", choices=["issue", "score", "both"])
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    parser.add_argument("--force", action="store_true", help="overwrite an existing entry (never for pre-registered dates)")
    args = parser.parse_args()
    if args.force and args.as_of >= PRE_REGISTERED_START:
        raise SystemExit("pre-registered ledger entries are never overwritten")
    if args.action in ("issue", "both"):
        issue(args.as_of, args.force)
    if args.action in ("score", "both"):
        score()


if __name__ == "__main__":
    main()
