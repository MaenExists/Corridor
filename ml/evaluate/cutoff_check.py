"""Post-cutoff and stress checks for the district-month model.

A. Strict cutoff. Only information public by 30 June 2026 is used: the Excise
   statements through September 2024 and the State Planning Board January-August
   2025 district totals (uploaded January 2026). The issuance rule decides first.
   "Forced" forecasts then show what the model would have said if made to answer.
   Their 80% ranges come from the same method's historical errors at the same
   horizon. They are scored on statewide July-September 2026 (Kerala Assembly
   answer, 13 October 2026) and the October 2026 district panel (Excise homepage).
B. New statewide months. A one-month-ahead replay of the statewide component on
   January 2025 to October 2026, months never used to design the model.
C. Stress tests of the frozen one-month test results.
"""

import csv
from datetime import date
import json
import math

import numpy as np

from ml.data.public_intake import ROOT
from ml.train import district_monthly as model

CUTOFF = date(2026, 6, 30)
STATEWIDE = ROOT / "excise_statewide_monthly.csv"
OCTOBER_PANEL = ROOT / "excise_month.csv"
JAN_AUG = ROOT / "prepared" / "district_jan_aug.csv"
OUTPUT = model.OUTPUT / "cutoff_check.json"
ER_2025_AVAILABLE = date(2026, 1, 31)  # spb.kerala.gov.in upload folder 2026-01


def months_between(first, second):
    return (second.year * 12 + second.month) - (first.year * 12 + first.month)


def empirical_range(log_errors, level=0.8):
    tail = (1 - level) / 2
    return float(np.quantile(log_errors, tail)), float(np.quantile(log_errors, 1 - tail))


def read_statewide():
    with STATEWIDE.open(encoding="utf-8", newline="") as stream:
        return {date.fromisoformat(row["period_start"]): int(row["ndps_cases"]) for row in csv.DictReader(stream)}


def read_october():
    with OCTOBER_PANEL.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    month = {date.fromisoformat(row["period_start"]) for row in rows}
    assert month == {date(2026, 10, 1)}, "Expected the October 2026 homepage panel."
    values = {row["district"]: int(row["count"]) for row in rows}
    return np.array([values[district] for district in model.DISTRICTS], float)


def read_jan_aug_2025():
    with JAN_AUG.open(encoding="utf-8", newline="") as stream:
        values = {row["district"]: int(row["excise_detected_cases"]) for row in csv.DictReader(stream) if row["year"] == "2025"}
    return np.array([values[district] for district in model.DISTRICTS], float)


def frozen_extrapolation(panel, origin, horizon):
    """The frozen model run past its validated horizon: shares x last statewide level x month effects."""
    return model.share_state_mean(panel, origin, horizon)


def block_forecast(panel, block_end, target):
    """Cutoff-best-information variant: the latest eight-month district block sets level and shares."""
    block = panel.counts[block_end - 7: block_end + 1].sum(axis=0)
    effect = model.month_effect(panel, block_end, panel.months[target].month, model.SEASONAL_SHRINK)
    return block / 8 * math.exp(effect)


def historical_log_errors(panel, method, horizon, statewide):
    errors = []
    for origin in range(12, len(panel.months) - horizon):
        target = origin + horizon
        if method == "frozen":
            mean = frozen_extrapolation(panel, origin, horizon)
        elif method == "block":
            if origin < 19:
                continue
            mean = block_forecast(panel, origin, target)
        elif method == "last_month":
            mean = panel.counts[origin]
        else:
            mean = panel.counts[origin - 11: origin + 1].mean(axis=0)
        actual = panel.counts[target]
        if statewide:
            errors.append(math.log(actual.sum() / mean.sum()))
        else:
            errors += [math.log((a + 1) / (m + 1)) for a, m in zip(actual, mean, strict=True)]
    return errors


def rank_correlation(first, second):
    return float(np.corrcoef(model._rank(first), model._rank(second))[0, 1])


def strict_cutoff(panel, statewide, october, jan_aug):
    known = model.releases_panel(CUTOFF)
    decision = model.issue(known, CUTOFF)
    origin = len(known.months) - 1  # September 2024
    targets = [date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1)]
    actual_state = {target: (statewide.get(target) if target in statewide else float(october.sum())) for target in targets}
    effect = lambda month, shrink=model.SEASONAL_SHRINK: model.month_effect(panel, origin, month, shrink)

    # Each method's 80% range is learned from its own historical errors at a horizon of 21 to 25 months.
    horizon_errors = {}
    methods = {}
    for target in targets:
        horizon = months_between(known.months[origin], target)
        frozen = frozen_extrapolation(known, origin, horizon)
        block_level = jan_aug.sum() / 8 * math.exp(effect(target.month))
        methods.setdefault("frozen_model", {})[target] = frozen
        methods.setdefault("latest_block_2025", {})[target] = jan_aug / jan_aug.sum() * block_level
        methods.setdefault("last_known_month", {})[target] = known.counts[origin]
        methods.setdefault("mean_12_months", {})[target] = known.counts[origin - 11: origin + 1].mean(axis=0)
        horizon_errors[target] = horizon

    history_key = {"frozen_model": "frozen", "latest_block_2025": "block", "last_known_month": "last_month",
                   "mean_12_months": "mean_12"}
    statewide_results, district_results = {}, {}
    for name, forecasts in methods.items():
        rows = []
        for target, mean in forecasts.items():
            horizon = horizon_errors[target] if name != "latest_block_2025" else months_between(date(2025, 8, 1), target)
            # Long horizons leave few historical origins; pool horizons within two months.
            pooled = [error for step in range(horizon - 2, horizon + 3) if step > 0
                      for error in historical_log_errors(panel, history_key[name], step, True)]
            low, high = empirical_range(pooled)
            point = float(mean.sum())
            truth = actual_state[target]
            rows.append({"target": target.isoformat(), "horizon_months": horizon, "forecast": round(point),
                         "range_80": [round(point * math.exp(low)), round(point * math.exp(high))],
                         "actual": int(truth), "error_pct": round(100 * (point - truth) / truth, 1),
                         "inside_range": point * math.exp(low) <= truth <= point * math.exp(high),
                         "historical_origins": len(pooled)})
        statewide_results[name] = rows
        mean = forecasts[date(2026, 10, 1)]
        horizon = horizon_errors[date(2026, 10, 1)] if name != "latest_block_2025" else 14
        pooled = [error for step in range(horizon - 2, horizon + 3)
                  for error in historical_log_errors(panel, history_key[name], step, False)]
        low, high = empirical_range(pooled)
        lower, upper = (mean + 1) * math.exp(low) - 1, (mean + 1) * math.exp(high) - 1
        inside = (october >= lower) & (october <= upper)
        top_forecast = set(np.argsort(-mean, kind="stable")[:4])
        top_actual = set(np.argsort(-october, kind="stable")[:4])
        district_results[name] = {
            "mae": round(float(np.abs(mean - october).mean()), 2),
            "within_20pct": int((np.abs(mean - october) <= 0.2 * october).sum()),
            "inside_80_range": int(inside.sum()),
            "rank_correlation": round(rank_correlation(mean, october), 3),
            "top4_overlap": len(top_forecast & top_actual),
            "share_mae_pct_points": round(float(np.abs(mean / mean.sum() - october / october.sum()).mean() * 100), 2),
            "districts": {district: {"forecast": round(float(value), 1), "actual": int(truth),
                                     "range_80": [max(0, round(float(lo))), round(float(hi))]}
                          for district, value, truth, lo, hi in zip(model.DISTRICTS, mean, october, lower, upper, strict=True)},
        }
    return {"decision": {key: decision[key] for key in ("status", "latest_complete_month", "target_month", "months_behind")
                         if key in decision},
            "statewide": statewide_results, "october_2026_districts": district_results}


def statewide_replay(panel, statewide, october):
    """One-month-ahead statewide replay on months never used in model design."""
    months = list(panel.months) + sorted(statewide) + [date(2026, 10, 1)]
    levels = list(panel.state) + [statewide[month] for month in sorted(statewide)] + [float(october.sum())]
    state_panel = model.Panel(months, np.array(levels, float)[:, None])
    rows = []
    first = months.index(date(2025, 2, 1))
    # Statewide one-step errors from 2017-2024 calibrate the 80% range.
    history = [math.log(state_panel.state[t] / (state_panel.state[t - 1] * math.exp(
        model.month_effect(state_panel, t - 1, months[t].month, model.SEASONAL_SHRINK))))
               for t in range(13, len(panel.months)) if model.add_months(months[t - 1], 1) == months[t]]
    low, high = empirical_range(history[-24:])
    for target in range(first, len(months)):
        if model.add_months(months[target - 1], 1) != months[target]:
            continue
        origin = target - 1
        model_mean = state_panel.state[origin] * math.exp(
            model.month_effect(state_panel, origin, months[target].month, model.SEASONAL_SHRINK))
        recent = [state_panel.state[step] for step in range(origin - 2, origin + 1)]
        rows.append({"target": months[target].isoformat(), "actual": int(state_panel.state[target]),
                     "model": round(model_mean), "last_month": int(state_panel.state[origin]),
                     "mean_3_months": round(float(np.mean(recent))),
                     "range_80": [round(model_mean * math.exp(low)), round(model_mean * math.exp(high))],
                     "after_cutoff": months[target] > CUTOFF})
    def mae(key, subset):
        return round(float(np.mean([abs(row[key] - row["actual"]) for row in subset])), 1)
    summary = {}
    for label, subset in (("all", rows), ("after_cutoff", [row for row in rows if row["after_cutoff"]])):
        summary[label] = {"months": len(subset), **{f"mae_{key}": mae(key, subset)
                                                     for key in ("model", "last_month", "mean_3_months")},
                          "inside_80_range": sum(row["range_80"][0] <= row["actual"] <= row["range_80"][1] for row in subset)}
    return {"rows": rows, "summary": summary}


def stress(panel):
    rows = model.replay(panel, 1, *model.TEST)
    predicted = np.array([row["pred"][model.MODEL] for row in rows])
    actual = np.array([row["actual"] for row in rows])
    last = np.array([row["pred"]["last_month"] for row in rows])
    moved = actual != last
    direction = (np.sign(predicted - last) == np.sign(actual - last))[moved]
    lows = np.array([row["interval"][0] for row in rows])
    highs = np.array([row["interval"][1] for row in rows])
    bands = {}
    for label, mask in (("under_30", actual < 30), ("30_to_60", (actual >= 30) & (actual < 60)), ("60_plus", actual >= 60)):
        bands[label] = {"n": int(mask.sum()), "coverage": round(float(((actual >= lows) & (actual <= highs))[mask].mean()), 3),
                        "mae": round(float(np.abs(predicted - actual)[mask].mean()), 2)}
    by_year = {}
    for year in (2023, 2024):
        mask = np.array([row["target"].startswith(str(year)) for row in rows])
        by_year[year] = {"model_mae": round(float(np.abs(predicted - actual)[mask].mean()), 2),
                         "last_month_mae": round(float(np.abs(last - actual)[mask].mean()), 2)}
    statewide = {}
    for target in sorted({row["target"] for row in rows}):
        subset = [row for row in rows if row["target"] == target]
        statewide[target] = (sum(row["pred"][model.MODEL] for row in subset), sum(row["actual"] for row in subset))
    state_error = [abs(p - a) / a for p, a in statewide.values()]
    decay = {}
    for horizon in (1, 2, 3, 6, 9, 12):
        replayed = model.replay(panel, horizon, *model.TEST)
        scores = {name: model.metrics(replayed, name)["mae"] for name in (model.MODEL, "last_month", "mean_12_months")}
        decay[horizon] = scores
    worst = sorted(rows, key=lambda row: -abs(row["pred"][model.MODEL] - row["actual"]))[:5]
    return {
        "district_months": len(rows),
        "within_20pct": round(float((np.abs(predicted - actual) <= 0.2 * actual).mean()), 3),
        "within_10_cases": round(float((np.abs(predicted - actual) <= 10).mean()), 3),
        "direction_vs_last_month_correct": round(float(direction.mean()), 3),
        "coverage_by_count_band": bands,
        "by_year": by_year,
        "statewide_monthly_abs_pct_error": round(100 * float(np.mean(state_error)), 1),
        "horizon_decay_mae": decay,
        "largest_misses": [{"target": row["target"], "district": row["district"], "forecast": round(row["pred"][model.MODEL], 1),
                            "actual": row["actual"]} for row in worst],
    }


def main():
    panel = model.load_panel()
    statewide = read_statewide()
    october = read_october()
    jan_aug = read_jan_aug_2025()
    if int(jan_aug.sum()) != sum(statewide[date(2025, month, 1)] for month in range(1, 9)):
        raise ValueError("Assembly statewide series does not reconcile with the Economic Review.")
    report = {"strict_cutoff": strict_cutoff(panel, statewide, october, jan_aug),
              "statewide_replay": statewide_replay(panel, statewide, october),
              "stress": stress(panel)}
    model.write_json(OUTPUT, report)
    decision = report["strict_cutoff"]["decision"]["status"]
    replay = report["statewide_replay"]["summary"]["after_cutoff"]
    print(f"Cutoff decision: {decision}. Post-cutoff statewide one-step MAE: model {replay['mae_model']}, "
          f"last month {replay['mae_last_month']}, three-month mean {replay['mae_mean_3_months']}. Report: {OUTPUT}")


if __name__ == "__main__":
    main()
