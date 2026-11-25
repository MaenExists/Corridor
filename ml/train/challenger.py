"""Synthetic-only model experiment. The published evaluation is never modified."""
import argparse
import math

from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from ml.data.synthetic import COVERAGE, END, START, generate, normalize
from ml.evaluate.metrics import count_metrics
from ml.evaluate.run import evaluate, panel, split_dates, training_rows
from ml.features.build import Dataset, load_dataset
from ml.train.models import METHODS

STRESS_SEEDS = (2027, 2411)


def design(row):
    recent = row["lags"]
    seasonal = row["baselines"]["seasonal_naive"]
    return [
        math.log1p(recent[0]), math.log1p(recent[2]), math.log1p(recent[3] - recent[2]),
        math.log1p(recent[4] - recent[3]), math.log1p(seasonal if seasonal is not None else row["baselines"]["last_56_days"]),
        *row["x"][10:12], *row["x"][13:27],
    ]


def benchmark(ds, horizon, *, freeze_final=False):
    if ds.synthetic is not True:
        raise ValueError("Challenger is synthetic only")
    selection, _, final = split_dates(ds)
    origins = final if freeze_final else selection
    freeze = origins[0] if freeze_final else None
    rows = panel(ds, "area", horizon, origins[-1])
    scored = evaluate(rows, origins, freeze=freeze)
    challenger = None
    with threadpool_limits(limits=2):
        for cutoff in origins:
            sample = [r for r in scored if r["origin"] == cutoff]
            if not sample:
                continue
            if freeze is None or challenger is None:
                train = training_rows(rows, freeze or cutoff)
                if len(train) < 60:
                    continue
                # Fixed before either separate stress archive is evaluated.
                challenger = make_pipeline(StandardScaler(), PoissonRegressor(alpha=.2, max_iter=400))
                challenger.fit([design(r) for r in train], [r["actual"] for r in train])
            for r, estimate in zip(sample, challenger.predict([design(r) for r in sample])):
                r["pred"]["poisson_glm"] = float(estimate)
    methods = (*METHODS, "poisson_glm")
    common = [r for r in scored if all(r["pred"].get(m) is not None for m in methods)]
    return {m: count_metrics(common, m) for m in methods}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stress", action="store_true", help="Chronological tests on two separate synthetic realizations")
    args = parser.parse_args()
    for seed in STRESS_SEEDS if args.stress else (None,):
        if seed is None:
            ds = load_dataset("synthetic")
        else:
            raw, _ = generate(seed)
            ds = Dataset({"synthetic": True, "cases": normalize(raw), "coverage": COVERAGE,
                          "as_of": END.isoformat(), "start": START.isoformat()}, True)
        for h in (7, 28):
            scores = benchmark(ds, h, freeze_final=args.stress)
            stage = "development only" if seed is None else f"stress seed {seed}, frozen test"
            print(f"SYNTHETIC {h}d {stage} (common windows): "
                  + " | ".join(f"{m} MAE {v['mae']} (n={v['n']})" for m, v in scores.items()), flush=True)
