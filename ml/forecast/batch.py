"""Write versioned, synthetic-only forecasts; never accepts an uploaded model."""
from datetime import datetime, timedelta, timezone
from urllib.request import urlopen
from urllib.error import URLError
import argparse
import json
import joblib
from ml.data.synthetic import WEB, dump
from ml.evaluate.metrics import calibrated_interval
from ml.evaluate.run import model_dir
from ml.features.build import d, load_dataset
from ml.local_api import local_api
from ml.train.models import predict
from shared.schema import Forecast


def forecast_records(ds, bundles, cutoff):
    for (scope, horizon), bundle in bundles.items():
        if bundle["synthetic"] is not True or not ds.synthetic:
            raise ValueError("Public forecast writer accepts only synthetic models and data")
        for key in ds.groups(scope, cutoff):
            f = ds.features(scope, key, cutoff, horizon)
            why = f["abstain_reason"]
            selected = bundle["chosen"]
            if cutoff < d(bundle["trained_as_of"]):
                why = "cutoff precedes inference fit"
            if (cutoff - ds.as_of).days > 91:
                why = "snapshot is more than 13 weeks old"
            estimate = None
            if not why:
                estimate = (predict(bundle["model"], [f])[0] if selected == "poisson_gbm" else f["baselines"].get(selected))
                if estimate is None:
                    why = "selected method lacks supporting history"
            interval = calibrated_interval(estimate, ds.cfg["nominal_interval"], bundle["pad"])
            notes = [f"{f['lags'][2]} visible documented cases in the previous 28 days.",
                     f"{f['history_count']} usable cases observed as of cutoff.",
                     "Seasonal and recent patterns are associations, not causes."]
            if f["break_warning"]:
                notes.append("Possible reporting or definition change: a recent count jumped.")
            if f["cues"]:
                notes.append("Reviewed fixtures are visible in evidence; their predictive effect has not been established.")
            is_area = scope == "area"
            yield Forecast(
                prediction_date=cutoff.isoformat(), information_cutoff=cutoff.isoformat(),
                window_start=(cutoff + timedelta(days=1)).isoformat(), window_end=(cutoff + timedelta(days=horizon)).isoformat(),
                horizon_days=horizon, area=key if is_area else None, connection=None if is_area else key,
                transport_context=None if is_area else "Invented historical connection; no street path",
                target="future documented seizure cases by district" if is_area else "future documented cases on a known directed connection",
                estimate=round(estimate, 3) if estimate is not None else None, interval=list(interval) if interval is not None else None,
                uncertainty_note=f"{ds.cfg['nominal_interval']:.0%} target; measured holdout coverage may fall short"
                if interval is not None else "uncertainty not yet established",
                supporting_patterns=notes, recent_verified_cues=[{"id": c["id"], "verified_at": c["verified_at"],
                    "event_date": c["event_date"], "synthetic": True} for c in f["cues"]],
                source_availability=f"{f['source_total']} dated fictional source references visible in the last 30 days.",
                coverage_gaps=["coverage unknown or thin; this does not mean safe"] if f["coverage"] is None or
                     f["coverage"] < ds.cfg["synthetic_min_coverage"] else ["simulated coverage is not measured enforcement effort"],
                model_version=f"synthetic-{bundle['run_id']}:{selected or 'none'}", synthetic=True,
                abstained=bool(why), abstain_reason=why)


def reviewed_cues(as_of):
    try:
        with urlopen(local_api("/api/cues/verified"), timeout=5) as response:
            obj = json.load(response)
    except (URLError, ValueError) as exc:
        raise SystemExit("Start `make demo` before refreshing with reviewed cues.") from exc
    if obj.get("synthetic") is not True:
        raise ValueError("Unexpected cue track")
    # At a live refresh, enforce exact timestamp in addition to day-level model cutoffs.
    return [r for r in obj.get("items", ()) if r.get("verified_at") and
            datetime.fromisoformat(r["verified_at"].replace("Z", "+00:00")) <= as_of]


def run(include_reviewed=False):
    now = datetime.now(timezone.utc)
    ds = load_dataset("synthetic", reviewed_cues(now) if include_reviewed else ())
    cutoff = max(ds.as_of, now.date()) if include_reviewed else ds.as_of
    report = json.loads((WEB / "eval_report.json").read_text())
    if report.get("synthetic") is not True:
        raise ValueError("Unexpected public report track")
    run_id = report["run_id"]
    bundles = {(s, h): joblib.load(model_dir("synthetic") / f"{s}_{h}_{run_id}.joblib")
               for s in ("area", "corridor") for h in (7, 28)}
    forecasts = list(forecast_records(ds, bundles, cutoff))
    obj = {"synthetic": True, "label": "SYNTHETIC DATA", "generated_at": now.isoformat(),
           "data_cutoff": cutoff.isoformat(), "case_snapshot_through": ds.as_of.isoformat(),
           "coverage_threshold": ds.cfg["synthetic_min_coverage"], "run_id": run_id, "forecasts": forecasts}
    temp = WEB / "forecasts.pending.json"
    dump(temp, obj)
    temp.replace(WEB / "forecasts.json")
    print(f"SYNTHETIC forecasts: {len(forecasts)} records, {sum(r['abstained'] for r in forecasts)} abstained; data cutoff {cutoff}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reviewed-cues", action="store_true")
    run(parser.parse_args().reviewed_cues)
