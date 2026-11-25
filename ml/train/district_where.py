"""Where-next forecast: which Kerala districts are likely to record the most NDPS cases next month.

The count model (district_monthly) gives each district an expected count. This
module turns that into a joint probability forecast by simulation. A statewide
multiplier is drawn from earlier statewide one-month errors, and each district
count is drawn from a negative binomial whose dispersion comes from earlier
district errors. From 4,000 simulated months it reports, for each district:

* expected cases and an 80% range,
* the probability of being one of the four highest districts statewide,
* the probability of running hot: a share of statewide cases at least 20%
  above the district's own 12-month share,
* the probability of a surge: a count at least 25% above its own 12-month mean.

These are forecasts of recorded enforcement outcomes for district-level review.
Recorded cases follow where officers look, so acting on them can reinforce
where cases are recorded. Use them alongside care and independent evidence,
never as targeting of people or places below district level.
"""

import argparse
import math

import numpy as np
from sklearn.metrics import roc_auc_score

from ml.train import district_monthly as count_model

SIMULATIONS = 4000
HOT_SHARE_RATIO = 1.2
SURGE_RATIO = 1.25
TOP_K = 4
ALERTS_PER_MONTH = 2
STATE_ERROR_WINDOW = 24
GATES = {
    "hot_alert_min_auc": 0.6,
    "hot_alert_min_brier_skill_vs_base_rate": 0.0,
    "hot_alert_min_precision_lift": 1.5,
    "top4_probability_min_brier_skill_vs_base_rate": 0.0,
}
OUTPUT = count_model.OUTPUT / "where"


def normal_share(panel, origin):
    window = panel.counts[origin - 11: origin + 1]
    return window.sum(axis=0) / window.sum()


def simulate(panel, origin, district_errors, state_errors, seed):
    """Simulated next-month district counts, shape (SIMULATIONS, districts)."""
    mean = count_model.share_state_mean(panel, origin, 1)
    phi = count_model.dispersion(district_errors[-count_model.DISPERSION_WINDOW * len(count_model.DISTRICTS):]) or 0.0
    rng = np.random.default_rng(seed)
    spread = float(np.std(state_errors[-STATE_ERROR_WINDOW:])) if len(state_errors) >= 12 else 0.0
    # A shared statewide draw makes districts move together. Keeping the full district dispersion
    # on top calibrated better on development than subtracting the statewide part.
    multiplier = np.exp(rng.normal(-spread ** 2 / 2, spread, size=(SIMULATIONS, 1)))
    size = 1 / max(phi, 1e-6)
    means = mean[None, :] * multiplier
    return rng.negative_binomial(size, size / (size + means)), mean


def probabilities(panel, origin, sims):
    totals = np.maximum(sims.sum(axis=1, keepdims=True), 1)
    shares = sims / totals
    ranks = (-sims).argsort(axis=1, kind="stable").argsort(axis=1, kind="stable")
    baseline = panel.counts[origin - 11: origin + 1].mean(axis=0)
    return {
        "top4": (ranks < TOP_K).mean(axis=0),
        "hot": (shares >= HOT_SHARE_RATIO * normal_share(panel, origin)).mean(axis=0),
        "surge": (sims >= SURGE_RATIO * baseline).mean(axis=0),
        "expected_rank": ranks.mean(axis=0) + 1,
        "range_80": np.quantile(sims, [0.1, 0.9], axis=0),
    }


def outcomes(panel, origin, target):
    actual = panel.counts[target]
    share = actual / actual.sum()
    order = (-actual).argsort(kind="stable")
    top = np.zeros(len(actual), bool)
    top[order[:TOP_K]] = True
    return {
        "top4": top.astype(int),
        "hot": (share >= HOT_SHARE_RATIO * normal_share(panel, origin)).astype(int),
        "surge": (actual >= SURGE_RATIO * panel.counts[origin - 11: origin + 1].mean(axis=0)).astype(int),
    }


def replay(panel, first, last):
    index = {month: position for position, month in enumerate(panel.months)}
    district_errors, state_errors, records = [], [], []
    history = {"top4": [], "hot": [], "surge": []}
    for target in range(13, index[last] + 1):
        origin = target - 1
        sims, mean = simulate(panel, origin, district_errors, state_errors, seed=target)
        if target >= index[first]:
            prob = probabilities(panel, origin, sims)
            truth = outcomes(panel, origin, target)
            # Base rates use only outcomes known at the origin.
            base = {name: (np.sum(history[name], axis=0) + 1) / (len(history[name]) + 2) for name in history}
            momentum = panel.counts[origin] / np.maximum(panel.counts[origin].sum(), 1) / normal_share(panel, origin)
            records.append({"target": panel.months[target].isoformat(), "prob": prob, "truth": truth, "base": base,
                            "persistence": momentum, "mean": mean, "actual": panel.counts[target].copy(),
                            "share_12": normal_share(panel, origin)})
        truth_now = outcomes(panel, origin, target)
        for name in history:
            history[name].append(truth_now[name])
        district_errors += list(zip(mean.tolist(), panel.counts[target].tolist()))
        state_errors.append(math.log(panel.counts[target].sum() / mean.sum()))
    return records


def brier(probability, truth):
    return float(np.mean((probability - truth) ** 2))


def score(records):
    report = {"months": len(records)}
    for name in ("top4", "hot", "surge"):
        p = np.concatenate([record["prob"][name] for record in records])
        y = np.concatenate([record["truth"][name] for record in records])
        b = np.concatenate([record["base"][name] for record in records])
        entry = {"base_rate": round(float(y.mean()), 3), "brier": round(brier(p, y), 4),
                 "brier_skill_vs_base_rate": round(1 - brier(p, y) / brier(b, y), 3),
                 "auc": round(float(roc_auc_score(y, p)), 3) if 0 < y.mean() < 1 else None,
                 "mean_probability": round(float(p.mean()), 3)}
        if name != "top4":
            matrix_p = np.array([record["prob"][name] for record in records])
            matrix_y = np.array([record["truth"][name] for record in records])
            persistence = np.array([record["persistence"] for record in records])
            chosen = np.argsort(-matrix_p, axis=1, kind="stable")[:, :ALERTS_PER_MONTH]
            naive = np.argsort(-persistence, axis=1, kind="stable")[:, :ALERTS_PER_MONTH]
            precision = float(np.mean(np.take_along_axis(matrix_y, chosen, axis=1)))
            entry.update({
                f"top{ALERTS_PER_MONTH}_alert_precision": round(precision, 3),
                "precision_lift_vs_base_rate": round(precision / max(float(y.mean()), 1e-9), 2),
                f"persistence_top{ALERTS_PER_MONTH}_precision": round(float(np.mean(np.take_along_axis(matrix_y, naive, axis=1))), 3),
                "persistence_auc": round(float(roc_auc_score(y, persistence.ravel())), 3) if 0 < y.mean() < 1 else None,
            })
        report[name] = entry
    capture = {}
    for label, key in (("model", "mean"), ("twelve_month_share", "share_12")):
        values = []
        for record in records:
            chosen = np.argsort(-record[key], kind="stable")[:TOP_K]
            values.append(record["actual"][chosen].sum() / record["actual"].sum())
        capture[label] = round(float(np.mean(values)), 4)
    capture["perfect_foresight"] = round(float(np.mean([np.sort(r["actual"])[::-1][:TOP_K].sum() / r["actual"].sum()
                                                        for r in records])), 4)
    report["top4_case_capture"] = capture
    return report


def gate(report):
    hot, top = report["hot"], report["top4"]
    checks = {
        "hot_auc": hot["auc"] is not None and hot["auc"] >= GATES["hot_alert_min_auc"],
        "hot_brier_skill": hot["brier_skill_vs_base_rate"] > GATES["hot_alert_min_brier_skill_vs_base_rate"],
        "hot_precision_lift": hot["precision_lift_vs_base_rate"] >= GATES["hot_alert_min_precision_lift"],
        "top4_brier_skill": top["brier_skill_vs_base_rate"] > GATES["top4_probability_min_brier_skill_vs_base_rate"],
    }
    checks["passed"] = all(checks.values())
    checks["beats_persistence_auc"] = hot["auc"] is not None and hot["auc"] > hot["persistence_auc"]
    return checks


def brief(panel, origin):
    """District hotspot brief for the month after a given origin."""
    index = range(13, origin + 1)
    district_errors, state_errors = [], []
    for target in index:
        mean = count_model.share_state_mean(panel, target - 1, 1)
        district_errors += list(zip(mean.tolist(), panel.counts[target].tolist()))
        state_errors.append(math.log(panel.counts[target].sum() / mean.sum()))
    sims, mean = simulate(panel, origin, district_errors, state_errors, seed=origin + 1)
    prob = probabilities(panel, origin, sims)
    rows = [{"district": district, "expected": round(float(mean[i]), 1),
             "range_80": [int(prob["range_80"][0, i]), int(prob["range_80"][1, i])],
             "p_top4": round(float(prob["top4"][i]), 3), "p_hot": round(float(prob["hot"][i]), 3),
             "p_surge": round(float(prob["surge"][i]), 3), "expected_rank": round(float(prob["expected_rank"][i]), 1)}
            for i, district in enumerate(count_model.DISTRICTS)]
    return sorted(rows, key=lambda row: row["expected_rank"])


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--stage", choices=("development", "test"), default="development")
    args = parser.parse_args()
    panel = count_model.load_panel()
    window = count_model.DEVELOPMENT if args.stage == "development" else count_model.TEST
    report = score(replay(panel, *window))
    report["gates"] = gate(report)
    report["settings"] = {"simulations": SIMULATIONS, "hot_share_ratio": HOT_SHARE_RATIO, "surge_ratio": SURGE_RATIO,
                          "alerts_per_month": ALERTS_PER_MONTH, "state_error_window": STATE_ERROR_WINDOW}
    if args.stage == "test":
        report["brief_for_october_2024"] = brief(panel, len(panel.months) - 1)
    count_model.write_json(OUTPUT / f"{args.stage}.json", report)
    hot, top, capture = report["hot"], report["top4"], report["top4_case_capture"]
    print(f"{args.stage}: top-4 districts capture {capture['model']:.1%} of cases "
          f"(12-month share {capture['twelve_month_share']:.1%}, perfect foresight {capture['perfect_foresight']:.1%}); "
          f"P(top-4) Brier skill {top['brier_skill_vs_base_rate']:+.2f}. Hot alerts: AUC {hot['auc']} "
          f"(persistence {hot['persistence_auc']}), Brier skill {hot['brier_skill_vs_base_rate']:+.2f}, "
          f"top-{ALERTS_PER_MONTH} precision {hot[f'top{ALERTS_PER_MONTH}_alert_precision']:.0%} vs base {hot['base_rate']:.0%}. "
          f"Surge AUC {report['surge']['auc']}. Gates {'PASS' if report['gates']['passed'] else 'FAIL'}.")


if __name__ == "__main__":
    main()
