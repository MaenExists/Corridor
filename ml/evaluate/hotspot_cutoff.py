"""Knowledge-cutoff test for the grid hotspot system.

Everything is frozen at 30 June 2026 (end of day): model weights *and* the
reports the model may see. One forecast is issued from that state and then
checked against every located seizure report published from 1 July 2026 to
yesterday. Nothing after the cutoff is used to make the forecast.

Two readings:

* Strict: the single cutoff forecast (top 1% of cells and named localities)
  scored month by month against later reports, with no updates at all.
* Rolling: weights frozen at the cutoff but the model reads each new week's
  reports, as a deployed system would (the post-cutoff stage of
  ml/train/hotspot_grid.py). Reported for comparison.

Plus the pattern layer: the risk-terrain new-place watch list built at the
cutoff, checked against seizures at places with no report before the cutoff.
"""

from datetime import date, timedelta
import json

import numpy as np
from scipy.spatial import cKDTree

from ml.train import hotspot_grid as g

OUTPUT = g.OUTPUT / "cutoff"
TOP_SHARE = 0.01


def month_windows(start, end):
    windows, cursor = [], start
    while cursor <= end:
        nxt = date(cursor.year + (cursor.month == 12), cursor.month % 12 + 1, 1)
        windows.append((cursor, min(nxt - timedelta(1), end)))
        cursor = nxt
    return windows


def main():
    cutoff = g.CUTOFF
    origin = g.day_number(cutoff + timedelta(1))  # reports published up to 30 June inclusive
    end = date.today() - timedelta(1)
    grid = g.Grid()
    events = g.load_events()
    cells = g.event_cells(grid, events)
    horizon = g.PRIMARY_HORIZON
    params = g.fit_etas(events["t"], events["locations_xy"][events["loc"]], origin)
    features = g.Features(grid, events)
    ranker = g.train_ranker(grid, events, features, params, cells, horizon,
                            g.origins(date(2017, 1, 1), cutoff, horizon), np.random.default_rng(g.SEED))
    n_top = int(round(TOP_SHARE * grid.size))
    everything = g.location_weights(events, origin)
    scores = {
        "grid_ranker": ranker.predict_proba(features.matrix(origin, params, horizon))[:, 1],
        "repeat_locality_1km": g.density(grid, events, everything, 1.0),
        "long_run_hotspots": g.density(grid, events, everything, g.BACKGROUND_SIGMA_KM),
        "population": grid.population.astype(float),
    }
    flagged = {name: set(np.lexsort((-grid.population, -s))[:n_top]) for name, s in scores.items()}

    # Pattern layer at the cutoff: risk terrain fitted on reports before the cutoff.
    from ml.train import hotspot_patterns as p
    from ml.data.context_layers import cell_context
    quantities, drugs = p.load_attributes(events)
    context, _ = cell_context(grid.xy)
    pf = p.PatternFeatures(grid, events, context, quantities, drugs)
    pf.fit_terrain(cells, origin)
    fresh = p.new_place_mask(events, origin, grid)
    watch = [c for c in np.argsort(-pf.rtm_score) if fresh[c]][:n_top]
    pop_watch = [c for c in np.argsort(-grid.population) if fresh[c]][:n_top]
    watch_sets = {"risk_terrain_watch": set(watch), "population_watch": set(pop_watch)}

    seen_before = set(events["loc"][events["t"] < origin])
    after = np.flatnonzero((events["t"] >= origin) & (events["t"] <= g.day_number(end)))
    months = []
    for lo, hi in month_windows(cutoff + timedelta(1), end):
        idx = [i for i in after if g.day_number(lo) <= events["t"][i] <= g.day_number(hi)]
        row = {"month": lo.strftime("%Y-%m"), "through": str(hi), "located_reports": len(idx)}
        for name, top in flagged.items():
            row[name] = sum(cells[i] in top for i in idx)
        new_idx = [i for i in idx if events["loc"][i] not in seen_before]
        row["new_place_reports"] = len(new_idx)
        for name, top in watch_sets.items():
            row[name] = sum(cells[i] in top for i in new_idx)
        months.append(row)
    total = {k: sum(m[k] for m in months) for k in months[0] if k not in ("month", "through")}

    # Named localities flagged at the cutoff: how many had a later report within 2 km?
    places = json.loads(g.Path("web/public/geography/kerala-places.json").read_text())["places"]
    place_tree = cKDTree(g.to_km([q["lat"] for q in places], [q["lon"] for q in places]))
    later_xy = events["locations_xy"][events["loc"][after]]
    later_tree = cKDTree(later_xy) if len(later_xy) else None
    order = np.lexsort((-grid.population, -scores["grid_ranker"]))
    named, seen_names = [], set()
    for cell in order:
        place = places[int(place_tree.query(grid.xy[cell])[1])]
        key = (place["name"], place.get("district"))
        if key in seen_names:
            continue
        seen_names.add(key)
        hits = len(later_tree.query_ball_point(grid.xy[cell], 2.0)) if later_tree else 0
        named.append({"locality": place["name"],
                      "district": (place.get("district") or "").replace(" District", "").replace(" district", ""),
                      "later_reports_within_2km": hits})
        if len(named) == 20:
            break

    rolling = None
    post = g.OUTPUT / "postcutoff.json"
    if post.exists():
        h = json.loads(post.read_text())["horizons"][str(horizon)]
        rolling = {m: h[m]["hit_rate_0.01"] for m in ("learned_ranker", "repeat_locality_1km", "long_run_hotspots",
                                                      "population") if m in h}
    report = {
        "cutoff": str(cutoff), "checked_through": str(end), "flagged_cells": n_top,
        "share_of_area": TOP_SHARE, "reports_known_at_cutoff": int((events["t"] < origin).sum()),
        "post_cutoff_located_reports": int(len(after)), "by_month": months, "total": total,
        "strict_hit_rate": {name: round(total[name] / max(total["located_reports"], 1), 3) for name in flagged},
        "new_place_hit_rate": {name: round(total[name] / max(total["new_place_reports"], 1), 3) for name in watch_sets},
        "top20_localities_at_cutoff": named,
        "top20_with_later_report": sum(n["later_reports_within_2km"] > 0 for n in named),
        "rolling_weekly_28d_hit_rate": rolling,
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "cutoff_check.json").write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
