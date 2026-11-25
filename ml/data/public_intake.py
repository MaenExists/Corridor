"""Normalize downloaded Kerala public tables without reading or publishing case rows."""

import argparse
import calendar
from collections import Counter
import csv
from datetime import date
from decimal import Decimal
from hashlib import file_digest
import json
from pathlib import Path
import re
from subprocess import check_output

from ml.data.aggregate_intake import COLUMNS, parse_date, read_releases
from ml.data.real_input import DISTRICT, DISTRICTS

ROOT = Path("ml/data/real/public_sources")
TABLE_HEADING = r"(?im)^\s*(?:Appendix 5\.5\.[79]\s+)?Number of cases detected by Excise Department under[^\n]*"
DISTRICTS_ML = dict(zip(
    ("തിരുവനന്തപുരം", "കൊല്ലം", "പത്തനംതിട്ട", "ആലപ്പുഴ", "കോട്ടയം", "ഇടുക്കി", "എറണാകുളം",
     "തൃശ്ശൂർ", "പാലക്കാട്", "മലപ്പൂറം", "കോഴിക്കോട്", "വയനാട്", "കണ്ണൂർ", "കാസർഗോഡ്"),
    ("Thiruvananthapuram", "Kollam", "Pathanamthitta", "Alappuzha", "Kottayam", "Idukki", "Ernakulam",
     "Thrissur", "Palakkad", "Malappuram", "Kozhikode", "Wayanad", "Kannur", "Kasaragod"),
))
DISTRICTS_ML["മലപ്പുറം"] = "Malappuram"
MONTHS_ML = (
    "ജനുവരി", "ഫെബ്രുവരി", "മാർച്ച്", "ഏപ്രിൽ", "മേയ്", "ജൂൺ", "ജൂലൈ", "ഓഗസ്റ്റ്",
    "സെപ്റ്റംബർ", "ഒക്ടോബർ", "നവംബർ", "ഡിസംബർ",
)
CONTEXT_COLUMNS = (
    "source", "district_or_state", "metric", "unit", "period_start", "period_end",
    "period_type", "value", "available_on", "district_sum_matches_published_total",
)


def write_csv(path, columns, rows):
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(columns)
        writer.writerows(rows)
    temporary.replace(path)


def review_counts(text, edition):
    districts = DISTRICT | {"kozhikkod": "Kozhikode", "kozhikkode": "Kozhikode", "total": "Total", "kerala": "Total"}
    for heading in re.finditer(TABLE_HEADING, text):
        table = re.split(r"\n\s*(?:Source:|Appendix)", text[heading.end():heading.end() + 8500], 1)[0]
        years = re.findall(r"(?<![.\d])(?:19|20)\d{2}(?![.\d])", table[:350])
        if years[:3] != [str(year) for year in range(edition - 2, edition + 1)]:
            continue
        rows = {}
        for line in table.splitlines():
            match = re.fullmatch(r"\s*(?:\d+\s+)?([A-Za-z]+)\s+((?:[\d,]+\s+){8}[\d,]+)\s*", line)
            if match and (district := districts.get(match[1].lower())):
                values = [int(value.replace(",", "")) for value in match[2].split()]
                if district in rows:
                    raise ValueError("Duplicate district in Economic Review table.")
                rows[district] = values[1::3]
        if set(rows) == {*DISTRICTS, "Total"}:
            return rows
    raise ValueError("Economic Review NDPS table did not contain all districts and a total.")


def economic_context(directory, seen):
    for edition in range(2020, 2026):
        if edition == 2023:
            text = (directory / "review_2023_table.txt").read_text(encoding="utf-8")
        else:
            path = directory / f"review_{edition}.pdf"
            text = check_output(["pdftotext", "-layout", str(path), "-"], encoding="utf-8")
        rows = review_counts(text, edition)
        for index, year in enumerate(range(edition - 2, edition + 1)):
            if year < 2020:
                continue
            partial = year == edition
            end = f"{year}-08-31" if partial else f"{year}-12-31"
            reconciled = sum(rows[d][index] for d in DISTRICTS) == rows["Total"][index]
            yield from (
                (f"economic_review_{edition}", district if district != "Total" else "Kerala",
                 "excise_ndps_cases_detected", "cases", f"{year}-01-01", end,
                 "year_to_date" if partial else "year", counts[index], seen, reconciled)
                for district, counts in rows.items()
            )


def html_rows(table):
    return [
        row for tr in table.find_all("tr")
        if (row := [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"], recursive=False)])
    ]


def state_context(official, seen):
    tables = [html_rows(table) for table in official["police.html"].find_all("table")]
    headings, ndps = next(
        (rows[0][2:], row[2:]) for rows in tables for row in rows
        if len(row) > 2 and row[1] == "NDPS Act"
    )
    for heading, raw in zip(headings, ndps, strict=True):
        match = re.fullmatch(r"(20\d\d)(?: \(Up to ([A-Za-z]+)\))?", heading)
        if not match:
            raise ValueError("Unexpected Kerala Police period.")
        year = int(match[1])
        month = list(calendar.month_name).index(match[2]) if match[2] else 12
        end = date(year, month, calendar.monthrange(year, month)[1])
        yield ("kerala_police", "Kerala", "ndps_registrations", "cases", f"{year}-01-01", end,
               "year_to_date" if match[2] else "year", int(raw.replace(",", "")), seen, "")

    for name, source, available, labels in (
        ("pib_totals.html", "ncrb_pib_2247659", "2026-04-01", (("ndps_registrations", "cases"),)),
        ("pib_quantities.html", "ncrb_pib_2291048", "2026-07-29",
         (("narcotics_seized", "kg"), ("narcotics_seized", "items"), ("narcotics_seized", "litres"))),
    ):
        periods = set()
        for table in official[name].find_all("table"):
            rows = html_rows(table)
            if not rows or rows[0][:2] != ["SL", "State/UT"]:
                continue
            if name == "pib_quantities.html" and (len(rows) < 2 or rows[1][:3] != ["Kgs.", "Nos.", "Ltrs."]):
                continue
            years = [int(value) for value in rows[0][2:]]
            kerala = next(row[2:] for row in rows[1:] if len(row) > 2 and row[1] == "Kerala")
            if len(kerala) != len(years) * len(labels):
                raise ValueError("Unexpected NCRB state table width.")
            for index, year in enumerate(years):
                if year < 2020 or year in periods:
                    continue
                periods.add(year)
                for offset, (metric, unit) in enumerate(labels):
                    value = Decimal(kerala[index * len(labels) + offset].replace(",", ""))
                    yield (source, "Kerala", metric, unit, f"{year}-01-01", f"{year}-12-31",
                           "year", value, available, "")
        last_year = 2023 if name == "pib_totals.html" else 2024
        if periods != set(range(2020, last_year + 1)):
            raise ValueError("NCRB state table is missing expected years.")


def excise_month(soup, seen):
    snapshots = [tag["wire:snapshot"] for tag in soup.find_all(attrs={"wire:snapshot": True})
                 if '"caseChart"' in tag["wire:snapshot"]]
    if len(snapshots) != 1:
        raise ValueError("Expected one public Excise statistics snapshot.")
    stats = json.loads(snapshots[0])["data"]
    month_text, year_text = stats["period"].rsplit(" ", 1)
    year, month = int(year_text), MONTHS_ML.index(month_text) + 1
    chart = stats["caseChart"][0]["data"][0]
    districts = [DISTRICTS_ML[label] for label in chart["labels"][0]]
    numbers = next(item[0]["data"][0] for item in chart["datasets"][0] if item[0]["label"] == "NDPS")
    official_total = next(item[0]["total"] for item in stats["summary"][0] if item[0]["label"] == "NDPS")
    if Counter(districts) != Counter(DISTRICTS) or sum(numbers) != official_total:
        raise ValueError("Monthly Excise snapshot failed district coverage or total reconciliation.")
    start, end = date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])
    return [
        ("excise", "ndps_registrations", district, "month", start, end, seen, "complete", count)
        for district, count in zip(districts, numbers, strict=True)
    ]


def service_directory(soup, seen):
    options = {
        item["value"]: item.get_text(" ", strip=True)
        for item in soup.select(".jj-ctr-sel option[value]")
    }
    rows = [
        (options[card["data-dist"]], card.select_one(".jj-ctr-card-name").get_text(" ", strip=True),
         "mayangilla_keralam_de_addiction_centres", seen)
        for card in soup.select(".jj-ctr-card[data-dist]")
    ]
    if Counter(row[0] for row in rows) != Counter(DISTRICTS) or any(not row[1] for row in rows):
        raise ValueError("Public care directory did not list one named facility per district.")
    return sorted(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--retrieved-on", required=True, type=parse_date)
    args = parser.parse_args()
    from bs4 import BeautifulSoup

    seen = args.retrieved_on.isoformat()
    office = ROOT / "official"
    health = ROOT / "health"
    paths = {name: office / name for name in ("police.html", "pib_totals.html", "pib_quantities.html", "excise.html")}
    paths["vimukthi.html"] = health / "vimukthi.html"
    soups = {key: BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser") for key, path in paths.items()}
    context = [*economic_context(office, seen), *state_context(soups, seen)]
    month = excise_month(soups["excise.html"], seen)
    facilities = service_directory(soups["vimukthi.html"], seen)
    write_csv(ROOT / "public_context.csv", CONTEXT_COLUMNS, context)
    monthly = ROOT / "excise_month.csv"
    write_csv(monthly, COLUMNS, month)
    with monthly.open(encoding="utf-8", newline="") as stream:
        read_releases(stream)
    write_csv(ROOT / "recovery_directory.csv", ("district", "facility", "source", "listed_on"), facilities)

    files = [*paths.values(), *sorted(office.glob("review_????.pdf")), office / "review_2023_table.txt",
             *sorted((ROOT / "court").glob("????.parquet")),
             *(path for path in sorted(health.iterdir()) if path.is_file() and path not in paths.values())]
    manifest = []
    for path in files:
        with path.open("rb") as stream:
            manifest.append((path.relative_to(ROOT), path.stat().st_size, file_digest(stream, "sha256").hexdigest(), seen))
    write_csv(ROOT / "sources_manifest.csv", ("relative_file", "bytes", "sha256", "retrieved_on"), manifest)
    differences = sorted({(row[0], row[5]) for row in context if row[-1] is False})
    print(f"{len(context)} context rows, {len(month)} monthly district observations, {len(facilities)} public facilities.")
    for edition, end in differences:
        print(f"Published district sum discrepancy: {edition}, period ending {end}.")


if __name__ == "__main__":
    main()
