"""Fit one private detection-yield model for a single comparable observation process."""

from collections import Counter
from dataclasses import dataclass
from datetime import date
import math

import numpy as np
from scipy.optimize import minimize
from scipy.stats import nbinom, poisson

from ml.data.training_prep import PREPARED, read_rows


def effort_signature(row):
    return tuple(row[key] for key in ("agency", "operation", "protocol", "effort_unit"))


@dataclass(frozen=True)
class YieldModel:
    signature: tuple[str, ...]
    fitted_on: date
    pooled_rate: float
    district_rates: dict[str, float]
    dispersion: float

    def estimate(self, district, planned_effort):
        """Return conditional count and 80% interval for independently supplied effort."""
        rate = self.district_rates.get(district)
        if rate is None or not math.isfinite(planned_effort) or planned_effort <= 0:
            return None
        mean = rate * planned_effort
        if self.dispersion:
            shape = 1 / self.dispersion
            distribution = nbinom(shape, shape / (shape + mean))
        else:
            distribution = poisson(mean)
        return float(mean), int(distribution.ppf(0.1)), int(distribution.ppf(0.9))


def fit(rows, cutoff, penalty=1.0):
    eligible = [
        row for row in rows
        if date.fromisoformat(row["period_start"]) <= date.fromisoformat(row["period_end"])
        <= date.fromisoformat(row["available_on"]) <= cutoff
    ]
    if not eligible:
        return None
    signatures = {effort_signature(row) for row in eligible}
    if len(signatures) != 1:
        raise ValueError("Fit separately by agency, operation, protocol and effort unit.")

    districts = sorted({row["district"] for row in eligible})
    columns = {district: index for index, district in enumerate(districts, start=1)}
    design = np.zeros((len(eligible), len(columns) + 1))
    design[:, 0] = 1
    for row_index, row in enumerate(eligible):
        design[row_index, columns[row["district"]]] = 1
    counts = np.array([int(row["recorded_detections"]) for row in eligible])
    exposure = np.array([int(row["enforcement_effort"]) for row in eligible])
    if np.any(counts < 0) or np.any(exposure <= 0):
        raise ValueError("Counts must be nonnegative and exposure must be positive.")
    if not counts.sum():
        return None
    pooled_rate = counts.sum() / exposure.sum()
    starting = np.zeros(design.shape[1])
    starting[0] = math.log(pooled_rate)
    offset = np.log(exposure)

    def objective(beta, dispersion):
        log_mean = np.clip(offset + design @ beta, -30, 30)
        mean = np.exp(log_mean)
        if dispersion:
            k = 1 / dispersion
            loss = ((counts + k) * np.log1p(dispersion * mean) - counts * log_mean).sum()
        else:
            loss = (mean - counts * log_mean).sum()
        return loss + penalty * np.square(beta[1:]).sum() / 2

    def optimize(initial, dispersion):
        solution = minimize(objective, initial, args=(dispersion,), method="L-BFGS-B",
                            bounds=[(-15, 15)] * len(initial))
        if not solution.success:
            raise ValueError("The exposure model did not converge.")
        return solution.x

    coefficients = optimize(starting, 0)
    means = np.exp(offset + design @ coefficients)
    dispersion = (
        max(0.0, float(np.sum((counts - means) ** 2 - means) / np.sum(means ** 2)))
        if len(eligible) > len(columns) + 1 else 0.0
    )
    if dispersion:
        coefficients = optimize(coefficients, dispersion)
    rates = {district: math.exp(coefficients[0] + coefficients[index]) for district, index in columns.items()}
    return YieldModel(next(iter(signatures)), cutoff, float(pooled_rate), rates, dispersion)


def main():
    rows = read_rows(PREPARED / "matched_effort_yield.csv")
    groups = Counter(effort_signature(row) for row in rows)
    if not groups:
        print("Effort model withheld. No verified matches between official cases and enforcement effort.")
        return
    print(f"{len(groups)} comparable series. Fit and evaluation require an explicit chronological split.")


if __name__ == "__main__":
    main()
