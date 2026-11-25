"""Audit the public Kerala High Court archive locally and fetch matching PDF candidates."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
from hashlib import sha256
from http.client import HTTPException
from pathlib import Path, PurePosixPath
import re
from time import sleep
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen

from ml.data.aggregate_intake import parse_date

ROOT = Path("ml/data/real/public_sources/court")
BUCKET = "https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com"
BENCH = "court=32_4/bench=highcourtofkerala"
YEARS = range(2020, 2027)
TERMS = r"(?i)\bN\.?D\.?P\.?S\.?\b|narcotic drugs and psychotropic substances"
PDF_NAME = re.compile(r"[A-Za-z0-9_-]+\.pdf\Z")
MAX_BYTES = 16 * 1024 * 1024


def archive_url(year: int, filename: str) -> str:
    return f"{BUCKET}/data/pdf/year={year}/{BENCH}/{quote(filename)}"


def cache_path(root: Path, year: int, filename: str) -> Path:
    return root / (sha256(f"{year}/{filename}".encode()).hexdigest() + ".pdf")


def download(root: Path, year: int, filename: str) -> str:
    target = cache_path(root, year, filename)
    if target.is_file():
        return "cached"
    for attempt in range(2):
        sleep(0.2 if attempt == 0 else 1)
        try:
            with urlopen(archive_url(year, filename), timeout=12) as response:
                data = response.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES or not data.startswith(b"%PDF-") or b"%%EOF" not in data[-8192:]:
                return "invalid"
            temporary = target.with_suffix(".tmp")
            temporary.write_bytes(data)
            temporary.replace(target)
            return "downloaded"
        except HTTPError as exc:
            if exc.code in {403, 404}:
                return "unavailable"
        except (URLError, TimeoutError, HTTPException):
            continue
    return "failed"


def audit(db, root: Path, *, fetch: bool, cutoff: str, retrieved_on: str) -> None:
    columns = [
        "decision_year", "metadata_rows", "dated_rows", "earliest_decision", "latest_decision",
        "keyword_rows", "keyword_rows_by_decision_cutoff", "distinct_pdf_candidates",
        "local_pdfs", "unavailable_pdfs", "failed_pdfs", "archive_retrieved_on",
    ]
    rows = []
    pdf_root = root / "pdf_candidates"
    if fetch:
        pdf_root.mkdir(mode=0o700, exist_ok=True)
    for year in YEARS:
        parquet = root / f"{year}.parquet"
        if not parquet.is_file():
            raise ValueError(f"Missing Kerala metadata partition for {year}.")
        metadata = db.execute(
            """SELECT count(*), count(decision_date), min(decision_date)::date,
                      max(decision_date)::date FROM read_parquet(?)""",
            [str(parquet)],
        ).fetchone()
        matches = db.execute(
            """SELECT pdf_link, decision_date::date FROM read_parquet(?)
               WHERE regexp_matches(concat_ws(' ', title, description), ?)""",
            [str(parquet), TERMS],
        ).fetchall()
        filenames = {PurePosixPath(link).name for link, _ in matches if link}
        filenames = sorted(name for name in filenames if PDF_NAME.fullmatch(name))
        before_cutoff = sum(decision is not None and decision.isoformat() <= cutoff for _, decision in matches)
        outcomes = []
        if fetch:
            with ThreadPoolExecutor(max_workers=4) as pool:
                outcomes = list(pool.map(lambda filename: download(pdf_root, year, filename), filenames))
        saved = sum(cache_path(pdf_root, year, name).is_file() for name in filenames)
        rows.append((
            year, *metadata, len(matches), before_cutoff, len(filenames), saved,
            outcomes.count("unavailable") if fetch else "",
            outcomes.count("failed") + outcomes.count("invalid") if fetch else "",
            retrieved_on,
        ))
        print(f"{year}: {metadata[0]:,} metadata rows, {len(matches)} keyword hits, {saved} saved PDFs.")
    target = root / "coverage.csv"
    with target.with_suffix(".tmp").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(columns)
        writer.writerows(rows)
    target.with_suffix(".tmp").replace(target)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--retrieved-on", required=True, type=parse_date)
    parser.add_argument("--decision-cutoff", default="2026-06-30", type=parse_date)
    parser.add_argument("--fetch-pdfs", action="store_true")
    args = parser.parse_args()
    import duckdb

    with duckdb.connect() as db:
        audit(db, ROOT, fetch=args.fetch_pdfs, cutoff=args.decision_cutoff.isoformat(),
              retrieved_on=args.retrieved_on.isoformat())


if __name__ == "__main__":
    main()
