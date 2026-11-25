"""Build private official statistics and comparable annual data for retrospective evaluation."""

import csv
from datetime import date
from decimal import Decimal
import math
from pathlib import Path
import re
from subprocess import DEVNULL, check_output

from ml.data.public_intake import ROOT
from ml.data.real_input import DISTRICT, DISTRICTS
from ml.data.source_api import write_rows

PREPARED = ROOT / "prepared"
YEARS = range(2020, 2027)
COLUMNS = (
    "area", "area_type", "period_start", "period_end", "agency", "metric", "value",
    "unit", "scope", "edition", "source", "available_on", "drug_class", "log1p_quantity",
)
POP_PDFS = {2020: "534", 2021: "656", 2022: "1796", 2023: "1930", 2024: "1923"}
POP_ALIASES = DISTRICT | {"ernakulum": "Ernakulam", "kasaragode": "Kasaragod"}
PERSONAL_PROXY = "recorded_personal_possession_proxy"
TRAFFICKING_PROXY = "recorded_trafficking_possession_proxy"


def read_rows(path):
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def number(value):
    value = Decimal(value)
    if not value.is_finite() or value < 0:
        raise ValueError("Official statistics require a finite nonnegative value.")
    return value


def quantity_features(value, drug_class, unit):
    """Preserve each class and reported unit. Quantity only informs review."""
    value = number(value)
    return drug_class or "unspecified", unit, math.log1p(float(value))


def make_stat(area, area_type, start, end, agency, metric, value, unit, scope, edition, source,
              available="", drug=""):
    value = number(value)
    if unit == "cases" and value != int(value):
        raise ValueError("A registration or detection count must be an integer.")
    if date.fromisoformat(end) < date.fromisoformat(start):
        raise ValueError("Official reporting window has reversed dates.")
    transform = ""
    if metric == "narcotics_seized":
        drug, _, transform = quantity_features(value, drug, unit)
    return dict(zip(COLUMNS, (
        area, area_type, start, end, agency, metric, str(value), unit, scope,
        edition, source, available, drug, transform,
    ), strict=True))


def official_stats(root):
    for row in read_rows(root / "public_context.csv"):
        area, source, metric = (row[key] for key in ("district_or_state", "source", "metric"))
        agency = ("kerala_excise" if source.startswith("economic_review") else
                  "kerala_police" if source == "kerala_police" else "ncrb")
        edition = source.rsplit("_", 1)[1] if source.startswith("economic_review") else source
        yield make_stat(
            area, "state" if area == "Kerala" else "revenue_district",
            row["period_start"], row["period_end"], agency, metric, row["value"], row["unit"],
            row["period_type"], edition, source, row["available_on"],
        )
    for row in read_rows(root / "excise_month.csv"):
        yield make_stat(
            row["district"], "revenue_district", row["period_start"], row["period_end"],
            "kerala_excise", row["metric"], row["count"], "cases", "month",
            row["period_start"][:7], "excise_dashboard", row["available_on"],
        )
    for row in read_rows(root / "ncrb_district_sll_ndps.csv"):
        year = row["year"]
        statewide = row["scope"] == "state_total"
        split = [number(row[key]) for key in ("ndps_cases", "possession_personal_cases", "possession_trafficking_cases")]
        if split[0] != sum(split[1:]):
            raise ValueError("NCRB offence split does not reconcile.")
        for metric, value in zip(("ndps_registrations", PERSONAL_PROXY, TRAFFICKING_PROXY), split, strict=True):
            yield make_stat(
                "Kerala" if statewide else row["police_reporting_unit"],
                "state" if statewide else "police_reporting_unit", f"{year}-01-01", f"{year}-12-31",
                "ncrb", metric, value, "cases", "year", year, "ncrb_district_sll",
            )


def projected_population(text, year):
    heading = re.search(r"District wise number [^\n]*Projected Mid Year Population[^\n]*" + str(year), text, re.I)
    if not heading:
        raise ValueError(f"The official population table for {year} was unavailable.")
    rows = {}
    total = None
    for line in text[heading.end():].splitlines()[:55]:
        cells = line.replace(",", "").split()
        if len(cells) == 8 and cells[0].isdigit() and cells[1].casefold() in POP_ALIASES:
            district = POP_ALIASES[cells[1].casefold()]
            units_r, rural, units_u, urban, fifth, sixth = map(int, cells[2:])
            expected = rural + urban
            if sorted((expected, units_r + units_u)) != sorted((fifth, sixth)) or district in rows:
                raise ValueError(f"District population or registration-unit total did not reconcile in {year}.")
            rows[district] = expected
        elif len(rows) == len(DISTRICTS) and len(cells) >= 7 and "total" in [c.casefold() for c in cells[:2]]:
            # The table swaps the final two columns in 2020.
            total = max(int(cell) for cell in cells[-2:])
            break
    if set(rows) != set(DISTRICTS) or total != sum(rows.values()):
        raise ValueError(f"State population total did not reconcile in {year}.")
    return rows


def load_population(root):
    result = {}
    for year, reference in POP_PDFS.items():
        path = root / "population" / f"des_{year}.pdf"
        if path.is_file():
            text = check_output(["pdftotext", "-layout", str(path), "-"], encoding="utf-8", stderr=DEVNULL)
            for district, persons in projected_population(text, year).items():
                result[(district, year)] = (
                    persons, f"https://ecostat.kerala.gov.in/storage/publications/{reference}.pdf",
                )
    return result


PANEL_COLUMNS = (
    "district", "year", "population", "population_source", "period_start", "period_end",
    "excise_detected_cases", "cases_per_lakh", "partial_period", "coverage_flag", "source_edition",
    "available_on", "known_by_knowledge_cutoff", "enforcement_inspections", "enforcement_campaign_days",
)


def district_panel(rows, population, partial):
    latest = {}
    for row in rows:
        if (row["area_type"] != "revenue_district" or not row["source"].startswith("economic_review_")
                or row["metric"] != "excise_ndps_cases_detected"):
            continue
        if row["scope"] != ("year_to_date" if partial else "year"):
            continue
        year = int(row["period_start"][:4])
        expected_end = f"{year}-08-31" if partial else f"{year}-12-31"
        if row["period_start"] != f"{year}-01-01" or row["period_end"] != expected_end:
            continue
        key = (row["area"], year)
        if key not in latest or row["edition"] > latest[key]["edition"]:
            latest[key] = row

    for year in YEARS:
        for district in DISTRICTS:
            row = latest.get((district, year))
            persons, source = population.get((district, year), ("", ""))
            count = int(row["value"]) if row else ""
            available = row["available_on"] if row else ""
            start, stop = f"{year}-01-01", f"{year}-08-31" if partial else f"{year}-12-31"
            yield (
                district, year, persons, source, start, stop, count,
                round(count * 100_000 / persons, 6) if row and persons else "",
                partial, "observed_comparable_window" if row else "unknown", row["edition"] if row else "",
                available, bool(available and date.fromisoformat(available) <= date(2026, 6, 30)), "", "",
            )


def care_inputs(root):
    for row in read_rows(root / "recovery_directory.csv"):
        # This range is a supplied planning assumption, never a measured facility capacity.
        yield row["district"], row["facility"], row["source"], row["listed_on"], "", "", 15, 20, "illustrative_range"


def prepare(root=ROOT, output=PREPARED):
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    rows = list(official_stats(root))
    population = load_population(root)
    write_rows(output / "official_statistics.csv", COLUMNS, [[row[column] for column in COLUMNS] for row in rows])
    for partial, filename in ((False, "district_year.csv"), (True, "district_jan_aug.csv")):
        write_rows(output / filename, PANEL_COLUMNS, district_panel(rows, population, partial))
    write_rows(output / "care_capacity.csv",
               ("district", "facility", "source", "listed_on", "verified_staffed_beds",
                "observed_admissions", "illustrative_beds_min", "illustrative_beds_max", "range_status"),
               care_inputs(root))
    print(f"Prepared {len(rows)} official measure rows and {len(population)} district-year population denominators.")
    print("District panels keep full years and January–August windows separate; unknown observations remain blank.")


if __name__ == "__main__":
    prepare()
