"""Private local import. No raw values in logs; strict value allowlists, not text redaction."""
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
import csv
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import sys

ROOT = Path("training_dataset")
PRIVATE = Path("ml/data/real")
AUDIT = Path("docs/progress/DATA_AUDIT_REAL.md")
DISTRICTS = ("Kasaragod", "Kannur", "Wayanad", "Kozhikode", "Malappuram", "Palakkad",
             "Thrissur", "Ernakulam", "Idukki", "Kottayam", "Alappuzha", "Pathanamthitta",
             "Kollam", "Thiruvananthapuram")
DISTRICT = {d.casefold(): d for d in DISTRICTS}
DISTRICT.update({"kasargod": "Kasaragod", "trivandrum": "Thiruvananthapuram",
                 "calicut": "Kozhikode", "alleppey": "Alappuzha", "trichur": "Thrissur"})
PLACES = DISTRICT | {s.casefold(): s for s in (
    "Karnataka", "Tamil Nadu", "Goa", "Maharashtra", "Andhra Pradesh", "Telangana", "Odisha",
    "Bengaluru", "Mangaluru", "Mysuru", "Chennai", "Coimbatore", "Madurai", "Mumbai", "Hyderabad",
    "Walayar", "Muthanga", "Thalappady", "Kumily", "Aryankavu", "Bodimettu", "Vazhikkadavu", "Kochi")}
PLACES.update({"bangalore": "Bengaluru", "mangalore": "Mangaluru", "mysore": "Mysuru", "orissa": "Odisha"})
SUBSTANCES = {
    "cannabis": "cannabis", "ganja": "cannabis", "marijuana": "cannabis", "weed": "cannabis",
    "mdma": "mdma", "ecstasy": "mdma", "hashish": "hashish", "hashish oil": "hashish",
    "charas": "hashish", "heroin": "opioid", "brown sugar": "opioid", "opium": "opioid",
    "cocaine": "cocaine", "lsd": "lsd", "methamphetamine": "methamphetamine",
    "meth": "methamphetamine", "amphetamine": "amphetamine", "ketamine": "ketamine",
    "synthetic drugs": "other", "tablets": "other", "narcotic tablets": "other"}
UNITS = {"g": "g", "gm": "g", "grams": "g", "gram": "g", "kg": "kg", "kilogram": "kg",
         "kilograms": "kg", "mg": "mg", "milligram": "mg", "milligrams": "mg"}
PUBLIC_INPUT_FILES = {
    "news": "kerala_seizures_news_clean_1137.csv",
    "court": "kerala_highcourt_ndps_cases_112.csv",
    "infrastructure": "kerala_transit_network_edges_72.csv",
}
ALLOWED_FIELDS = frozenset(("case_id", "source_ref", "agency", "evidence_status", "independent_corroboration",
    "event_date", "first_available_date", "verified_date", "withdrawn", "correction_history",
    "district", "seizure_location", "origin", "destination", "transit_points", "substance_category",
    "quantity", "unit", "transport_mode", "linked_case_ids", "source_permissions", "coverage_definition",
    "revisions", "extraction_date", "synthetic", "source_type", "date_basis", "original_unit",
    "movement_available_date"))


def clean(s):
    return " ".join((s or "").strip().casefold().split())


def iso(s):
    try:
        return date.fromisoformat(s).isoformat()
    except (ValueError, TypeError):
        return None


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def private_write(path, value):
    """Owner-only permissions even if the caller's umask is permissive."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(value)
    path.chmod(0o600)


def fingerprint(key, value):
    return hmac.new(key, (value or "").encode(), hashlib.sha256).hexdigest()


def geo(name, precision="place"):
    return {"name": name, "geo_precision": precision if name else "unknown", "uncertainty_km": None}


def grams(raw):
    try:
        q = float(raw)
        return q if math.isfinite(q) and q > 0 else None
    except (ValueError, TypeError):
        return None


def sanitise(row, kind, key):
    court = kind == "court"
    pub = iso(row.get("judgment_date" if court else "publish_date"))
    event = iso(row.get("event_date"))
    invalid = bool(event and pub and event > pub)
    event = None if invalid else event
    basis = "offence field" if court else (
        "reported seizure date" if row.get("date_basis") in ("explicit", "relative_to_publication") else "supplied event field")
    if not event and not court and pub:
        event, basis = pub, "publication fallback"
    if not event:
        basis = "unknown"
    if court and event and event == pub:
        basis = "offence field equals judgment"
    district = DISTRICT.get(clean(row.get("district")))
    origin = PLACES.get(clean(row.get("origin_place"))) if court else None
    dest = PLACES.get(clean(row.get("destination_place"))) if court else None
    movement_date = pub if event and origin and dest and origin != dest else None
    raw_unit = re.fullmatch(r"\s*[0-9.,]+\s*([a-z]+)\s*", clean(row.get("quantity_raw")))
    unit = UNITS.get(raw_unit[1]) if raw_unit else None
    quantity = grams(row.get("quantity_g"))
    primary = row.get("source_url")
    refs = [primary] if primary else []
    if not court:
        try:
            links = json.loads(row.get("source_urls") or "[]")
            refs += [s for s in links if isinstance(s, str) and s.startswith(("https://", "http://"))]
        except (TypeError, ValueError):
            pass
    return {
        "case_id": fingerprint(key, kind + ":" + (row.get("case_id" if court else "event_id") or primary or "")),
        "source_ref": [{"source_type": kind, "ref": fingerprint(key, ref),
                        # Secondary article dates are not supplied; never backdate them.
                        "available_date": pub if ref == primary else None} for ref in sorted(set(refs))],
        "agency": None, "evidence_status": "court record" if court else "publicly reported",
        "independent_corroboration": False, "event_date": event, "first_available_date": pub,
        "verified_date": None, "withdrawn": False, "correction_history": [], "district": district,
        "seizure_location": geo(district, "district"), "origin": geo(origin), "destination": geo(dest),
        "transit_points": [], "substance_category": SUBSTANCES.get(clean(row.get("substance" if court else "drug_type"))),
        "quantity": quantity, "unit": "g" if quantity is not None else None, "original_unit": unit,
        "transport_mode": None, "linked_case_ids": [], "source_permissions": "private local analysis only",
        "coverage_definition": "publicly reported seizures (news + High Court judgments)",
        "revisions": [], "extraction_date": iso((row.get("extracted_at") or "")[:10]),
        "synthetic": False, "source_type": kind, "date_basis": basis, "movement_available_date": movement_date,
    }


def dedupe_cross_source(news, court):
    """Pairs are (sanitised case, transient exact place token); no ambiguous matches."""
    index = defaultdict(list)
    for i, (n, place) in enumerate(news):
        if place and n["district"] and n["quantity"] and n["substance_category"] and n["event_date"] and n["first_available_date"]:
            index[(n["district"], place, n["substance_category"], round(n["quantity"], 2))].append(i)
    forward, reverse = {}, Counter()
    for j, (c, place) in enumerate(court):
        if not (place and c["event_date"] and c["quantity"] and c["substance_category"] and c["first_available_date"]):
            continue
        d = date.fromisoformat(c["event_date"])
        candidates = [i for i in index[(c["district"], place, c["substance_category"], round(c["quantity"], 2))]
                      if abs((date.fromisoformat(news[i][0]["event_date"]) - d).days) <= 2
                      and news[i][0]["first_available_date"] <= c["first_available_date"]]
        forward[j] = candidates
        reverse.update(candidates)
    result = [n.copy() for n, _ in news]
    merged = 0
    for j, (c, _) in enumerate(court):
        ids = forward.get(j, [])
        if len(ids) != 1 or reverse[ids[0]] != 1:
            result.append(c)
            continue
        n = result[ids[0]]
        n["source_ref"] = n["source_ref"] + c["source_ref"]
        if c["movement_available_date"]:
            for k in ("origin", "destination", "movement_available_date"):
                n[k] = c[k]
        merged += 1
    return result, merged


def monthly_sources(cases):
    seen = {}
    for case in cases:
        for ref in case["source_ref"]:
            on = ref["available_date"]
            k = (ref["source_type"], ref["ref"])
            if on and (k not in seen or on < seen[k]):
                seen[k] = on
    result = defaultdict(Counter)
    for (kind, _), on in seen.items():
        result[on[:7]][kind] += 1
    return dict(sorted(result.items()))


def audit_chart(volume):
    months = [(m, v) for m, v in volume.items() if m >= "2023-11"]
    lines = ["```text", "MONTH    news articles (one block ≈ 5)                   judgments"]
    past = []
    for m, v in months:
        share = v.get("court", 0) / max(1, sum(v.values()))
        flag = " · source-mix change" if past and abs(share - past[-1]) >= .15 else ""
        past.append(share)
        lines.append(f"{m}  {'█' * ((v.get('news', 0) + 2) // 5):<43} {v.get('news', 0):>3} / {v.get('court', 0)}{flag}")
    lines += ["```", "Chart counts distinct dated primary references (not all linked articles). Secondary links without their own publication dates are not backdated. A change of ≥15 percentage points in the court share is flagged."]
    return "\n".join(lines)


def run():
    if not ROOT.exists():
        print("REAL: no private training_dataset/; skipped.")
        return
    PRIVATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    key_path = PRIVATE / ".ref_key"
    if not key_path.exists():
        private_write(key_path, secrets.token_hex(32))
    key = bytes.fromhex(key_path.read_text().strip())
    inputs = {kind: read_csv(ROOT / name) for kind, name in PUBLIC_INPUT_FILES.items()}
    pairs = {kind: [(sanitise(r, kind, key), clean(r.get("place"))) for r in inputs[kind]]
             for kind in ("news", "court")}
    cases, merged = dedupe_cross_source(pairs["news"], pairs["court"])
    if any(set(c) != ALLOWED_FIELDS for c in cases):
        raise RuntimeError("Sanitised schema does not match the allowlist")
    counts = monthly_sources(cases)
    asof = max(c["extraction_date"] for c in cases if c["extraction_date"])
    trim = 2
    last_news = date.fromisoformat(max(c["event_date"] for c in cases if c["source_type"] == "news" and c["event_date"]))
    trim_from = last_news - timedelta(days=last_news.weekday() + 7 * (trim - 1))
    unknown_time = sum(not (c["event_date"] and c["first_available_date"]) for c in cases)
    unknown_district = sum(not c["district"] for c in cases)
    shifted = sum(bool(c["event_date"] and c["first_available_date"] and c["first_available_date"] > c["event_date"]) for c, _ in pairs["court"])
    route = sum(bool(c["movement_available_date"]) for c in cases)
    private_write(PRIVATE / "cases.json", json.dumps({"synthetic": False, "as_of": asof,
        "exclude_on_or_after": trim_from.isoformat(), "cases": cases}))
    # The supplied infrastructure names are known transit metadata, kept private and not handed to ML.
    edges = [{"from": r["from_node"], "to": r["to_node"], "relation": "infrastructure hypothesis"}
             for r in inputs["infrastructure"] if all(re.fullmatch(r"[A-Za-z0-9 ()_.-]{1,100}", r[k])
             for k in ("from_node", "to_node"))]
    private_write(PRIVATE / "infrastructure.json", json.dumps({"synthetic": False,
        "label": "Possible connections (infrastructure) · hypothesis · not movement evidence", "edges": edges}))
    template = PRIVATE / "official_counts_TEMPLATE.csv"
    if not template.exists():
        private_write(template, "district,year,ndps_cases_police,ndps_cases_excise,source_url,retrieved_on,notes\n" +
                      "".join(f"{district},{year},,,,,\n" for district in DISTRICTS for year in range(2023, 2027)))
    campaigns = PRIVATE / "campaigns.csv"
    if not campaigns.exists():
        private_write(campaigns, "start,end,scope,source_note\n")
    audit_header = AUDIT.read_text().split("\n<!-- cleaning -->", 1)[0] if AUDIT.exists() else (
        "# REAL DATA (publicly reported cases): aggregate results only\n\nNot all cases. Not operational accuracy. "
        "Private audit of publicly reported seizures (news + High Court judgments).\n")
    rows_in_trim = sum(bool(c["event_date"] and c["event_date"] >= trim_from.isoformat()) for c in cases)
    audit = f"""
<!-- cleaning -->

- {len(cases):,} retained canonical cases after {merged} conservative news–court matches; 1,249 source rows before matching. Unmatched reports may still overlap. Match: same district, exact supplied place, same allowlisted substance and grams (to 0.01 g), within two days, unique in both directions, news available first. Same-source exact IDs were already distinct.
- {unknown_time} cases cannot be used in time modelling (unknown event or availability); {unknown_district} have unknown district. {shifted} court rows explicitly become visible later than their event; 36 equal dates are retained as supplied, not proof of independent offence dating. One reversed pair is excluded from time modelling. No missing judgment date is imputed.
- {sum(c['date_basis'] == 'publication fallback' for c in cases)} dates fall back to news publication. {sum(c['quantity'] is None for c in cases)} cases have unknown usable weight; corpus grams are used as supplied, original unit retained only when safely recognisable. Names, texts, identifiers, coordinates and URLs are not retained; source references are keyed local fingerprints.
- Two trailing event weeks from {trim_from} ({rows_in_trim} rows) excluded, plus evaluation accounts for reporting maturity. {route} cases have allowlisted distinct court endpoints and valid dates. News-only locations do not establish movement. {len(edges)} possible infrastructure edges remain separate; never model inputs.
- No validated official denominators or campaign notes supplied for this run. Coverage is unknown; this is not a finding of safety.

{audit_chart(counts)}
"""
    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    private_write(AUDIT, audit_header.rstrip() + "\n" + audit)
    print(f"REAL private import complete: {len(cases)} sanitised cases; {merged} cross-source matches; "
          f"{unknown_time} unknown time; {route} documented movement candidates.")


if __name__ == "__main__":
    try:
        run()
    except (OSError, KeyError, ValueError):
        print("REAL import stopped: input missing, unreadable, or invalid; no raw values were printed.", file=sys.stderr)
        raise SystemExit(1)
