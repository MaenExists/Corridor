"""Fit and score the private retrospective Kerala Excise annual model."""

from dataclasses import asdict, dataclass
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

from ml.data.model_bundle import FEATURES, HOLDOUT_YEAR, TARGETS, TRAIN_YEARS, digest
from ml.data.real_input import DISTRICTS, private_write
from ml.data.training_prep import PREPARED, read_rows
from ml.evaluate.metrics import calibration, calibrated_interval, count_metrics, interval_coverage

TRAINING_BUNDLE = PREPARED / "training_bundle"
FIT_DIR = PREPARED / "annual_fit"
EXPOSURE_SCALE = 100_000
PENALTIES = (0.1, 1.0, 10.0)
MAX_ITERATIONS = 500
FTOL = 1e-11
GTOL = 1e-7
INTERVAL_LEVEL = 0.8
MIN_IMPROVEMENT = 0.05
METHODS = ("poisson", "previous_year", "pooled_population_rate")


@dataclass(frozen=True)
class DistrictYear:
    district: str
    year: int
    population: int
    detections: int | None = None


@dataclass(frozen=True)
class AnnualCountModel:
    last_training_year: int
    log_rate_per_lakh: float
    district_effects: dict[str, float]
    shared_year_slope: float
    iterations: int

    def predict(self, row):
        offset = math.log(row.population / EXPOSURE_SCALE)
        year_effect = self.shared_year_slope * (row.year - self.last_training_year)
        return math.exp(offset + self.log_rate_per_lakh + self.district_effects[row.district] + year_effect)


def fit(rows, penalty, trend, decay):
    districts = sorted({row.district for row in rows})
    last_year = max(row.year for row in rows)
    district_columns = {district: i for i, district in enumerate(districts, start=1)}
    design = np.zeros((len(rows), 1 + len(districts) + int(trend)))
    design[:, 0] = 1
    ages = np.array([last_year - row.year for row in rows])
    for index, row in enumerate(rows):
        design[index, district_columns[row.district]] = 1
    if trend:
        design[:, -1] = -ages
    counts = np.array([row.detections for row in rows], dtype=float)
    if not counts.any():
        raise ValueError("The annual model needs a positive detection count in each fit window.")
    exposure = np.array([row.population / EXPOSURE_SCALE for row in rows])
    weights = decay ** ages
    weights /= weights.sum()
    offset = np.log(exposure)
    ridge = np.full(design.shape[1], penalty)
    ridge[0] = 0
    initial = np.zeros(design.shape[1])
    initial[0] = math.log(float(weights @ counts / (weights @ exposure)))

    def loss_and_gradient(beta):
        log_means = offset + design @ beta
        means = np.exp(log_means)
        loss = weights @ (means - counts * log_means) + ridge @ np.square(beta) / 2
        gradient = design.T @ (weights * (means - counts)) + ridge * beta
        return float(loss), gradient

    result = minimize(
        loss_and_gradient, initial, jac=True, method="L-BFGS-B",
        options={"maxiter": MAX_ITERATIONS, "ftol": FTOL, "gtol": GTOL},
    )
    if not result.success or not np.isfinite(result.x).all():
        raise ValueError("The annual Poisson fit did not converge.")
    return AnnualCountModel(
        last_year, float(result.x[0]),
        {district: float(result.x[index]) for district, index in district_columns.items()},
        float(result.x[-1]) if trend else 0.0,
        int(result.nit),
    )


def verified_rows(bundle, manifest, name, columns):
    path = bundle / name
    descriptor = manifest["files"][name]
    if digest(path) != descriptor["sha256"]:
        raise ValueError(f"The checksum for {name} differs from the prepared bundle.")
    rows = read_rows(path)
    if not rows or len(rows) != descriptor["rows"] or any(tuple(row) != columns for row in rows):
        raise ValueError(f"The row count or column schema for {name} is invalid.")
    return rows


def key(row):
    return row["district"], int(row["year"])


def feature_panel(rows, years):
    features = {}
    for row in rows:
        district, year = key(row)
        population = int(row["population"])
        if (population <= 0 or (district, year) in features
                or not math.isclose(float(row["log_population_offset"]), math.log(population), abs_tol=1e-9)):
            raise ValueError("The feature panel contains an invalid exposure or duplicate district-year.")
        features[(district, year)] = DistrictYear(district, year, population)
    if features.keys() != {(district, year) for district in DISTRICTS for year in years}:
        raise ValueError("The feature panel does not match the frozen years and district coverage.")
    return features


def target_panel(rows, expected_keys):
    targets = {}
    for row in rows:
        identifier = key(row)
        count = int(row[TARGETS[-1]])
        if identifier in targets or count < 0:
            raise ValueError("The target panel has a duplicate or negative count.")
        targets[identifier] = count
    if targets.keys() != expected_keys:
        raise ValueError("The target panel does not match the feature panel's district-years.")
    return targets


def training_panel(bundle, manifest):
    features = feature_panel(verified_rows(bundle, manifest, "train_features.csv", FEATURES), TRAIN_YEARS)
    targets = target_panel(verified_rows(bundle, manifest, "train_targets.csv", TARGETS), features.keys())
    return [DistrictYear(*identifier, row.population, targets[identifier])
            for identifier, row in sorted(features.items())]


def estimates(model, past, future):
    latest = max(row.year for row in past)
    if any(row.year != latest + 1 for row in future):
        raise ValueError("The annual model and baselines require a single next-year window.")
    previous = {row.district: row.detections for row in past if row.year == latest}
    pooled = sum(row.detections for row in past) / sum(row.population for row in past)
    return [{
        "key": row.district,
        "pred": {
            "poisson": model.predict(row),
            "previous_year": previous[row.district],
            "pooled_population_rate": pooled * row.population,
        },
    } for row in future]


def score(rows):
    return {method: dict(
        count_metrics(rows, method),
        mean_bias=round(float(np.mean([row["pred"][method] - row["actual"] for row in rows])), 4),
    ) for method in METHODS}


def choose_settings(rows):
    evaluations = []
    for trend in (False, True):
        for decay in (1.0, 0.5):
            for penalty in PENALTIES:
                settings = dict(penalty=penalty, trend=trend, decay=decay)
                fold_rows = []
                for year in TRAIN_YEARS[2:]:
                    past = [row for row in rows if row.year < year]
                    future = [row for row in rows if row.year == year]
                    model = fit(past, **settings)
                    for row, prediction in zip(future, estimates(model, past, future), strict=True):
                        fold_rows.append(dict(prediction, actual=row.detections, validation_year=year))
                evaluations.append((settings, score(fold_rows), fold_rows))
    # Prefer the simpler no-trend, equally weighted specification on an MAE tie.
    best = min(evaluations, key=lambda run: run[1]["poisson"]["mae"])
    return best, [{"settings": settings, "scores": scores} for settings, scores, _ in evaluations]


def relative_improvement(scores, baseline):
    baseline_mae = scores[baseline]["mae"]
    return 1 - scores["poisson"]["mae"] / baseline_mae if baseline_mae > 0 else None


def write_json(path, data):
    temporary = path.with_suffix(".tmp")
    private_write(temporary, json.dumps(data, indent=2, allow_nan=False) + "\n")
    temporary.replace(path)


def run(bundle=TRAINING_BUNDLE, output=FIT_DIR):
    manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
    if (manifest["schema_version"] != 1 or manifest["track"] != "private_real_retrospective_annual"
            or manifest["training_years"] != list(TRAIN_YEARS) or manifest["holdout_year"] != HOLDOUT_YEAR):
        raise ValueError("Expected the private official retrospective annual bundle and frozen split.")
    past = training_panel(bundle, manifest)
    (settings, development, dev_rows), candidates = choose_settings(past)
    model = fit(past, **settings)
    interval_fit = calibration(dev_rows, "poisson", INTERVAL_LEVEL)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    checkpoint = {
        "model": "L2-regularized Poisson regression with a log-population offset",
        "track": manifest["track"],
        "target": manifest["target"],
        "training_years": list(TRAIN_YEARS),
        "training_rows": len(past),
        "exposure_scale": EXPOSURE_SCALE,
        "settings": settings,
        "optimization": {"method": "L-BFGS-B", "iteration_cap": MAX_ITERATIONS,
                         "relative_objective_tolerance": FTOL, "projected_gradient_tolerance": GTOL},
        "parameters": asdict(model),
        "interval": dict(interval_fit, nominal=INTERVAL_LEVEL, status="exploratory_training_year_residuals"),
        "development_scores": development,
        "training_inputs": {name: manifest["files"][name]["sha256"]
                            for name in ("train_features.csv", "train_targets.csv")},
        "implementation_sha256": digest(Path(__file__)),
    }
    frozen = output / "model.json"
    write_json(frozen, checkpoint)

    # Produce predictions from the frozen fit before loading the holdout labels.
    future = feature_panel(verified_rows(bundle, manifest, "holdout_2024_features.csv", FEATURES),
                           (HOLDOUT_YEAR,))
    requested = list(future.values())
    predictions = estimates(model, past, requested)
    outcomes = target_panel(verified_rows(bundle, manifest, "holdout_2024_targets.csv", TARGETS), future.keys())
    for row, prediction in zip(requested, predictions, strict=True):
        prediction["actual"] = outcomes[(row.district, row.year)]
        prediction["interval"] = calibrated_interval(prediction["pred"]["poisson"], INTERVAL_LEVEL,
                                                     interval_fit["pad"])
    heldout = score(predictions)
    baseline_methods = METHODS[1:]
    dev_baseline = min(baseline_methods, key=lambda method: development[method]["mae"])
    holdout_baseline = min(baseline_methods, key=lambda method: heldout[method]["mae"])
    dev_gain = relative_improvement(development, dev_baseline)
    holdout_gain = relative_improvement(heldout, holdout_baseline)
    report = {
        "track": manifest["track"],
        "target": manifest["target"],
        "model_sha256": digest(frozen),
        "holdout_inputs": {name: manifest["files"][name]["sha256"]
                           for name in ("holdout_2024_features.csv", "holdout_2024_targets.csv")},
        "development_years": list(TRAIN_YEARS[2:]),
        "candidates": candidates,
        "holdout_year": HOLDOUT_YEAR,
        "holdout_scores": heldout,
        "holdout_interval": dict(interval_coverage(predictions), nominal=INTERVAL_LEVEL),
        "holdout_district_errors": [{
            "district": row["key"], "error": row["pred"]["poisson"] - row["actual"],
            "inside_interval": row["interval"][0] <= row["actual"] <= row["interval"][1],
        } for row in predictions],
        "baseline_gate": {
            "minimum_relative_improvement": MIN_IMPROVEMENT,
            "development_baseline": dev_baseline, "development_relative_gain": dev_gain,
            "holdout_baseline": holdout_baseline, "holdout_relative_gain": holdout_gain,
            "passed": all(gain is not None and gain >= MIN_IMPROVEMENT for gain in (dev_gain, holdout_gain)),
        },
        "status": "retrospective_experiment",
        "verified_as_of_training_origin": False,
        "future_predictions_issued": 0,
    }
    write_json(output / "evaluation.json", report)
    print(f"Annual count model converged in {model.iterations} iterations on {len(past)} training rows.")
    print(f"Held-out {HOLDOUT_YEAR} MAE: {heldout['poisson']['mae']:.2f} "
          f"versus {heldout[holdout_baseline]['mae']:.2f} for the strongest baseline.")
    return checkpoint, report


if __name__ == "__main__":
    run()
