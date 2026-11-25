"""Learn conservative adjustments to the previous comparable district count."""

from dataclasses import asdict, dataclass
import math

import numpy as np
from sklearn.linear_model import PoissonRegressor
from threadpoolctl import threadpool_limits

from ml.evaluate.metrics import calibration, count_metrics
from ml.train import count_boosting as history_rows
from ml.train.annual_counts import INTERVAL_LEVEL, MAX_ITERATIONS, MIN_IMPROVEMENT

METHOD = "lagged_poisson"
BASELINE = "previous_year"
PENALTIES = (10.0, 1.0, 0.1, 0.01)
FEATURE_SETS = (
    ("shared_adjustment",),
    ("shared_adjustment", "state_log_growth"),
    ("shared_adjustment", "state_log_growth", "district_growth_vs_state"),
)
DISTRICT_GROWTH = history_rows.FEATURE_NAMES.index("district_log_growth")
STATE_GROWTH = history_rows.FEATURE_NAMES.index("state_log_growth")


def features(rows, names):
    matrix = []
    for row in rows:
        district = row["x"][DISTRICT_GROWTH]
        state = row["x"][STATE_GROWTH]
        available = {
            "shared_adjustment": 1.0,
            "state_log_growth": state if math.isfinite(state) else 0.0,
            "district_growth_vs_state": district - state if math.isfinite(district) and math.isfinite(state) else 0.0,
        }
        matrix.append([available[name] for name in names])
    return np.asarray(matrix, dtype=float)


@dataclass(frozen=True)
class LaggedPoisson:
    feature_names: tuple[str, ...]
    penalty: float
    coefficients: tuple[float, ...]
    iterations: int

    def attach(self, rows):
        multiplier = np.exp(features(rows, self.feature_names) @ self.coefficients)
        return [dict(row, pred=dict(row["pred"], **{METHOD: float(row["anchor"] * ratio)}))
                for row, ratio in zip(rows, multiplier, strict=True)]


def fit(rows, names, penalty):
    offset = np.asarray([row["anchor"] for row in rows], dtype=float)
    counts = np.asarray([row["actual"] for row in rows], dtype=float)
    # A penalized constant shrinks the shared log multiplier toward zero.
    # Exposure-weighted loss on counts divided by exposure is count Poisson loss.
    estimator = PoissonRegressor(alpha=penalty, fit_intercept=False, max_iter=MAX_ITERATIONS, tol=1e-9)
    with threadpool_limits(limits=2):
        estimator.fit(features(rows, names), counts / offset, sample_weight=offset)
    if estimator.n_iter_ >= MAX_ITERATIONS or not np.isfinite(estimator.coef_).all():
        raise ValueError("The lagged Poisson fit did not converge.")
    return LaggedPoisson(names, penalty, tuple(float(value) for value in estimator.coef_), int(estimator.n_iter_))


def train_window(history, target_year):
    years = sorted(year for year in history if year < target_year)
    if len(years) < 3:
        raise ValueError("The lagged Poisson model needs three comparable years before evaluation.")
    folds = [(history_rows.supervised(history, year), history_rows.examples(history, year), history[year])
             for year in years[2:]]
    trials = []
    for names in FEATURE_SETS:
        for penalty in PENALTIES:
            validation = []
            for training, inputs, outcomes in folds:
                model = fit(training, names, penalty)
                validation.extend(history_rows.observed(model.attach(inputs), outcomes))
            trials.append((names, penalty, count_metrics(validation, METHOD), validation))
    names, penalty, _, validation = min(trials, key=lambda trial: trial[2]["mae"])
    rows = history_rows.supervised(history, target_year)
    model = fit(rows, names, penalty)
    return model, {
        "parameters": asdict(model),
        "training_rows": len(rows),
        "history_years": years,
        "validation_years": years[2:],
        "development_scores": {method: count_metrics(validation, method) for method in (METHOD, BASELINE)},
        "trials": [{"features": names, "penalty": penalty, "score": score} for names, penalty, score, _ in trials],
        "interval": dict(calibration(validation, METHOD, INTERVAL_LEVEL), nominal=INTERVAL_LEVEL,
                         status="exploratory_rolling_residuals"),
    }


def adoption_status(checkpoint, scores):
    development = checkpoint["development_scores"]
    dev_mae = development[METHOD]["mae"]
    dev_baseline = development[BASELINE]["mae"]
    replay_mae = scores[METHOD]["mae"]
    replay_baseline = scores[BASELINE]["mae"]
    # Require observed gains in both phases, including the simple benchmark.
    gate = (dev_baseline > 0 and dev_mae <= (1 - MIN_IMPROVEMENT) * dev_baseline
            and replay_baseline > 0 and replay_mae <= (1 - MIN_IMPROVEMENT) * replay_baseline)
    best = min(scores, key=lambda method: scores[method]["mae"])
    return {
        "minimum_improvement_over_previous_year": MIN_IMPROVEMENT,
        "baseline_gate_passed": gate,
        "best_observed_method": best,
        "lagged_model_promoted_for_retrospective_research": gate and best == METHOD,
        "prospective_forecasts_issued": 0,
    }
