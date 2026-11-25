"""Where the next reported seizure is likely: a 1 km grid forecast for Kerala.

This is the cell-level "where next" model in the style used abroad for
hotspot policing, built on dated, located seizure reports
(ml/data/news_incidents.py):

* Grid: the 1 km WorldPop cells inside Kerala (the recovery map grid).
* Self-exciting point process (ETAS / Mohler et al. 2011). The expected number
  of reported seizures in cell c over the next T days is

      mu * T * nu(c)  +  sum_i theta * (exp(-w (t0 - t_i)) - exp(-w (t0 + T - t_i))) * g_sigma(c - x_i)

  nu is a long-run kernel density of past seizures (the persistent hotspots),
  and the triggering term says that each seizure briefly raises the chance of
  another nearby (near repeat). theta, w, sigma and mu are fitted by
  expectation-maximisation on development data only and then frozen.
* Learned ranker: gradient-boosted trees on cell features (recent and long-run
  seizure densities at three spatial scales, the ETAS intensity, population,
  distance to railway stations). It is trained on development origins only.
* Baselines: long-run hotspot density, last-year density, last-28-day density,
  population, and random cells.

Evaluation is chronological. At each weekly origin a model sees only reports
published before the origin and ranks every cell. Scores are hit rate (the
share of the next window's located seizures that fall in the flagged cells),
PAI (hit rate / share of area flagged) and the precision of the top 20 cells.

What it measures: *reported* seizures. Reporting follows enforcement effort
and newsroom attention, so a hotspot here is where seizures get made and
reported, not a measure of where drugs or people who use them are. Locations
are locality centroids from headlines, so the effective resolution is a
locality (about 1-3 km), not a street.
"""

import argparse
import csv
from datetime import date, timedelta
import json
import math
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.spatial import cKDTree

from ml.data.news_incidents import INCIDENTS
from ml.data.public_intake import ROOT
from ml.recovery.access_map import population_grid

OUTPUT = ROOT / "prepared" / "hotspot_grid"
EPOCH = date(2016, 1, 1)
LAT0, LON0 = 10.5, 76.3
KX, KY = 111.32 * math.cos(math.radians(LAT0)), 110.57

# Pre-registered design (docs/MODEL_PLAN.md, "Grid hotspot forecast").
HORIZONS = (7, 28)
PRIMARY_HORIZON = 28
STEP_DAYS = 7
AREA_SHARES = (0.01, 0.05)
TOP_CELLS = 20
BACKGROUND_SIGMA_KM = 3.0
SIGMA_FLOOR_KM = 1.0  # locality-centroid precision
DEVELOPMENT = (date(2022, 1, 1), date(2023, 12, 31))
TEST = (date(2024, 1, 1), date(2026, 6, 30))
CUTOFF = date(2026, 6, 30)
RANKER_FEATURE_SIGMAS = (1.0, 3.0, 10.0)
RANKER_WINDOWS = (28, 91, 365, None)
SEED = 1729


def day_number(value):
    return (value - EPOCH).days


def to_km(lat, lon):
    return np.column_stack([(np.asarray(lon) - LON0) * KX, (np.asarray(lat) - LAT0) * KY])


class Grid:
    def __init__(self):
        lats, lons, population, step = population_grid()
        self.lat, self.lon, self.population = lats, lons, population
        self.xy = to_km(lats, lons)
        self.tree = cKDTree(self.xy)
        self.size = len(lats)
        self._kernels = {}

    def kernel(self, locations_xy, sigma):
        """Row-normalised truncated Gaussian from each location onto land cells (sparse L x C)."""
        key = (sigma, locations_xy.shape[0], float(locations_xy.sum()))
        if key in self._kernels:
            return self._kernels[key]
        rows, cols, vals = [], [], []
        for row, neighbours in enumerate(self.tree.query_ball_point(locations_xy, 4 * sigma)):
            if not neighbours:
                neighbours = [int(self.tree.query(locations_xy[row])[1])]
            d2 = ((self.xy[neighbours] - locations_xy[row]) ** 2).sum(1)
            weight = np.exp(-d2 / (2 * sigma * sigma))
            rows.extend([row] * len(neighbours))
            cols.extend(neighbours)
            vals.extend(weight / weight.sum())
        matrix = sparse.csr_matrix((vals, (rows, cols)), shape=(len(locations_xy), self.size))
        self._kernels[key] = matrix
        return matrix


def load_events(path=INCIDENTS):
    with path.open(encoding="utf-8", newline="") as stream:
        rows = [row for row in csv.DictReader(stream) if row["precision"] == "locality" and row["lat"]]
    rows.sort(key=lambda row: row["published"])
    keys = sorted({(float(row["lat"]), float(row["lon"])) for row in rows})
    index = {key: i for i, key in enumerate(keys)}
    events = {
        "t": np.array([day_number(date.fromisoformat(row["published"])) for row in rows], float),
        "loc": np.array([index[(float(row["lat"]), float(row["lon"]))] for row in rows]),
        "district": [row["district"] for row in rows],
        "place": [row["place"] for row in rows],
    }
    locations = np.array(keys)
    events["locations_xy"] = to_km(locations[:, 0], locations[:, 1])
    events["locations_latlon"] = locations
    return events


# ---------------------------------------------------------------- ETAS fit

def fit_etas(t, xy, end_day, iterations=60, sigma_b=BACKGROUND_SIGMA_KM, max_lag=365.0, max_km=40.0):
    """EM (stochastic declustering) for theta, omega, sigma and mu on events before end_day."""
    keep = t < end_day
    t, xy = t[keep], xy[keep]
    n = len(t)
    span = float(end_day - t.min())
    # Leave-one-out background density at each event (per km^2), fixed bandwidth.
    tree = cKDTree(xy)
    pairs = tree.query_pairs(4 * sigma_b, output_type="ndarray")
    d2b = ((xy[pairs[:, 0]] - xy[pairs[:, 1]]) ** 2).sum(1)
    kb = np.exp(-d2b / (2 * sigma_b ** 2)) / (2 * math.pi * sigma_b ** 2)
    nu = np.bincount(pairs[:, 0], kb, n) + np.bincount(pairs[:, 1], kb, n)
    nu = nu / max(n - 1, 1) + 1e-9
    # Candidate parent pairs j < i within lag and distance windows.
    close = tree.query_pairs(max_km, output_type="ndarray")
    first, second = close[:, 0], close[:, 1]
    child = np.where(t[first] >= t[second], first, second)
    parent = np.where(t[first] >= t[second], second, first)
    lag = t[child] - t[parent]
    ok = (lag > 0) & (lag <= max_lag)
    child, parent, lag = child[ok], parent[ok], lag[ok]
    d2 = ((xy[child] - xy[parent]) ** 2).sum(1)
    theta, omega, sigma, mu = 0.2, 1 / 30, 3.0, 0.8 * n / span
    for _ in range(iterations):
        trig = theta * omega * np.exp(-omega * lag) * np.exp(-d2 / (2 * sigma ** 2)) / (2 * math.pi * sigma ** 2)
        back = mu * nu
        total = back + np.bincount(child, trig, n)
        p_trig = trig / total[child]
        p_back = back / total
        triggered = p_trig.sum()
        mu = p_back.sum() / span
        theta = min(triggered / n, 0.95)
        omega = triggered / max((p_trig * lag).sum(), 1e-9)
        sigma = max(math.sqrt((p_trig * d2).sum() / max(2 * triggered, 1e-9)), SIGMA_FLOOR_KM)
    return {"theta": theta, "omega": omega, "sigma_km": sigma, "mu_per_day": mu,
            "background_share": float(p_back.mean()), "events": int(n), "end": str(EPOCH + timedelta(end_day))}


# ---------------------------------------------------------------- scores

def location_weights(events, origin, window=None, decay=None, horizon=None):
    """Sum of per-event weights at each unique location, using only events before origin."""
    past = events["t"] < origin
    if window is not None:
        past &= events["t"] >= origin - window
    t = events["t"][past]
    if decay is not None:
        omega, theta = decay
        weight = theta * (np.exp(-omega * (origin - t)) - np.exp(-omega * (origin + horizon - t)))
    else:
        weight = np.ones_like(t)
    return np.bincount(events["loc"][past], weight, len(events["locations_xy"]))


def density(grid, events, weights, sigma):
    return np.asarray(weights @ grid.kernel(events["locations_xy"], sigma)).ravel()


def etas_score(grid, events, params, origin, horizon):
    background = density(grid, events, location_weights(events, origin), BACKGROUND_SIGMA_KM)
    total = background.sum()
    background = background / total if total else background
    trigger = density(grid, events, location_weights(events, origin, decay=(params["omega"], params["theta"]),
                                                      horizon=horizon), params["sigma_km"])
    return params["mu_per_day"] * horizon * background + trigger


def baseline_scores(grid, events, origin, rng):
    return {
        "long_run_hotspots": density(grid, events, location_weights(events, origin), BACKGROUND_SIGMA_KM),
        # Added after the test audit: "same locality again" with a 1 km kernel. A baseline, not a setting.
        "repeat_locality_1km": density(grid, events, location_weights(events, origin), 1.0),
        "last_365_days": density(grid, events, location_weights(events, origin, 365), BACKGROUND_SIGMA_KM),
        "last_28_days": density(grid, events, location_weights(events, origin, 28), BACKGROUND_SIGMA_KM),
        "population": grid.population.copy(),
        "random": rng.random(grid.size),
    }


class Features:
    """Per-cell features for the learned ranker, computed from reports before the origin."""

    def __init__(self, grid, events):
        self.grid, self.events = grid, events
        stations = [p for p in json.loads(open("web/public/geography/kerala-places.json").read())["transport"]
                    if p.get("featureCode") == "RSTN" and p.get("lat")]
        station_xy = to_km([p["lat"] for p in stations], [p["lon"] for p in stations])
        self.station_km = cKDTree(station_xy).query(grid.xy)[0] if stations else np.zeros(grid.size)
        self.log_population = np.log1p(grid.population)
        # Population within about 5 km, from a coarse 5 km smoothing of the cell populations.
        neighbours = grid.tree.query_ball_point(grid.xy, 5.0)
        self.population_5km = np.log1p(np.array([grid.population[n].sum() for n in neighbours]))
        self.names = ([f"density_{w or 'all'}d_{s:g}km" for w in RANKER_WINDOWS for s in RANKER_FEATURE_SIGMAS]
                      + ["days_since_local_report", "etas", "log_population", "log_population_5km",
                         "railway_station_km"])

    def matrix(self, origin, params, horizon):
        columns = []
        for window in RANKER_WINDOWS:
            weights = location_weights(self.events, origin, window)
            for sigma in RANKER_FEATURE_SIGMAS:
                columns.append(density(self.grid, self.events, weights, sigma))
        past = self.events["t"] < origin
        last = np.full(len(self.events["locations_xy"]), np.inf)
        np.minimum.at(last, self.events["loc"][past], origin - self.events["t"][past])
        loc_tree = cKDTree(self.events["locations_xy"])
        distance, nearest = loc_tree.query(self.grid.xy, k=8, distance_upper_bound=3.0)
        gap = np.where(np.isfinite(distance), last[np.minimum(nearest, len(last) - 1)], np.inf).min(1)
        columns.append(np.minimum(gap, 3650))
        columns.append(etas_score(self.grid, self.events, params, origin, horizon))
        columns += [self.log_population, self.population_5km, self.station_km]
        return np.column_stack(columns).astype(np.float32)


# ---------------------------------------------------------------- evaluation

def event_cells(grid, events):
    return grid.tree.query(events["locations_xy"])[1][events["loc"]]


def outcome(events, cells, origin, horizon, size):
    inside = (events["t"] >= origin) & (events["t"] < origin + horizon)
    return np.bincount(cells[inside], minlength=size)


def evaluate_ranking(score, counts, tiebreak):
    order = np.lexsort((-tiebreak, -score))
    total = counts.sum()
    result = {"events": int(total)}
    for share in AREA_SHARES:
        flagged = order[:max(1, int(round(share * len(score))))]
        result[f"hits_{share:g}"] = int(counts[flagged].sum())
    top = order[:TOP_CELLS]
    result["top_cells_with_report"] = int((counts[top] > 0).sum())
    return result


def origins(start, end, horizon):
    first, last = day_number(start), day_number(end) - horizon + 1
    return list(range(first, last + 1, STEP_DAYS))


def summarise(rows, size):
    total = sum(row["events"] for row in rows)
    summary = {"origins": len(rows), "events": total}
    for share in AREA_SHARES:
        hits = sum(row[f"hits_{share:g}"] for row in rows)
        summary[f"hit_rate_{share:g}"] = round(hits / total, 4) if total else None
        summary[f"pai_{share:g}"] = round(hits / total / share, 2) if total else None
    summary["top_cell_precision"] = round(sum(r["top_cells_with_report"] for r in rows) / (TOP_CELLS * len(rows)), 4)
    return summary


def bootstrap(rows_a, rows_b, key, blocks=13, draws=2000, seed=SEED):
    """Block bootstrap (quarterly blocks of weekly origins) for a hit-rate difference."""
    rng = np.random.default_rng(seed)
    n = len(rows_a)
    starts = list(range(0, n, blocks))
    diffs = []
    for _ in range(draws):
        pick = np.concatenate([np.arange(s, min(s + blocks, n)) for s in rng.choice(starts, len(starts))])
        events = sum(rows_a[i]["events"] for i in pick)
        if not events:
            continue
        diffs.append((sum(rows_a[i][key] for i in pick) - sum(rows_b[i][key] for i in pick)) / events)
    return [round(float(np.percentile(diffs, 2.5)), 4), round(float(np.percentile(diffs, 97.5)), 4)]


def train_ranker(grid, events, features, params, cells, horizon, train_origins, rng):
    from sklearn.ensemble import HistGradientBoostingClassifier
    X, y, w = [], [], []
    for origin in train_origins:
        counts = outcome(events, cells, origin, horizon, grid.size)
        matrix = features.matrix(origin, params, horizon)
        positive = np.flatnonzero(counts > 0)
        negative = np.flatnonzero(counts == 0)
        sample = rng.choice(negative, min(len(negative), 600), replace=False)
        X.append(matrix[np.concatenate([positive, sample])])
        y.append(np.concatenate([np.ones(len(positive)), np.zeros(len(sample))]))
        w.append(np.concatenate([np.ones(len(positive)), np.full(len(sample), len(negative) / len(sample))]))
    model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
                                           l2_regularization=1.0, random_state=SEED)
    model.fit(np.vstack(X), np.concatenate(y), sample_weight=np.concatenate(w))
    return model


def gates(report):
    model = primary_model()
    h = report["horizons"][str(PRIMARY_HORIZON)]
    checks = {
        "pai_1pct_at_least_5": h[model]["pai_0.01"] >= 5,
        "beats_long_run_hotspots_1pct": h[model]["hit_rate_0.01"] >= h["long_run_hotspots"]["hit_rate_0.01"],
        "beats_population_1pct": h[model]["hit_rate_0.01"] >= h["population"]["hit_rate_0.01"],
        "top20_beats_long_run": h[model]["top_cell_precision"] > h["long_run_hotspots"]["top_cell_precision"],
    }
    return {"model": model, "checks": checks, "passed": all(checks.values())}


def replay(stage):
    grid = Grid()
    events = load_events()
    cells = event_cells(grid, events)
    rng = np.random.default_rng(SEED)
    start, end = {"development": DEVELOPMENT, "test": TEST,
                  "postcutoff": (CUTOFF + timedelta(1), date.today() - timedelta(1))}[stage]
    params = fit_etas(events["t"], events["locations_xy"][events["loc"]], day_number(start))
    features = Features(grid, events)
    report = {"stage": stage, "window": [str(start), str(end)], "etas": params, "horizons": {},
              "grid_cells": grid.size, "located_reports": int(len(events["t"])),
              "unique_locations": int(len(events["locations_xy"]))}
    for horizon in HORIZONS:
        train = origins(date(2017, 1, 1), start - timedelta(1), horizon)
        ranker = train_ranker(grid, events, features, params, cells, horizon, train, rng)
        rows = {}
        for origin in origins(start, end, horizon):
            counts = outcome(events, cells, origin, horizon, grid.size)
            scores = baseline_scores(grid, events, origin, rng)
            scores["etas"] = etas_score(grid, events, params, origin, horizon)
            scores["learned_ranker"] = ranker.predict_proba(features.matrix(origin, params, horizon))[:, 1]
            for name, score in scores.items():
                rows.setdefault(name, []).append(evaluate_ranking(score, counts, grid.population))
        summary = {name: summarise(model_rows, grid.size) for name, model_rows in rows.items()}
        for model in ("etas", "learned_ranker"):
            for rival in [r for r in ("long_run_hotspots", "last_365_days", "repeat_locality_1km") if r in rows]:
                for share in AREA_SHARES:
                    summary[model][f"minus_{rival}_{share:g}_95ci"] = bootstrap(
                        rows[model], rows[rival], f"hits_{share:g}")
        report["horizons"][str(horizon)] = summary
    if stage == "development":
        primary = report["horizons"][str(PRIMARY_HORIZON)]
        report["primary"] = max(("etas", "learned_ranker"), key=lambda m: primary[m]["hit_rate_0.01"])
    elif stage == "test":
        report["gates"] = gates(report)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / f"{stage}.json").write_text(json.dumps(report, indent=1))
    return report


SERVED = Path("web/public/generated/hotspots")
FLAGGED_SHARE = 0.01


def _read(name):
    path = OUTPUT / name
    return json.loads(path.read_text()) if path.exists() else None


def primary_model():
    development = json.loads((OUTPUT / "development.json").read_text())
    return development["primary"]


def issue(as_of, horizon=PRIMARY_HORIZON):
    """Rank cells for the window after as_of with the pre-registered primary model, using reports before it."""
    grid = Grid()
    events = load_events()
    origin = day_number(as_of)
    cells = event_cells(grid, events)
    params = fit_etas(events["t"], events["locations_xy"][events["loc"]], origin)
    model = primary_model()
    if model == "learned_ranker":
        features = Features(grid, events)
        ranker = train_ranker(grid, events, features, params, cells, horizon,
                              origins(date(2017, 1, 1), as_of - timedelta(1), horizon), np.random.default_rng(SEED))
        score = ranker.predict_proba(features.matrix(origin, params, horizon))[:, 1]
    else:
        score = etas_score(grid, events, params, origin, horizon)
    order = np.lexsort((-grid.population, -score))
    flagged = order[:int(round(FLAGGED_SHARE * grid.size))]
    places = json.loads(Path("web/public/geography/kerala-places.json").read_text())["places"]
    place_xy = to_km([p["lat"] for p in places], [p["lon"] for p in places])
    nearest = cKDTree(place_xy).query(grid.xy[flagged])[1]
    near = cKDTree(events["locations_xy"])
    recent = {}
    for window in (28, 365):
        weights = location_weights(events, origin, window)
        recent[window] = [int(weights[near.query_ball_point(grid.xy[c], 3.0)].sum()) for c in flagged]
    etas_part = etas_score(grid, events, params, origin, horizon)[flagged]
    cells_out = []
    for rank, (cell, place, r28, r365, expected) in enumerate(zip(flagged, nearest, recent[28], recent[365],
                                                                   etas_part), 1):
        cells_out.append({"rank": rank, "lat": round(float(grid.lat[cell]), 4), "lon": round(float(grid.lon[cell]), 4),
                          "locality": places[place]["name"], "taluk": places[place].get("subdistrict"),
                          "district": (places[place].get("district") or "").replace(" District", "").replace(" district", ""),
                          "score": round(float(score[cell]), 5), "etas_expected_reports": round(float(expected), 3),
                          "reports_within_3km_28d": r28, "reports_within_3km_365d": r365})
    past = events["t"] < origin
    weekly = np.bincount(((origin - events["t"][past]) // 7).astype(int), minlength=104)[:104][::-1]
    with INCIDENTS.open(encoding="utf-8", newline="") as stream:
        all_rows = [row for row in csv.DictReader(stream) if row["published"] < as_of.isoformat()]
    latest = {}
    for row in all_rows:
        latest[row["source"]] = max(latest.get(row["source"], ""), row["published"])
    test = json.loads((OUTPUT / "test.json").read_text()) if (OUTPUT / "test.json").exists() else None
    brief = {
        "as_of": as_of.isoformat(), "horizon_days": horizon, "model": model, "etas": params,
        "flagged_share_of_area": FLAGGED_SHARE, "grid_cells": grid.size, "cells": cells_out,
        "weekly_located_reports": [int(v) for v in weekly], "latest_report_by_source": latest,
        "located_reports_used": int(past.sum()),
        "test": test and {"horizon": test["horizons"][str(horizon)][model],
                          "long_run_hotspots": test["horizons"][str(horizon)]["long_run_hotspots"],
                          "population": test["horizons"][str(horizon)]["population"]},
        "audit": _read("audit.json"),
        "postcutoff": (lambda r: r and {"window": r["window"], "horizon": r["horizons"][str(horizon)]})(_read("postcutoff.json")),
        "measure": "reported drug seizures in two English publishers' Kerala coverage, located to a locality",
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / f"forecast_{as_of}.json").write_text(json.dumps(brief, indent=1))
    SERVED.mkdir(parents=True, exist_ok=True)
    (SERVED / "grid_forecast.json").write_text(json.dumps(brief))
    return brief


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("stage", choices=["development", "test", "postcutoff", "forecast"])
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    if args.stage == "forecast":
        brief = issue(args.as_of)
        print(json.dumps({k: v for k, v in brief.items() if k != "cells"} | {"top_cells": brief["cells"][:10]},
                         indent=1))
        return
    report = replay(args.stage)
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
