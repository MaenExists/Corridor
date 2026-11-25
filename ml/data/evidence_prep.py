"""Prepare a private, pseudonymous evidence review table from the local snapshot."""

import calendar
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from hashlib import sha256
import hmac
import json
import os
from pathlib import PurePosixPath
import random
import re
import secrets
from subprocess import DEVNULL, SubprocessError, check_output

from ml.data.court_archive import TERMS, YEARS, cache_path
from ml.data.real_input import SUBSTANCES
from ml.data.source_api import month_windows, write_rows
from ml.data.source_review import ENFORCEMENT, dates_mentioned, place_candidates, read_court_documents
from ml.data.training_prep import PREPARED, ROOT, quantity_features, read_rows

DOCKET = re.compile(
    r"\b(?P<kind>bail\s+appl(?:ication)?\.?|b\s*\.?\s*a\.?|crl\s*\.?\s*m\s*\.?\s*c\.?|"
    r"crl\s*\.?\s*(?:appeal|a)\.?|w\s*\.?\s*p\s*\.?\s*\(\s*c\s*\))"
    r"\s*(?:no\.?\s*)?(?P<number>\d{1,7})\s*(?:/|of)\s*(?P<year>20\d{2})\b", re.I,
)
CNR = re.compile(r"\bKL[A-Z]{2}\d{12}\b", re.I)
FIR = re.compile(
    r"\bcrime\s+no\.?\s*([0-9]{1,7})\s*(?:/|of)\s*(20\d{2})\s+of\s+"
    r"([A-Za-z][A-Za-z .'-]{2,48}?)\s+Police\s+Station\b", re.I,
)
QUANTITIES = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*(kilograms?|kg|milligrams?|mg|grams?|g|"
    r"millilitres?|ml|litres?|l|tablets?|capsules?|plants?)\b", re.I,
)
DRUG_TERMS = sorted(SUBSTANCES, key=lambda text: (-len(text), text))
DRUGS = re.compile(r"\b(" + "|".join(re.escape(drug) for drug in DRUG_TERMS) + r")\b", re.I)
UNITS = {
    "kilogram": "kg", "kg": "kg", "gram": "g", "g": "g", "milligram": "mg", "mg": "mg",
    "millilitre": "ml", "ml": "ml", "litre": "litre", "l": "litre", "tablet": "tablets",
    "capsule": "capsules", "plant": "plants",
}
SAMPLE_COLUMNS = ("sample_id", "source_type", "related_to_ndps", "distinct_incident_described",
                  "incident_date_supported", "seizure_district_supported")


def protected_key(output):
    path = output / ".evidence_key"
    if not path.exists():
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as stream:
            stream.write(secrets.token_bytes(32))
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError("Evidence key must be owner-only.")
    return path.read_bytes()


def tag(key, reference):
    return hmac.new(key, reference.encode("utf-8"), sha256).hexdigest()


def docket_keys(header, reported_cnr=""):
    keys = {f"cnr:{item.upper()}" for item in CNR.findall(f"{reported_cnr} {header[:3000]}")}
    match = DOCKET.search(header[:3000])
    if match:
        kind = re.sub(r"[^a-z]", "", match["kind"].lower())
        kind = "ba" if kind.startswith("bail") else "crla" if kind == "crlappeal" else kind
        keys.add(f"klhc:{kind}:{int(match['number'])}:{match['year']}")
    return keys


def crime_key(text, key):
    references = {
        f"{int(number)}/{year}/{re.sub(r'[^a-z0-9]', '', station.casefold())}"
        for number, year, station in FIR.findall(text[:9000])
    }
    return tag(key, "station_crime:" + next(iter(references))) if len(references) == 1 else ""


def quantity_mention(text):
    classes = {SUBSTANCES[match.casefold()] for match in DRUGS.findall(text)}
    quantities = QUANTITIES.findall(text)
    if len(classes) != 1 or len(quantities) != 1:
        return None
    amount, unit = quantities[0]
    unit = UNITS.get(unit.casefold().rstrip("s"))
    if unit is None:
        return None
    drug, unit, transformed = quantity_features(amount, next(iter(classes)), unit)
    return {"drug_class": drug, "quantity": amount, "unit": unit, "log1p_quantity": transformed}


def extract_mentions(clauses, decision_date):
    dates, districts, quantities = set(), set(), {}
    for clause in clauses:
        if not ENFORCEMENT.search(clause):
            continue
        localities = place_candidates(clause)
        if not localities:
            continue
        districts.update(localities)
        dates.update(dates_mentioned(clause) - {decision_date})
        if quantity := quantity_mention(clause):
            quantities[(quantity["drug_class"], quantity["quantity"], quantity["unit"])] = quantity
    return {"incident_date_mentions": sorted(dates), "district_mentions": sorted(districts),
            "quantity_mentions": list(quantities.values())}


def open_orders(db, root):
    selected = {}
    for year in YEARS:
        rows = db.execute(
            """SELECT pdf_link, decision_date::date, cnr FROM read_parquet(?)
               WHERE regexp_matches(concat_ws(' ', title, description), ?)""",
            [str(root / "court" / f"{year}.parquet"), TERMS],
        ).fetchall()
        for link, decision, cnr in rows:
            if not link:
                continue
            path = cache_path(root / "court" / "pdf_candidates", year, PurePosixPath(link).name)
            if path.is_file():
                selected.setdefault(path, (decision.isoformat() if decision else "", cnr or ""))

    def read(item):
        path, (decision, cnr) = item
        try:
            content = check_output(["pdftotext", "-layout", str(path), "-"], timeout=15, stderr=DEVNULL,
                                   encoding="utf-8", errors="replace")
        except (SubprocessError, OSError):
            content = ""
        return "open_high_court", path, decision, cnr, content

    with ThreadPoolExecutor(max_workers=4) as pool:
        yield from pool.map(read, sorted(selected.items()))


def kanoon_orders(root):
    from bs4 import BeautifulSoup

    archive = root / "api" / "kanoon_pilot"
    for identifier, document in read_court_documents(archive):
        text = BeautifulSoup(document["doc"], "html.parser").get_text("\n", strip=True)
        listed_date = str(document.get("publishdate") or "")[:10]
        # A provider indexing date alone cannot establish the date for a cross-source match.
        header = text[:1900]
        verified = listed_date in dates_mentioned(header)
        if listed_date:
            try:
                day = date.fromisoformat(listed_date)
                verified |= bool(re.search(
                    rf"\b(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)[^\n]{{0,80}}"
                    rf"\b0?{day.day}(?:ST|ND|RD|TH)?\s+DAY\s+OF\s+{calendar.month_name[day.month]}\s*,?\s+{day.year}\b",
                    header.replace("\n", " "), re.I,
                ))
            except ValueError:
                verified = False
        yield "indian_kanoon", archive / "responses" / f"{identifier}.json", listed_date if verified else "", "", text


def order_records(root, output, key):
    import duckdb

    records, lookup = [], []
    with duckdb.connect() as db:
        for orders in (open_orders(db, root), kanoon_orders(root)):
            for provider, path, decision, cnr, text in orders:
                source_id = tag(key, f"{provider}/{path.name}")
                docket = docket_keys(text, cnr)
                order_keys = {tag(key, f"order:{case}/{decision}") for case in docket} if decision else set()
                clauses = [re.sub(r"\s+", " ", clause).strip() for clause in
                           re.split(r"\n\s*\n|(?<=\.)\s+(?=[A-Z])", text)]
                records.append({
                    "source_type": provider, "source_id": source_id, "court_decision_date": decision or None,
                    "order_keys": order_keys, "crime_station_year_key": crime_key(text, key),
                    "verified_incident_date": None, "verified_seizure_district": None,
                    "transit_status": "unverified", **extract_mentions(clauses, decision),
                })
                lookup.append((source_id, path.relative_to(root)))
    write_rows(output / "protected_source_lookup.csv", ("source_id", "relative_document"), lookup)
    return records


def group_orders(records):
    groups, assigned = {}, {}
    for record in records:
        source = record["source_id"]
        keys = record["order_keys"]
        seen = sorted({assigned[key] for key in keys if key in assigned})
        group = seen[0] if seen else source
        entries, linked = groups.setdefault(group, ([], set()))
        for alias in seen[1:]:
            previous, previous_keys = groups.pop(alias)
            entries.extend(previous)
            linked.update(previous_keys)
        entries.append(record)
        linked.update(keys)
        assigned.update({key: group for key in linked})

    results = []
    for group, (entries, keys) in sorted(groups.items()):
        identities = {item["crime_station_year_key"] for item in entries if item["crime_station_year_key"]}
        results.append({
            "order_review_id": group, "order_id_status": "identified_case_and_date" if keys else "unresolved",
            "source_ids": [item["source_id"] for item in entries],
            "source_types": sorted({item["source_type"] for item in entries}),
            "crime_station_year_key": next(iter(identities)) if len(identities) == 1 else None,
            "incident_date": None, "place": None, "transit_status": "unverified",
            "evidence": [{name: value for name, value in item.items()
                          if name not in {"order_keys", "crime_station_year_key"}} for item in entries],
        })
    return results


def incident_review_groups(groups, output):
    by_crime = defaultdict(list)
    by_signature = defaultdict(list)
    quantities = defaultdict(dict)
    for order in groups:
        identifier = order["order_review_id"]
        if reference := order["crime_station_year_key"]:
            by_crime[reference].append(identifier)

        evidence = order["evidence"]
        days = {value for item in evidence for value in item["incident_date_mentions"]}
        areas = {value for item in evidence for value in item["district_mentions"]}
        amounts = {(q["drug_class"], q["unit"], float(q["quantity"]))
                   for item in evidence for q in item["quantity_mentions"]}
        for drug, unit, amount in amounts:
            quantities[(drug, unit)][identifier] = max(amount, quantities[(drug, unit)].get(identifier, 0))
        if len(days) == len(areas) == len(amounts) == 1:
            drug, unit, amount = next(iter(amounts))
            signature = (next(iter(areas)), drug, unit)
            by_signature[signature].append((date.fromisoformat(next(iter(days))), amount, identifier))

    suggestions = []
    for group in by_signature.values():
        group.sort()
        for index, (day, amount, left) in enumerate(group):
            for other_day, other_amount, right in group[index + 1:]:
                if (other_day - day).days > 3:
                    break
                if max(amount, other_amount) and abs(amount - other_amount) / max(amount, other_amount) <= 0.10:
                    suggestions.append((left, right, "possible_same_incident_review_required"))

    write_rows(output / "incident_links_exact.csv", ("hashed_station_crime_year", "order_review_id"),
               [(reference, order) for reference, orders in by_crime.items() for order in orders])
    write_rows(output / "incident_links_review.csv", ("left_order", "right_order", "status"), suggestions)
    outliers = []
    for (drug, unit), amounts in quantities.items():
        if len(amounts) < 20:
            continue
        ranked = sorted(amounts.values())
        quantile = ranked[int(0.95 * len(ranked)) - 1]
        outliers.extend((identifier, drug, unit, "large_quantity_review_only")
                        for identifier, amount in amounts.items() if amount > quantile)
    write_rows(output / "quantity_outlier_review.csv", ("order_review_id", "drug_class", "unit", "status"), outliers)


def court_month_coverage(root, output):
    import duckdb

    archive = root / "api" / "kanoon_pilot"
    original = {row["start"]: row for row in read_rows(archive / "coverage.csv")}
    retry_path = archive / "coverage_retry.csv"
    retries = {row["start"]: row for row in read_rows(retry_path)} if retry_path.is_file() else {}
    counts = {}
    with duckdb.connect() as db:
        for year in YEARS:
            for month, entries, keywords in db.execute(
                """SELECT date_trunc('month', decision_date)::date, count(*),
                          count(*) FILTER (WHERE regexp_matches(concat_ws(' ', title, description), ?))
                   FROM read_parquet(?) WHERE decision_date IS NOT NULL GROUP BY 1""",
                [TERMS, str(root / "court" / f"{year}.parquet")],
            ).fetchall():
                counts[month.isoformat()] = (entries, keywords)
    result = []
    for first, last in month_windows(date(2020, 1, 1), date(2026, 11, 24)):
        month = first.isoformat()
        entries, hits = counts.get(month, ("", ""))
        base, retry = original.get(month, {}), retries.get(month, {})
        actual = retry.get("retrieved_documents", base.get("distinct_documents", ""))
        estimate = retry.get("provider_search_estimate", base.get("provider_search_estimate", ""))
        coverage = ("unknown" if actual == "" or estimate == "" else
                    "short" if int(actual) < int(estimate) else "reached_reported_estimate")
        result.append((first, last, entries, hits, "archive_observed" if entries else "unknown",
                       estimate, actual, coverage, retry.get("status", ""), "evidence_only"))
    write_rows(output / "court_month_coverage.csv", (
        "index_month_start", "index_month_end", "open_metadata_rows", "open_keyword_rows", "open_coverage",
        "kanoon_provider_estimate", "kanoon_retrieved", "kanoon_coverage", "retry_status", "rate_use",
    ), result)


def sample_review(output, groups):
    path = output / "court_precision_sample.csv"
    if not path.exists():
        sample = random.Random(20261125).sample(groups, min(80, len(groups)))
        write_rows(path, SAMPLE_COLUMNS,
                   [(item["order_review_id"], "+".join(item["source_types"]), "", "", "", "") for item in sample])
    rows = read_rows(path)
    if not rows or any(row["related_to_ndps"] not in {"yes", "no"} for row in rows):
        print(f"Prepared a random sample of {len(rows)} court orders. Precision awaits completed human labels.")
        return
    from scipy.stats import binomtest

    positive = sum(row["related_to_ndps"] == "yes" for row in rows)
    interval = binomtest(positive, len(rows)).proportion_ci(method="wilson")
    print(f"NDPS keyword precision: {positive}/{len(rows)}; 95% Wilson interval "
          f"{interval.low:.1%}–{interval.high:.1%}.")


def news_review_table(root, output, key):
    path = root / "api" / "news_review_queue.json"
    reviewed = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else []
    rows, references = [], []
    for row in reviewed:
        identifier = tag(key, f"media_cloud/{row['story_reference']}")
        rows.append((identifier, "media_cloud", "", "", row["review_district"], row["district_basis"],
                     row["publication_year"], row["publication_quarter"], "pending", "evidence_only"))

    supplemental = root / "api" / "news_gap_reference.json"
    if supplemental.is_file():
        for district, url in json.loads(supplemental.read_text(encoding="utf-8")):
            identifier = tag(key, "publisher/" + url)
            references.append((identifier, url))
            rows.append((identifier, "publisher", "", "", district, "publisher_coverage_scope",
                         "", "", "pending", "evidence_only"))
    write_rows(output / "protected_publisher_lookup.csv", ("source_id", "source_url"), references)
    write_rows(output / "news_incident_candidates.csv", (
        "source_id", "source_type", "incident_date", "verified_event_district", "review_district",
        "district_basis", "publication_year", "publication_quarter", "review_status", "usage",
    ), rows)
    print(f"Prepared {len(rows)} news review leads across {len({row[4] for row in rows})} district scopes.")


def main(root=ROOT, output=PREPARED):
    from ml.data.real_input import private_write

    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = protected_key(output)
    records = order_records(root, output, key)
    groups = group_orders(records)
    private_write(output / "court_incident_candidates.json", json.dumps(groups, ensure_ascii=False))
    incident_review_groups(groups, output)
    court_month_coverage(root, output)
    sample_review(output, groups)
    news_review_table(root, output, key)
    print(f"Prepared {len(records)} court source documents in {len(groups)} order groups. "
          f"{sum(group['order_id_status'] == 'unresolved' for group in groups)} groups lack a usable order identity.")


if __name__ == "__main__":
    main()
