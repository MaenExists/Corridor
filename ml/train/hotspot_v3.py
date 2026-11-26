"""Grid forecast v3: a measurement-aware ranker of where located seizure reports will fall.

Located reports can only land in squares holding a gazetteer point the geocoder
can choose (5,754 of 46,057). v3 ranks only those squares, with features of the
square's own history, its neighbourhood, how much the news covers it, its
gazetteer point and its surroundings, using LightGBM models refitted every
13 weeks. Design, pre-registration and results: docs/MODEL_PLAN.md,
"Grid forecast v3".

Stages:
  features  - compute and cache features and outcomes for every weekly origin
  tune      - development (2022-23) comparison of configurations, then the choice
  evaluate  - one pass of the chosen design on the later windows, with baselines
  forecast  - issue the four-week list for --as-of
"""

import argparse
from datetime import date, timedelta
import csv
import json
import math
import multiprocessing as mp
import time

import numpy as np
from scipy.spatial import cKDTree

from ml.data.context_layers import cell_context
from ml.data.news_incidents import place_index
from ml.data.news_prominence import load as load_prominence
from ml.recovery.drug_burden import cell_districts
from ml.train import hotspot_grid as g
from ml.train import hotspot_patterns as p

OUTPUT = g.OUTPUT / "v3"
HORIZON = g.PRIMARY_HORIZON
FIRST_ORIGIN = date(2017, 1, 1)
ETAS_END = date(2022, 1, 1)
REFIT_WEEKS = 13
EASY_NEGATIVES = 500
WINDOWS = {"development": g.DEVELOPMENT, "reused_test": g.TEST,
           "postcutoff": (g.CUTOFF + timedelta(1), date.today() - timedelta(1))}
DECAYS = (14, 45, 120, 365, 1095)


# ---------------------------------------------------------------- reachable squares

def reachable_points():
    """Every gazetteer point the geocoder can choose, with the attributes that shape how often it is chosen."""
    out = {}
    for key, options in place_index().items():
        districts = {o["district"] for o in options}
        groups = [options] if len(districts) == 1 else [[o for o in options if o["district"] == d] for d in districts]
        for group in groups:
            c = max(group, key=lambda o: (o["population"], o["feature"].startswith("PPLA"), o["feature"] != "POSTAL"))
            point = out.setdefault((c["lat"], c["lon"]), {"lat": c["lat"], "lon": c["lon"], "population": c["population"],
                                                          "name": c["name"],
                                                          "feature": c["feature"], "keys": 0, "ambiguity": 99})
            point["keys"] += 1
            point["ambiguity"] = min(point["ambiguity"], len(districts))
    return list(out.values())


class Candidates:
    def __init__(self, grid):
        points = reachable_points()
        d, c = grid.tree.query(g.to_km([q["lat"] for q in points], [q["lon"] for q in points]))
        keep = d < 0.75
        self.cells = np.unique(c[keep])
        self.n = len(self.cells)
        self.pos = np.full(grid.size, -1)
        self.pos[self.cells] = np.arange(self.n)
        gaz_pop, gaz_class, n_points, ambiguity, keys = (np.zeros(self.n) for _ in range(5))
        self.point_name = [""] * self.n
        best_pop = np.full(self.n, -1.0)
        ambiguity[:] = 99
        for q, cell, ok in zip(points, c, keep):
            if not ok:
                continue
            i = self.pos[cell]
            if q["population"] > best_pop[i] or (q["population"] == best_pop[i] and q["feature"] != "POSTAL"):
                best_pop[i], self.point_name[i] = q["population"], q["name"]
            gaz_pop[i] = max(gaz_pop[i], q["population"])
            cls = 2 if q["feature"].startswith("PPLA") or q["feature"] == "PPLC" else 0 if q["feature"] == "POSTAL" else 1
            gaz_class[i] = max(gaz_class[i], cls)
            n_points[i] += 1
            keys[i] += q["keys"]
            ambiguity[i] = min(ambiguity[i], q["ambiguity"])
        xy = grid.xy[self.cells]
        self.xy = xy
        tree = cKDTree(xy)
        pairs = tree.sparse_distance_matrix(tree, 10.0, output_type="coo_matrix").tocsr()
        from scipy import sparse
        near = pairs.copy(); near.data = (near.data <= 2.0).astype(np.float32); near.eliminate_zeros()
        far = pairs.copy(); far.data = ((far.data > 2.0) & (far.data <= 10.0)).astype(np.float32); far.eliminate_zeros()
        self.near, self.far = near.tocsr(), far.tocsr()
        neighbours = grid.tree.query_ball_point(xy, 5.0)
        context, _ = cell_context(grid.xy, extended=True)
        district = cell_districts(grid.lat[self.cells], grid.lon[self.cells])
        names = sorted(set(district))
        self.district = np.array([names.index(x) for x in district])
        self.n_districts = len(names)
        self.static_names = ["log_population", "log_population_5km", "log_gazetteer_population", "gazetteer_class",
                             "gazetteer_points", "gazetteer_names", "name_ambiguity", "km_police_station",
                             "km_railway_station", "km_bus_station", "km_national_highway", "km_border_gateway",
                             "km_hotel_lodge", "km_college"]
        self.static = np.column_stack([
            np.log1p(grid.population[self.cells]),
            np.log1p([grid.population[nb].sum() for nb in neighbours]),
            np.log1p(gaz_pop), gaz_class, n_points, keys, np.minimum(ambiguity, 14),
            *[np.log1p(context[k][self.cells]) for k in ("police_station", "railway_station", "bus_station",
                                                         "national_highway", "border_gateway", "hotel_lodge", "college")],
        ]).astype(np.float32)


# ---------------------------------------------------------------- per-origin features

DYNAMIC = (["decay_%dd" % h for h in DECAYS] + ["count_28d", "count_91d", "count_365d", "count_all",
           "days_since_report", "report_days_all", "sources_all", "large_hauls_all", "synthetic_all",
           "near2km_91d", "near2km_365d", "near2km_all", "ring2_10km_91d", "ring2_10km_365d", "ring2_10km_all",
           "km_to_reported", "km_to_recent_reported", "etas",
           "news_91d", "news_365d", "news_prev_year", "news_all", "crime_news_365d", "crime_news_all",
           "district_reports_365d", "district_news_365d", "share_of_district_news",
           "state_reports_28d_vs_year", "month_sin", "month_cos",
           # Short-list signals (v3.1): what is happening at and around a place right now.
           "count_14d", "near2km_28d", "recent_vs_year", "mean_gap_days", "news_28d", "crime_news_91d",
           "crime_news_28d"])
COUNT_ALL, NEWS_ALL = DYNAMIC.index("count_all"), DYNAMIC.index("news_all")


def load_attributes(events):
    with g.INCIDENTS.open(encoding="utf-8", newline="") as stream:
        rows = [r for r in csv.DictReader(stream) if r["precision"] == "locality" and r["lat"]]
    rows.sort(key=lambda r: r["published"])
    assert len(rows) == len(events["t"])
    sources = sorted({r["source"] for r in rows})
    return (np.array([sources.index(r["source"]) for r in rows]),
            np.array([bool(r["quantity_g"]) and float(r["quantity_g"]) >= 1000 for r in rows]),
            np.array([r["drug"] == "synthetic" for r in rows]))


class State:
    def __init__(self):
        self.grid = g.Grid()
        self.events = g.load_events()
        self.cells = g.event_cells(self.grid, self.events)
        self.cand = Candidates(self.grid)
        self.ev = self.cand.pos[self.cells]
        assert (self.ev >= 0).all(), "a located report fell outside the reachable squares"
        self.t = self.events["t"]
        self.source, self.large, self.synthetic = load_attributes(self.events)
        # First time each (square, day) and (square, source) pair appears.
        self.pair_day = self._first(self.ev * 100000 + self.t.astype(int))
        self.pair_source = self._first(self.ev * 100 + self.source)
        day, cell, crime = load_prominence()
        cpos = self.cand.pos[cell]
        keep = cpos >= 0
        self.p_day, self.p_cell, self.p_crime = day[keep], cpos[keep], crime[keep]
        self.params = g.fit_etas(self.t, self.events["locations_xy"][self.events["loc"]], g.day_number(ETAS_END))

    def _first(self, keys):
        _, first = np.unique(keys, return_index=True)
        return self.ev[first], self.t[first]

    def counts(self, lo, hi, weights=None):
        m = (self.t >= lo) & (self.t < hi)
        return np.bincount(self.ev[m], weights=None if weights is None else weights[m], minlength=self.cand.n)

    def features(self, o):
        c, t, n = self.cand, self.t, self.cand.n
        past = t < o
        cols = [np.bincount(self.ev[past], weights=0.5 ** ((o - t[past]) / h), minlength=n) for h in DECAYS]
        w91, w365, wall = self.counts(o - 91, o), self.counts(o - 365, o), self.counts(-1e9, o)
        cols += [self.counts(o - 28, o), w91, w365, wall]
        last = np.full(n, -1e9)
        np.maximum.at(last, self.ev[past], t[past])
        cols.append(np.minimum(o - last, 3650))
        cols.append(np.bincount(self.pair_day[0][self.pair_day[1] < o], minlength=n))
        cols.append(np.bincount(self.pair_source[0][self.pair_source[1] < o], minlength=n))
        cols.append(self.counts(-1e9, o, self.large.astype(float)))
        cols.append(self.counts(-1e9, o, self.synthetic.astype(float)))
        for w in (w91, w365, wall):
            cols.append(c.near @ w)
        for w in (w91, w365, wall):
            cols.append(c.far @ w)
        for w in (wall, w365):
            reported = np.flatnonzero(w > 0)
            if len(reported) >= 2:
                d, i = cKDTree(c.xy[reported]).query(c.xy, k=2)
                cols.append(np.minimum(np.where(d[:, 0] > 0, d[:, 0], d[:, 1]), 300))
            else:
                cols.append(np.full(n, 300.0))
        cols.append(g.etas_score(self.grid, self.events, self.params, o, HORIZON)[c.cells])
        pd_, pc, pcr = self.p_day, self.p_cell, self.p_crime

        def news(lo, hi, crime=False):
            m = (pd_ >= lo) & (pd_ < hi)
            if crime:
                m &= pcr
            return np.bincount(pc[m], minlength=n)
        n365 = news(o - 365, o)
        cols += [news(o - 91, o), n365, news(o - 730, o - 365), news(-1e9, o), news(o - 365, o, True), news(-1e9, o, True)]
        dr = np.bincount(c.district, weights=w365, minlength=c.n_districts)[c.district]
        dn = np.bincount(c.district, weights=n365, minlength=c.n_districts)[c.district]
        cols += [dr, dn, n365 / np.maximum(dn, 1)]
        state28 = ((t >= o - 28) & past).sum()
        state365 = ((t >= o - 365) & past).sum()
        month = (g.EPOCH + timedelta(int(o))).month
        cols += [np.full(n, state28 / max(state365 / 13, 1)), np.full(n, math.sin(2 * math.pi * month / 12)),
                 np.full(n, math.cos(2 * math.pi * month / 12))]
        w28 = cols[DYNAMIC.index("count_28d")]
        first = np.full(n, 1e9)
        np.minimum.at(first, self.ev[past], t[past])
        span = np.where(wall > 1, (last - first) / np.maximum(wall - 1, 1), 3650)
        cols += [self.counts(o - 14, o), c.near @ w28, w91 / (w365 / 4 + 0.5), np.minimum(span, 3650),
                 news(o - 28, o), news(o - 91, o, True), news(o - 28, o, True)]
        return np.column_stack(cols + [c.static]).astype(np.float32)

    def outcome(self, o, h=HORIZON):
        return self.counts(o, o + h).astype(np.int16)


def feature_names(state):
    return DYNAMIC + state.cand.static_names


# ---------------------------------------------------------------- cache

_S = {}


def _features(o):
    s = _S["state"]
    return o, s.features(o), s.outcome(o), s.outcome(o, 7)


def build_cache():
    state = State()
    origins = sorted(set(g.origins(FIRST_ORIGIN, WINDOWS["postcutoff"][1], HORIZON)))
    _S["state"] = state
    OUTPUT.mkdir(parents=True, exist_ok=True)
    F = len(feature_names(state))
    X = np.lib.format.open_memmap(OUTPUT / "X.npy", mode="w+", dtype=np.float32, shape=(len(origins), state.cand.n, F))
    Y = np.zeros((len(origins), state.cand.n), np.int16)
    Y7 = np.zeros_like(Y)
    started = time.time()
    with mp.get_context("fork").Pool(2) as pool:
        for k, (o, x, y, y7) in enumerate(pool.imap(_features, origins, chunksize=8)):
            i = origins.index(o)
            X[i], Y[i], Y7[i] = x, y, y7
            if (k + 1) % 100 == 0:
                print(f"features {k + 1}/{len(origins)} in {time.time() - started:.0f}s", flush=True)
    X.flush()
    np.savez(OUTPUT / "meta.npz", origins=np.array(origins), Y=Y, Y7=Y7, cells=state.cand.cells)
    (OUTPUT / "feature_names.json").write_text(json.dumps(feature_names(state)))
    print(f"cache: {len(origins)} origins x {state.cand.n} squares x {F} features in {time.time() - started:.0f}s")


def load_cache():
    meta = np.load(OUTPUT / "meta.npz")
    X = np.load(OUTPUT / "X.npy", mmap_mode="r")
    names = json.loads((OUTPUT / "feature_names.json").read_text())
    assert names[COUNT_ALL] == "count_all" and names[NEWS_ALL] == "news_all"
    return X, meta["origins"], meta["Y"], meta["Y7"], meta["cells"], names


# ---------------------------------------------------------------- models

def training_rows(X, origins, Y, end_day, cfg, rng_seed=g.SEED):
    """Positives and sampled negatives from every origin whose window closed before end_day."""
    rows, ys, ws, groups = [], [], [], []
    hl = cfg.get("recency_half_life")
    for i in np.flatnonzero(origins + HORIZON <= end_day):
        y = Y[i]
        x = np.asarray(X[i])
        pos = np.flatnonzero(y > 0)
        # Hard negatives (any report or news history) are all kept; easy ones are sampled and reweighted.
        known = (x[:, COUNT_ALL] > 0) | (x[:, NEWS_ALL] > 0)
        hard = np.flatnonzero((y == 0) & known)
        easy = np.flatnonzero((y == 0) & ~known)
        rng = np.random.default_rng(rng_seed + int(origins[i]))
        take = rng.choice(easy, min(len(easy), EASY_NEGATIVES), replace=False)
        idx = np.concatenate([pos, hard, take])
        w = np.concatenate([np.ones(len(pos) + len(hard)), np.full(len(take), len(easy) / max(len(take), 1))])
        if hl:
            w = w * 0.5 ** ((end_day - origins[i]) / hl)
        rows.append(x[idx])
        ys.append(y[idx])
        ws.append(w)
        groups.append(len(idx))
    return np.vstack(rows), np.concatenate(ys), np.concatenate(ws), np.array(groups)


def fit(cfg, X, y, w, groups):
    import lightgbm as lgb
    common = dict(n_estimators=cfg.get("trees", 400), learning_rate=cfg.get("lr", 0.03), num_leaves=cfg.get("leaves", 15),
                  min_child_samples=cfg.get("min_child", 100), subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
                  reg_lambda=1.0, max_bin=63, random_state=g.SEED, n_jobs=4, verbose=-1)
    if cfg["objective"] == "lambdarank":
        model = lgb.LGBMRanker(objective="lambdarank", lambdarank_truncation_level=cfg.get("truncation", 200), **common)
        model.fit(X, np.minimum(y, 3), group=groups)
    elif cfg["objective"] == "poisson":
        model = lgb.LGBMRegressor(objective="poisson", **common)
        model.fit(X, y, sample_weight=w / w.mean())
    else:
        model = lgb.LGBMClassifier(objective="binary", **common)
        model.fit(X, (y > 0).astype(int), sample_weight=w / w.mean())
    return model


def predict(model, x):
    if hasattr(model, "predict_proba"):
        return model.predict_proba(x)[:, 1]
    return model.predict(x)


def rank01(score):
    order = np.argsort(np.argsort(score))
    return order / max(len(score) - 1, 1)


def full_score(grid_size, cells, score):
    """Spread a candidate score onto all squares; unreachable squares rank last."""
    out = np.full(grid_size, -1e9)
    out[cells] = score
    return out


CONFIGS = {
    "bin_l15_m100": {"objective": "binary", "leaves": 15, "min_child": 100},
    "bin_l31_m100": {"objective": "binary", "leaves": 31, "min_child": 100},
    "bin_l15_m300": {"objective": "binary", "leaves": 15, "min_child": 300},
    "bin_l15_m100_recent": {"objective": "binary", "leaves": 15, "min_child": 100, "recency_half_life": 730},
    "bin_l7_m50_t800": {"objective": "binary", "leaves": 7, "min_child": 50, "trees": 800, "lr": 0.02},
    "poi_l15_m100": {"objective": "poisson", "leaves": 15, "min_child": 100},
    "poi_l31_m100": {"objective": "poisson", "leaves": 31, "min_child": 100},
    "poi_l15_m100_recent": {"objective": "poisson", "leaves": 15, "min_child": 100, "recency_half_life": 730},
    "rank_l15_m100": {"objective": "lambdarank", "leaves": 15, "min_child": 100},
    "rank_l31_m100": {"objective": "lambdarank", "leaves": 31, "min_child": 100},
    "rank_l15_m100_recent": {"objective": "lambdarank", "leaves": 15, "min_child": 100, "recency_half_life": 730},
    # v3.1 short-list candidates: rank loss focused on the top 50, and slower, deeper boosting.
    "rank_l15_t50": {"objective": "lambdarank", "leaves": 15, "min_child": 100, "truncation": 50},
    "bin_l15_m100_t800": {"objective": "binary", "leaves": 15, "min_child": 100, "trees": 800, "lr": 0.015},
    "poi_l7_m50_t800": {"objective": "poisson", "leaves": 7, "min_child": 50, "trees": 800, "lr": 0.02},
}
SHORT_LIST_CRITERION = "precision_top50"


def refits(start, end):
    first, last = g.day_number(start), g.day_number(end)
    return list(range(first, last + 1, 7 * REFIT_WEEKS))


def window_scores(X, origins, Y, stage, configs):
    """Quarterly-refitted predictions for every origin of a window, per configuration."""
    start, end = WINDOWS[stage]
    eval_idx = [i for i, o in enumerate(origins) if g.day_number(start) <= o and o + HORIZON - 1 <= g.day_number(end)]
    out = {name: {} for name in configs}
    for refit in refits(start, end):
        batch = [i for i in eval_idx if refit <= origins[i] < refit + 7 * REFIT_WEEKS]
        if not batch:
            continue
        cache = {}
        for name, cfg in configs.items():
            key = cfg.get("recency_half_life")
            if key not in cache:
                cache[key] = training_rows(X, origins, Y, refit, cfg)
            model = fit(cfg, *cache[key])
            for i in batch:
                out[name][i] = predict(model, np.asarray(X[i]))
    return eval_idx, out


# ---------------------------------------------------------------- scoring

BUDGETS = (20, 50, 115)  # small lists: top 20 and 50 squares, and a quarter of the 1% budget


class Scorer:
    def __init__(self):
        self.grid = g.Grid()
        self.events = g.load_events()
        self.cells = g.event_cells(self.grid, self.events)

    def score(self, scores_by_model, origin, horizon=HORIZON):
        rows = p.score_origin(scores_by_model, self.events, self.cells, origin, horizon, self.grid)
        counts = g.outcome(self.events, self.cells, origin, horizon, self.grid.size)
        for name, score in scores_by_model.items():
            order = np.lexsort((-self.grid.population, -score))
            for b in BUDGETS:
                rows[name][f"hits_top{b}"] = int(counts[order[:b]].sum())
                rows[name][f"squares_hit_top{b}"] = int((counts[order[:b]] > 0).sum())
        return rows


def summarise(per):
    out = {}
    for name, rows in per.items():
        s = p.summarise([{k: v for k, v in r.items() if not k.startswith(("hits_top", "squares_hit_top"))} for r in rows])
        for b in BUDGETS:
            s[f"hit_rate_top{b}"] = round(sum(r[f"hits_top{b}"] for r in rows) / max(s["events"], 1), 4)
            s[f"precision_top{b}"] = round(sum(r[f"squares_hit_top{b}"] for r in rows) / (b * len(rows)), 4)
        out[name] = s
    return out


def tune():
    X, origins, Y, _, cells, names = load_cache()
    scorer = Scorer()
    folder = OUTPUT / "tune"
    folder.mkdir(parents=True, exist_ok=True)
    preds = {}
    for name, cfg in CONFIGS.items():
        path = folder / f"{name}.npz"
        if not path.exists():
            started = time.time()
            eval_idx, out = window_scores(X, origins, Y, "development", {name: cfg})
            np.savez(path, idx=np.array(eval_idx), pred=np.array([out[name][i] for i in eval_idx]))
            print(f"tuned {name} in {time.time() - started:.0f}s", flush=True)
        saved = np.load(path)
        eval_idx = [int(i) for i in saved["idx"]]
        preds[name] = dict(zip(eval_idx, saved["pred"]))
    per = {}
    for i in eval_idx:
        scores = {name: full_score(scorer.grid.size, cells, preds[name][i]) for name in CONFIGS}
        x = np.asarray(X[i])
        scores["reported_before_then_news"] = full_score(scorer.grid.size, cells, heuristic(x, names))
        for name, row in scorer.score(scores, int(origins[i])).items():
            per.setdefault(name, []).append(row)
    result = summarise(per)
    # v3.1 rule (pre-registered): among configurations within 1 point of the best top-1% hit rate, the best
    # precision in the top 50 squares, then the best hit rate in the top 115.
    best1 = max(result[m]["hit_rate_1pct"] for m in CONFIGS)
    ranked = sorted([m for m in CONFIGS if result[m]["hit_rate_1pct"] >= best1 - 0.01],
                    key=lambda m: (-result[m][SHORT_LIST_CRITERION], -result[m]["hit_rate_top115"]))
    # Ensemble of the best configuration of each objective, by averaged within-origin ranks.
    best = {}
    for name in ranked:
        best.setdefault(CONFIGS[name]["objective"], name)
    if len(best) < 2:
        best = {name: name for name in ranked[:3]}
    members = list(best.values())
    ens_rows = []
    for i in eval_idx:
        s = np.mean([rank01(preds[m][i]) for m in members], axis=0)
        ens_rows.append(scorer.score({"ensemble": full_score(scorer.grid.size, cells, s)}, int(origins[i]))["ensemble"])
    result["ensemble"] = summarise({"ensemble": ens_rows})["ensemble"]
    eligible = [m for m in ranked[:1] + ["ensemble"] if result[m]["hit_rate_1pct"] >= best1 - 0.01]
    choice = max(eligible, key=lambda m: (result[m][SHORT_LIST_CRITERION], result[m]["hit_rate_top115"]))
    decision = {"decided_on": "development 2022-23", "chosen": choice,
                "members": members if choice == "ensemble" else [choice],
                "configs": {m: CONFIGS[m] for m in (members if choice == "ensemble" else [choice])},
                "development": {m: {k: v for k, v in r.items() if k in ("hit_rate_1pct", "hit_rate_5pct", "fresh_list_hit_rate",
                                                                         "new_place_hit_rate_1pct", "hit_rate_top115", "precision_top20",
                                                                         "precision_top50")} for m, r in result.items()}}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "tuning.json").write_text(json.dumps(decision, indent=1))
    for m in sorted(result, key=lambda m: -result[m]["hit_rate_1pct"]):
        r = result[m]
        print(f"{m:24s} top1% {r['hit_rate_1pct']:.3f}  top5% {r['hit_rate_5pct']:.3f}  new@1% {r['new_place_hit_rate_1pct']:.3f}  "
              f"fresh {r['fresh_list_hit_rate']:.3f}  top115 {r['hit_rate_top115']:.3f}  prec@20 {r['precision_top20']:.3f}  prec@50 {r['precision_top50']:.3f}")
    print("chosen:", choice, members)
    return decision


def heuristic(x, names):
    """Baseline rule: squares with earlier reports first (most first), then by news coverage, then population."""
    return (x[:, names.index("count_all")] * 1e6 + x[:, names.index("news_all")]
            + 1e-6 * x[:, names.index("log_population")])


def chosen_score(models, x):
    return np.mean([rank01(predict(m, x)) for m in models], axis=0) if len(models) > 1 else predict(models[0], x)


V1_CACHE = OUTPUT / "v1_cache"


def _v1_worker(o):
    s = _S
    m = s["features"].matrix(o, s["params"], HORIZON)
    counts = g.outcome(s["events"], s["cells"], o, HORIZON, s["grid"].size)
    rng = np.random.default_rng(g.SEED + int(o))
    pos, neg = np.flatnonzero(counts > 0), np.flatnonzero(counts == 0)
    take = rng.choice(neg, min(len(neg), 600), replace=False)
    idx = np.concatenate([pos, take])
    w = np.concatenate([np.ones(len(pos)), np.full(len(take), len(neg) / max(len(take), 1))])
    if o in s["evaluate"]:
        np.save(V1_CACHE / f"{o}.npy", m.astype(np.float32))
    return o, m[idx], (counts[idx] > 0).astype(np.int8), w


def v1_rows(eval_origins):
    """The v1 grid ranker's features, computed once per origin: training samples for every origin, and full
    matrices for the evaluated ones (same design as hotspot_grid.train_ranker, ETAS fitted before 2022)."""
    grid = g.Grid()
    events = g.load_events()
    _S.update(grid=grid, events=events, cells=g.event_cells(grid, events),
              params=g.fit_etas(events["t"], events["locations_xy"][events["loc"]], g.day_number(ETAS_END)),
              features=g.Features(grid, events), evaluate=set(eval_origins))
    V1_CACHE.mkdir(parents=True, exist_ok=True)
    every = sorted(set(g.origins(FIRST_ORIGIN, WINDOWS["postcutoff"][1], HORIZON)) | set(eval_origins))
    with mp.get_context("fork").Pool(2) as pool:
        rows = sorted(pool.imap(_v1_worker, every, chunksize=8), key=lambda r: r[0])
    return rows


def v1_scores(rows, stage, eval_origins):
    """The v1 grid ranker refitted on the same quarterly schedule as v3, on the full grid."""
    from sklearn.ensemble import HistGradientBoostingClassifier
    start, end = WINDOWS[stage]
    out = {}
    for refit in refits(start, end):
        batch = [o for o in eval_origins if refit <= o < refit + 7 * REFIT_WEEKS]
        if not batch:
            continue
        train = [r for r in rows if r[0] + HORIZON <= refit]
        model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
                                               l2_regularization=1.0, random_state=g.SEED)
        model.fit(np.vstack([r[1] for r in train]), np.concatenate([r[2] for r in train]),
                  sample_weight=np.concatenate([r[3] for r in train]))
        for o in batch:
            out[o] = model.predict_proba(np.load(V1_CACHE / f"{o}.npy"))[:, 1]
    return out


def calibration(preds, members, eval_idx, Y):
    """Do the Poisson member's expected counts match what happened? Mean predicted vs mean observed, by band."""
    poisson = [m for m in members if CONFIGS[m]["objective"] == "poisson"]
    if not poisson:
        return None
    pred = np.concatenate([preds[poisson[0]][i] for i in eval_idx])
    obs = np.concatenate([Y[i] for i in eval_idx]).astype(float)
    bands = []
    for lo, hi in ((0, .01), (.01, .03), (.03, .1), (.1, .3), (.3, 1), (1, 1e9)):
        m = (pred >= lo) & (pred < hi)
        if m.sum():
            bands.append({"expected": [lo, hi], "squares": int(m.sum()), "mean_expected": round(float(pred[m].mean()), 4),
                          "mean_observed": round(float(obs[m].mean()), 4)})
    return {"model": poisson[0], "total_expected": round(float(pred.sum()), 1), "total_observed": int(obs.sum()), "bands": bands}


def evaluate():
    X, origins, Y, Y7, cells, names = load_cache()
    decision = json.loads((OUTPUT / "tuning.json").read_text())
    members = {m: CONFIGS[m] for m in decision["members"]}
    scorer = Scorer()
    grid = scorer.grid
    reports = {}
    stage_idx = {}
    for stage, (start, end) in WINDOWS.items():
        stage_idx[stage] = [i for i, o in enumerate(origins) if g.day_number(start) <= o and o + HORIZON - 1 <= g.day_number(end)]
    rows = v1_rows([int(origins[i]) for idx in stage_idx.values() for i in idx])
    for stage in WINDOWS:
        eval_idx, preds = window_scores(X, origins, Y, stage, members)
        v1 = v1_scores(rows, stage, [int(origins[i]) for i in eval_idx])
        per = {}
        f = {k: names.index(k) for k in ("count_all", "news_all", "log_population")}
        for i in eval_idx:
            o = int(origins[i])
            x = np.asarray(X[i])
            v3 = (np.mean([rank01(preds[m][i]) for m in members], axis=0) if len(members) > 1 else preds[decision["members"][0]][i])
            v1_full = v1[o]
            masked = np.full(grid.size, -1e9)
            masked[cells] = v1_full[cells]
            scores = {
                "v3": full_score(grid.size, cells, v3),
                "v1_grid_ranker": v1_full,
                "v1_masked_to_reachable": masked,
                "reported_before_then_news": full_score(grid.size, cells, heuristic(x, names)),
                "repeat_locality_1km": g.density(grid, scorer.events, g.location_weights(scorer.events, o), 1.0),
                "population": grid.population.astype(float),
            }
            for name, row in scorer.score(scores, o).items():
                per.setdefault(name, []).append(row)
        models = summarise(per)
        for rival in ("v1_grid_ranker", "repeat_locality_1km", "v1_masked_to_reachable", "reported_before_then_news"):
            models["v3"][f"minus_{rival}_hit1_95ci"] = p.bootstrap(per["v3"], per[rival], "hit1", "events")
            models["v3"][f"minus_{rival}_fresh_95ci"] = p.bootstrap(per["v3"], per[rival], "new_fresh_hit", "new_in_fresh")
        reports[stage] = {"window": [str(d) for d in WINDOWS[stage]], "origins": len(eval_idx), "models": models,
                          "calibration": calibration(preds, members, eval_idx, Y)}
        (OUTPUT / f"{stage}.json").write_text(json.dumps(reports[stage], indent=1))
        print(stage, json.dumps({m: {k: v for k, v in r.items() if k in ("hit_rate_1pct", "hit_rate_5pct", "fresh_list_hit_rate", "new_place_hit_rate_1pct")}
                                 for m, r in models.items()}), flush=True)
        print(stage, "v3 vs v1 95% CI:", models["v3"]["minus_v1_grid_ranker_hit1_95ci"], flush=True)
    reused, post = reports["reused_test"]["models"], reports["postcutoff"]["models"]
    switch = (reused["v3"]["minus_v1_grid_ranker_hit1_95ci"][0] > 0
              and post["v3"]["hit_rate_1pct"] >= post["v1_grid_ranker"]["hit_rate_1pct"] - 0.02)
    verdict = {"rule": "switch if the reused-window CI vs v1 excludes zero and post-cutoff is within 2 points",
               "switch_to_v3": bool(switch),
               "reused_v3": reused["v3"]["hit_rate_1pct"], "reused_v1": reused["v1_grid_ranker"]["hit_rate_1pct"],
               "reused_ci": reused["v3"]["minus_v1_grid_ranker_hit1_95ci"],
               "post_v3": post["v3"]["hit_rate_1pct"], "post_v1": post["v1_grid_ranker"]["hit_rate_1pct"]}
    (OUTPUT / "verdict.json").write_text(json.dumps(verdict, indent=1))
    print("verdict", json.dumps(verdict))


def importance():
    """Grouped permutation importance of the chosen design on development origins (descriptive)."""
    X, origins, Y, _, cells, names = load_cache()
    decision = json.loads((OUTPUT / "tuning.json").read_text())
    start, _ = WINDOWS["development"]
    cfgs = [CONFIGS[m] for m in decision["members"]]
    models = [fit(c, *training_rows(X, origins, Y, g.day_number(start) + 7 * 52, c)) for c in cfgs]
    idx = [i for i, o in enumerate(origins) if g.day_number(start) + 7 * 52 <= o < g.day_number(start) + 7 * 104 - HORIZON]
    groups = {"own history": [n for n in names if n.startswith(("decay", "count", "days_since", "report_days", "sources", "large", "synthetic"))],
              "neighbours and ETAS": [n for n in names if n.startswith(("near", "ring", "km_to_re", "etas"))],
              "news prominence": [n for n in names if "news" in n],
              "gazetteer point": [n for n in names if n.startswith(("log_gazetteer", "gazetteer", "name_"))],
              "surroundings": [n for n in names if n.startswith("km_") and not n.startswith("km_to_re")],
              "population": ["log_population", "log_population_5km"],
              "district and state": ["district_reports_365d", "state_reports_28d_vs_year", "month_sin", "month_cos"]}
    rng = np.random.default_rng(g.SEED)
    n_top = 461

    def hit(score, y):
        return y[np.argsort(-score)[:n_top]].sum() / max(y.sum(), 1)
    base = np.mean([hit(chosen_score(models, np.asarray(X[i])), Y[i]) for i in idx])
    out = {}
    for group, cols in groups.items():
        j = [names.index(c) for c in cols if c in names]
        drops = []
        for i in idx:
            x = np.array(X[i])
            x[:, j] = x[rng.permutation(len(x))][:, j]
            drops.append(hit(chosen_score(models, x), Y[i]))
        out[group] = round(float(base - np.mean(drops)), 4)
    (OUTPUT / "importance.json").write_text(json.dumps(dict(sorted(out.items(), key=lambda kv: -kv[1])), indent=1))
    print(json.dumps(dict(sorted(out.items(), key=lambda kv: -kv[1])), indent=1))


def cutoff_check():
    """One v3 list frozen at 30 June 2026 (weights and reports), scored month by month against later reports."""
    from ml.evaluate.hotspot_cutoff import month_windows
    X, origins, Y, _, cells, names = load_cache()
    decision = json.loads((OUTPUT / "tuning.json").read_text())
    state = State()
    origin = g.day_number(g.CUTOFF + timedelta(1))
    models = [fit(CONFIGS[m], *training_rows(X, origins, Y, origin, CONFIGS[m])) for m in decision["members"]]
    x = state.features(origin)
    score = chosen_score(models, x)
    n_top = int(round(0.01 * state.grid.size))
    flagged = set(state.cand.cells[np.argsort(-score)[:n_top]].tolist())
    end = date.today() - timedelta(1)
    t, cells_ev = state.t, state.cells
    seen = set(state.events["loc"][t < origin])
    months, total, new_total, new_hit, hit = [], 0, 0, 0, 0
    for lo, hi in month_windows(g.CUTOFF + timedelta(1), end):
        idx = np.flatnonzero((t >= g.day_number(lo)) & (t <= g.day_number(hi)))
        h = int(sum(cells_ev[i] in flagged for i in idx))
        new = [i for i in idx if state.events["loc"][i] not in seen]
        months.append({"month": lo.strftime("%Y-%m"), "through": str(hi), "located_reports": int(len(idx)), "v3": h})
        total += len(idx); hit += h; new_total += len(new); new_hit += sum(cells_ev[i] in flagged for i in new)
    top20 = state.cand.cells[np.argsort(-score)[:20]]
    later = state.events["locations_xy"][state.events["loc"][(t >= origin) & (t <= g.day_number(end))]]
    later_tree = cKDTree(later) if len(later) else None
    top20_hit = int(sum(bool(later_tree and later_tree.query_ball_point(state.grid.xy[c], 2.0)) for c in top20))
    report = {"cutoff": str(g.CUTOFF), "checked_through": str(end), "flagged_cells": n_top, "model": decision["chosen"],
              "top20_with_later_report": top20_hit,
              "post_cutoff_located_reports": total, "caught": hit, "hit_rate": round(hit / max(total, 1), 3),
              "new_place_reports": new_total, "new_place_caught": int(new_hit), "by_month": months}
    (OUTPUT / "cutoff_check.json").write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))


# ---------------------------------------------------------------- forecast

def issue(as_of):
    """Four-week list of the top 1% of squares, all reachable, from reports before as_of."""
    state = State()
    origin = g.day_number(as_of)
    decision = json.loads((OUTPUT / "tuning.json").read_text())
    X, origins, Y, _, cells, names = load_cache()
    assert (cells == state.cand.cells).all(), "candidate set changed since the cache was built; rerun features"
    cfgs = [CONFIGS[m] for m in decision["members"]]
    models = [fit(c, *training_rows(X, origins, Y, origin, c)) for c in cfgs]
    x = state.features(origin)
    score = chosen_score(models, x)
    poisson = [m for c, m in zip(cfgs, models) if c["objective"] == "poisson"]
    expected = predict(poisson[0], x) if poisson else None
    grid = state.grid
    n_top = int(round(0.01 * grid.size))
    order = np.argsort(-score)[:n_top]
    flagged = state.cand.cells[order]
    places = json.loads(g.Path("web/public/geography/kerala-places.json").read_text())["places"]
    place_tree = cKDTree(g.to_km([q["lat"] for q in places], [q["lon"] for q in places]))
    nearest = place_tree.query(grid.xy[flagged])[1]
    import unicodedata

    def plain_name(name):
        """The locality reports in this square are placed at, without GeoNames diacritics (Angamāli -> Angamali)."""
        return "".join(ch for ch in unicodedata.normalize("NFKD", name) if not unicodedata.combining(ch))
    near = cKDTree(state.events["locations_xy"])
    cells_out = []
    for rank, (cell, ci, place) in enumerate(zip(flagged, order, nearest), 1):
        r = {w: int(g.location_weights(state.events, origin, w)[near.query_ball_point(grid.xy[cell], 3.0)].sum()) for w in (28, 365)}
        cells_out.append({"rank": rank, "lat": round(float(grid.lat[cell]), 4), "lon": round(float(grid.lon[cell]), 4),
                          "locality": plain_name(state.cand.point_name[ci]) or places[place]["name"], "taluk": places[place].get("subdistrict"),
                          "district": (places[place].get("district") or "").replace(" District", "").replace(" district", ""),
                          "score": round(float(score[ci]), 5), "reports_here_ever": int(x[ci, names.index("count_all")]),
                          "expected_reports_28d": None if expected is None else round(float(expected[ci]), 3),
                          "news_365d": int(x[ci, names.index("news_365d")]),
                          "reports_within_3km_28d": r[28], "reports_within_3km_365d": r[365]})
    return {"as_of": as_of.isoformat(), "horizon_days": HORIZON, "model": "v3_" + decision["chosen"],
            "members": decision["members"], "cells": cells_out}


def serve(brief):
    """Serve v3 as the four-week list only if its pre-registered verdict passed; always keep both lists for the ledger."""
    verdict_path = OUTPUT / "verdict.json"
    verdict = json.loads(verdict_path.read_text()) if verdict_path.exists() else {"switch_to_v3": False}
    served = g.SERVED / "grid_forecast.json"
    v1 = json.loads(served.read_text()) if served.exists() else None
    g.SERVED.mkdir(parents=True, exist_ok=True)
    if v1 and v1.get("model", "").startswith("v3_"):
        v1 = json.loads((g.SERVED / "grid_forecast_v1.json").read_text())
    if not verdict["switch_to_v3"] or not v1 or v1["as_of"] != brief["as_of"]:
        (g.SERVED / "grid_forecast_v3.json").write_text(json.dumps(brief))
        print("v3 kept as challenger (grid_forecast_v3.json)")
        return
    (g.SERVED / "grid_forecast_v1.json").write_text(json.dumps(v1))
    evaluation = {stage: json.loads((OUTPUT / f"{stage}.json").read_text())["models"] for stage in WINDOWS
                  if (OUTPUT / f"{stage}.json").exists()}
    cutoff = json.loads((OUTPUT / "cutoff_check.json").read_text()) if (OUTPUT / "cutoff_check.json").exists() else None
    merged = v1 | {"cells": brief["cells"], "model": brief["model"], "members": brief["members"], "verdict": verdict,
                   "v3_evaluation": {st: {m: {k: v for k, v in r.items() if "95ci" not in k}
                                          for m, r in ms.items()} for st, ms in evaluation.items()}}
    if cutoff:
        merged["v3_cutoff"] = cutoff
    served.write_text(json.dumps(merged))
    print("v3 served as the four-week list (v1 kept as grid_forecast_v1.json)")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("stage", choices=["features", "tune", "evaluate", "importance", "cutoff", "forecast"])
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    if args.stage == "features":
        build_cache()
    elif args.stage == "tune":
        tune()
    elif args.stage == "evaluate":
        evaluate()
    elif args.stage == "importance":
        importance()
    elif args.stage == "cutoff":
        cutoff_check()
    else:
        brief = issue(args.as_of)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        (OUTPUT / f"forecast_{args.as_of}.json").write_text(json.dumps(brief, indent=1))
        serve(brief)
        print(json.dumps({k: v for k, v in brief.items() if k != "cells"} | {"top": [c["locality"] for c in brief["cells"][:15]]}, indent=1))


if __name__ == "__main__":
    main()
