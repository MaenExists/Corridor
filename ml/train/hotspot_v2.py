"""Pattern engine v2: learned hotspot profiles, a dedicated new-place model and emerging clusters.

The v1 pattern layer (hotspot_patterns.py) used hand-written rules for hotspot
types and one model for both old and new places. It did not beat population at
finding new places. v2 splits the problem and learns the patterns instead:

1. Learned hotspot profiles. Every 1 km square gets a context profile: the
   distance to 18 kinds of places (railway stations, highways, bus stands,
   hotels and lodges, beaches, jetties, toll plazas, markets, cinemas and
   malls, colleges and more), how many of the venue kinds lie within 2 km, and
   how many people live in it and within 5 km. A Gaussian mixture fitted to
   the profiles of squares with reports (last three years) finds recurring
   kinds of hotspot; a second mixture fitted to ordinary inhabited squares is
   the background. Each profile is named by what sets it apart. The log ratio
   of the two densities says how hotspot-like a square is for the people who
   live there ("look-alike" score). Mixtures are refitted every 1 January on
   reports before that date.
2. New-place model. A model trained only on squares more than 2 km from every
   earlier report, to predict which of them get a report in the next 28 days.
   Inputs: population, the look-alike score, reports in rings 2-5, 5-15 and
   15-30 km away (all history and last year), distance to the nearest earlier
   and recent report, the district's news-report rate (coverage), and a few
   distances and venue counts. Logistic regression and small boosted trees
   are both fitted; development picks one.
3. Combined list. The top 1% of squares is the grid ranker's list with a share
   of slots handed to the best new-place squares. Development picks the share.
4. Emerging clusters. A prospective space-time permutation scan (Kulldorff
   2005) over the last three years: circles of 2, 5 and 10 km around recent
   reports, windows of 28, 56 and 91 days, 199 random reshuffles of report
   dates for significance. A cluster means reports there are recent more often
   than the area's own history would explain.

Enforcement presence (police stations, Excise offices) is not in the profiles,
and neither are industrial areas, which in Kerala largely mean migrant
workers' housing; no layer describes who lives somewhere. Pre-registration and
results: docs/MODEL_PLAN.md, "Pattern engine v2".
"""

import argparse
from datetime import date, timedelta
import json
import multiprocessing as mp
from pathlib import Path
import time

import numpy as np
from scipy import sparse
from scipy.spatial import cKDTree

from ml.data.context_layers import cell_context, layer_counts
from ml.recovery.drug_burden import cell_districts
from ml.train import hotspot_grid as g
from ml.train import hotspot_patterns as p

OUTPUT = g.OUTPUT / "v2"
CACHE = OUTPUT / "cache"
SERVED = g.SERVED / "patterns_v2.json"
PLACES = Path("web/public/generated/places/kerala_places.json")
SETTLEMENTS = ("city", "town", "suburb", "village", "neighbourhood")

LEFT_OUT = ("police_station", "excise_office", "industrial_area")
COUNT_LAYERS = ("hotel_lodge", "college", "bus_station", "liquor_outlet", "marketplace", "cinema_mall",
                "resort_homestay", "railway_station", "tourist_site", "fuel_station")
COUNT_KM = 2.0
PROFILE_YEARS = 3
PROFILE_K = range(2, 9)
PROFILE_REG = 0.05
BACKGROUND_K = 8
BACKGROUND_SAMPLE = 8000
FRESH_KM = p.NEW_PLACE_EXCLUSION_KM
NEW_NEGATIVES = 1500
GRID_NEGATIVES = 600
SHARES = (0.0, 0.05, 0.1, 0.2)
SCAN_RADII = (2.0, 5.0, 10.0)
SCAN_WINDOWS = (28, 56, 91)
SCAN_YEARS = 3
SCAN_PERMS = 199
SCAN_ALPHA = 0.05
SCAN_MIN = 3
WORKERS = 2
HORIZON = g.PRIMARY_HORIZON
FIRST_TRAIN = date(2018, 1, 1)

NEW_NAMES = ["log_population", "log_population_5km", "look_alike", "ring_2_5km_all", "ring_5_15km_all",
             "ring_15_30km_all", "ring_2_5km_year", "ring_5_15km_year", "log_km_to_report", "log_km_to_recent_report",
             "district_news_rate", "km_railway_station", "km_national_highway", "km_bus_station", "lodges_2km",
             "colleges_2km"]

LABEL = {
    "railway_station": "railway stations", "railway_line": "railway lines", "national_highway": "national highways",
    "main_road": "main roads", "bus_station": "bus stands", "airport": "an airport", "port": "a port or harbour",
    "college": "colleges", "school": "schools", "tourist_site": "tourist sites", "resort_homestay": "resorts and homestays",
    "liquor_outlet": "liquor outlets", "hotel_lodge": "hotels and lodges", "beach": "beaches",
    "ferry_jetty": "ferry jetties", "fuel_station": "fuel stations", "toll_booth": "toll plazas",
    "marketplace": "markets", "cinema_mall": "cinemas and malls", "land_border": "the state border",
    "border_gateway": "a border crossing",
}


# ---------------------------------------------------------------- context profiles

class Context:
    """Standardised context profile of every square (population-weighted Kerala average = 0)."""

    def __init__(self, grid):
        distances, gates = cell_context(grid.xy, extended=True)
        counts = layer_counts(grid.xy, COUNT_KM, COUNT_LAYERS)
        neighbours = grid.tree.query_ball_point(grid.xy, 5.0)
        pop5 = np.log1p(np.array([grid.population[n].sum() for n in neighbours]))
        columns, names = [], []
        for name in sorted(distances):
            if name in LEFT_OUT:
                continue
            columns.append(np.log1p(distances[name]))
            names.append(f"km:{name}")
        for name in sorted(counts):
            columns.append(np.log1p(counts[name]))
            names.append(f"n2km:{name}")
        columns += [np.log1p(grid.population), pop5]
        names += ["people", "people_5km"]
        raw = np.column_stack(columns)
        weight = grid.population / grid.population.sum()
        self.mean = (raw * weight[:, None]).sum(0)
        self.sd = np.sqrt((((raw - self.mean) ** 2) * weight[:, None]).sum(0)) + 1e-6
        self.Z = ((raw - self.mean) / self.sd).astype(np.float32)
        self.names, self.raw = names, raw
        self.distances, self.counts, self.gates, self.pop5 = distances, counts, gates, pop5


class Profiles:
    """Hotspot profiles against an inhabited-square background, fitted on reports before `origin`."""

    def __init__(self, ctx, grid, events, cells, origin, seed=g.SEED):
        from sklearn.mixture import GaussianMixture
        rng = np.random.default_rng(seed)
        past = (events["t"] < origin) & (events["t"] >= origin - 365 * PROFILE_YEARS)
        self.cells, counts = np.unique(cells[past], return_counts=True)
        self.reports = counts
        self.ok = len(self.cells) >= 20
        background = rng.choice(grid.size, BACKGROUND_SAMPLE, p=grid.population / grid.population.sum())
        self.background = GaussianMixture(BACKGROUND_K, covariance_type="diag", reg_covar=PROFILE_REG,
                                          random_state=seed).fit(ctx.Z[background])
        if not self.ok:
            return
        rows = np.repeat(ctx.Z[self.cells], np.minimum(counts, 5), axis=0)
        best = None
        for k in PROFILE_K:
            if len(rows) < 15 * k:
                break
            model = GaussianMixture(k, covariance_type="diag", reg_covar=PROFILE_REG, n_init=3,
                                    random_state=seed).fit(rows)
            bic = model.bic(rows)
            if best is None or bic < best[0]:
                best = (bic, model)
        self.hot = best[1]

    def look_alike(self, Z):
        """log p_hotspot(profile) - log p_inhabited(profile): how much more hotspot-like than an ordinary square."""
        if not self.ok:
            return np.zeros(len(Z), np.float32)
        return (self.hot.score_samples(Z) - self.background.score_samples(Z)).astype(np.float32)


def describe(profiles, ctx, grid, namer):
    """Readable profiles: what sets each apart, its share of reports, and example places."""
    if not profiles.ok:
        return []
    member = profiles.hot.predict(ctx.Z[profiles.cells])
    total = profiles.reports.sum()
    out = []
    weight = grid.population / grid.population.sum()
    for k in range(profiles.hot.n_components):
        inside = member == k
        if not inside.any():
            continue
        cells, reports = profiles.cells[inside], profiles.reports[inside]
        traits, used, short = [], set(), []
        for j in np.argsort(-np.abs(profiles.hot.means_[k])):
            name, z = ctx.names[j], float(profiles.hot.means_[k][j])
            kind, _, layer = name.partition(":")
            if layer in used:
                continue
            typical = float(np.expm1((ctx.raw[:, j] * weight).sum()))
            here = float(np.expm1(np.median(ctx.raw[cells, j])))
            if kind == "km" and z < -0.6 and layer in LABEL:
                traits.append({"text": f"near {LABEL[layer]}", "here_km": round(here, 1), "typical_km": round(typical, 1)})
                short.append(LABEL[layer])
            elif kind == "n2km" and z > 0.6:
                traits.append({"text": f"many {LABEL[layer]} within 2 km", "here": round(here, 1), "typical": round(typical, 1)})
                short.append(LABEL[layer])
            elif name == "people_5km" and abs(z) > 0.6:
                traits.append({"text": "dense town" if z > 0 else "thinly populated"})
                short.append(traits[-1]["text"])
            elif kind == "km" and z > 0.9 and layer in ("railway_station", "national_highway", "main_road", "bus_station"):
                traits.append({"text": f"far from {LABEL[layer]}", "here_km": round(here, 1), "typical_km": round(typical, 1)})
                short.append(traits[-1]["text"])
            else:
                continue
            used.add(layer or name)
            if len(traits) == 4:
                break
        top = cells[np.argsort(-reports)][:6]
        examples, seen = [], set()
        for cell in top:
            place = namer(grid.xy[cell])
            if place["name"] in seen:
                continue
            seen.add(place["name"])
            examples.append(place | {"reports": int(reports[cells == cell].sum())})
        title = " · ".join(short[:2])
        out.append({"id": f"p{k}", "name": (title[:1].upper() + title[1:]) if title else "Mixed surroundings",
                    "traits": traits, "reports": int(reports.sum()), "share": round(float(reports.sum() / total), 3),
                    "squares": int(len(cells)), "examples": examples[:4]})
    return sorted(out, key=lambda o: -o["reports"])


# ---------------------------------------------------------------- new-place features

class Neighbourhood:
    """Precomputed square-to-locality links within 2, 5, 15 and 30 km, and district news rates."""

    def __init__(self, grid, events):
        loc_tree = cKDTree(events["locations_xy"])
        self.rings = {r: grid.tree.sparse_distance_matrix(loc_tree, r, output_type="coo_matrix").tocsr()
                      .astype(bool).astype(np.float32) for r in (2.0, 5.0, 15.0, 30.0)}
        self.district = cell_districts(grid.lat, grid.lon)
        names = sorted(set(self.district))
        self.index = {n: i for i, n in enumerate(names)}
        self.cell_district = np.array([self.index[d] for d in self.district])
        self.people = np.bincount(self.cell_district, grid.population, len(names))
        self.event_district = np.array([self.index.get(d, -1) for d in events["district"]])


def new_matrix(grid, events, ctx, hood, origin, look):
    w_all = g.location_weights(events, origin)
    w_year = g.location_weights(events, origin, 365)
    ring = {r: hood.rings[r] @ w_all for r in hood.rings}
    ring_year = {r: hood.rings[r] @ w_year for r in (2.0, 5.0, 15.0)}
    seen, recent = w_all > 0, w_year > 0
    d_any = cKDTree(events["locations_xy"][seen]).query(grid.xy)[0] if seen.any() else np.full(grid.size, 300.0)
    d_recent = cKDTree(events["locations_xy"][recent]).query(grid.xy)[0] if recent.any() else np.full(grid.size, 300.0)
    window = (events["t"] < origin) & (events["t"] >= origin - 730) & (hood.event_district >= 0)
    rate = np.bincount(hood.event_district[window], minlength=len(hood.people)) / np.maximum(hood.people, 1) * 1e5
    columns = [np.log1p(grid.population), ctx.pop5, look,
               np.log1p(ring[5.0] - ring[2.0]), np.log1p(ring[15.0] - ring[5.0]), np.log1p(ring[30.0] - ring[15.0]),
               np.log1p(ring_year[5.0] - ring_year[2.0]), np.log1p(ring_year[15.0] - ring_year[5.0]),
               np.log1p(np.minimum(d_any, 300.0)), np.log1p(np.minimum(d_recent, 300.0)),
               np.log1p(rate[hood.cell_district]),
               np.log1p(ctx.distances["railway_station"]), np.log1p(ctx.distances["national_highway"]),
               np.log1p(ctx.distances["bus_station"]),
               np.log1p(ctx.counts["hotel_lodge"]), np.log1p(ctx.counts["college"])]
    return np.column_stack(columns).astype(np.float32), d_any > FRESH_KM


# ---------------------------------------------------------------- emerging clusters

def scan(events, origin, perms=SCAN_PERMS, seed=g.SEED):
    """Prospective space-time permutation scan ending at origin; non-overlapping significant clusters."""
    rng = np.random.default_rng(seed + int(origin))
    idx = np.flatnonzero((events["t"] < origin) & (events["t"] >= origin - 365 * SCAN_YEARS))
    if len(idx) < 30:
        return []
    xy = events["locations_xy"][events["loc"][idx]]
    age = origin - events["t"][idx]
    recent_locs = np.unique(events["loc"][idx[age < max(SCAN_WINDOWS)]])
    if not len(recent_locs):
        return []
    tree = cKDTree(xy)
    zones, members = [], []
    for loc in recent_locs:
        centre = events["locations_xy"][loc]
        for r in SCAN_RADII:
            inside = tree.query_ball_point(centre, r)
            zones.append((int(loc), r))
            row = np.zeros(len(idx), np.float32)
            row[inside] = 1
            members.append(row)
    M = np.vstack(members)
    n = float(len(idx))
    nz = M.sum(1)

    def glr(window_matrix):
        obs = M @ window_matrix
        expected = np.outer(nz, window_matrix.sum(0)) / n
        with np.errstate(divide="ignore", invalid="ignore"):
            value = obs * np.log(obs / expected) + (n - obs) * np.log((n - obs) / (n - expected))
        return np.where((obs > expected) & (obs >= SCAN_MIN) & (obs < n), np.nan_to_num(value), 0.0), obs, expected

    W = np.column_stack([age < w for w in SCAN_WINDOWS]).astype(np.float32)
    stat, obs, expected = glr(W)
    null = np.array([glr(W[rng.permutation(len(idx))])[0].max() for _ in range(perms)])
    order = np.dstack(np.unravel_index(np.argsort(-stat, axis=None), stat.shape))[0]
    found = []
    for zi, wi in order:
        if stat[zi, wi] <= 0:
            break
        p_value = (1 + (null >= stat[zi, wi]).sum()) / (perms + 1)
        if p_value > SCAN_ALPHA:
            break
        loc, radius = zones[zi]
        centre = events["locations_xy"][loc]
        if any(np.hypot(*(centre - f["xy"])) < radius + f["radius_km"] for f in found):
            continue
        found.append({"xy": centre, "radius_km": radius, "window_days": SCAN_WINDOWS[wi],
                      "observed": int(obs[zi, wi]), "expected": round(float(expected[zi, wi]), 2),
                      "ratio": round(float(obs[zi, wi] / max(expected[zi, wi], 1e-9)), 1),
                      "p_value": round(float(p_value), 3), "zone_reports_3y": int(nz[zi])})
        if len(found) == 10:
            break
    return found


# ---------------------------------------------------------------- evaluation

WINDOWS = p.WINDOWS
_S = {}


def _worker(origin):
    s = _S
    year = (g.EPOCH + timedelta(int(origin))).year
    look = s["look"][year]
    base = s["features"].matrix(origin, s["params"], HORIZON)
    newm, fresh = new_matrix(s["grid"], s["events"], s["ctx"], s["hood"], origin, look)
    counts = g.outcome(s["events"], s["cells"], origin, HORIZON, s["grid"].size)
    rng = np.random.default_rng(origin)
    pos = np.flatnonzero(counts > 0)
    neg = np.flatnonzero(counts == 0)
    take = rng.choice(neg, min(len(neg), GRID_NEGATIVES), replace=False)
    gi = np.concatenate([pos, take])
    gw = np.concatenate([np.ones(len(pos)), np.full(len(take), len(neg) / max(len(take), 1))])
    fpos = np.flatnonzero(fresh & (counts > 0))
    fneg = np.flatnonzero(fresh & (counts == 0))
    ftake = rng.choice(fneg, min(len(fneg), NEW_NEGATIVES), replace=False)
    ni = np.concatenate([fpos, ftake])
    nw = np.concatenate([np.ones(len(fpos)), np.full(len(ftake), len(fneg) / max(len(ftake), 1))])
    if origin in s["evaluate"]:
        np.savez(CACHE / f"{origin}.npz", base=base.astype(np.float16), new=newm)
    return (origin, base[gi], (counts[gi] > 0).astype(np.int8), gw, newm[ni], (counts[ni] > 0).astype(np.int8), nw)


def _fit_grid(rows):
    from sklearn.ensemble import HistGradientBoostingClassifier
    model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
                                           l2_regularization=1.0, random_state=g.SEED)
    model.fit(np.vstack([r[1] for r in rows]), np.concatenate([r[2] for r in rows]),
              sample_weight=np.concatenate([r[3] for r in rows]))
    return model


def _fit_new(rows):
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    X = np.vstack([r[4] for r in rows])
    y = np.concatenate([r[5] for r in rows])
    w = np.concatenate([r[6] for r in rows])
    lr = make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000))
    lr.fit(X, y, logisticregression__sample_weight=w / w.mean())
    hgb = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_leaf_nodes=7, min_samples_leaf=200,
                                         l2_regularization=1.0, random_state=g.SEED)
    hgb.fit(X, y, sample_weight=w / w.mean())
    return {"new_place_logistic": lr, "new_place_trees": hgb}, int(y.sum())


def combine(grid_score, new_score, fresh, share, n_top):
    """The grid ranker's top cells, with `share` of the slots given to the best new-place cells."""
    order = np.lexsort((-np.zeros(len(grid_score)), -grid_score))
    k_new = int(round(share * n_top))
    chosen = list(order[:n_top - k_new])
    taken = set(chosen)
    for cell in np.argsort(-np.where(fresh, new_score, -np.inf)):
        if len(chosen) >= n_top or not fresh[cell]:
            break
        if cell not in taken:
            chosen.append(cell)
            taken.add(cell)
    out = grid_score * 1e-6
    out[np.array(chosen)] = 2.0 + np.linspace(1, 0, len(chosen))
    return out


def prepare(look_years):
    grid = g.Grid()
    events = g.load_events()
    cells = g.event_cells(grid, events)
    ctx = Context(grid)
    hood = Neighbourhood(grid, events)
    profiles = {y: Profiles(ctx, grid, events, cells, g.day_number(date(y, 1, 1))) for y in look_years}
    look = {y: profiles[y].look_alike(ctx.Z) for y in look_years}
    return grid, events, cells, ctx, hood, profiles, look


def scan_eval(events, start, end):
    """Do emerging clusters keep running hot? Next-28-day reports inside each zone against its long-run share."""
    rows = []
    for origin in range(g.day_number(start), g.day_number(end) - HORIZON + 1, 28):
        found = scan(events, origin)
        past = np.flatnonzero((events["t"] < origin) & (events["t"] >= origin - 365 * SCAN_YEARS))
        nxt = np.flatnonzero((events["t"] >= origin) & (events["t"] < origin + HORIZON))
        if not len(past):
            continue
        past_xy = events["locations_xy"][events["loc"][past]]
        next_xy = events["locations_xy"][events["loc"][nxt]]
        # Rival: the same number of zones with the most raw reports in the last 28 days.
        recent = np.flatnonzero((events["t"] < origin) & (events["t"] >= origin - 28))
        busiest = []
        if len(recent):
            locs, n = np.unique(events["loc"][recent], return_counts=True)
            for loc in locs[np.argsort(-n)]:
                centre = events["locations_xy"][loc]
                if all(np.hypot(*(centre - b)) > 10 for b in busiest):
                    busiest.append(centre)
                if len(busiest) == len(found):
                    break
        for name, zones in (("scan", [(f["xy"], f["radius_km"]) for f in found]), ("busiest_recent", [(b, 5.0) for b in busiest])):
            observed = expected = 0.0
            for centre, radius in zones:
                share = (np.hypot(*(past_xy - centre).T) <= radius).mean()
                observed += (np.hypot(*(next_xy - centre).T) <= radius).sum() if len(next_xy) else 0
                expected += share * len(nxt)
            rows.append({"origin": int(origin), "model": name, "zones": len(zones), "observed": float(observed),
                         "expected": float(expected)})
    out = {}
    for name in ("scan", "busiest_recent"):
        r = [x for x in rows if x["model"] == name]
        obs, exp = sum(x["observed"] for x in r), sum(x["expected"] for x in r)
        out[name] = {"months": len(r), "zones": sum(x["zones"] for x in r), "next_28d_reports": obs,
                     "expected_from_long_run_share": round(exp, 1), "lift": round(obs / exp, 2) if exp else None}
    return out


def run_all():
    first = min(s for s, _ in WINDOWS.values())
    last_end = max(e for _, e in WINDOWS.values())
    years = list(range(FIRST_TRAIN.year, last_end.year + 1))
    grid, events, cells, ctx, hood, _, look = prepare(years)
    features = g.Features(grid, events)
    params = g.fit_etas(events["t"], events["locations_xy"][events["loc"]], g.day_number(first))
    stage_origins = {stage: g.origins(s, e, HORIZON) for stage, (s, e) in WINDOWS.items()}
    evaluate = {o for v in stage_origins.values() for o in v}
    every = sorted(set(g.origins(FIRST_TRAIN, last_end, HORIZON)) | evaluate)
    CACHE.mkdir(parents=True, exist_ok=True)
    _S.update(grid=grid, events=events, cells=cells, ctx=ctx, hood=hood, look=look, features=features,
              params=params, evaluate=evaluate)
    started, rows = time.time(), []
    with mp.get_context("fork").Pool(WORKERS) as pool:
        for count, row in enumerate(pool.imap(_worker, every, chunksize=4), 1):
            rows.append(row)
            if count % 50 == 0:
                print(f"origins {count}/{len(every)} in {time.time() - started:.0f}s", flush=True)
    rows.sort(key=lambda r: r[0])
    v1_context, _ = cell_context(grid.xy)
    reports = {}
    for stage, (start, end) in WINDOWS.items():
        start_day = g.day_number(start)
        train = [r for r in rows if r[0] + HORIZON <= start_day]
        grid_model = _fit_grid(train)
        new_models, positives = _fit_new(train)
        terrain = p.RiskTerrain(v1_context, grid.population).fit(
            np.bincount(cells[events["t"] < start_day], minlength=grid.size).astype(float))
        rtm = np.log(terrain.score() + 1e-9)
        per = {}
        n_top = int(round(0.01 * grid.size))
        for origin in stage_origins[stage]:
            cached = np.load(CACHE / f"{origin}.npz")
            base, newm = cached["base"].astype(np.float32), cached["new"]
            fresh = newm[:, NEW_NAMES.index("log_km_to_report")] > np.log1p(FRESH_KM)
            grid_score = grid_model.predict_proba(base)[:, 1]
            scores = {
                "grid_ranker": grid_score,
                "repeat_locality_1km": g.density(grid, events, g.location_weights(events, origin), 1.0),
                "population": grid.population.astype(float),
                "risk_terrain_v1": rtm,
                "look_alike": newm[:, NEW_NAMES.index("look_alike")] + np.log1p(grid.population),
            }
            for name, model in new_models.items():
                scores[name] = model.predict_proba(newm)[:, 1]
            for name in list(new_models):
                for share in SHARES[1:]:
                    scores[f"combined_{name}_{share:g}"] = combine(grid_score, scores[name], fresh, share, n_top)
            for name, row in p.score_origin(scores, events, cells, origin, HORIZON, grid).items():
                per.setdefault(name, []).append(row)
        models = {n: p.summarise(r) for n, r in per.items()}
        for model in ("new_place_logistic", "new_place_trees", "look_alike"):
            for rival in ("population", "risk_terrain_v1"):
                models[model][f"minus_{rival}_fresh_95ci"] = p.bootstrap(per[model], per[rival], "new_fresh_hit", "new_in_fresh")
        for name in [n for n in per if n.startswith("combined_")]:
            models[name]["minus_grid_ranker_hit1_95ci"] = p.bootstrap(per[name], per["grid_ranker"], "hit1", "events")
        report = {"stage": stage, "window": [str(start), str(end)], "horizon_days": HORIZON,
                  "training_origins": len(train), "new_place_training_positives": positives,
                  "models": models, "emerging_scan": scan_eval(events, start, end),
                  "note": "ETAS feature parameters fitted on reports before 2022 for every window; profiles refitted each 1 January"}
        OUTPUT.mkdir(parents=True, exist_ok=True)
        (OUTPUT / f"{stage}.json").write_text(json.dumps(report, indent=1))
        print(stage, json.dumps({m: {k: v for k, v in s.items() if "95ci" not in k and "median" not in k}
                                 for m, s in models.items() if not m.startswith("combined") or m.endswith("0.1")}), flush=True)
        print(stage, "scan", json.dumps(report["emerging_scan"]), flush=True)
    for path in CACHE.glob("*.npz"):
        path.unlink()
    choose()


def choose():
    """Apply the pre-registered development rules (docs/MODEL_PLAN.md) and record the choices."""
    dev = json.loads((OUTPUT / "development.json").read_text())["models"]
    fresh = lambda m: dev[m]["fresh_list_hit_rate"]
    best_new = max(("new_place_logistic", "new_place_trees", "look_alike"), key=fresh)
    adopted = fresh(best_new) > fresh("population") and fresh(best_new) > fresh("risk_terrain_v1")
    share = 0.0
    if adopted and best_new != "look_alike":
        for s in SHARES[1:]:
            if dev[f"combined_{best_new}_{s:g}"]["hit_rate_1pct"] >= dev["grid_ranker"]["hit_rate_1pct"] - 0.01:
                share = s
    decision = {"decided_on": "development", "new_place_model": best_new, "adopted_over_population_and_v1": adopted,
                "combined_share": share,
                "rule": "best fresh-list hit rate among the new-place candidates; adopted only if above population and v1 "
                        "risk terrain; combined share = largest share keeping the top-1% hit rate within 1 point of the grid ranker"}
    (OUTPUT / "decision.json").write_text(json.dumps(decision, indent=1))
    print("decision", json.dumps(decision), flush=True)
    return decision


# ---------------------------------------------------------------- forecast

def namer_from_places():
    data = json.loads(PLACES.read_text())
    rows = [dict(zip(data["fields"], r)) for r in data["places"] if r[2] in SETTLEMENTS and r[6]]
    tree = cKDTree(g.to_km([r["lat"] for r in rows], [r["lon"] for r in rows]))

    def name(xy):
        r = rows[int(tree.query(xy)[1])]
        return {"name": r["name"], "name_ml": r["name_ml"], "district": r["district"],
                "lat": round(r["lat"], 4), "lon": round(r["lon"], 4)}
    return name


def latlon(xy):
    return round(float(xy[1] / g.KY + g.LAT0), 4), round(float(xy[0] / g.KX + g.LON0), 4)


def issue(as_of):
    origin = g.day_number(as_of)
    decision = json.loads((OUTPUT / "decision.json").read_text()) if (OUTPUT / "decision.json").exists() else \
        {"new_place_model": "new_place_logistic", "combined_share": 0.0, "adopted_over_population_and_v1": False}
    years = list(range(FIRST_TRAIN.year, as_of.year + 1))
    grid, events, cells, ctx, hood, _, look = prepare(years)
    current = Profiles(ctx, grid, events, cells, origin)
    namer = namer_from_places()
    rows = []
    for o in g.origins(FIRST_TRAIN, as_of - timedelta(1), HORIZON):
        year = (g.EPOCH + timedelta(int(o))).year
        newm, fresh = new_matrix(grid, events, ctx, hood, o, look[year])
        counts = g.outcome(events, cells, o, HORIZON, grid.size)
        rng = np.random.default_rng(o)
        fpos = np.flatnonzero(fresh & (counts > 0))
        fneg = np.flatnonzero(fresh & (counts == 0))
        take = rng.choice(fneg, min(len(fneg), NEW_NEGATIVES), replace=False)
        idx = np.concatenate([fpos, take])
        w = np.concatenate([np.ones(len(fpos)), np.full(len(take), len(fneg) / max(len(take), 1))])
        rows.append((o, None, None, None, newm[idx], (counts[idx] > 0).astype(np.int8), w))
    models, positives = _fit_new(rows)
    chosen = decision["new_place_model"]
    newm, fresh = new_matrix(grid, events, ctx, hood, origin, current.look_alike(ctx.Z))
    score = (newm[:, NEW_NAMES.index("look_alike")] + np.log1p(grid.population) if chosen == "look_alike"
             else models[chosen].predict_proba(newm)[:, 1])
    n_top = int(round(0.01 * grid.size))
    watch_cells = [c for c in np.argsort(-np.where(fresh, score, -np.inf)) if fresh[c]][:n_top]
    profile_of = current.hot.predict(ctx.Z[watch_cells]) if current.ok else np.zeros(len(watch_cells), int)
    described = describe(current, ctx, grid, namer)
    name_of_profile = {d["id"]: d["name"] for d in described}
    groups = {}
    for rank, (cell, prof) in enumerate(zip(watch_cells, profile_of)):
        place = namer(grid.xy[cell])
        key = (place["name"], place["district"])
        entry = groups.setdefault(key, place | {"rank": rank + 1, "squares": 0, "profile": name_of_profile.get(f"p{prof}"),
                                                "km_to_report": round(float(np.expm1(newm[cell, NEW_NAMES.index("log_km_to_report")])), 1),
                                                "reports_5_15km_year": int(round(np.expm1(newm[cell, NEW_NAMES.index("ring_5_15km_year")])))})
        entry["squares"] += 1
    watch = sorted(groups.values(), key=lambda e: e["rank"])[:40]
    found = scan(events, origin)
    emerging = []
    for f in found:
        place = namer(f["xy"])
        emerging.append({k: v for k, v in f.items() if k != "xy"} | {"centre": dict(zip(("lat", "lon"), latlon(f["xy"])))}
                        | {"near": place["name"], "near_ml": place["name_ml"], "district": place["district"]})
    evaluation = {}
    for stage in WINDOWS:
        path = OUTPUT / f"{stage}.json"
        if path.exists():
            r = json.loads(path.read_text())
            keep = ("grid_ranker", "repeat_locality_1km", "population", "risk_terrain_v1", "look_alike",
                    "new_place_logistic", "new_place_trees", f"combined_{chosen}_{decision['combined_share']:g}")
            evaluation[stage] = {"window": r["window"], "emerging_scan": r["emerging_scan"],
                                 "models": {m: {k: v for k, v in r["models"][m].items() if "95ci" not in k}
                                            for m in keep if m in r["models"]},
                                 "fresh_95ci": {m: r["models"][m].get("minus_population_fresh_95ci") for m in
                                                ("new_place_logistic", "new_place_trees", "look_alike")}}
    brief = {
        "as_of": as_of.isoformat(), "horizon_days": HORIZON, "decision": decision,
        "profiles": described, "profile_reports_window_years": PROFILE_YEARS,
        "new_place_watch": watch, "new_place_cells": [list(latlon(grid.xy[c])) for c in watch_cells],
        "new_place_training_positives": positives,
        "emerging": emerging, "evaluation": evaluation,
        "layers": sorted(n.split(":", 1)[1] for n in ctx.names if ":" in n),
        "left_out": list(LEFT_OUT),
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / f"brief_{as_of}.json").write_text(json.dumps(brief, indent=1))
    SERVED.parent.mkdir(parents=True, exist_ok=True)
    SERVED.write_text(json.dumps(brief))
    return brief


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("stage", choices=["evaluate", "forecast", "choose"])
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    if args.stage == "evaluate":
        run_all()
    elif args.stage == "choose":
        choose()
    else:
        brief = issue(args.as_of)
        print(json.dumps({"profiles": [(d["name"], d["share"], [e["name"] for e in d["examples"]]) for d in brief["profiles"]],
                          "watch": [w["name"] for w in brief["new_place_watch"][:15]],
                          "emerging": [(e["near"], e["observed"], e["expected"], e["p_value"]) for e in brief["emerging"]]},
                         indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
