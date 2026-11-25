"""District-month forecast of recorded Kerala Excise NDPS cases.

The model splits each forecast into two parts that move at different speeds:

* the statewide level, carried forward from the latest complete month and
  adjusted by a shrunken calendar-month effect (special drives such as the
  Onam and Christmas campaigns recur), and
* each district's share of statewide cases, smoothed exponentially.

The expected count is share x statewide level. Prediction intervals use a
negative binomial whose dispersion is estimated only from earlier forecast
errors. Every forecast is replayed from a fixed origin: features, shares,
calendar effects and dispersion use months completed by that origin.

Counts describe recorded enforcement outcomes. They depend on where and how
hard the department looks, and are not measures of drug use or availability.
"""

import argparse
import csv
from dataclasses import dataclass
from datetime import date
import json
import math
from pathlib import Path

import numpy as np
from scipy.stats import nbinom, poisson

from ml.data.public_intake import ROOT

PANEL = ROOT / "excise_enforcement_monthly.csv"
OUTPUT = ROOT / "prepared" / "district_monthly"
DISTRICTS = ("Thiruvananthapuram", "Kollam", "Pathanamthitta", "Alappuzha", "Kottayam", "Idukki",
             "Ernakulam", "Thrissur", "Palakkad", "Malappuram", "Kozhikode", "Wayanad", "Kannur", "Kasaragod")

# Frozen on development targets (January 2019 to December 2022). See docs/MODEL_PLAN.md.
SHARE_SMOOTHING = 0.3
SEASONAL_SHRINK = 4.0
INTERVAL = 0.8
MIN_DISPERSION_ERRORS = 24
DISPERSION_WINDOW = 24  # months of earlier errors; frozen on development
DEVELOPMENT = (date(2019, 1, 1), date(2022, 12, 1))
TEST = (date(2023, 1, 1), date(2024, 9, 1))
HORIZONS = (1, 2, 3)
MAX_HORIZON = 3
GATES = {
    "min_mae_improvement_vs_best_baseline": 0.05,
    "max_abs_relative_bias": 0.05,
    "interval_coverage_range": (0.72, 0.88),
    "min_mean_rank_correlation": 0.7,
}
DEVELOPMENT_GRID = {"share_smoothing": (0.2, 0.3, 0.4, 0.5), "seasonal_shrink": (1.0, 2.0, 4.0, None)}


@dataclass(frozen=True)
class Panel:
    months: list
    counts: np.ndarray  # months x districts

    @property
    def state(self):
        return self.counts.sum(axis=1)


def load_panel(path=PANEL):
    by_month = {}
    with path.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            by_month.setdefault(date.fromisoformat(row["period_start"]), {})[row["district"]] = int(row["ndps_cases"])
    months = sorted(by_month)
    for previous, current in zip(months, months[1:]):
        if (current.year * 12 + current.month) - (previous.year * 12 + previous.month) != 1:
            raise ValueError("The monthly panel must be consecutive.")
    if any(set(by_month[month]) != set(DISTRICTS) for month in months):
        raise ValueError("Every month needs all 14 districts.")
    return Panel(months, np.array([[by_month[month][district] for district in DISTRICTS] for month in months], float))


def smoothed_share(panel, origin, smoothing):
    shares = panel.counts[: origin + 1] / np.maximum(panel.state[: origin + 1, None], 1)
    level = shares[0].copy()
    for row in shares[1:]:
        level = smoothing * row + (1 - smoothing) * level
    return level / level.sum()


def month_effect(panel, origin, month, shrink):
    """Average log change into a calendar month, shrunk towards zero by n / (n + shrink)."""
    if shrink is None:
        return 0.0
    changes = [math.log(panel.state[step] / panel.state[step - 1]) for step in range(1, origin + 1)
               if panel.months[step].month == month and panel.state[step - 1] > 0 and panel.state[step] > 0]
    return sum(changes) / (len(changes) + shrink) if changes else 0.0


def add_months(day, count):
    year, index = divmod(day.year * 12 + day.month - 1 + count, 12)
    return date(year, index + 1, 1)


def share_state_mean(panel, origin, horizon, smoothing=SHARE_SMOOTHING, shrink=SEASONAL_SHRINK):
    level = panel.state[origin]
    for step in range(1, horizon + 1):
        level *= math.exp(month_effect(panel, origin, add_months(panel.months[origin], step).month, shrink))
    return smoothed_share(panel, origin, smoothing) * level


def baselines(panel, origin, horizon):
    target = origin + horizon
    counts = panel.counts
    means = {
        "last_month": counts[origin],
        "mean_3_months": counts[origin - 2: origin + 1].mean(axis=0),
        "mean_12_months": counts[origin - 11: origin + 1].mean(axis=0),
    }
    if target - 12 <= origin:
        means["same_month_last_year"] = counts[target - 12]
    return means


BASELINES = ("last_month", "mean_3_months", "mean_12_months", "same_month_last_year")
MODEL = "share_state"


def dispersion(errors):
    """Method-of-moments negative binomial dispersion: Var = mu + phi * mu^2."""
    if len(errors) < MIN_DISPERSION_ERRORS:
        return None
    mean, actual = np.array(errors, float).T
    excess = ((actual - mean) ** 2 - mean).sum() / (mean ** 2).sum()
    return max(float(excess), 0.0)


def interval(mean, phi, level=INTERVAL):
    tail = (1 - level) / 2
    if phi is None:
        return None
    if phi <= 1e-9:
        return int(poisson.ppf(tail, mean)), int(poisson.ppf(1 - tail, mean))
    size = 1 / phi
    probability = size / (size + mean)
    return int(nbinom.ppf(tail, size, probability)), int(nbinom.ppf(1 - tail, size, probability))


def replay(panel, horizon, first_target, last_target, smoothing=SHARE_SMOOTHING, shrink=SEASONAL_SHRINK):
    """Forecast every target month from its origin, using only months completed by then."""
    index = {month: position for position, month in enumerate(panel.months)}
    rows, errors = [], []
    start = 12 + horizon
    for target in range(start, len(panel.months)):
        origin = target - horizon
        mean = share_state_mean(panel, origin, horizon, smoothing, shrink)
        # Dispersion only uses errors whose outcome month was complete at this origin.
        phi = dispersion([pair for pair, month in errors if origin - DISPERSION_WINDOW < month <= origin])
        if index[first_target] <= target <= index[last_target]:
            predictions = {MODEL: mean, **baselines(panel, origin, horizon)}
            for position, district in enumerate(DISTRICTS):
                rows.append({
                    "target": panel.months[target].isoformat(), "origin": panel.months[origin].isoformat(),
                    "horizon": horizon, "district": district, "actual": float(panel.counts[target, position]),
                    "pred": {name: float(values[position]) for name, values in predictions.items()},
                    "interval": interval(float(mean[position]), phi),
                })
        errors.extend(((float(m), float(a)), target) for m, a in zip(mean, panel.counts[target], strict=True))
    return rows


def metrics(rows, method):
    pairs = [(row["pred"][method], row["actual"]) for row in rows if method in row["pred"]]
    if not pairs:
        return None
    predicted, actual = np.array(pairs).T
    error = predicted - actual
    by_month = {}
    for row in rows:
        if method in row["pred"]:
            by_month.setdefault(row["target"], []).append((row["pred"][method], row["actual"]))
    correlations = []
    for values in by_month.values():
        p, a = np.array(values).T
        if np.std(p) > 0 and np.std(a) > 0:
            correlations.append(float(np.corrcoef(_rank(p), _rank(a))[0, 1]))
    top = []
    for values in by_month.values():
        p, a = np.array(values).T
        chosen = set(np.argsort(-p, kind="stable")[:4])
        top.append(len(chosen & set(np.argsort(-a, kind="stable")[:4])) / 4)
    return {
        "n": len(pairs),
        "mae": round(float(np.abs(error).mean()), 3),
        "rmse": round(float(np.sqrt((error ** 2).mean())), 3),
        "wape": round(float(np.abs(error).sum() / actual.sum()), 4),
        "relative_bias": round(float(error.sum() / actual.sum()), 4),
        "mean_rank_correlation": round(float(np.mean(correlations)), 3),
        "top4_overlap": round(float(np.mean(top)), 3),
    }


def _rank(values):
    order = np.argsort(values, kind="stable")
    ranks = np.empty(len(values))
    ranks[order] = np.arange(len(values))
    return ranks


def coverage(rows):
    checked = [row for row in rows if row["interval"] is not None]
    if not checked:
        return None
    inside = [row["interval"][0] <= row["actual"] <= row["interval"][1] for row in checked]
    widths = [row["interval"][1] - row["interval"][0] for row in checked]
    return {"n": len(checked), "coverage": round(float(np.mean(inside)), 3),
            "mean_width": round(float(np.mean(widths)), 2)}


def stage_report(panel, window):
    report = {}
    for horizon in HORIZONS:
        rows = replay(panel, horizon, *window)
        scores = {method: metrics(rows, method) for method in (MODEL, *BASELINES)}
        scores = {name: score for name, score in scores.items() if score}
        report[f"h{horizon}"] = {"scores": scores, "interval": coverage(rows), "rows": rows}
    return report


def gate(stage):
    scores = stage["scores"]
    best = min((name for name in BASELINES if name in scores), key=lambda name: scores[name]["mae"])
    model = scores[MODEL]
    improvement = 1 - model["mae"] / scores[best]["mae"]
    low, high = GATES["interval_coverage_range"]
    checks = {
        "best_baseline": best,
        "mae_improvement": round(improvement, 4),
        "skill": improvement >= GATES["min_mae_improvement_vs_best_baseline"],
        "bias": abs(model["relative_bias"]) <= GATES["max_abs_relative_bias"],
        "calibration": stage["interval"] is not None and low <= stage["interval"]["coverage"] <= high,
        "ranking": model["mean_rank_correlation"] >= GATES["min_mean_rank_correlation"],
    }
    checks["passed"] = all(checks[name] for name in ("skill", "bias", "calibration", "ranking"))
    return checks


def development_grid(panel):
    results = []
    for smoothing in DEVELOPMENT_GRID["share_smoothing"]:
        for shrink in DEVELOPMENT_GRID["seasonal_shrink"]:
            rows = replay(panel, 1, *DEVELOPMENT, smoothing, shrink)
            results.append({"share_smoothing": smoothing, "seasonal_shrink": shrink,
                            "mae": metrics(rows, MODEL)["mae"]})
    return sorted(results, key=lambda row: row["mae"])


def strip_rows(stage):
    return {key: {name: value for name, value in section.items() if name != "rows"} for key, section in stage.items()}


def write_json(path, value):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2, default=str) + "\n", encoding="utf-8")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--stage", choices=("development", "test"), default="development")
    args = parser.parse_args()
    panel = load_panel()
    report = {
        "target": "Recorded Kerala Excise NDPS cases per district and month",
        "panel": {"first": panel.months[0].isoformat(), "last": panel.months[-1].isoformat(), "months": len(panel.months)},
        "model": {"name": MODEL, "share_smoothing": SHARE_SMOOTHING, "seasonal_shrink": SEASONAL_SHRINK,
                  "dispersion_window_months": DISPERSION_WINDOW,
                  "interval": INTERVAL},
        "gates": GATES,
        "development_grid": development_grid(panel),
        "development": strip_rows(development := stage_report(panel, DEVELOPMENT)),
        "development_gates": {key: gate(section) for key, section in development.items()},
    }
    if args.stage == "test":
        test = stage_report(panel, TEST)
        report["test"] = strip_rows(test)
        report["test_gates"] = {key: gate(section) for key, section in test.items()}
        write_json(OUTPUT / "test_forecasts.json", [row for row in test["h1"]["rows"]])
    write_json(OUTPUT / f"{args.stage}.json", report)
    for stage in ("development", "test"):
        if stage not in report:
            continue
        for key, section in report[stage].items():
            scores, checks = section["scores"], report[f"{stage}_gates"][key]
            print(f"{stage} {key}: model MAE {scores[MODEL]['mae']} vs {checks['best_baseline']} "
                  f"{scores[checks['best_baseline']]['mae']} ({checks['mae_improvement']:+.1%}); "
                  f"bias {scores[MODEL]['relative_bias']:+.1%}; rank r {scores[MODEL]['mean_rank_correlation']}; "
                  f"top-4 {scores[MODEL]['top4_overlap']}; 80% coverage {section['interval']['coverage']} "
                  f"(width {section['interval']['mean_width']}); gates {'PASS' if checks['passed'] else 'FAIL'}")


if __name__ == "__main__":
    main()
