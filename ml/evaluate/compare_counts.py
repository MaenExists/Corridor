"""Compare frozen district count estimators on common retrospective outcomes."""

import json
import math
from pathlib import Path

import joblib
from threadpoolctl import threadpool_limits

from ml.data.model_bundle import FEATURES, HOLDOUT_YEAR, PARTIAL_YEAR, TARGETS, TRAIN_YEARS, digest
from ml.data.real_input import DISTRICTS
from ml.data.training_prep import PREPARED
from ml.evaluate.metrics import count_metrics, interval_coverage, calibrated_interval
from ml.train import annual_counts as poisson
from ml.train import count_boosting as trees

OUTPUT = PREPARED / "count_comparison"
BLEND_WEIGHT = 0.5
METHODS = ("poisson", "boosted", "blended", "previous_year")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify_training_inputs(checkpoint, manifest):
    for name, expected in checkpoint["training_inputs"].items():
        if expected != manifest["files"][name]["sha256"]:
            raise ValueError("A model checkpoint was fitted to a different training bundle.")


def predict_rows(history, year, poisson_model, populations, tree_path, tree_metadata):
    if digest(tree_path) != tree_metadata["sha256"]:
        raise ValueError("The boosted model artifact does not match its fit metadata.")
    # Load only the expected local artifacts produced by make train-boosting.
    examples = trees.examples(history, year)
    with threadpool_limits(limits=2):
        booster = joblib.load(tree_path)
        rows = trees.attach(examples, booster.predict(trees.matrix(examples)))
    for row in rows:
        district = row["key"]
        row["pred"]["poisson"] = poisson_model.predict(poisson.DistrictYear(district, year, populations[district]))
        row["pred"]["blended"] = ((1 - BLEND_WEIGHT) * row["pred"]["previous_year"]
                                  + BLEND_WEIGHT * row["pred"]["boosted"])
    return rows


def compare(predictions, outcomes, interval_rules):
    rows = trees.observed(predictions, outcomes)
    scores = {}
    total = sum(outcomes.values())
    for method in METHODS:
        errors = [row["pred"][method] - row["actual"] for row in rows]
        scores[method] = dict(
            count_metrics(rows, method),
            rmse=math.sqrt(sum(error**2 for error in errors) / len(errors)),
            mean_bias=sum(errors) / len(errors),
            wape=sum(abs(error) for error in errors) / total if total else None,
        )
    intervals = {}
    for method, rule in interval_rules.items():
        intervals[method] = dict(interval_coverage([
            dict(row, interval=calibrated_interval(row["pred"][method], rule["nominal"], rule["pad"]))
            for row in rows
        ]), nominal=rule["nominal"])
    paired = {"poisson_lower_error": 0, "boosted_lower_error": 0, "ties": 0}
    for row in rows:
        difference = abs(row["pred"]["poisson"] - row["actual"]) - abs(row["pred"]["boosted"] - row["actual"])
        if math.isclose(difference, 0, abs_tol=1e-9):
            paired["ties"] += 1
        elif difference < 0:
            paired["poisson_lower_error"] += 1
        else:
            paired["boosted_lower_error"] += 1
    return {"scores": scores, "absolute_error_head_to_head": paired, "exploratory_intervals": intervals}


def run(bundle=poisson.TRAINING_BUNDLE, poisson_fit=poisson.FIT_DIR, tree_fit=trees.OUTPUT, output=OUTPUT):
    manifest = read_json(bundle / "manifest.json")
    annual_checkpoint = read_json(poisson_fit / "model.json")
    tree_checkpoint = read_json(tree_fit / "fit.json")
    for checkpoint in (annual_checkpoint, tree_checkpoint):
        if checkpoint["track"] != manifest["track"] or manifest["track"] != "private_real_retrospective_annual":
            raise ValueError("Compare models from the private retrospective annual track.")
        verify_training_inputs(checkpoint, manifest)
    full_training = poisson.training_panel(bundle, manifest)
    full_history = {year: {} for year in TRAIN_YEARS}
    for row in full_training:
        full_history[row.year][row.district] = row.detections
    full_features = poisson.feature_panel(
        poisson.verified_rows(bundle, manifest, "holdout_2024_features.csv", FEATURES), (HOLDOUT_YEAR,)
    )
    annual_pop = {district: full_features[district, HOLDOUT_YEAR].population for district in DISTRICTS}
    historical_pop = {(row.district, row.year): row.population for row in full_training}
    historical_pop.update({identifier: row.population for identifier, row in full_features.items()})
    partial_history = trees.read_partial(bundle, manifest, "jan_aug_reference.csv", (*TRAIN_YEARS, HOLDOUT_YEAR))
    partial_training = [
        poisson.DistrictYear(district, year, historical_pop[district, year], count)
        for year, counts in partial_history.items() for district, count in sorted(counts.items())
    ]
    partial_model = poisson.fit(partial_training, **annual_checkpoint["settings"])
    full_model = poisson.AnnualCountModel(**annual_checkpoint["parameters"])

    annual = predict_rows(full_history, HOLDOUT_YEAR, full_model, annual_pop,
                          tree_fit / "annual.joblib", tree_checkpoint["annual"])
    # Use the last documented population estimate as exposure for the 2025 replay.
    partial = predict_rows(partial_history, PARTIAL_YEAR, partial_model, annual_pop,
                           tree_fit / "jan_aug.joblib", tree_checkpoint["january_august"])
    annual_label = f"holdout_{HOLDOUT_YEAR}_targets.csv"
    partial_label = f"jan_aug_{PARTIAL_YEAR}_check.csv"
    annual_targets = poisson.target_panel(
        poisson.verified_rows(bundle, manifest, annual_label, TARGETS),
        {(district, HOLDOUT_YEAR) for district in DISTRICTS},
    )
    partial_targets = trees.read_partial(bundle, manifest, partial_label, (PARTIAL_YEAR,))
    report = {
        "track": manifest["track"],
        "target": "Recorded district Excise detections in each matched reporting window",
        "model_artifacts": {"annual_poisson": digest(poisson_fit / "model.json"),
                            "boosted_fit": digest(tree_fit / "fit.json")},
        "evaluation_inputs": {name: manifest["files"][name]["sha256"] for name in (annual_label, partial_label)},
        "implementation_sha256": digest(Path(__file__)),
        "blend_boosted_weight": BLEND_WEIGHT,
        "annual_2024": compare(
            annual, {district: annual_targets[district, HOLDOUT_YEAR] for district in DISTRICTS},
            {"poisson": annual_checkpoint["interval"], "boosted": tree_checkpoint["annual"]["interval"]},
        ),
        "january_august_2025": compare(
            partial, partial_targets[PARTIAL_YEAR], {"boosted": tree_checkpoint["january_august"]["interval"]},
        ),
        "partial_poisson": {
            "settings": annual_checkpoint["settings"], "training_rows": len(partial_training),
            "iterations": partial_model.iterations, "prediction_population_year": HOLDOUT_YEAR,
        },
        "selection": "Previously examined outcomes. Blend and partial Poisson are retrospective comparisons.",
        "prospective_accuracy_verified": False,
    }
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    poisson.write_json(output / "evaluation.json", report)
    for name in ("annual_2024", "january_august_2025"):
        scores = report[name]["scores"]
        print(name + " MAE | " + " | ".join(f"{method} {scores[method]['mae']:.2f}" for method in METHODS))
    return report


if __name__ == "__main__":
    run()
