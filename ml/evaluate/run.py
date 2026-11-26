"""Train on knowable labels, select and calibrate in development, then freeze for final holdout."""
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from html import escape
from pathlib import Path
import argparse
import json
import math
import os
import joblib
from ml.data import real_input
from ml.data.synthetic import WEB, dump
from ml.evaluate.metrics import calibration, calibrated_interval, count_metrics, interval_coverage, top_k
from ml.features.build import campaign_on, d, load_dataset
from ml.train.models import METHODS, fit, predict

LABEL_REAL = "REAL DATA (publicly reported cases): aggregate results only"
LABEL_SIM = "SYNTHETIC DATA — fictional cases for demonstration"
UNIVERSE = "Publicly reported seizures (news + High Court judgments). Selective sample, not all cases. Not operational accuracy."
FEEDBACK = ("More attention can find more cases, which can send still more attention to the same districts. "
            "Compare reporting and enforcement effort, audit errors and abstentions by area, and validate on an independently "
            "observed sample before any operational claim. No intervention outcome or causal effect was measured.")


def model_dir(track):
    return Path("artifacts/synthetic/models") if track == "synthetic" else real_input.PRIVATE / "models"


def report_dir(track):
    return WEB if track == "synthetic" else Path("reports/real")


def split_dates(ds):
    cfg = ds.cfg
    days = cfg["outcome_maturity_days"]
    latest = min(ds.trim - timedelta(days=29), ds.as_of - timedelta(days=28 + days))
    latest -= timedelta(days=latest.weekday())
    n = cfg["synthetic_holdout_weeks" if ds.synthetic else "real_holdout_weeks"]
    holdout = [latest - timedelta(weeks=x) for x in reversed(range(n))]
    gap = math.ceil((28 + days) / 7)
    cal_end = holdout[0] - timedelta(weeks=gap)
    cal = [cal_end - timedelta(weeks=x) for x in reversed(range(cfg["calibration_weeks"]))]
    sel_end = cal[0] - timedelta(weeks=gap)
    sel = [sel_end - timedelta(weeks=x) for x in reversed(range(cfg["selection_weeks"]))]
    return sel, cal, holdout


def panel(ds, scope, h, latest):
    out = []
    start = ds.start + timedelta(days=83)
    start += timedelta(days=(-start.weekday()) % 7)
    for i in range(max(0, (latest - start).days // 7 + 1)):
        origin = start + timedelta(weeks=i)
        for key in ds.groups(scope, origin):
            f = ds.features(scope, key, origin, h)
            reason = f["abstain_reason"]
            diagnostics = (not ds.synthetic and scope == "area" and origin >= ds.start + timedelta(weeks=26))
            out.append({**f, "key": key, "origin": origin, "end": origin + timedelta(days=h),
                        "label_known": origin + timedelta(days=h + ds.cfg["outcome_maturity_days"]),
                        "eligible": reason is None or diagnostics, "actual": ds.label(scope, key, origin, h)})
    return out


def training_rows(rows, cutoff):
    return [r for r in rows if r["eligible"] and r["origin"] < cutoff and r["end"] <= cutoff and r["label_known"] <= cutoff]


def evaluate(rows, origins, freeze=None):
    scored = []
    frozen = fit(training_rows(rows, freeze)) if freeze is not None else None
    for at in origins:
        samples = [r for r in rows if r["origin"] == at and r["eligible"]]
        model = frozen if freeze is not None else fit(training_rows(rows, at))
        estimates = predict(model, samples)
        scored += [{**r, "pred": {**r["baselines"], "poisson_gbm": p}} for r, p in zip(samples, estimates)]
    return scored


def select_method(rows):
    full = [r for r in rows if all(r["pred"].get(m) is not None for m in METHODS)]
    if not full:
        full = rows
    scores = {m: count_metrics(full, m) for m in METHODS}
    baselines = sorted((s["mae"], m) for m, s in scores.items() if m != "poisson_gbm" and s["mae"] is not None)
    if not baselines:
        return None, scores
    best_error, best = baselines[0]
    candidate = scores["poisson_gbm"]
    # Borrowed idea: the candidate needs a material development benefit to displace a baseline.
    if candidate["mae"] is not None and candidate["n"] == scores[best]["n"] and candidate["mae"] < best_error * .95:
        return "poisson_gbm", scores
    return best, scores


def metric_set(rows):
    return {m: count_metrics(rows, m) for m in METHODS}


def release_cell(unique_events, group_size, minimum):
    return unique_events >= minimum and group_size >= minimum


def distinct_events(ds, scope, key, rows, horizon):
    ids = set()
    for r in rows:
        end = r["origin"] + timedelta(days=horizon)
        matured = end + timedelta(days=ds.cfg["outcome_maturity_days"])
        area, corridors, _ = ds.snapshot(matured)
        source = area if scope == "area" else corridors
        ids.update(c["case_id"] for c in source.get(key, []) if r["origin"] < d(c["event_date"]) <= end)
    return len(ids)


def ranking(rows, k):
    by = {m: Counter() for m in METHODS}
    for origin in sorted({r["origin"] for r in rows}):
        group = [r for r in rows if r["origin"] == origin]
        for m in METHODS:
            by[m].update({key: val for key, val in top_k(group, m, k).items() if key != "capture"})
    result = {}
    for m, counts in by.items():
        total = counts["events_captured"] + counts["events_missed"]
        result[m] = {**counts, "capture": round(counts["events_captured"]/total, 4) if total else None}
    return result


def sensitivity(ds, rows, horizon, cutoff):
    supports = ds.snapshot(cutoff)[0]
    history = {k: min((r["event_date"] for r in supports.get(k, []) if d(r["event_date"]) >= ds.start), default="9999")
               for k in real_input.DISTRICTS}
    shortest = set(sorted(history, key=lambda k: (history[k], k), reverse=True)[:4])
    covered = {k for k in real_input.DISTRICTS if any((ds.ratio(k, y) or 0) >= ds.cfg["real_min_coverage_ratio"]
                                                    for y in (cutoff.year - 2, cutoff.year - 1))}
    choices = {"well_covered_only": [r for r in rows if r["key"] in covered],
        "excluding_campaign_weeks": [r for r in rows if not campaign_on(ds.campaigns, r["key"], r["origin"]+timedelta(days=1), r["end"])],
        "excluding_shortest_history": [r for r in rows if r["key"] not in shortest]}
    full = metric_set(rows)
    winner = best_method(full)
    result = {}
    for name, subset in choices.items():
        qualifies = bool(subset) and name != "excluding_campaign_weeks" or bool(subset and ds.campaigns)
        unique = sum(distinct_events(ds, "area", k, [r for r in subset if r["key"] == k], horizon)
                     for k in {r["key"] for r in subset})
        qualifies = qualifies and release_cell(unique, len(subset), ds.cfg["min_release_group"])
        scores = metric_set(subset) if qualifies else None
        result[name] = {"metrics": scores, "conclusion": (
            ("same MAE winner" if best_method(scores) == winner else "different MAE winner") if scores else
            ("not testable: no dated campaign entries" if name == "excluding_campaign_weeks" and not ds.campaigns else
             "not testable: insufficient eligible coverage or group size"))}
    return result


def best_method(metrics):
    options = [(v["mae"], k) for k, v in metrics.items() if v["mae"] is not None]
    return min(options)[1] if options else None


def report_task(ds, scope, h, splits, track, runid):
    select, calib, final = splits
    rows = panel(ds, scope, h, final[-1])
    chosen, dev = select_method(evaluate(rows, select))
    calibration_rows = evaluate(rows, calib)
    calibrated = calibration(calibration_rows, chosen, ds.cfg["nominal_interval"]) if chosen else {
        "n": 0, "pad": None, "raw_coverage": None}
    final_rows = evaluate(rows, final, freeze=final[0])
    for r in final_rows:
        r["interval"] = calibrated_interval(r["pred"].get(chosen), ds.cfg["nominal_interval"], calibrated["pad"])
    considered = [r for r in rows if r["origin"] in final]
    abstains = Counter(r["abstain_reason"] for r in considered if r["abstain_reason"])
    final_keys = {r["key"] for r in final_rows}
    there = []
    minimum = ds.cfg["min_release_group"]
    minimum_group = {}
    for k in sorted(final_keys):
        sub = [r for r in final_rows if r["key"] == k]
        if not ds.synthetic:
            nn = distinct_events(ds, scope, k, sub, h)
            if not release_cell(nn, len(sub), minimum):
                continue
            minimum_group[k] = nn
        scores = metric_set(sub)
        better = [m for m in METHODS if m != "poisson_gbm" and scores[m]["mae"] is not None
                  and scores["poisson_gbm"]["mae"] is not None and scores[m]["mae"] < scores["poisson_gbm"]["mae"]]
        there.append({"location": " → ".join(k) if isinstance(k, tuple) else k, "metrics": scores,
                      "baseline_beats_candidate": better, "interval": interval_coverage(sub),
                      "distinct_event_support": minimum_group.get(k)})
    release = ds.synthetic or (scope == "area" and release_cell(
        sum(distinct_events(ds, scope, k, [r for r in final_rows if r["key"] == k], h) for k in final_keys),
        len(final_rows), minimum))
    metrics = metric_set(final_rows) if release else metric_set([])
    rank = ranking(final_rows, ds.cfg["top_k"]) if release else {}
    if not ds.synthetic:
        rank = {m: {k: (v if k == "capture" or v >= minimum else None) for k, v in r.items()} for m, r in rank.items()}
    monitor = []
    best = best_method(metrics)
    iv = interval_coverage(final_rows) if release else interval_coverage([])
    if best and best != "poisson_gbm":
        monitor.append(f"Candidate did not win final MAE; best method was {best}.")
    if chosen and best and chosen != best:
        monitor.append("The development-selected method did not win the final holdout; it was not changed afterward.")
    if iv["coverage"] is not None and iv["coverage"] < ds.cfg["nominal_interval"]:
        monitor.append("Observed interval coverage fell below the nominal target.")
    fit_rows = training_rows(panel(ds, scope, h, ds.as_of - timedelta(days=h + ds.cfg["outcome_maturity_days"])), ds.as_of)
    # The inference refit happens only after the final report results are frozen; it isn't scored on the holdout.
    final_model = fit(fit_rows)
    mdir = model_dir(track)
    mdir.mkdir(parents=True, exist_ok=True, mode=0o700)
    model_path = mdir / f"{scope}_{h}_{runid}.joblib"
    joblib.dump({"synthetic": ds.synthetic, "model": final_model, "chosen": chosen, "pad": calibrated["pad"],
                 "run_id": runid, "horizon": h, "scope": scope, "trained_as_of": ds.as_of.isoformat()}, model_path)
    if not ds.synthetic:
        model_path.chmod(0o600)
    folds = [{"date": origin.isoformat(), "scores": metric_set([r for r in final_rows if r["origin"] == origin]),
              "observations": sum(r["actual"] for r in final_rows if r["origin"] == origin),
              "interval": interval_coverage([r for r in final_rows if r["origin"] == origin])}
             for origin in final] if ds.synthetic else []
    diagnostic = not ds.synthetic and scope == "area"
    return {"scope": scope, "horizon_days": h, "selected_method": chosen, "winner": best, "metrics": metrics,
            "selection": dev if release else {}, "interval": iv, "calibration": calibrated if release else None,
            "top_k": ds.cfg["top_k"], "ranking": rank, "locations": there, "lead_time_days": [1, h],
            "window_count": len(considered) if ds.synthetic or len(considered) >= minimum else None,
            "abstention_reasons": dict(abstains) if ds.synthetic else {k: (v if v >= minimum else None) for k, v in abstains.items()},
            "issued_windows": sum(not r["abstain_reason"] for r in considered) if ds.synthetic or scope == "area" else None,
            "diagnostic_only": diagnostic, "monitoring": monitor, "replay": folds,
            "sensitivity": sensitivity(ds, final_rows, h, final[0]) if diagnostic else None,
            "notice": ("No corridor reaches the dated support requirement; no forecast or score issued." if scope == "corridor" and not final_rows else
                       "Research-only comparisons include unknown-coverage districts; no forecast is released there." if diagnostic else None)}


def coverage_section(ds):
    area, _, source_days = ds.snapshot(ds.as_of)
    base_counts = Counter(c["district"] for c in ds.cases if c["district"] and c["event_date"] and c["first_available_date"]
                          and ds.start <= d(c["event_date"]) < ds.trim)
    months = {}
    for kind, on in source_days:
        if on >= ds.start:
            months.setdefault(on.isoformat()[:7], Counter())[kind] += 1
    prev_share, prev_total = None, None
    volume = []
    for month, counts in sorted(months.items()):
        total = sum(counts.values())
        n = ds.cfg["min_release_group"]
        share = counts.get("court", 0) / total
        volume.append({"month": month, "articles": (total if ds.synthetic or total >= n else None),
            "mix_change": prev_share is not None and abs(share - prev_share) >= .15,
            "possible_break": prev_total is not None and total >= max(10, 2 * prev_total),
            "campaign": any(a.isoformat()[:7] <= month <= b.isoformat()[:7] for a,b,_ in ds.campaigns)})
        prev_share, prev_total = share, total
    groups = []
    for district in real_input.DISTRICTS:
        count = sum(d(r["event_date"]) >= ds.start for r in area.get(district, ()))
        display = count if ds.synthetic or count >= ds.cfg["min_release_group"] else None
        ratios = []
        for dd, year in sorted(ds.official):
            if dd != district:
                continue
            numerator = sum(d(r["event_date"]).year == year for r in area.get(district, ()))
            enough = ds.synthetic or numerator >= ds.cfg["min_release_group"]
            ratios.append({"year": year, "ratio": ds.ratio(district, year) if enough else None,
                           "observed_cases": numerator if enough else None})
        groups.append({"location": district, "cases": display, "ratios": ratios,
                       "coverage": ds.coverage.get(district) if ds.synthetic else None})
    return {"sources": ["Fictional fixtures"] if ds.synthetic else ["Public news reports", "High Court judgments"],
            "months": volume, "districts": groups, "minimum_quantity_grams": ds.cfg["minimum_quantity_grams"],
            "before_quantity_rule": sum(base_counts.values()), "after_quantity_rule": sum(
                sum(d(r["event_date"]) >= ds.start for r in values) for values in area.values()),
            "campaign_markers": len(ds.campaigns), "coverage_floor": ds.cfg["real_min_coverage_ratio"],
            "effort": "No independent observed effort series.",
            "note": "Coverage ratio is a rough proxy; police and excise counts can overlap and include small possession cases. Use verified comparable non-overlapping counts only."}


def aggregate_for_picker(report):
    """Tiny allowlisted shape; never includes real window replay, movements, URLs or counts below k."""
    n = report["minimum_group"]
    area = {t["horizon_days"]: {row["location"]: row for row in t["locations"]} for t in report["tasks"] if t["scope"] == "area"}
    districts = []
    for r in report["coverage"]["districts"]:
        district = r["location"]
        rows = []
        for h, table in area.items():
            g = table.get(district)
            if g and release_cell(g["distinct_event_support"], g["metrics"]["last_56_days"]["n"], n):
                rows.append({"horizon_days": h, "distinct_event_support": g["distinct_event_support"], "windows": g["metrics"]["last_56_days"]["n"],
                             "metrics": {m: v["mae"] for m, v in g["metrics"].items()}})
        ratios = [{"year": v["year"], "ratio": v["ratio"], "observed_cases": v["observed_cases"]}
                  for v in r["ratios"] if isinstance(v.get("observed_cases"), int) and v["observed_cases"] >= n]
        districts.append({"district": district, "cases": r["cases"] if isinstance(r["cases"], int) and r["cases"] >= n else None,
                          "metrics": rows, "ratios": ratios})
    months = [{**row, "articles": row["articles"] if isinstance(row["articles"], int) and row["articles"] >= n else None}
              for row in report["coverage"]["months"]]
    return {"schema": "narcotrace-real-aggregate-v1", "synthetic": False, "minimum_group": n,
            "label": LABEL_REAL, "universe": UNIVERSE, "districts": districts, "data_cutoff": report["data_cutoff"],
            "generated_at": report["generated_at"], "coverage_minimum": report["coverage"].get("coverage_floor", .05),
            "months": [{**r, "mix_change": False, "possible_break": False} if r["articles"] is None else r for r in months]}


def html_report(report):
    title = f"{report['label']} | NarcoTrace evaluation"
    blocks = []
    for t in report["tasks"]:
        base = "".join(f"<tr><th>{escape(m)}</th><td>{s['n']}</td><td>{s['mae']}</td><td>{s['poisson_deviance']}</td></tr>"
                       for m,s in t["metrics"].items())
        districts = "".join(f"<tr><th>{escape(g['location'])}</th><td>{g['metrics']['poisson_gbm']['mae']}</td>"
             f"<td>{escape(', '.join(g['baseline_beats_candidate']) or 'No lower baseline MAE')}</td><td>{g['interval']['coverage']}</td></tr>"
             for g in t["locations"])
        details = escape(json.dumps({"ranking and misses": t["ranking"], "abstentions": t["abstention_reasons"],
                   "interval": t["interval"], "sensitivity": t["sensitivity"], "monitoring": t["monitoring"]}, indent=2))
        blocks.append(f"<section><h2>{t['scope'].title()} / {t['horizon_days']} days</h2><p>Development selected: {t['selected_method']}. "
                      f"Final best: {t['winner']}. {escape(t['notice'] or '')}</p><table><tr><th>Method</th><th>Windows</th><th>MAE</th>"
                      f"<th>Poisson deviance</th></tr>{base}</table><table><tr><th>Place</th><th>Candidate MAE</th><th>Where it loses</th>"
                      f"<th>Interval coverage</th></tr>{districts}</table><details><summary>Misses, ranges and checks</summary><pre>{details}</pre></details></section>")
    return ("<!DOCTYPE html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width'><title>"
            + escape(title) + "</title><style>body{margin:2rem auto;max-width:68rem;padding:0 1rem;background:#0e1419;color:#e6e9ee;"
            "font:16px system-ui}th,td{text-align:left;padding:.45rem;border-bottom:1px solid #52616c}section{margin:2rem 0}pre{overflow:auto}"
            "header{position:sticky;top:0;background:#0e1419;border-bottom:2px solid #82cce3}table{margin:1rem 0}h1{font:2rem Georgia}</style>"
            f"<header><strong>{escape(report['label'])}</strong><p>Proposed by the team. Not an official agency system. Decision support only.</p></header>"
            f"<h1>Forecast report card</h1><p>{escape(report['universe'])}</p><p>Generated {escape(report['generated_at'])}; "
            f"data cutoff {escape(report['data_cutoff'])}; final forecast origins {report['splits']['final'][0]} to {report['splits']['final'][-1]}.</p>"
            "<p>MAE is the average miss in cases; lower is better. Poisson deviance is a count-error score that penalizes badly underestimated outcomes. "
            "Top-k ranks the highest few forecasts, not the probability that any case occurs. Overlapping 28-day origins can count a case more than once.</p>"
            + "".join(blocks) + f"<h2>Feedback loop</h2><p>{escape(FEEDBACK)}</p><p>Minimum groups do not guarantee anonymity.</p></html>")


def run(track):
    if track == "real" and not real_input.ROOT.exists():
        print("REAL: no training_dataset/; skipped.")
        return
    ds = load_dataset(track)
    out = report_dir(track)
    out.mkdir(parents=True, exist_ok=True, mode=0o700 if not ds.synthetic else 0o755)
    marker = out / "eval_report.json"
    fingerprint = sha256(json.dumps([ds.cfg, ds.cases, ds.official and sorted((k, v[0], v[1].isoformat()) for k,v in ds.official.items()),
        [[a.isoformat(), b.isoformat(), s] for a,b,s in ds.campaigns]], sort_keys=True).encode()).hexdigest()[:16]
    if marker.exists():
        prior = json.loads(marker.read_text())
        if prior["run_id"] == fingerprint:
            print(f"{track.upper()}: existing frozen holdout report at {marker}; not re-scored.")
            return
        print(f"{track.upper()}: inputs/config changed; a new run on overlapping dates is exploratory, not fresh validation.")
    splits = split_dates(ds)
    if not ds.synthetic:
        os.umask(0o077)
    tasks = [report_task(ds, s, h, splits, track, fingerprint) for s in ("area", "corridor") for h in (7, 28)]
    report = {"schema": "narcotrace-eval-v1", "synthetic": ds.synthetic, "label": LABEL_SIM if ds.synthetic else LABEL_REAL,
        "universe": "Invented documented cases, not all movement. No real-world accuracy." if ds.synthetic else UNIVERSE,
        "run_id": fingerprint, "generated_at": datetime.now(timezone.utc).isoformat(), "data_cutoff": ds.as_of.isoformat(),
        "splits": {k: [o.isoformat() for o in v] for k,v in zip(("selection", "calibration", "final"), splits)},
        "outcome_maturity_days": ds.cfg["outcome_maturity_days"], "nominal_interval": ds.cfg["nominal_interval"],
        "minimum_group": ds.cfg["min_release_group"], "coverage": coverage_section(ds), "feedback": FEEDBACK, "tasks": tasks}
    (out / "eval_report.html").write_text(html_report(report))
    if not ds.synthetic:
        dump(out / "ui_aggregate.json", aggregate_for_picker(report))
    dump(marker, report)
    print(f"{track.upper()} report: {marker} ({len(splits[-1])} final weekly origins).")
    for t in tasks:
        print(f"  {t['scope']} {t['horizon_days']}d: best MAE {t['winner'] or 'not testable'}, "
              f'selected {t["selected_method"] or "none"}, abstention reasons {t["abstention_reasons"]}')


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("track", choices=["synthetic", "real"])
    p.add_argument("--release-existing", action="store_true", help="Rebuild the private picker file without re-scoring.")
    args = p.parse_args()
    if args.release_existing:
        private_report = report_dir("real") / "eval_report.json"
        if args.track != "real":
            p.error("--release-existing is only for real reports")
        if not private_report.exists():
            print("REAL: no private aggregate report to prepare.")
        else:
            report = json.loads(private_report.read_text())
            if report.get("synthetic") is not False:
                raise SystemExit("Unexpected report track")
            os.umask(0o077)
            dump(private_report.parent / "ui_aggregate.json", aggregate_for_picker(report))
            print("REAL: private picker file rebuilt; owner review required before opening. Holdout was not re-scored.")
    else:
        run(args.track)
