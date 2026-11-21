"""Deterministic two-layer simulation. Hidden activity is never a model input."""
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
import argparse
import json
import math
import numpy as np
from ml.data.real_input import DISTRICTS, geo

WEB = Path("web/public/generated")
STATE = Path("artifacts/synthetic")
START, END = date(2022, 11, 14), date(2026, 11, 21)
PAIRS = [
    ("North Gate (fictional)", "Kasaragod"), ("Kasaragod", "Kannur"),
    ("Kannur", "Kozhikode"), ("Kozhikode", "Malappuram"),
    ("East Gate (fictional)", "Palakkad"), ("Palakkad", "Thrissur"),
    ("Thrissur", "Ernakulam"), ("Ernakulam", "Kottayam"),
    ("Ernakulam", "Alappuzha"), ("South Gate (fictional)", "Thiruvananthapuram"),
]
COVERAGE = dict(zip(DISTRICTS, [.6, .71, .19, .79, .66, .83, .71, .85, .48, .58, .64, .23, .61, .78]))
BASE = dict(zip(DISTRICTS, [.27, .38, .19, .50, .43, .52, .44, .82, .24, .32, .33, .21, .34, .54]))


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, allow_nan=False, indent=2) + "\n", encoding="utf-8")


def normalize(rows):
    """Known simulated syndication keys preserve one case, earliest source first."""
    groups = defaultdict(list)
    for row in rows:
        if row["synthetic"] is not True:
            raise ValueError("Synthetic normalizer refuses non-synthetic input")
        groups[row["case_id"]].append(row)
    cases = []
    for key in sorted(groups):
        group = sorted(groups[key], key=lambda r: r["first_available_date"] or "9999")
        case = group[0].copy()
        refs = {(r["ref"], r["available_date"]): r for a in group for r in a["source_ref"]}
        case["source_ref"] = list(refs.values())
        q, u = case["quantity"], case["unit"]
        case["original_unit"] = u
        factor = {"mg": .001, "g": 1, "kg": 1000}.get(u)
        case["quantity"] = round(q * factor, 6) if q is not None and factor is not None else None
        case["unit"] = "g" if case["quantity"] is not None else None
        cases.append(case)
    return cases


def generate(seed):
    rng = np.random.default_rng(seed)
    raw, hidden = [], []
    for i in range((END - START).days + 1):
        day = START + timedelta(days=i)
        seasonal = 1 + .52 * math.cos(2 * math.pi * (day.timetuple().tm_yday - 245) / 365.25)
        trend = .82 + .38 * i / (END - START).days
        newsroom = .72 if i < 350 else (.94 if i < 870 else 1.13)
        for idx, district in enumerate(DISTRICTS):
            pair = next((p for p in PAIRS if p[1] == district), None)
            surge = (1.65 if pair and (i + idx * 31) % 280 < 35 else 1)
            activity = BASE[district] * seasonal * trend * surge
            effort = .94 + .12 * math.cos(i / 46 + idx)
            coverage = COVERAGE[district]
            hidden.append({"synthetic": True, "district": district, "day": day.isoformat(),
                           "hidden_activity_rate": round(activity, 4), "observation_effort": round(effort, 4)})
            for _ in range(rng.poisson(activity * effort * coverage * newsroom)):
                serial = len(raw) + 1
                delay = int(rng.choice((0, 1, 2, 4, 9, 16, 26), p=(.21, .26, .22, .19, .08, .03, .01)))
                pub = day + timedelta(days=delay)
                if pub > END:
                    continue
                ref = f"demo-source-{serial:05d}"
                verified = pub + timedelta(days=2) if rng.random() < .26 else None
                if verified and verified > END:
                    verified = None
                observed = district if rng.random() > .02 else None
                routed = pair if pair and rng.random() < .68 else None
                event = day.isoformat() if rng.random() > .026 else None
                substance = rng.choice(["cannabis", "mdma", "methamphetamine", "opioid"]) if rng.random() > .085 else None
                unit = rng.choice(["g", "mg", "kg"]) if rng.random() > .18 else None
                qty = round(float(rng.lognormal(4., 1.8)) / {"g": 1, "kg": 1000, "mg": .001}[unit], 5) if unit else None
                revise = pub + timedelta(days=10)
                withdrawn = rng.random() < .013 and revise <= END
                corrected = not withdrawn and rng.random() < .018 and revise <= END
                edits = ([{"effective_at": revise.isoformat(), "kind": "withdrawal"}] if withdrawn else
                         [{"effective_at": revise.isoformat(), "kind": "quantity revised", "multiplier": 1.2}] if corrected else [])
                row = {"case_id": f"demo-case-{serial:05d}", "synthetic": True,
                    "source_ref": [{"source_type": "fixture", "ref": ref, "available_date": pub.isoformat()}],
                    "agency": None, "evidence_status": "synthetic documented", "independent_corroboration": False,
                    "event_date": event, "first_available_date": pub.isoformat(),
                    "verified_date": verified.isoformat() if verified else None, "withdrawn": withdrawn, "correction_history": edits,
                    "district": observed, "seizure_location": geo(observed, "district"),
                    "origin": geo(routed[0], "place" if routed and "fictional" in routed[0] else "district") if routed else geo(None),
                    "destination": geo(routed[1], "district") if routed else geo(None), "transit_points": [],
                    "substance_category": substance, "quantity": qty, "unit": unit, "original_unit": unit,
                    "transport_mode": "fictional road context" if routed else None, "linked_case_ids": [],
                    "source_permissions": "synthetic public demo", "coverage_definition": "simulated probability of documentation",
                    "revisions": [], "extraction_date": pub.isoformat(), "source_type": "fixture", "date_basis": "simulation" if event else "unknown",
                    "movement_available_date": pub.isoformat() if routed and event else None}
                raw.append(row)
                copydate = pub + timedelta(days=1)
                if rng.random() < .075 and copydate <= END:
                    raw.append({**row, "first_available_date": copydate.isoformat(),
                                "source_ref": [{"source_type": "fixture", "ref": ref + "-syndicated", "available_date": copydate.isoformat()}]})
    return raw, hidden


def main(seed):
    raw, hidden = generate(seed)
    cases = normalize(raw)
    dd = [c["event_date"] for c in cases if c["event_date"]]
    by = Counter(c["district"] for c in cases if c["district"])
    out = {"synthetic": True, "label": "SYNTHETIC DATA", "seed": seed, "as_of": END.isoformat(),
        "start": START.isoformat(), "coverage": COVERAGE, "cases": cases,
        "connections_label": "Invented connections for testing, not claims about real routes",
        "connections": PAIRS}
    dump(WEB / "cases_synthetic.json", out)
    dump(STATE / "hidden_simulator.json", {"synthetic": True, "rows": hidden})
    n = len(cases)
    summary = {"synthetic": True, "source_rows": len(raw), "canonical_cases": n, "duplicates_merged": len(raw) - n,
        "event_range": [min(dd), max(dd)], "counts_per_district": by,
        "missing_fraction": {k: round(sum(c[k] is None for c in cases) / n, 4) for k in
                             ("event_date", "first_available_date", "district", "quantity", "substance_category")}}
    dump(WEB / "summary.json", summary)
    print(f"SYNTHETIC: {n} cases, {len(raw)-n} duplicate copies merged; {min(dd)} to {max(dd)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=1729)
    main(parser.parse_args().seed)
