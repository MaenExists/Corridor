"""Audit the frozen where-next forecast without changing it.

Reliability tables, month-block bootstrap intervals, alert hit patterns,
district concentration, small-count noise, threshold sensitivity, year-by-year
stability and simple comparison rules. Nothing here selects settings.
"""

import json
from collections import Counter

import numpy as np
from sklearn.metrics import roc_auc_score

from ml.train import district_monthly as count_model
from ml.train import district_where as where

OUTPUT = where.OUTPUT / "audit.json"
BOOTSTRAP = 2000


def reliability(p, y, edges=(0, .1, .2, .3, .5, .7, 1.0001)):
    rows = []
    for low, high in zip(edges, edges[1:]):
        mask = (p >= low) & (p < high)
        if mask.any():
            rows.append({"bin": f"{low:.1f}-{min(high, 1):.1f}", "n": int(mask.sum()),
                         "mean_predicted": round(float(p[mask].mean()), 3), "observed": round(float(y[mask].mean()), 3)})
    return rows


def block_bootstrap(per_month, statistic, seed=0):
    rng = np.random.default_rng(seed)
    months = len(per_month)
    values = [statistic([per_month[i] for i in rng.integers(0, months, months)]) for _ in range(BOOTSTRAP)]
    return [round(float(np.quantile(values, 0.025)), 3), round(float(np.quantile(values, 0.975)), 3)]


def alerts(matrix, k=where.ALERTS_PER_MONTH):
    return np.argsort(-matrix, axis=1, kind="stable")[:, :k]


def audit(panel, window, ratio=where.HOT_SHARE_RATIO):
    original = where.HOT_SHARE_RATIO
    where.HOT_SHARE_RATIO = ratio
    try:
        records = where.replay(panel, *window)
    finally:
        where.HOT_SHARE_RATIO = original
    P = np.array([r["prob"]["hot"] for r in records])
    Y = np.array([r["truth"]["hot"] for r in records])
    persistence = np.array([r["persistence"] for r in records])
    chosen, naive = alerts(P), alerts(persistence)
    hits = np.take_along_axis(Y, chosen, axis=1)
    naive_hits = np.take_along_axis(Y, naive, axis=1)
    rng = np.random.default_rng(1)
    random_precision = float(np.mean([Y[i, rng.choice(14, 2, replace=False)].mean()
                                      for _ in range(500) for i in range(len(Y))]))
    # A fixed rule: always alert the two districts with the most hot months before the window.
    return records, P, Y, persistence, chosen, hits, naive_hits, random_precision


def main():
    panel = count_model.load_panel()
    report = {}
    records, P, Y, persistence, chosen, hits, naive_hits, random_precision = audit(panel, count_model.TEST)
    months = [r["target"] for r in records]
    districts = count_model.DISTRICTS
    per_month = list(zip(hits, naive_hits, Y))

    report["alert_precision"] = {
        "model": round(float(hits.mean()), 3),
        "model_95ci": block_bootstrap(per_month, lambda sample: np.mean([h for h, _, _ in sample])),
        "persistence": round(float(naive_hits.mean()), 3),
        "model_minus_persistence_95ci": block_bootstrap(
            per_month, lambda sample: np.mean([h.mean() - n.mean() for h, n, _ in sample])),
        "random_two_districts": round(random_precision, 3),
        "base_rate": round(float(Y.mean()), 3),
        "months_with_both_alerts_wrong": int((hits.sum(axis=1) == 0).sum()),
        "months_with_at_least_one_hit": int((hits.sum(axis=1) > 0).sum()),
        "months": len(months),
        "hot_districts_missed_by_alerts": int(Y.sum() - hits.sum()),
        "hot_district_months_total": int(Y.sum()),
    }
    auc_model = roc_auc_score(Y.ravel(), P.ravel())
    auc_persist = roc_auc_score(Y.ravel(), persistence.ravel())
    report["auc"] = {
        "model": round(float(auc_model), 3), "persistence": round(float(auc_persist), 3),
        "difference_95ci": block_bootstrap(
            list(zip(P, persistence, Y)),
            lambda s: roc_auc_score(np.concatenate([y for _, _, y in s]), np.concatenate([p for p, _, _ in s]))
            - roc_auc_score(np.concatenate([y for _, _, y in s]), np.concatenate([q for _, q, _ in s]))),
    }
    report["reliability"] = {name: reliability(np.concatenate([r["prob"][name] for r in records]),
                                               np.concatenate([r["truth"][name] for r in records]))
                             for name in ("hot", "top4", "surge")}

    alert_counts = Counter(districts[i] for row in chosen for i in row)
    per_district = {}
    for i, district in enumerate(districts):
        mask = (chosen == i).any(axis=1)
        per_district[district] = {"alerts": int(mask.sum()),
                                  "alert_hits": int(Y[mask, i].sum()) if mask.any() else 0,
                                  "hot_months": int(Y[:, i].sum()),
                                  "mean_cases": round(float(np.mean([r["actual"][i] for r in records])), 1)}
    report["alerts_by_district"] = dict(sorted(per_district.items(), key=lambda kv: -kv[1]["alerts"]))
    report["alert_concentration_top3_share"] = round(sum(c for _, c in alert_counts.most_common(3)) / chosen.size, 3)

    # What does a correct alert amount to in cases?
    excess = []
    for r, row, hit_row in zip(records, chosen, hits):
        for i, hit in zip(row, hit_row):
            if hit:
                expected_share_cases = r["share_12"][i] * r["actual"].sum()
                excess.append({"district": districts[i], "actual": int(r["actual"][i]),
                               "normal_share_cases": round(float(expected_share_cases), 1),
                               "excess_cases": round(float(r["actual"][i] - expected_share_cases), 1)})
    report["correct_alert_size"] = {
        "median_excess_cases": round(float(np.median([e["excess_cases"] for e in excess])), 1) if excess else None,
        "median_actual_cases": float(np.median([e["actual"] for e in excess])) if excess else None,
        "examples": excess[:8],
    }
    small = np.array([[r["actual"][i] < 30 for i in range(14)] for r in records])
    report["hot_events_in_small_counts"] = {
        "share_of_hot_events_under_30_cases": round(float(Y[small].sum() / Y.sum()), 3),
        "hot_rate_small": round(float(Y[small].mean()), 3), "hot_rate_large": round(float(Y[~small].mean()), 3),
    }
    report["monthly_hits"] = [{"month": month[:7], "alerts": [districts[i] for i in row], "hits": hit_row.tolist(),
                               "actually_hot": [districts[i] for i in np.flatnonzero(y)]}
                              for month, row, hit_row, y in zip(months, chosen, hits.astype(int), Y)]

    sensitivity = {}
    for ratio in (1.1, 1.3, 1.5):
        _, p_s, y_s, pers_s, _, hits_s, naive_s, _ = audit(panel, count_model.TEST, ratio)
        sensitivity[str(ratio)] = {"base_rate": round(float(y_s.mean()), 3), "alert_precision": round(float(hits_s.mean()), 3),
                                   "persistence_precision": round(float(naive_s.mean()), 3),
                                   "auc": round(float(roc_auc_score(y_s.ravel(), p_s.ravel())), 3),
                                   "persistence_auc": round(float(roc_auc_score(y_s.ravel(), pers_s.ravel())), 3)}
    report["threshold_sensitivity"] = sensitivity

    by_year = {}
    for year in range(2019, 2025):
        window = (count_model.add_months(count_model.DEVELOPMENT[0], 12 * (year - 2019)),
                  min(count_model.add_months(count_model.DEVELOPMENT[0], 12 * (year - 2019) + 11), count_model.TEST[1]))
        _, p_y, y_y, pers_y, _, hits_y, naive_y, _ = audit(panel, window)
        by_year[year] = {"alert_precision": round(float(hits_y.mean()), 3), "persistence": round(float(naive_y.mean()), 3),
                         "base_rate": round(float(y_y.mean()), 3), "auc": round(float(roc_auc_score(y_y.ravel(), p_y.ravel())), 3)}
    report["by_year_2019_2022_are_development"] = by_year

    count_model.write_json(OUTPUT, report)
    print(json.dumps({key: report[key] for key in ("alert_precision", "auc")}, indent=1))


if __name__ == "__main__":
    main()
