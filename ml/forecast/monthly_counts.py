"""Backtest or issue a private next-month forecast of recorded district counts."""

import argparse
from collections import defaultdict
import csv
from datetime import date, timedelta
import math
from pathlib import Path

import numpy as np
from sklearn.linear_model import PoissonRegressor
from threadpoolctl import threadpool_limits

from ml.data.aggregate_intake import as_of, parse_date, read_releases
from ml.data.model_bundle import CUTOFF, digest
from ml.data.real_input import DISTRICTS
from ml.data.training_prep import PREPARED, ROOT
from ml.evaluate.metrics import count_metrics
from ml.train.annual_counts import INTERVAL_LEVEL, MAX_ITERATIONS, MIN_IMPROVEMENT, write_json

AGENCY = "excise"
METRIC = "ndps_registrations"
HISTORY = 12
MIN_FIT_MONTHS = 6
DEVELOPMENT, CALIBRATION, TEST = 6, 12, 12
STAGE_GAP = 1
BASELINES = ("last_reported", "seasonal_naive", "recent_mean")
METHODS = (*BASELINES, "poisson")
MAX_WAPE = 0.25
MAX_RELATIVE_INTERVAL_WIDTH = 2.0


def shift(month, amount):
    year, index = divmod(month.year * 12 + month.month - 1 + amount, 12)
    return date(year, index + 1, 1)


def months(first, last):
    while first <= last:
        yield first
        first = shift(first, 1)


def monthly_releases(releases):
    return [release for release in releases if (
        release.period.agency, release.period.metric, release.period.frequency
    ) == (AGENCY, METRIC, "month")]


def complete_months(releases, cutoff):
    panels = defaultdict(dict)
    for period, release in as_of(releases, cutoff).items():
        if release.status == "complete":
            panels[period.start][period.district] = release.count
    return {month: district_counts for month, district_counts in panels.items()
            if district_counts.keys() == set(DISTRICTS)}


def inputs(releases, target):
    known = complete_months(releases, target - timedelta(days=1))
    recent = max(known, default=None)
    if recent not in (shift(target, -1), shift(target, -2)):
        return []
    trailing = [known.get(shift(recent, -lag)) for lag in range(HISTORY)]
    if any(panel is None for panel in trailing):
        return []
    seasonal = known[shift(target, -12)]
    return [{
        "key": district,
        "pred": {
            "last_reported": trailing[0][district],
            "seasonal_naive": seasonal[district],
            "recent_mean": sum(panel[district] for panel in trailing[:3]) / 3,
        },
    } for district in DISTRICTS]


def fit_inputs(rows):
    last = np.asarray([row["pred"]["last_reported"] for row in rows], dtype=float)
    seasonal = np.asarray([row["pred"]["seasonal_naive"] for row in rows], dtype=float)
    smoothed = np.asarray([row["pred"]["recent_mean"] for row in rows], dtype=float)
    anchor = np.maximum(smoothed, 1)
    design = np.column_stack((np.ones(len(rows)), np.log1p(last) - np.log1p(smoothed),
                              np.log1p(seasonal) - np.log1p(smoothed)))
    return anchor, design


def estimate(available_inputs, prior_outcomes, target):
    eligible = sorted(month for month in available_inputs.keys() & prior_outcomes.keys()
                      if month < target and available_inputs[month])
    if len(eligible) < MIN_FIT_MONTHS:
        return []
    training = [row for month in eligible for row in available_inputs[month]]
    actual = np.asarray([prior_outcomes[month][row["key"]] for month in eligible
                         for row in available_inputs[month]], dtype=float)
    if not actual.any():
        return []
    anchor, design = fit_inputs(training)
    next_anchor, next_design = fit_inputs(available_inputs[target])
    model = PoissonRegressor(alpha=1.0, fit_intercept=False, max_iter=MAX_ITERATIONS, tol=1e-8)
    with threadpool_limits(limits=2):
        model.fit(design, actual / anchor, sample_weight=anchor)
        if model.n_iter_ >= MAX_ITERATIONS:
            return []
        means = next_anchor * model.predict(next_design)
    return [dict(row, pred=dict(row["pred"], poisson=float(mean)))
            for row, mean in zip(available_inputs[target], means, strict=True)]


def rolling_blocks(releases, available_inputs, truth, first, last):
    """Replay each origin in a fixed stage with its own model fit cutoff."""
    blocks = []
    for month in months(first, last):
        if month not in truth or not available_inputs.get(month):
            return []
        prior = complete_months(releases, month - timedelta(days=1))
        predicted = estimate(available_inputs, prior, month)
        if not predicted:
            return []
        blocks.append([dict(row, actual=truth[month][row["key"]]) for row in predicted])
    return blocks


def evaluation_stages(last):
    test = (shift(last, 1 - TEST), last)
    cal_end = shift(test[0], -1 - STAGE_GAP)
    calibration = (shift(cal_end, 1 - CALIBRATION), cal_end)
    dev_end = shift(calibration[0], -1 - STAGE_GAP)
    return (shift(dev_end, 1 - DEVELOPMENT), dev_end), calibration, test


def method_scores(blocks):
    rows = [row for block in blocks for row in block]
    return {method: count_metrics(rows, method) for method in METHODS}


def supports_challenger(scores, baseline):
    reference = scores[baseline]["mae"]
    return reference > 0 and scores["poisson"]["mae"] <= (1 - MIN_IMPROVEMENT) * reference


def radius(blocks, method):
    # Each calibration unit is an entire month, so correlated districts do not
    # artificially inflate the number of calibration observations.
    scores = sorted(max(abs(row["actual"] - row["pred"][method]) / math.sqrt(max(row["pred"][method], 1))
                        for row in block) for block in blocks)
    rank = math.ceil((len(scores) + 1) * INTERVAL_LEVEL)
    return scores[rank - 1]


def band(value, multiplier):
    pad = multiplier * math.sqrt(max(value, 1))
    return max(0, math.floor(value - pad)), math.ceil(value + pad)


def test_quality(blocks, method, multiplier):
    coverage, width, absolute_error, total = 0, 0, 0, 0
    district_hits = 0
    for block in blocks:
        hits = 0
        for row in block:
            estimate, actual = row["pred"][method], row["actual"]
            low, high = band(estimate, multiplier)
            hits += low <= actual <= high
            width += high - low
            absolute_error += abs(actual - estimate)
            total += actual
        coverage += hits == len(block)
        district_hits += hits
    return {
        "wape": absolute_error / total if total else None,
        "relative_interval_width": width / total if total else None,
        "covered_months": coverage,
        "test_months": len(blocks),
        "district_coverage": district_hits / sum(map(len, blocks)),
    }


def run(releases, cutoff):
    target = shift(cutoff.replace(day=1), 1)
    if cutoff != target - timedelta(days=1):
        raise ValueError("The forecast cutoff must be the last day of a month in IST.")
    releases = monthly_releases(releases)
    evidence = complete_months(releases, cutoff)
    archive = complete_months(releases, max((release.available_on for release in releases), default=cutoff))
    report = {
        "track": "private_official_monthly",
        "target": "Monthly recorded Kerala Excise NDPS registrations",
        "as_of_ist": cutoff.isoformat(),
        "target_month": target.isoformat(),
        "archive_complete_months": len(archive),
        "as_of_complete_months": len(evidence),
        "latest_complete_month": max(evidence).isoformat() if evidence else None,
        "required_backtest_months": DEVELOPMENT + CALIBRATION + TEST,
        "required_history_months_per_origin": HISTORY,
        "minimum_complete_archive_months": HISTORY + MIN_FIT_MONTHS + DEVELOPMENT + CALIBRATION + TEST
                                          + 2 * STAGE_GAP,
        "enforcement_effort_adjusted": False,
        "issued_count": 0,
    }
    if not evidence:
        return dict(report, status="withheld_no_complete_month_known_at_cutoff")
    if len(evidence) < report["minimum_complete_archive_months"]:
        return dict(report, status="withheld_insufficient_monthly_history")
    if max(evidence) < shift(target, -2):
        return dict(report, status="withheld_stale_series")
    start = shift(min(evidence), HISTORY)
    available_inputs = {month: inputs(releases, month) for month in months(start, target)}
    if not available_inputs[target]:
        return dict(report, status="withheld_incomplete_recent_history")
    dev_window, cal_window, test_window = evaluation_stages(max(evidence))
    # Only outcomes available before the next stage may inform method selection or calibration.
    dev_cutoff = cal_window[0] - timedelta(days=1)
    cal_cutoff = test_window[0] - timedelta(days=1)
    dev_blocks = rolling_blocks(releases, available_inputs, complete_months(releases, dev_cutoff), *dev_window)
    cal_blocks = rolling_blocks(releases, available_inputs, complete_months(releases, cal_cutoff), *cal_window)
    test_blocks = rolling_blocks(releases, available_inputs, evidence, *test_window)
    report["scorable_backtest_months"] = {
        "development": len(dev_blocks), "calibration": len(cal_blocks), "test": len(test_blocks),
    }
    report["stage_windows"] = {
        name: [day.isoformat() for day in window]
        for name, window in zip(("development", "calibration", "test"),
                                (dev_window, cal_window, test_window), strict=True)
    }
    if not (dev_blocks and cal_blocks and test_blocks):
        return dict(report, status="withheld_insufficient_consecutive_backtest_origins")

    development = method_scores(dev_blocks)
    baseline = min(BASELINES, key=lambda method: development[method]["mae"])
    method = "poisson" if supports_challenger(development, baseline) else baseline
    multiplier = radius(cal_blocks, method)
    test = method_scores(test_blocks)
    quality = test_quality(test_blocks, method, multiplier)
    threshold = math.ceil(TEST * INTERVAL_LEVEL)
    best_test_baseline = min(BASELINES, key=lambda name: test[name]["mae"])
    test_baseline_mae = test[best_test_baseline]["mae"]
    report.update(method=method, development_baseline=baseline, development=development,
                  test_best_baseline=best_test_baseline, test=test, holdout_quality=quality,
                  interval_nominal=INTERVAL_LEVEL, required_covered_test_months=threshold,
                  maximum_wape=MAX_WAPE, maximum_relative_interval_width=MAX_RELATIVE_INTERVAL_WIDTH)
    skill = (supports_challenger(test, best_test_baseline) if method == "poisson"
             else test[method]["mae"] <= 1.05 * test_baseline_mae)
    if (not skill or quality["wape"] is None or quality["wape"] > MAX_WAPE
            or quality["relative_interval_width"] > MAX_RELATIVE_INTERVAL_WIDTH
            or quality["covered_months"] < threshold):
        return dict(report, status="withheld_validation_gates")
    future = (estimate(available_inputs, evidence, target) if method == "poisson" else available_inputs[target])
    if not future:
        return dict(report, status="withheld_refit")
    return dict(report, status="issued_private_next_month", issued_count=len(future), forecasts=[
        {"district": row["key"], "mean": row["pred"][method], "interval": band(row["pred"][method], multiplier)}
        for row in future
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "excise_month.csv")
    parser.add_argument("--as-of", type=parse_date, default=CUTOFF)
    args = parser.parse_args()
    try:
        with args.input.open(encoding="utf-8-sig", newline="") as stream:
            releases = read_releases(stream)
        report = run(releases, args.as_of)
        report["input_sha256"] = digest(args.input)
        report["implementation_sha256"] = digest(Path(__file__))
        output = PREPARED / "monthly_forecast"
        output.mkdir(mode=0o700, parents=True, exist_ok=True)
        write_json(output / f"{args.as_of.isoformat()}.json", report)
    except (OSError, UnicodeError, csv.Error):
        parser.exit(1, "Could not read the aggregate input or save the protected monthly report.\n")
    except ValueError as exc:
        parser.exit(1, f"{exc}\n")
    print(report["status"].replace("_", " ").capitalize() + ". "
          f"Complete months known by cutoff: {report['as_of_complete_months']}. "
          f"Complete in archive: {report['archive_complete_months']}. "
          f"District forecasts issued: {report['issued_count']}.")


if __name__ == "__main__":
    main()
