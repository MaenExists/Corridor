import numpy as np
from scipy.stats import poisson
from sklearn.metrics import mean_absolute_error, mean_poisson_deviance


def count_metrics(rows, method):
    pairs = [(r["actual"], r["pred"][method]) for r in rows if r["pred"].get(method) is not None]
    if not pairs:
        return {"n": 0, "mae": None, "poisson_deviance": None}
    y, p = np.array(pairs, dtype=float).T
    return {"n": len(y), "mae": round(float(mean_absolute_error(y, p)), 4),
            "poisson_deviance": round(float(mean_poisson_deviance(y, np.maximum(p, 1e-8))), 4)}


def top_k(rows, method, k):
    all_rows = [r for r in rows if r["pred"].get(method) is not None]
    chosen = sorted(all_rows, key=lambda r: (-r["pred"][method], str(r["key"])))[:k]
    hits = sum(r["actual"] for r in chosen)
    total = sum(r["actual"] for r in all_rows)
    return {"selections": len(chosen), "selections_supported": sum(r["actual"] > 0 for r in chosen),
            "false_positives": sum(r["actual"] == 0 for r in chosen), "events_captured": hits,
            "events_missed": total - hits, "capture": round(hits / total, 4) if total else None}


def poisson_interval(estimate, nominal=.8):
    a = (1 - nominal) / 2
    return int(poisson.ppf(a, estimate)), int(poisson.ppf(1 - a, estimate))


def calibrated_interval(estimate, nominal, pad):
    if estimate is None or pad is None:
        return None
    lo, hi = poisson_interval(estimate, nominal)
    return max(0, lo - pad), hi + pad


def calibration(rows, method, nominal):
    misses = []
    for r in rows:
        p = r["pred"].get(method)
        if p is not None:
            lo, hi = poisson_interval(p, nominal)
            misses.append(max(0, lo - r["actual"], r["actual"] - hi))
    if len(misses) < 20:
        return {"n": len(misses), "raw_coverage": None, "pad": None}
    rank = min(len(misses), int(np.ceil((len(misses) + 1) * nominal)))
    return {"n": len(misses), "raw_coverage": round(misses.count(0)/len(misses), 4), "pad": sorted(misses)[rank-1]}


def interval_coverage(rows):
    checked = [r for r in rows if r.get("interval") is not None]
    if not checked:
        return {"n": 0, "coverage": None, "mean_width": None}
    return {"n": len(checked),
            "coverage": round(sum(r["interval"][0] <= r["actual"] <= r["interval"][1] for r in checked)/len(checked), 4),
            "mean_width": round(sum(r["interval"][1] - r["interval"][0] for r in checked)/len(checked), 3)}
