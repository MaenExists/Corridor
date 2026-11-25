"""Audit of the grid hotspot test: where does the skill come from?

Questions, with settings frozen:

* What share of test seizures happened at a locality that already had a report
  before the origin (repeat) versus a new locality?
* Hit rates for repeat and new localities separately.
* A sharp repeat-locality baseline: long-run density with a 1 km kernel, which
  isolates "same place again" from the learned ranker.
* Hit rate by district, and by year.
"""

from datetime import date, timedelta
import json

import numpy as np

from ml.train import hotspot_grid as g


def main():
    grid = g.Grid()
    events = g.load_events()
    cells = g.event_cells(grid, events)
    start, end = g.TEST
    horizon = g.PRIMARY_HORIZON
    params = g.fit_etas(events["t"], events["locations_xy"][events["loc"]], g.day_number(start))
    features = g.Features(grid, events)
    ranker = g.train_ranker(grid, events, features, params, cells, horizon,
                            g.origins(date(2017, 1, 1), start - timedelta(1), horizon), np.random.default_rng(g.SEED))
    flagged_n = int(round(0.01 * grid.size))
    tally = {k: {"events": 0, "ranker": 0, "repeat_1km": 0, "long_run": 0}
             for k in ("repeat", "new")}
    by_district, by_year = {}, {}
    for origin in g.origins(start, end, horizon):
        scores = {
            "ranker": ranker.predict_proba(features.matrix(origin, params, horizon))[:, 1],
            "repeat_1km": g.density(grid, events, g.location_weights(events, origin), 1.0),
            "long_run": g.density(grid, events, g.location_weights(events, origin), g.BACKGROUND_SIGMA_KM),
        }
        top = {name: set(np.lexsort((-grid.population, -score))[:flagged_n]) for name, score in scores.items()}
        seen = set(events["loc"][events["t"] < origin])
        window = np.flatnonzero((events["t"] >= origin) & (events["t"] < origin + horizon))
        for i in window:
            kind = "repeat" if events["loc"][i] in seen else "new"
            tally[kind]["events"] += 1
            for name in scores:
                tally[kind][name] += cells[i] in top[name]
            d = by_district.setdefault(events["district"][i], [0, 0])
            d[0] += 1
            d[1] += cells[i] in top["ranker"]
            y = by_year.setdefault(str(g.EPOCH + timedelta(int(events["t"][i])))[:4], [0, 0])
            y[0] += 1
            y[1] += cells[i] in top["ranker"]
    total = sum(v["events"] for v in tally.values())
    report = {
        "horizon_days": horizon, "event_windows": total,
        "share_at_repeat_localities": round(tally["repeat"]["events"] / total, 3),
        "hit_rate_top1pct": {kind: {name: round(v[name] / v["events"], 3) for name in ("ranker", "repeat_1km", "long_run")}
                             | {"events": v["events"]} for kind, v in tally.items()},
        "overall_top1pct": {name: round(sum(v[name] for v in tally.values()) / total, 3)
                            for name in ("ranker", "repeat_1km", "long_run")},
        "ranker_by_district": {k: {"events": v[0], "hit_rate": round(v[1] / v[0], 3)}
                               for k, v in sorted(by_district.items(), key=lambda kv: -kv[1][0])},
        "ranker_by_year": {k: {"events": v[0], "hit_rate": round(v[1] / v[0], 3)} for k, v in sorted(by_year.items())},
    }
    (g.OUTPUT / "audit.json").write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
