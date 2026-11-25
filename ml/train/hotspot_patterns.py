"""Patterns around hotspots: explicit rules plus patterns learned from the data.

The grid forecast (hotspot_grid.py) is good at "same place again" and nearly
blind to new places. This module asks what *surrounds* seizure hotspots and
uses it to rank places that have never had a report.

Explicit patterns (readable, fitted on training data only):

1. Risk terrain. A penalised Poisson regression of located reports per 1 km
   cell on distance bands to each context layer (railway stations and lines,
   national highways, main roads, bus stations, the inter-state border and its
   road/rail gateways, airports, ports, colleges, schools, tourist sites,
   resorts and homestays, liquor outlets, and police stations as an
   enforcement-presence control) plus log population. Each coefficient is a
   relative risk such as "within 1 km of a railway station: x3.1".
2. Hotspot typology. DBSCAN clusters of recent reports, labelled by rules:
   entry gateway (near the land border or a border crossing, large hauls),
   air/sea entry (near an airport or port, large hauls), transit corridor
   (stretched along a highway or railway), retail market (dense town, small
   quantities), venue-linked (resorts, tourist sites or colleges) and emerging
   (most reports in the last six months).
3. Corridor spread. Reports are attached to nearby points on highways, main
   roads and railway lines and spread along the network, not across open land,
   so a cell beside an active corridor ranks up even with no report of its own.

Learned patterns: gradient-boosted trees over the grid features plus the risk
terrain score, corridor activity, ring counts of the surrounding area (2-5 km
and 5-15 km, excluding the cell's own neighbourhood), the distance to each
hotspot type and the raw distances to every layer.

Scoring adds what the first audit showed matters: the hit rate for reports at
localities that had no earlier report ("new places").
"""

import argparse
from datetime import date, timedelta
import json
import math

import numpy as np
from scipy import sparse
from scipy.spatial import cKDTree

from ml.data.context_layers import LAYERS, cell_context, sample_line
from ml.train import hotspot_grid as g

OUTPUT = g.OUTPUT / "patterns"
BANDS_KM = (0.5, 1.0, 2.0, 5.0)
RTM_ALPHA = 1e-5  # 1e-3 shrank rare-band risks toward 1 (fixed 26 Nov 2026, see MODEL_PLAN)
CLUSTER_EPS_KM = 4.0
CLUSTER_MIN = 3
CLUSTER_WINDOW_DAYS = 730
CORRIDOR_ATTACH_KM = 2.0
CORRIDOR_SPREAD_KM = 12.0
CORRIDOR_SAMPLE_KM = 0.5
CELL_TO_LINE_KM = 1.5
LARGE_HAUL_G = 1000.0
SMALL_HAUL_G = 100.0
EFFORT_LAYERS = ("police_station", "excise_office")
NEW_PLACE_EXCLUSION_KM = 2.0


# ---------------------------------------------------------------- explicit 1: risk terrain

class RiskTerrain:
    def __init__(self, context, population):
        self.names = sorted(context)
        self.context = context
        self.population = population
        self.design = self._design()

    def _design(self):
        columns, labels = [], []
        for name in self.names:
            distance = self.context[name]
            lower = 0.0
            for upper in BANDS_KM:
                columns.append((distance >= lower) & (distance < upper))
                labels.append((name, lower, upper))
                lower = upper
        columns.append(np.log1p(self.population))
        labels.append(("log_population", None, None))
        self.labels = labels
        return np.column_stack(columns).astype(float)

    def fit(self, counts):
        from sklearn.linear_model import PoissonRegressor
        self.model = PoissonRegressor(alpha=RTM_ALPHA, solver="newton-cholesky", max_iter=500)
        self.model.fit(self.design, counts)
        return self

    def score(self):
        return self.model.predict(self.design)

    def factors(self, counts):
        """Readable relative risks with the number of training reports and cells in each band."""
        rows = []
        for (name, lower, upper), coef, column in zip(self.labels, self.model.coef_, self.design.T):
            if lower is None:
                rows.append({"factor": "population (per doubling)", "relative_risk": round(math.exp(coef * math.log(2)), 2)})
                continue
            in_band = column > 0
            rows.append({"factor": name, "band_km": [lower, upper], "relative_risk": round(math.exp(coef), 2),
                         "cells": int(in_band.sum()), "reports": int(counts[in_band].sum()),
                         "kind": "enforcement presence" if name in EFFORT_LAYERS else "context"})
        return rows


# ---------------------------------------------------------------- explicit 2: hotspot typology

def clusters(events, origin, context_at, quantities, drugs):
    """DBSCAN of the last two years' located reports, each cluster labelled by explicit rules."""
    from sklearn.cluster import DBSCAN
    past = np.flatnonzero((events["t"] < origin) & (events["t"] >= origin - CLUSTER_WINDOW_DAYS))
    if len(past) < CLUSTER_MIN:
        return []
    xy = events["locations_xy"][events["loc"][past]]
    jitter = np.random.default_rng(0).normal(0, 1e-3, xy.shape)  # identical centroids stay one cluster
    labels = DBSCAN(eps=CLUSTER_EPS_KM, min_samples=CLUSTER_MIN).fit_predict(xy + jitter)
    found = []
    for label in sorted(set(labels) - {-1}):
        members = past[labels == label]
        pts = events["locations_xy"][events["loc"][members]]
        centre = pts.mean(0)
        spread = np.cov(pts.T) if len(pts) > 2 else np.eye(2) * 1e-3
        eig = np.sort(np.linalg.eigvalsh(spread + np.eye(2) * 1e-3))
        elongation = float(math.sqrt(eig[1] / eig[0]))
        near = {name: float(np.mean([context_at(p)[name] for p in pts])) for name in
                ("land_border", "border_gateway", "airport", "port", "national_highway", "railway_line",
                 "railway_station", "college", "resort_homestay", "tourist_site")}
        grams = [quantities[i] for i in members if quantities[i] is not None]
        large = float(np.mean([q >= LARGE_HAUL_G for q in grams])) if grams else 0.0
        median_g = float(np.median(grams)) if grams else None
        synthetic = float(np.mean([drugs[i] == "synthetic" for i in members]))
        recent = float(np.mean(events["t"][members] >= origin - 182))
        on_transport = float(np.mean([min(context_at(p)["national_highway"], context_at(p)["railway_line"]) < 1.0
                                      for p in pts]))
        density = float(np.mean([context_at(p)["log_population_5km"] for p in pts]))
        types = []
        if (near["border_gateway"] < 15 or near["land_border"] < 8) and large >= 0.3:
            types.append("entry gateway")
        if (near["airport"] < 6 or near["port"] < 4) and large >= 0.3:
            types.append("air or sea entry")
        if on_transport >= 0.6 and (elongation >= 2.0 or large >= 0.3):
            types.append("transit corridor")
        if density >= 12.5 and median_g is not None and median_g <= SMALL_HAUL_G:
            types.append("retail market")
        if min(near["resort_homestay"], near["tourist_site"], near["college"]) < 0.5:
            types.append("venue-linked")
        if recent >= 0.5:
            types.append("emerging")
        found.append({"centre_xy": centre.tolist(), "reports": int(len(members)), "elongation": round(elongation, 2),
                      "large_haul_share": round(large, 2), "median_grams": median_g,
                      "synthetic_share": round(synthetic, 2), "recent_share": round(recent, 2),
                      "on_transport_share": round(on_transport, 2),
                      "mean_km": {k: round(v, 1) for k, v in near.items()}, "types": types or ["unlabelled"]})
    return found


TYPES = ("entry gateway", "air or sea entry", "transit corridor", "retail market", "venue-linked", "emerging")


# ---------------------------------------------------------------- explicit 3: corridor spread

class Corridors:
    def __init__(self, grid, events):
        layers = json.loads(LAYERS.read_text())
        samples = [sample_line(line, CORRIDOR_SAMPLE_KM) for name in ("national_highway", "main_road", "railway_line")
                   for line in layers["lines"][name] if len(line) > 1]
        xy = np.vstack(samples)
        xy = xy[(xy[:, 0] > grid.xy[:, 0].min() - 20) & (xy[:, 0] < grid.xy[:, 0].max() + 20)
                & (xy[:, 1] > grid.xy[:, 1].min() - 20) & (xy[:, 1] < grid.xy[:, 1].max() + 20)]
        # Thin duplicates where roads overlap.
        keep = np.unique(np.round(xy / CORRIDOR_SAMPLE_KM).astype(int), axis=0, return_index=True)[1]
        self.xy = xy[np.sort(keep)]
        tree = cKDTree(self.xy)
        self.attach = self._radius_matrix(cKDTree(events["locations_xy"]), tree, CORRIDOR_ATTACH_KM).T.tocsr()
        pairs = tree.query_pairs(CORRIDOR_SPREAD_KM, output_type="ndarray")
        d = np.hypot(*(self.xy[pairs[:, 0]] - self.xy[pairs[:, 1]]).T)
        w = np.exp(-d / (CORRIDOR_SPREAD_KM / 3))
        n = len(self.xy)
        self.spread = sparse.csr_matrix((np.concatenate([w, w, np.ones(n)]),
                                         (np.concatenate([pairs[:, 0], pairs[:, 1], np.arange(n)]),
                                          np.concatenate([pairs[:, 1], pairs[:, 0], np.arange(n)]))), shape=(n, n))
        distance, self.cell_sample = tree.query(grid.xy)
        self.cell_on_line = distance <= CELL_TO_LINE_KM

    @staticmethod
    def _radius_matrix(tree_a, tree_b, radius):
        return tree_a.sparse_distance_matrix(tree_b, radius, output_type="coo_matrix").tocsr().astype(bool).astype(float)

    def activity(self, location_weights):
        on_line = self.attach @ location_weights
        spread = self.spread @ on_line
        return np.where(self.cell_on_line, spread[self.cell_sample], 0.0)


# ---------------------------------------------------------------- features

class PatternFeatures(g.Features):
    def __init__(self, grid, events, context, quantities, drugs):
        super().__init__(grid, events)
        self.context = context
        self.quantities, self.drugs = quantities, drugs
        self.corridors = Corridors(grid, events)
        self.context["log_population_5km"] = self.population_5km
        self.cell_tree = grid.tree
        self.rtm = None

    def context_at(self, xy):
        cell = int(self.cell_tree.query(xy)[1])
        return {name: values[cell] for name, values in self.context.items()}

    def fit_terrain(self, cells, end_day):
        counts = np.bincount(cells[self.events["t"] < end_day], minlength=self.grid.size).astype(float)
        terrain = RiskTerrain({k: v for k, v in self.context.items() if k != "log_population_5km"},
                              self.grid.population).fit(counts)
        self.rtm, self.rtm_counts = terrain, counts
        self.rtm_score = np.log(terrain.score() + 1e-9)
        return terrain

    def ring(self, weights, inner, outer):
        return (g.density(self.grid, self.events, weights, outer) * outer ** 2
                - g.density(self.grid, self.events, weights, inner) * inner ** 2) / (outer ** 2 - inner ** 2)

    def type_distances(self, origin):
        found = clusters(self.events, origin, self.context_at, self.quantities, self.drugs)
        columns = []
        for kind in TYPES:
            centres = [c["centre_xy"] for c in found if kind in c["types"]]
            columns.append(cKDTree(np.array(centres)).query(self.grid.xy)[0] if centres
                           else np.full(self.grid.size, 300.0))
        return columns, found

    def matrix(self, origin, params, horizon):
        base = super().matrix(origin, params, horizon)
        year = g.location_weights(self.events, origin, 365)
        everything = g.location_weights(self.events, origin)
        big = self.large_weights(origin)
        extra = [self.rtm_score,
                 np.log1p(self.corridors.activity(year)), np.log1p(self.corridors.activity(everything)),
                 np.log1p(self.corridors.activity(big)),
                 self.ring(year, 2.0, 5.0), self.ring(year, 5.0, 15.0), self.ring(everything, 2.0, 5.0)]
        distances, _ = self.type_distances(origin)
        extra += [np.minimum(d, 300.0) for d in distances]
        extra += [self.context[name] for name in sorted(self.context) if name != "log_population_5km"]
        return np.column_stack([base] + extra).astype(np.float32)

    def large_weights(self, origin):
        past = self.events["t"] < origin
        big = np.array([q is not None and q >= LARGE_HAUL_G for q in self.quantities])
        mask = past & big
        return np.bincount(self.events["loc"][mask], minlength=len(self.events["locations_xy"])).astype(float)


def load_attributes(events):
    import csv
    with g.INCIDENTS.open(encoding="utf-8", newline="") as stream:
        rows = [row for row in csv.DictReader(stream) if row["precision"] == "locality" and row["lat"]]
    rows.sort(key=lambda row: row["published"])
    quantities = [float(row["quantity_g"]) if row.get("quantity_g") else None for row in rows]
    drugs = [row.get("drug", "other") for row in rows]
    assert len(rows) == len(events["t"])
    return quantities, drugs


# ---------------------------------------------------------------- evaluation

def new_place_mask(events, origin, grid):
    """Cells further than NEW_PLACE_EXCLUSION_KM from every locality reported before origin."""
    seen = np.unique(events["loc"][events["t"] < origin])
    if not len(seen):
        return np.ones(grid.size, bool)
    distance = cKDTree(events["locations_xy"][seen]).query(grid.xy)[0]
    return distance > NEW_PLACE_EXCLUSION_KM


def score_origin(scores, events, cells, origin, horizon, grid):
    window = np.flatnonzero((events["t"] >= origin) & (events["t"] < origin + horizon))
    seen = set(events["loc"][events["t"] < origin])
    fresh = new_place_mask(events, origin, grid)
    n_top = int(round(0.01 * grid.size))
    out = {}
    for name, score in scores.items():
        order = np.lexsort((-grid.population, -score))
        rank = np.empty(grid.size, int)
        rank[order] = np.arange(grid.size)
        top1, top5 = rank < n_top, rank < 5 * n_top
        # New-place list: the same model's ranking restricted to cells away from every earlier report.
        fresh_order = order[fresh[order]]
        fresh_top = np.zeros(grid.size, bool)
        fresh_top[fresh_order[:n_top]] = True
        row = {"events": 0, "hit1": 0, "hit5": 0, "new_events": 0, "new_hit1": 0, "new_hit5": 0,
               "new_in_fresh": 0, "new_fresh_hit": 0, "new_pct_rank": []}
        for i in window:
            cell = cells[i]
            row["events"] += 1
            row["hit1"] += bool(top1[cell])
            row["hit5"] += bool(top5[cell])
            if events["loc"][i] not in seen:
                row["new_events"] += 1
                row["new_hit1"] += bool(top1[cell])
                row["new_hit5"] += bool(top5[cell])
                row["new_pct_rank"].append(rank[cell] / grid.size)
                if fresh[cell]:
                    row["new_in_fresh"] += 1
                    row["new_fresh_hit"] += bool(fresh_top[cell])
        out[name] = row
    return out


def summarise(rows):
    total = {k: sum(r[k] for r in rows) for k in rows[0] if k != "new_pct_rank"}
    ranks = [x for r in rows for x in r["new_pct_rank"]]
    return {
        "events": total["events"], "hit_rate_1pct": round(total["hit1"] / max(total["events"], 1), 4),
        "hit_rate_5pct": round(total["hit5"] / max(total["events"], 1), 4),
        "new_place_events": total["new_events"],
        "new_place_hit_rate_1pct": round(total["new_hit1"] / max(total["new_events"], 1), 4),
        "new_place_hit_rate_5pct": round(total["new_hit5"] / max(total["new_events"], 1), 4),
        "new_place_median_rank_pct": round(float(np.median(ranks)) * 100, 2) if ranks else None,
        "new_places_away_from_old_reports": total["new_in_fresh"],
        "fresh_list_hit_rate": round(total["new_fresh_hit"] / max(total["new_in_fresh"], 1), 4),
    }


def bootstrap(rows_a, rows_b, key_hit, key_n, blocks=13, draws=2000):
    rng = np.random.default_rng(g.SEED)
    n = len(rows_a)
    starts = list(range(0, n, blocks))
    diffs = []
    for _ in range(draws):
        pick = np.concatenate([np.arange(s, min(s + blocks, n)) for s in rng.choice(starts, len(starts))])
        denom = sum(rows_a[i][key_n] for i in pick)
        if denom:
            diffs.append((sum(rows_a[i][key_hit] for i in pick) - sum(rows_b[i][key_hit] for i in pick)) / denom)
    return [round(float(np.percentile(diffs, 2.5)), 4), round(float(np.percentile(diffs, 97.5)), 4)]


WINDOWS = {"development": g.DEVELOPMENT, "reused_test": g.TEST,
           "postcutoff": (g.CUTOFF + timedelta(1), date.today() - timedelta(1))}


def setup(start):
    grid = g.Grid()
    events = g.load_events()
    cells = g.event_cells(grid, events)
    quantities, drugs = load_attributes(events)
    context, gates = cell_context(grid.xy)
    features = PatternFeatures(grid, events, context, quantities, drugs)
    terrain = features.fit_terrain(cells, g.day_number(start))
    params = g.fit_etas(events["t"], events["locations_xy"][events["loc"]], g.day_number(start))
    return grid, events, cells, features, terrain, params, gates


CACHE = OUTPUT / "matrix_cache"
WORKERS = 2  # the machine has 3 GB of RAM; workers share the prepared state by fork
NEGATIVES = 600
_STATE = {}


def _rtm_position(features):
    return len(features.names)  # the risk-terrain column follows the grid ranker's own columns


def _origin_rows(origin):
    """Worker: one origin's full matrix (risk-terrain column left as zero), training sample, cached if evaluated."""
    s = _STATE
    matrix = s["features"].matrix(origin, s["params"], s["horizon"])
    counts = g.outcome(s["events"], s["cells"], origin, s["horizon"], s["grid"].size)
    rng = np.random.default_rng(origin)
    positive = np.flatnonzero(counts > 0)
    negative = np.flatnonzero(counts == 0)
    sample = rng.choice(negative, min(len(negative), NEGATIVES), replace=False)
    idx = np.concatenate([positive, sample])
    y = np.concatenate([np.ones(len(positive)), np.zeros(len(sample))])
    w = np.concatenate([np.ones(len(positive)), np.full(len(sample), len(negative) / max(len(sample), 1))])
    if origin in s["evaluate"]:
        np.save(CACHE / f"{origin}.npy", matrix.astype(np.float16))
    return origin, idx, matrix[idx], y, w


def _fit(rows, columns, rtm, pos):
    from sklearn.ensemble import HistGradientBoostingClassifier
    X = np.vstack([np.insert(m, pos, rtm[idx], axis=1)[:, columns] for _, idx, m, _, _ in rows])
    model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
                                           l2_regularization=1.0, random_state=g.SEED)
    model.fit(X, np.concatenate([r[3] for r in rows]), sample_weight=np.concatenate([r[4] for r in rows]))
    return model


GROUPS = {
    "recent reports (28-91 days)": ["density_28d", "density_91d"],
    "long-run reports (1 year, all)": ["density_365d", "density_alld"],
    "near repeat (ETAS, days since)": ["etas", "days_since_local_report"],
    "risk terrain": ["risk_terrain"],
    "corridor spread": ["corridor_"],
    "surrounding rings": ["ring_"],
    "hotspot-type distances": [f"km_to_{t}" for t in TYPES],
    "transport distances": ["km_to_railway", "km_to_national_highway", "km_to_main_road", "km_to_bus_station",
                            "km_to_airport", "km_to_port", "railway_station_km"],
    "venue distances": ["km_to_college", "km_to_school", "km_to_tourist_site", "km_to_resort_homestay",
                        "km_to_liquor_outlet"],
    "border distances": ["km_to_land_border", "km_to_border_gateway"],
    "enforcement presence": ["km_to_police_station", "km_to_excise_office"],
    "population": ["log_population"],
}


def run_all(horizon=g.PRIMARY_HORIZON):
    """All three windows in one pass: each origin's features are computed once and shared."""
    import multiprocessing as mp
    import time
    first = min(start for start, _ in WINDOWS.values())
    grid, events, cells, features, _, params, gates = setup(first)
    names = list(features.names) + ["risk_terrain", "corridor_year", "corridor_all", "corridor_large_hauls",
                                    "ring_2_5km_year", "ring_5_15km_year", "ring_2_5km_all"] + \
        [f"km_to_{t}" for t in TYPES] + [f"km_to_{n}" for n in sorted(features.context) if n != "log_population_5km"]
    pos = _rtm_position(features)
    features.rtm_score = np.zeros(grid.size)  # filled per window at fit and predict time
    stage_origins = {stage: g.origins(start, end, horizon) for stage, (start, end) in WINDOWS.items()}
    evaluate = {o for v in stage_origins.values() for o in v}
    last_end = max(end for _, end in WINDOWS.values())
    every = sorted(set(g.origins(date(2017, 1, 1), last_end, horizon)) | evaluate)
    CACHE.mkdir(parents=True, exist_ok=True)
    _STATE.update(grid=grid, events=events, cells=cells, features=features, params=params, horizon=horizon,
                  evaluate=evaluate)
    started = time.time()
    rows = []
    with mp.get_context("fork").Pool(WORKERS) as pool:
        for count, row in enumerate(pool.imap(_origin_rows, every, chunksize=4), 1):
            rows.append(row)
            if count % 50 == 0:
                print(f"origins {count}/{len(every)} in {time.time() - started:.0f}s", flush=True)
    rows.sort(key=lambda r: r[0])
    base_columns = list(range(len(features.names)))
    all_columns = list(range(len(names)))
    for stage, (start, end) in WINDOWS.items():
        terrain = features.fit_terrain(cells, g.day_number(start))
        rtm = features.rtm_score
        train = [r for r in rows if r[0] + horizon <= g.day_number(start)]
        grid_model = _fit(train, base_columns, rtm, pos)
        pattern_model = _fit(train, all_columns, rtm, pos)
        per_model = {}
        importance_mats = []
        for origin in stage_origins[stage]:
            matrix = np.load(CACHE / f"{origin}.npy").astype(np.float32)
            matrix[:, pos] = rtm
            everything = g.location_weights(events, origin)
            scores = {
                "repeat_locality_1km": g.density(grid, events, everything, 1.0),
                "grid_ranker": grid_model.predict_proba(matrix[:, base_columns])[:, 1],
                "risk_terrain": rtm,
                "corridor_spread": matrix[:, names.index("corridor_year")] + 1e-6 * rtm,
                "pattern_ranker": pattern_model.predict_proba(matrix)[:, 1],
                "population": grid.population.astype(float),
            }
            for name, row in score_origin(scores, events, cells, origin, horizon, grid).items():
                per_model.setdefault(name, []).append(row)
            if stage == "development" and len(importance_mats) < 26 and origin % 2 == 0:
                importance_mats.append((matrix, g.outcome(events, cells, origin, horizon, grid.size)))
        report = {"stage": stage, "window": [str(start), str(end)], "horizon_days": horizon,
                  "training_origins": len(train), "models": {n: summarise(r) for n, r in per_model.items()},
                  "note": "ETAS feature parameters fitted on reports before 2022 for every window"}
        for rival in ("grid_ranker", "repeat_locality_1km", "population"):
            for model in ("pattern_ranker", "risk_terrain"):
                report["models"][model][f"minus_{rival}_new_hit5_95ci"] = bootstrap(
                    per_model[model], per_model[rival], "new_hit5", "new_events")
                report["models"][model][f"minus_{rival}_fresh_95ci"] = bootstrap(
                    per_model[model], per_model[rival], "new_fresh_hit", "new_in_fresh")
            report["models"]["pattern_ranker"][f"minus_{rival}_hit1_95ci"] = bootstrap(
                per_model["pattern_ranker"], per_model[rival], "hit1", "events")
        report["risk_terrain_factors"] = terrain.factors(features.rtm_counts)
        if importance_mats:
            report["group_importance"] = group_importance(pattern_model, importance_mats, names, grid)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        (OUTPUT / f"{stage}.json").write_text(json.dumps(report, indent=1))
        print(stage, json.dumps({m: {k: v for k, v in s.items() if "95ci" not in k}
                                 for m, s in report["models"].items()}), flush=True)
    for path in CACHE.glob("*.npy"):
        path.unlink()


def group_importance(model, mats, names, grid):
    """Drop in mean top-1% hit rate when a whole group of related features is shuffled across cells."""
    rng = np.random.default_rng(g.SEED)
    n_top = int(round(0.01 * grid.size))

    def hit(score, counts):
        return counts[np.lexsort((-grid.population, -score))[:n_top]].sum() / max(counts.sum(), 1)

    base = np.mean([hit(model.predict_proba(m)[:, 1], c) for m, c in mats])
    out = {}
    for group, prefixes in GROUPS.items():
        columns = [j for j, name in enumerate(names) if any(name.startswith(p) for p in prefixes)]
        drops = []
        for m, c in mats:
            shuffled = m.copy()
            perm = rng.permutation(len(m))
            shuffled[:, columns] = shuffled[perm][:, columns]
            drops.append(hit(model.predict_proba(shuffled)[:, 1], c))
        out[group] = round(float(base - np.mean(drops)), 4)
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def to_latlon(xy):
    return round(float(xy[1] / g.KY + g.LAT0), 4), round(float(xy[0] / g.KX + g.LON0), 4)


def issue(as_of):
    """Hotspot types, readable risk factors and the new-place watch list, from reports before as_of."""
    grid, events, cells, features, terrain, params, gates = setup(as_of)
    origin = g.day_number(as_of)
    places = json.loads(g.Path("web/public/geography/kerala-places.json").read_text())["places"]
    place_tree = cKDTree(g.to_km([p["lat"] for p in places], [p["lon"] for p in places]))

    def name_at(xy):
        place = places[int(place_tree.query(xy)[1])]
        district = (place.get("district") or "").replace(" District", "").replace(" district", "")
        return place["name"], place.get("subdistrict"), district

    _, found = features.type_distances(origin)
    clusters_out = []
    for c in sorted(found, key=lambda c: -c["reports"]):
        lat, lon = to_latlon(np.array(c["centre_xy"]))
        locality, taluk, district = name_at(np.array(c["centre_xy"]))
        clusters_out.append({**{k: v for k, v in c.items() if k != "centre_xy"}, "lat": lat, "lon": lon,
                             "locality": locality, "taluk": taluk, "district": district})
    fresh = new_place_mask(events, origin, grid)
    order = np.argsort(-features.rtm_score)
    watch = [c for c in order if fresh[c]][:int(round(0.01 * grid.size))]
    reasons = []
    for cell in watch[:60]:
        near = sorted(((name, float(features.context[name][cell])) for name in features.context
                       if name not in ("log_population_5km", "school") and features.context[name][cell] < 1.0),
                      key=lambda kv: kv[1])
        lat, lon = float(grid.lat[cell]), float(grid.lon[cell])
        locality, taluk, district = name_at(grid.xy[cell])
        reasons.append({"lat": round(lat, 4), "lon": round(lon, 4), "locality": locality, "taluk": taluk,
                        "district": district, "relative_risk": round(float(np.exp(features.rtm_score[cell])
                                                         / np.exp(features.rtm_score).mean()), 1),
                        "within_1km_of": [n for n, _ in near][:5]})
    factors = [f for f in terrain.factors(features.rtm_counts) if f.get("band_km") and f["reports"] >= 5]
    factors.sort(key=lambda f: -f["relative_risk"])
    gateways_out = [dict(zip(("lat", "lon"), to_latlon(xy))) | {"near": name_at(xy)[0]} for xy in gates]
    evaluation = {stage: json.loads((OUTPUT / f"{stage}.json").read_text())["models"]
                  for stage in WINDOWS if (OUTPUT / f"{stage}.json").exists()}
    brief = {"as_of": as_of.isoformat(), "clusters": clusters_out, "risk_factors": factors[:20],
             "new_place_watch": reasons, "border_gateways": gateways_out,
             "evaluation": {stage: {m: {k: v for k, v in s.items() if "95ci" not in k} for m, s in models.items()}
                            for stage, models in evaluation.items()}}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / f"brief_{as_of}.json").write_text(json.dumps(brief, indent=1))
    g.SERVED.mkdir(parents=True, exist_ok=True)
    (g.SERVED / "patterns.json").write_text(json.dumps(brief))
    return brief


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("stage", choices=["evaluate", "forecast"])
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    if args.stage == "forecast":
        brief = issue(args.as_of)
        print(json.dumps({"clusters": brief["clusters"][:12], "risk_factors": brief["risk_factors"][:12],
                          "new_place_watch": brief["new_place_watch"][:12]}, indent=1))
        return
    run_all()


if __name__ == "__main__":
    main()
