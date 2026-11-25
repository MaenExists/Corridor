"""Train private boosted-tree replays of documented district detection counts."""

from itertools import product
import json
import math
from pathlib import Path
from tempfile import TemporaryDirectory

import joblib
import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from threadpoolctl import threadpool_limits

from ml.data.model_bundle import HOLDOUT_YEAR, PARTIAL_YEAR, TARGETS, TRAIN_YEARS, digest
from ml.data.real_input import DISTRICTS
from ml.data.training_prep import PREPARED
from ml.evaluate.metrics import calibration, calibrated_interval, count_metrics, interval_coverage
from ml.train.annual_counts import (
    INTERVAL_LEVEL, MIN_IMPROVEMENT, TRAINING_BUNDLE, target_panel, training_panel, verified_rows, write_json,
)

OUTPUT = PREPARED / "count_boosting"
ROUND_CHECKPOINTS = (8, 16, 32, 64, 128, 256, 512)
DEV_YEARS = TRAIN_YEARS[2:]
PARTIAL_COLUMNS = (*TARGETS, "period_start", "period_end")
FEATURE_NAMES = ("log_previous_count", "log_district_mean", "district_log_growth",
                 "state_log_growth", "prior_district_share")
BASELINES = ("previous_year", "district_history_mean")
SEED = 1729


def examples(history, year):
    """Build all inputs using only earlier complete like-for-like observations."""
    years = sorted(prior for prior in history if prior < year)
    if not years or years != list(range(years[0], year)):
        raise ValueError("A replay needs consecutive, earlier comparable reporting windows.")
    last = history[year - 1]
    earlier = history[year - 2] if len(years) > 1 else None
    last_total = sum(last.values())
    state_growth = math.log1p(last_total) - math.log1p(sum(earlier.values())) if earlier is not None else math.nan
    rows = []
    for district in DISTRICTS:
        previous = last[district]
        district_mean = sum(history[prior][district] for prior in years) / len(years)
        change = math.log1p(previous) - math.log1p(earlier[district]) if earlier is not None else math.nan
        rows.append({
            "key": district, "year": year, "anchor": max(1, previous),
            "x": (math.log1p(previous), math.log1p(district_mean), change, state_growth,
                  previous / last_total if last_total else 0),
            "pred": {"previous_year": previous, "district_history_mean": district_mean},
        })
    return rows


def supervised(history, before):
    years = sorted(year for year in history if year < before)
    return [dict(row, actual=history[year][row["key"]])
            for year in years[1:] for row in examples(history, year)]


def matrix(rows):
    return np.asarray([row["x"] for row in rows], dtype=float)


def fit(rows, settings, rounds):
    # For a conditional mean of anchor * prediction, Poisson loss on the
    # scaled target with anchor weights yields the count-scale objective.
    anchors = np.asarray([row["anchor"] for row in rows], dtype=float)
    observed = np.asarray([row["actual"] for row in rows], dtype=float)
    if not observed.any():
        raise ValueError("Boosting requires at least one positive detection count in each fit window.")
    model = HistGradientBoostingRegressor(
        loss="poisson", max_iter=rounds, l2_regularization=4, early_stopping=False,
        random_state=SEED, **settings,
    )
    return model.fit(matrix(rows), observed / anchors, sample_weight=anchors)


def attach(rows, estimates):
    return [dict(row, pred=dict(row["pred"], boosted=float(estimate * row["anchor"])))
            for row, estimate in zip(rows, estimates, strict=True)]


def observed(rows, outcomes):
    return [dict(row, actual=outcomes[row["key"]]) for row in rows]


def scores(rows):
    return {method: dict(
        count_metrics(rows, method),
        mean_bias=round(float(np.mean([row["pred"][method] - row["actual"] for row in rows])), 4),
    ) for method in ("boosted", *BASELINES)}


def search(history):
    trials = []
    for depth, learning_rate, leaf_minimum in product((1, 2), (0.025, 0.06), (3, 6)):
        settings = dict(max_depth=depth, learning_rate=learning_rate, min_samples_leaf=leaf_minimum)
        rounds = {checkpoint: [] for checkpoint in ROUND_CHECKPOINTS}
        for year in DEV_YEARS:
            training = supervised(history, year)
            validation = examples(history, year)
            model = fit(training, settings, ROUND_CHECKPOINTS[-1])
            for step, prediction in enumerate(model.staged_predict(matrix(validation)), start=1):
                if step in rounds:
                    rounds[step].extend(observed(attach(validation, prediction), history[year]))
        for checkpoint, rows in rounds.items():
            trials.append(({"settings": settings, "rounds": checkpoint, "scores": scores(rows)}, rows))
    best_mae = min(trial["scores"]["boosted"]["mae"] for trial, _ in trials)
    # Favour fewer trees when validation errors are effectively tied.
    equivalent = [entry for entry in trials if entry[0]["scores"]["boosted"]["mae"] <= best_mae * 1.01]
    winner, out_of_fold = min(equivalent, key=lambda entry: (entry[0]["rounds"], entry[0]["scores"]["boosted"]["mae"]))
    return winner, out_of_fold, [trial for trial, _ in trials]


def read_partial(bundle, manifest, name, years):
    rows = verified_rows(bundle, manifest, name, PARTIAL_COLUMNS)
    panel = target_panel(rows, {(district, year) for district in DISTRICTS for year in years})
    for row in rows:
        year = row["year"]
        if (row["period_start"], row["period_end"]) != (f"{year}-01-01", f"{year}-08-31"):
            raise ValueError("The partial-window series must use January–August in every year.")
    return {year: {district: panel[district, year] for district in DISTRICTS} for year in years}


def interval_fit(rows):
    return dict(calibration(rows, "boosted", INTERVAL_LEVEL), nominal=INTERVAL_LEVEL,
                status="exploratory_rolling_residuals")


def partial_calibration(history, settings, rounds):
    residual_rows = []
    for year in (*DEV_YEARS, HOLDOUT_YEAR):
        model = fit(supervised(history, year), settings, rounds)
        validation = examples(history, year)
        residual_rows.extend(observed(attach(validation, model.predict(matrix(validation))), history[year]))
    return interval_fit(residual_rows)


def score_replay(predictions, outcomes, bands):
    rows = observed(predictions, outcomes)
    for row in rows:
        row["interval"] = calibrated_interval(row["pred"]["boosted"], INTERVAL_LEVEL, bands["pad"])
    metrics = scores(rows)
    baseline = min(BASELINES, key=lambda method: metrics[method]["mae"])
    baseline_mae = metrics[baseline]["mae"]
    return {
        "scores": metrics,
        "strongest_baseline": baseline,
        "relative_mae_gain": 1 - metrics["boosted"]["mae"] / baseline_mae if baseline_mae > 0 else None,
        "interval_evaluation": dict(interval_coverage(rows), nominal=INTERVAL_LEVEL),
        "district_errors": [
            {"district": row["key"], "absolute_error": {
                method: abs(estimate - row["actual"]) for method, estimate in row["pred"].items()
            }} for row in rows
        ],
    }


def save_estimator(path, estimator):
    with TemporaryDirectory(dir=path.parent) as scratch:
        temporary = Path(scratch) / path.name
        joblib.dump(estimator, temporary)
        temporary.chmod(0o600)
        temporary.replace(path)


def run(bundle=TRAINING_BUNDLE, output=OUTPUT):
    manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
    if (manifest["schema_version"] != 1 or manifest["track"] != "private_real_retrospective_annual"
            or manifest["training_years"] != list(TRAIN_YEARS) or manifest["holdout_year"] != HOLDOUT_YEAR):
        raise ValueError("Expected the verified official retrospective bundle.")
    annual_history = {year: {} for year in TRAIN_YEARS}
    for row in training_panel(bundle, manifest):
        annual_history[row.year][row.district] = row.detections
    partial_history = read_partial(bundle, manifest, "jan_aug_reference.csv", (*TRAIN_YEARS, HOLDOUT_YEAR))
    annual_rows = supervised(annual_history, HOLDOUT_YEAR)
    partial_rows = supervised(partial_history, PARTIAL_YEAR)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    with threadpool_limits(limits=2):
        selected, dev_predictions, learning_curve = search(annual_history)
        settings, rounds = selected["settings"], selected["rounds"]
        annual = fit(annual_rows, settings, rounds)
        partial = fit(partial_rows, settings, rounds)
        annual_bands = interval_fit(dev_predictions)
        partial_bands = partial_calibration(partial_history, settings, rounds)
        annual_path, partial_path = (output / name for name in ("annual.joblib", "jan_aug.joblib"))
        save_estimator(annual_path, annual)
        save_estimator(partial_path, partial)
        trained = {
            "model": "Histogram gradient boosting with weighted Poisson loss",
            "track": manifest["track"], "target": manifest["target"],
            "scikit_learn_version": sklearn.__version__, "seed": SEED,
            "features": list(FEATURE_NAMES), "selected": selected,
            "development_validation_years": list(DEV_YEARS),
            "annual": {"history_years": list(TRAIN_YEARS), "scored_year": HOLDOUT_YEAR,
                       "window": "calendar_year", "rows": len(annual_rows),
                       "rounds": annual.n_iter_, "interval": annual_bands,
                       "sha256": digest(annual_path)},
            "january_august": {"history_years": [*TRAIN_YEARS, HOLDOUT_YEAR], "scored_year": PARTIAL_YEAR,
                               "window": "january_august", "rows": len(partial_rows),
                               "rounds": partial.n_iter_, "interval": partial_bands,
                               "sha256": digest(partial_path)},
            "training_inputs": {name: manifest["files"][name]["sha256"] for name in
                                ("train_features.csv", "train_targets.csv", "jan_aug_reference.csv")},
            "code_sha256": digest(Path(__file__)),
        }
        write_json(output / "fit.json", trained)
        # Exercise the saved estimators before opening the scoring outcomes.
        annual_examples = examples(annual_history, HOLDOUT_YEAR)
        partial_examples = examples(partial_history, PARTIAL_YEAR)
        annual_pred = attach(annual_examples, joblib.load(annual_path).predict(matrix(annual_examples)))
        partial_pred = attach(partial_examples, joblib.load(partial_path).predict(matrix(partial_examples)))

    annual_file = f"holdout_{HOLDOUT_YEAR}_targets.csv"
    partial_file = f"jan_aug_{PARTIAL_YEAR}_check.csv"
    annual_targets = target_panel(verified_rows(bundle, manifest, annual_file, TARGETS),
                                  {(district, HOLDOUT_YEAR) for district in DISTRICTS})
    partial_targets = read_partial(bundle, manifest, partial_file, (PARTIAL_YEAR,))
    annual_report = score_replay(annual_pred, {
        district: annual_targets[district, HOLDOUT_YEAR] for district in DISTRICTS
    }, annual_bands)
    partial_report = score_replay(partial_pred, partial_targets[PARTIAL_YEAR], partial_bands)
    dev_baseline = min(selected["scores"][method]["mae"] for method in BASELINES)
    relative_gains = (
        1 - selected["scores"]["boosted"]["mae"] / dev_baseline if dev_baseline > 0 else None,
        annual_report["relative_mae_gain"], partial_report["relative_mae_gain"],
    )
    result = {
        "fit_metadata_sha256": digest(output / "fit.json"),
        "learning_curve": learning_curve, "round_checkpoints": list(ROUND_CHECKPOINTS),
        "development_rounds_executed": (len(learning_curve) // len(ROUND_CHECKPOINTS)) *
                                        len(DEV_YEARS) * ROUND_CHECKPOINTS[-1],
        "annual_2024_replay": dict(annual_report, previously_scored_window=True),
        "january_august_2025_replay": partial_report,
        "evaluation_inputs": {name: manifest["files"][name]["sha256"] for name in (annual_file, partial_file)},
        "minimum_relative_mae_gain": MIN_IMPROVEMENT,
        "retrospective_baseline_gate_passed": all(gain is not None and gain >= MIN_IMPROVEMENT
                                                  for gain in relative_gains),
        "verified_as_of_training_origin": False, "future_predictions_issued": 0,
    }
    write_json(output / "evaluation.json", result)
    print(f"Evaluated {len(learning_curve)} settings and round combinations. Selected {rounds} boosting rounds.")
    for label, report in ((f"{HOLDOUT_YEAR} annual", annual_report), (f"{PARTIAL_YEAR} January–August", partial_report)):
        metrics = report["scores"]
        print(f"{label} MAE: {metrics['boosted']['mae']:.2f} boosted, "
              f"{metrics[report['strongest_baseline']]['mae']:.2f} best simple baseline.")
    return trained, result


if __name__ == "__main__":
    run()
