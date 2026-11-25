"""Read normalized district counts locally and select release versions as of a date."""

import argparse
import calendar
import csv
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable, TextIO

from ml.data.real_input import DISTRICT

COLUMNS = (
    "agency", "metric", "district", "frequency", "period_start", "period_end",
    "available_on", "status", "count",
)
AGENCIES = {"police", "excise", "ncb", "dri", "verified_combined"}
METRICS = {
    "seizure_events", "ndps_registrations", "trafficking_registrations",
    "possession_registrations", "searches", "inspections",
}
STATUSES = {"complete", "partial", "unavailable", "suppressed"}


@dataclass(frozen=True)
class Period:
    agency: str
    metric: str
    district: str
    frequency: str
    start: date
    end: date


@dataclass(frozen=True)
class Release:
    period: Period
    available_on: date
    status: str
    count: int | None


def parse_date(value: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ValueError("Expected a date in YYYY-MM-DD format.") from None
    if parsed.isoformat() != value:
        raise ValueError("Expected a date in YYYY-MM-DD format.")
    return parsed


def parse_release(row: list[str]) -> Release:
    if len(row) != len(COLUMNS):
        raise ValueError("Unexpected number of fields.")
    agency, metric, district, frequency, start, end, available, status, count = (
        field.strip() for field in row
    )
    district = DISTRICT.get(district.casefold())
    if agency not in AGENCIES or metric not in METRICS or district is None:
        raise ValueError("Unrecognized agency, metric or revenue district.")
    if status not in STATUSES:
        raise ValueError("Unrecognized reporting status.")

    start, end, available = map(parse_date, (start, end, available))
    if frequency == "week":
        valid_period = start.weekday() == 0 and (end - start).days == 6
    elif frequency == "month":
        last_day = calendar.monthrange(start.year, start.month)[1]
        valid_period = start.day == 1 and end == start.replace(day=last_day)
    else:
        raise ValueError("Frequency must be week or month.")
    if not valid_period or available < end:
        raise ValueError("Invalid reporting period or release date.")

    if status == "complete":
        if not count.isascii() or not count.isdecimal() or len(count) > 12:
            raise ValueError("A complete row needs a nonnegative integer count.")
        value = int(count)
    else:
        if count:
            raise ValueError("Leave count blank for partial, unavailable or suppressed periods.")
        value = None
    return Release(Period(agency, metric, district, frequency, start, end), available, status, value)


def read_releases(stream: TextIO) -> list[Release]:
    reader = csv.reader(stream, strict=True)
    if tuple(next(reader, ())) != COLUMNS:
        raise ValueError("Unexpected aggregate CSV header.")
    releases = []
    seen = set()
    for row in reader:
        if not row:
            continue
        try:
            release = parse_release(row)
            key = (release.period, release.available_on)
            if key in seen:
                raise ValueError("Duplicate period and release date.")
        except ValueError as exc:
            raise ValueError(f"CSV line {reader.line_num}. {exc}") from None
        seen.add(key)
        releases.append(release)
    if not releases:
        raise ValueError("No aggregate releases supplied.")
    return releases


def as_of(releases: Iterable[Release], cutoff: date) -> dict[Period, Release]:
    snapshot = {}
    for release in releases:
        if release.available_on > cutoff:
            continue
        previous = snapshot.get(release.period)
        if previous is None or release.available_on > previous.available_on:
            snapshot[release.period] = release
    return snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of", required=True, metavar="YYYY-MM-DD")
    parser.add_argument("csv", type=Path)
    args = parser.parse_args()
    try:
        cutoff = parse_date(args.as_of)
        with args.csv.open(encoding="utf-8-sig", newline="") as stream:
            releases = read_releases(stream)
    except (OSError, UnicodeError, csv.Error):
        parser.exit(1, "Could not read the aggregate CSV. Check the file path, UTF-8 encoding and CSV format.\n")
    except ValueError as exc:
        parser.exit(1, f"{exc}\n")
    if not any(release.status == "complete" for release in as_of(releases, cutoff).values()):
        parser.exit(1, "CSV validated. No complete counts are available by the selected cutoff.\n")
    print("CSV validated. Complete counts are available by the selected cutoff.")


if __name__ == "__main__":
    main()
