"""Assemble a private retrospective district-count training snapshot."""

from datetime import date
from hashlib import sha256
import json
from math import log

from ml.data.real_input import DISTRICTS, private_write
from ml.data.source_api import write_rows
from ml.data.training_prep import PREPARED, read_rows

TRAIN_YEARS = (2020, 2021, 2022, 2023)
HOLDOUT_YEAR = 2024
PARTIAL_YEAR = 2025
CUTOFF = date(2026, 6, 30)
METRIC = "excise_ndps_cases_detected"
FEATURES = ("district", "year", "population", "log_population_offset")
TARGETS = ("district", "year", "recorded_excise_ndps_detections")
PANEL_FILES = ("district_year.csv", "district_jan_aug.csv", "official_statistics.csv")


def comparable_rows(panel, stats, years, *, partial):
    """Require one observation per district and reconcile each edition to its state total."""
    end_suffix = "08-31" if partial else "12-31"
    scope = "year_to_date" if partial else "year"
    index = {}
    for row in stats:
        if (row["agency"] != "kerala_excise" or row["metric"] != METRIC
                or row["unit"] != "cases" or row["scope"] != scope
                or not row["source"].startswith("economic_review_")):
            continue
        key = (row["area_type"], row["area"], row["period_start"], row["period_end"], row["edition"])
        if key in index:
            raise ValueError("An official Excise edition has duplicate observations.")
        index[key] = int(row["value"])

    records = {}
    for row in panel:
        year = int(row["year"])
        if year not in years:
            continue
        key = (year, row["district"])
        expected = (f"{year}-01-01", f"{year}-{end_suffix}")
        if (key in records or (row["period_start"], row["period_end"]) != expected
                or row["partial_period"] != str(partial)
                or row["coverage_flag"] != "observed_comparable_window"):
            raise ValueError("Retrospective panel has inconsistent coverage, windows or duplicate rows.")
        value = int(row["excise_detected_cases"])
        edition = row["source_edition"]
        if value < 0 or index.get(("revenue_district", row["district"], *expected, edition)) != value:
            raise ValueError("District count differs from the corresponding official edition.")
        if not partial and (not row["population"] or int(row["population"]) <= 0 or not row["population_source"]):
            raise ValueError("An annual observation is missing a documented population exposure.")
        if row["available_on"]:
            date.fromisoformat(row["available_on"])
        records[key] = row

    if set(records) != {(year, district) for year in years for district in DISTRICTS}:
        raise ValueError("Retrospective panel does not cover exactly the requested district-years.")
    for year in years:
        rows = [records[(year, district)] for district in DISTRICTS]
        editions = {row["source_edition"] for row in rows}
        if len(editions) != 1:
            raise ValueError("District counts for one reporting window come from different editions.")
        state_key = ("state", "Kerala", f"{year}-01-01", f"{year}-{end_suffix}", editions.pop())
        if sum(int(row["excise_detected_cases"]) for row in rows) != index.get(state_key):
            raise ValueError(f"District counts do not reconcile to the official state total for {year} ({scope}).")
    return [records[key] for key in sorted(records)]


def feature_rows(records):
    for row in records:
        population = int(row["population"])
        yield row["district"], row["year"], population, log(population)


def target_rows(records):
    for row in records:
        yield row["district"], row["year"], int(row["excise_detected_cases"])


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def prepare_bundle(prepared=PREPARED):
    annual, jan_aug, official = (read_rows(prepared / filename) for filename in PANEL_FILES)
    train = comparable_rows(annual, official, TRAIN_YEARS, partial=False)
    holdout = comparable_rows(annual, official, (HOLDOUT_YEAR,), partial=False)
    prior_partial = comparable_rows(jan_aug, official, (*TRAIN_YEARS, HOLDOUT_YEAR), partial=True)
    partial_check = comparable_rows(jan_aug, official, (PARTIAL_YEAR,), partial=True)
    effort_pairs = read_rows(prepared / "matched_effort_yield.csv")
    care_rows = read_rows(prepared / "independent_care_input.csv")
    court = json.loads((prepared / "court_quality" / "summary.json").read_text(encoding="utf-8"))

    output = prepared / "training_bundle"
    output.mkdir(mode=0o700, exist_ok=True)
    files = {}

    def save(filename, columns, rows):
        rows = list(rows)
        path = output / filename
        write_rows(path, columns, rows)
        files[filename] = {"rows": len(rows), "sha256": digest(path)}

    for name, rows in (("train", train), ("holdout_2024", holdout)):
        save(f"{name}_features.csv", FEATURES, feature_rows(rows))
        save(f"{name}_targets.csv", TARGETS, target_rows(rows))
    for name, rows in (("jan_aug_reference", prior_partial), ("jan_aug_2025_check", partial_check)):
        save(f"{name}.csv", (*TARGETS, "period_start", "period_end"),
             ((*target, row["period_start"], row["period_end"])
              for row, target in zip(rows, target_rows(rows), strict=True)))
    save("annual_provenance.csv", (
        "district", "year", "period_start", "period_end", "edition", "coverage_flag", "available_on",
    ), ((row["district"], row["year"], row["period_start"], row["period_end"], row["source_edition"],
         row["coverage_flag"], row["available_on"]) for row in [*train, *holdout]))

    manifest = {
        "schema_version": 1,
        "track": "private_real_retrospective_annual",
        "target": "Kerala Excise recorded NDPS detections in a full calendar year",
        "districts": len(DISTRICTS),
        "training_years": list(TRAIN_YEARS),
        "holdout_year": HOLDOUT_YEAR,
        "feature_keys": ["district", "year"],
        "model_inputs": ["district", "log_population_offset"],
        "log_population_offset": "Fixed exposure coefficient of one for a log-link count model",
        "proposed_knowledge_cutoff_ist": f"{CUTOFF}T23:59:59+05:30",
        "documented_available_by_cutoff_train_rows": sum(
            bool(row["available_on"] and date.fromisoformat(row["available_on"]) <= CUTOFF) for row in train
        ),
        "verified_as_of_training_origin": False,
        "partial_window_check": "Compare 2025 counts to historical January–August counts only",
        "matched_effort_rows": len(effort_pairs),
        "independent_care_input_rows": len(care_rows),
        "court_target_rows": court["incident_training_rows"],
        "input_hashes": {name: digest(prepared / name) for name in PANEL_FILES},
        "files": files,
    }
    private_write(output / "manifest.json", json.dumps(manifest, indent=2) + "\n")
    print(f"Prepared {len(train)} annual training rows, {len(holdout)} holdout rows, "
          f"and a separate {len(partial_check)}-row partial-year check.")
    print("The bundle is retrospective. Training and evaluation have yet to run.")
    return manifest


if __name__ == "__main__":
    prepare_bundle()
