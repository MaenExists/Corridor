"""Export an offline, synthetic-only district experiment, with no outcomes in the model input."""
import json
import math
from datetime import timedelta

from ml.data.synthetic import WEB, dump
from ml.evaluate.run import panel, split_dates, training_rows
from ml.features.build import d, load_dataset
from ml.train.models import fit, predict


def portable(model):
    if model.loss != "poisson" or model.n_trees_per_iteration_ != 1:
        raise ValueError("Only scalar Poisson boosting is supported")
    trees = []
    for (tree,) in model._predictors:
        if any(tree.nodes["is_categorical"]):
            raise ValueError("Categorical split is unsupported")
        trees.append([[float(n["value"])] if n["is_leaf"] else [
            int(n["feature_idx"]), float(n["num_threshold"]), int(n["left"]),
            int(n["right"]), bool(n["missing_go_to_left"])] for n in tree.nodes])
    return {"bias": float(model._baseline_prediction.item()), "trees": trees}


def portable_predict(model, x):
    score = model["bias"]
    for nodes in model["trees"]:
        node = nodes[0]
        while len(node) != 1:
            i, limit, left, right, missing_left = node
            value = x[i]
            node = nodes[left if (missing_left if value is None else value <= limit) else right]
        score += node[0]
    return math.exp(score)


def build(ds, report, replay):
    if ds.synthetic is not True or report.get("synthetic") is not True or replay.get("synthetic") is not True:
        raise ValueError("Only the synthetic track can enter the challenge")
    if (report["run_id"] != replay["run_id"] or d(report["data_cutoff"]) != ds.as_of
            or report["splits"]["final"] != [v.isoformat() for v in split_dates(ds)[2]]):
        raise ValueError("Challenge assets must use the same evaluation")
    origins = [d(value) for value in report["splits"]["final"]]
    out = []
    for horizon in (7, 28):
        latest_mature_origin = origins[0] - timedelta(days=horizon + ds.cfg["outcome_maturity_days"])
        rows = panel(ds, "area", horizon, latest_mature_origin)
        train = training_rows(rows, origins[0])
        model = fit(train)
        if model is None:
            raise ValueError("Not enough synthetic training history")
        export = portable(model)
        task = next(t for t in replay["tasks"] if t["scope"] == "area" and t["horizon_days"] == horizon)
        if [w["origin"] for w in task["windows"]] != report["splits"]["final"]:
            raise ValueError("Challenge origins must match the saved replay")
        frames = []
        for origin, reference in zip(origins, task["windows"]):
            known = {r["location"]: r for r in reference["rows"]}
            districts = {}
            for district in ds.groups("area", origin):
                f = ds.features("area", district, origin, horizon)
                x = [float(v) if math.isfinite(v) else None for v in f["x"]]
                reason = f["abstain_reason"]
                saved = known[district]
                expected = saved["predicted"]["poisson_gbm"]
                if reason != saved["abstain_reason"] or (reason is None) != (expected is not None):
                    raise ValueError("Abstention does not match the frozen evaluation")
                if expected is not None and (
                    not math.isclose(portable_predict(export, x), expected, rel_tol=1e-10)
                    or not math.isclose(predict(model, [f])[0], expected, rel_tol=1e-10)
                    or f["baselines"]["last_56_days"] != saved["predicted"]["last_56_days"]
                ):
                    raise ValueError("Portable model does not match the frozen evaluation")
                districts[district] = {"x": x if not reason else None, "reason": reason,
                    "recent": f["lags"][2], "baseline": f["baselines"]["last_56_days"] if not reason else None}
            frames.append({"cutoff": origin.isoformat(), "start": (origin + timedelta(days=1)).isoformat(),
                           "end": (origin + timedelta(days=horizon)).isoformat(), "districts": districts})
        out.append({"horizon": horizon, "model": export, "training_windows": len(train), "frames": frames})
    return {"schema": "narcotrace-challenge-v1", "synthetic": True, "run_id": report["run_id"],
            "frozen_at": origins[0].isoformat(), "tasks": out}


def run():
    report = json.loads((WEB / "eval_report.json").read_text())
    replay = json.loads((WEB / "replay.json").read_text())
    artifact = build(load_dataset("synthetic"), report, replay)
    temp = WEB / "challenge.pending"
    dump(temp, artifact)
    temp.replace(WEB / "challenge.json")
    print("SYNTHETIC: exported offline model and cutoff inputs; checked all predictions against the frozen evaluation.")


if __name__ == "__main__":
    run()
