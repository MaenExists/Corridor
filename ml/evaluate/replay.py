"""Synthetic replay details. Reconstruct the frozen fold predictions without re-scoring."""
from collections import defaultdict
import json
from ml.data.synthetic import WEB, dump
from ml.evaluate.run import evaluate, panel
from ml.features.build import d, load_dataset
from ml.train.models import METHODS


def run():
    report = json.loads((WEB / "eval_report.json").read_text())
    if report.get("synthetic") is not True:
        raise ValueError("Replay accepts only the synthetic evaluation")
    path = WEB / "replay.json"
    try:
        prior = json.loads(path.read_text())
        if prior.get("synthetic") is True and prior.get("run_id") == report["run_id"]:
            print("SYNTHETIC: held-out replay is up to date.")
            return
    except (OSError, ValueError):
        pass
    ds = load_dataset("synthetic")
    origins = [d(value) for value in report["splits"]["final"]]
    tasks = []
    for task in report["tasks"]:
        scope, horizon = task["scope"], task["horizon_days"]
        sample = panel(ds, scope, horizon, origins[-1])
        predictions = {(r["origin"], r["key"]): r["pred"] for r in
                       evaluate(sample, origins, freeze=origins[0])}
        by_date = defaultdict(list)
        for r in sample:
            origin = r["origin"]
            if origin not in origins:
                continue
            scores = predictions.get((origin, r["key"]), {})
            by_date[origin].append({"location": " → ".join(r["key"]) if isinstance(r["key"], tuple) else r["key"],
                "observed": r["actual"], "predicted": {m: scores.get(m) for m in METHODS},
                "abstain_reason": r["abstain_reason"]})
        tasks.append({"scope": scope, "horizon_days": horizon, "windows": [
            {"origin": o.isoformat(), "rows": by_date[o]} for o in origins]})
    dump(path, {"synthetic": True, "run_id": report["run_id"], "tasks": tasks})
    print("SYNTHETIC: wrote replay counts from the frozen pre-holdout fit; report scores unchanged.")


if __name__ == "__main__":
    run()
