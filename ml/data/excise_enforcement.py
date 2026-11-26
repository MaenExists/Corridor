"""Acquire and parse Kerala Excise monthly district enforcement statements.

Kerala Excise published one statement per month on its former WordPress site
(Enforcement Activities, 2015 to September 2024). The redesigned site no longer
lists them, so this module retrieves the original uploads through the Internet
Archive and records hashes in a manifest. Raw files stay in the gitignored
public source directory. Parsing reads each district row by column position,
checks that district values sum to the published statewide total, and writes
the aggregate-intake CSV that the monthly forecast reads.

The upload folder (wp-content/uploads/YYYY/MM) dates each release. The release
date is taken as the last day of that upload month, so a forecast never uses a
statement before the department could have published it.
"""

import argparse
import calendar
import csv
from datetime import date
from hashlib import sha256
from pathlib import Path
import re
import time
from urllib.request import Request, urlopen

from ml.data.aggregate_intake import COLUMNS
from ml.data.public_intake import ROOT

INDEX_SNAPSHOT = "https://web.archive.org/web/20250120084840id_/https://keralaexcise.gov.in/en/enforcement-activities-2/"
ARCHIVE = "https://web.archive.org/web/2024id_/{url}"
RAW = ROOT / "official" / "excise_enforcement"
MANIFEST = RAW / "manifest.csv"
PANEL = ROOT / "excise_enforcement_monthly.csv"
HISTORY = ROOT / "excise_monthly_history.csv"
USER_AGENT = "NarcoTrace research client (offline public statistics study)"

# Each statement row begins with a division label. Excise divisions match revenue districts.
LABELS = {
    "Thiruvananthapuram": ("tvm", "trivandrum", "thiruvananthapuram", "tvpm"),
    "Kollam": ("klm", "kollam", "quilon"),
    "Pathanamthitta": ("pta", "pathanamthitta", "pathanamthit", "pathanamthita", "ptta"),
    "Alappuzha": ("aly", "alappuzha", "alapuzha", "alleppey", "alp", "alpy"),
    "Kottayam": ("ktm", "kottayam", "ktym"),
    "Idukki": ("idk", "idukki", "idky"),
    "Ernakulam": ("ekm", "ernakulam"),
    "Thrissur": ("tsr", "thrissur", "trichur", "tcr"),
    "Palakkad": ("pkd", "palakkad", "palghat", "plkd"),
    "Malappuram": ("mpm", "malappuram", "mlpm"),
    "Kozhikode": ("kkd", "kozhikode", "kozhikkode", "kozhikkod", "calicut", "kzd"),
    "Wayanad": ("wnd", "wayanad", "wyd", "wynd"),
    "Kannur": ("knr", "kannur", "kannoor", "kanur", "cannanore"),
    "Kasaragod": ("ksd", "kasaragod", "kasargod", "kasaragode", "kasargode", "ksgd"),
}
ALIAS = {alias: district for district, names in LABELS.items() for alias in names}
MONTH_NAMES = {name: index for index in range(1, 13) for name in (
    calendar.month_name[index].lower(), calendar.month_abbr[index].lower())}
MONTH_NAMES.update({"sept": 9, "octo": 10, "jly": 7, "marcch": 3, "june": 6, "july": 7})
PANEL_COLUMNS = (
    "district", "period_start", "period_end", "available_on", "raids",
    "abkari_cases", "ndps_cases", "cotpa_cases", "abkari_arrests", "ndps_arrests",
    "source_file", "sha256",
)


def fetch(url, attempts=4):
    for attempt in range(attempts):
        try:
            with urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=90) as response:
                return response.read()
        except OSError:
            if attempt == attempts - 1:
                raise
            time.sleep(5 * (attempt + 1))
    raise AssertionError("unreachable")


def statement_links(index_html):
    links = re.findall(r'href="(https?://keralaexcise\.gov\.in/wp-content/uploads/\d{4}/\d{2}/[^"]+\.pdf)"', index_html)
    return list(dict.fromkeys(link.replace("http://", "https://", 1) for link in links))


def statement_month(url):
    """Read the reporting month from the upload name, or None for annual summaries."""
    name = Path(url).stem.lower()
    if re.search(r"annul|month_|dist_", name):
        return None
    if match := re.fullmatch(r"(20\d{2})_(?:0?)(\d{1,2})(?:-\d+)?", name):
        return int(match[1]), int(match[2])
    if match := re.fullmatch(r"(20\d{2})_([a-z]+)", name):
        return int(match[1]), MONTH_NAMES[match[2]]
    letters = re.sub(r"[^a-z]", " ", name)
    month = next((MONTH_NAMES[word] for word in sorted(MONTH_NAMES, key=len, reverse=True)
                  if re.search(rf"(?<![a-z]){word}|{word}(?![a-z])", letters)), None)
    full = re.findall(r"20[12]\d(?!\d)", name)
    short = re.findall(r"(?<!\d)\d{2}(?!\d)", name)
    if month is None or not (full or short):
        raise ValueError(f"Unrecognized statement name {Path(url).name}.")
    year = int(full[0]) if full else 2000 + int(short[-1])
    if (year, month) >= (upload_release(url).year, upload_release(url).month + 1):
        raise ValueError(f"Statement {Path(url).name} postdates its upload.")
    return year, month


def upload_release(url):
    year, month = map(int, re.search(r"/uploads/(\d{4})/(\d{2})/", url).groups())
    return date(year, month, calendar.monthrange(year, month)[1])


def acquire(delay=1.5):
    RAW.mkdir(parents=True, exist_ok=True)
    links = statement_links(fetch(INDEX_SNAPSHOT).decode("utf-8", "replace"))
    rows = []
    for url in links:
        path = RAW / Path(url).name
        if not path.exists() or path.read_bytes()[:5] != b"%PDF-":
            body = fetch(ARCHIVE.format(url=url))
            if body[:5] != b"%PDF-":
                print(f"Skipped {path.name}: archive did not return a PDF.")
                continue
            path.write_bytes(body)
            time.sleep(delay)
        rows.append((path.name, url, upload_release(url).isoformat(), sha256(path.read_bytes()).hexdigest()))
    with MANIFEST.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(("file", "original_url", "released_by", "sha256"))
        writer.writerows(rows)
    print(f"Manifest lists {len(rows)} of {len(links)} archived statements.")


TOTAL_ROW = re.compile(r"\s*(?:\d+\s+)?TOTAL\b", re.I)


def run(*command):
    from subprocess import DEVNULL, check_output
    return check_output(command, text=True, stderr=DEVNULL)


def layout_text(path):
    # Scanned uploads return no text and fall back to a recorded manual check.
    return run("pdftotext", "-layout", str(path), "-")


def row_label(line):
    """Return (district, remaining text) when a line begins a district row."""
    text = re.sub(r"^\s*\d{1,2}[.)]?\s+", "", line)
    match = re.match(r"\s*([A-Za-z][A-Za-z.]*)\s*(.*)", text)
    if not match or match[2].startswith(":"):
        return None
    label = match[1].rstrip(".").casefold()
    district = ALIAS.get(label) or next(
        (ALIAS[alias] for alias in ALIAS if len(label) >= 6 and alias.startswith(label)), None)
    return (district, match[2]) if district else None


def leading_integers(text, limit):
    """Integers at the start of a row. A printed dash is zero."""
    values = []
    for token in text.split():
        if not re.fullmatch(r"\d+|-", token):
            break
        values.append(0 if token == "-" else int(token))
        if len(values) == limit:
            break
    return values


def statement_fields(text):
    header = text[:3000].upper()
    if "DISTRICTWISE" in header or "RAIDS" in header:
        return ("raids", "abkari_cases", "ndps_cases", "cotpa_cases", "abkari_arrests", "ndps_arrests")
    return ("abkari_cases", "ndps_cases", "cotpa_cases", "abkari_arrests", "ndps_arrests")


def parse_statement(text):
    """Parse district rows from layout text. Returns rows and any NDPS total printed on the TOTAL line."""
    fields = statement_fields(text)
    position = fields.index("ndps_cases")
    lines = text.splitlines()
    rows, totals = {}, set()
    for index, line in enumerate(lines):
        if TOTAL_ROW.match(line):
            values = leading_integers(TOTAL_ROW.sub("", line, 1), len(fields))
            if len(values) == len(fields):
                totals.add(values[position])
            continue
        found = row_label(line)
        if not found:
            continue
        district, rest = found
        values = leading_integers(rest, len(fields))
        above = next((candidate for candidate in lines[max(0, index - 2):index][::-1] if candidate.strip()), "")
        if values and re.fullmatch(r"\s*\d+\s*", above):
            # The first cell wrapped onto the line above the district label.
            values = ([int(above)] + values)[:len(fields)]
        if not values:
            nearby = [candidate for candidate in lines[index + 1:index + 3] + lines[max(0, index - 3):index][::-1]
                      if candidate.strip() and not row_label(candidate) and not TOTAL_ROW.match(candidate)]
            values = next((found for candidate in nearby
                           if len(found := leading_integers(candidate, len(fields))) > position), [])
        if len(values) <= position:
            continue
        if district in rows:
            raise ValueError(f"Duplicate row for {district}.")
        rows[district] = dict(zip(fields, values))
    return rows, totals


def layout_words(path):
    from html import unescape
    xml = run("pdftotext", "-bbox", "-f", "1", "-l", "1", str(path), "-")
    pattern = r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<'
    return [(float(x0), float(y0), float(x1), float(y1), unescape(text).strip())
            for x0, y0, x1, y1, text in re.findall(pattern, xml)]


def bbox_ndps(path):
    """Independent extraction of district and total NDPS cases from word positions.

    Some statements print rotated text, so reversed header and label spellings are accepted.
    """
    words = layout_words(path)
    names = {"ndps", "spdn"}
    headers = sorted((x0 + x1) / 2 for x0, y0, x1, y1, text in words if text.casefold() in names and y0 < 200)
    if not headers:
        return {}, None
    column = headers[0]
    integers = [(x0, y0, x1, y1, int(text)) for x0, y0, x1, y1, text in words if re.fullmatch(r"\d+", text)]

    def value_near(y0, y1):
        middle = (y0 + y1) / 2
        hits = [value for a, b, c, d, value in integers if abs((a + c) / 2 - column) <= 7 and b - 3 <= middle <= d + 3]
        return hits[0] if len(hits) == 1 else None

    rows = {}
    for x0, y0, x1, y1, text in words:
        label = text.rstrip(".").casefold()
        district = ALIAS.get(label) or ALIAS.get(label[::-1])
        if district and x0 < column and district not in rows and (value := value_near(y0, y1)) is not None:
            rows[district] = value
    total = next((value_near(y0, y1) for x0, y0, x1, y1, text in words
                  if text.casefold() in ("total", "latot") and x0 < column), None)
    return rows, total


def extract(path):
    """Return verified district rows for one statement and how they were verified, or a reason."""
    text = layout_text(path)
    rows, totals = parse_statement(text)
    box_rows, box_total = bbox_ndps(path)
    if box_total is not None:
        totals.add(box_total)
    complete = set(rows) == set(LABELS)
    if complete:
        ndps = sum(row["ndps_cases"] for row in rows.values())
        if ndps in totals:
            agree = all(box_rows.get(district, row["ndps_cases"]) == row["ndps_cases"] for district, row in rows.items())
            return rows, "printed_total" if agree else "printed_total_layout_only", None
    if set(box_rows) == set(LABELS) and sum(box_rows.values()) == box_total:
        merged = {district: {**rows.get(district, {}), "ndps_cases": value} for district, value in box_rows.items()}
        return merged, "printed_total_word_positions", None
    if complete:
        return rows, None, "No printed NDPS total matched the district sum."
    return rows, None, "Some district rows were not found."


FIRST_MONTH = date(2016, 1, 1)
CHECKS = RAW / "manual_checks.csv"
RECONCILIATION = ROOT / "prepared" / "excise_enforcement_reconciliation.csv"


def manual_checks():
    checks = {}
    if CHECKS.exists():
        with CHECKS.open(encoding="utf-8", newline="") as stream:
            for row in csv.DictReader(stream):
                checks.setdefault(row["file"], {})[row["district"]] = int(row["ndps_cases"])
    return checks


def verified_statement(path, checks):
    rows, how, reason = extract(path)
    check = checks.get(path.name, {})
    if not how and "TOTAL" in check:
        districts = {district: value for district, value in check.items() if district != "TOTAL"}
        if districts:
            rows = {district: {**rows.get(district, {}), "ndps_cases": value} for district, value in districts.items()}
        if set(rows) == set(LABELS) and sum(row["ndps_cases"] for row in rows.values()) == check["TOTAL"]:
            return rows, "transcribed_total" if districts else "visual_total", None
    return rows, how, reason


def reconcile(panel):
    """Compare yearly sums of verified months with the State Planning Board annual district series."""
    path = ROOT / "prepared" / "district_year.csv"
    if not path.exists():
        return []
    monthly = {}
    for row in panel:
        start = date.fromisoformat(row["period_start"])
        monthly.setdefault((row["district"], start.year), []).append(int(row["ndps_cases"]))
    output = []
    with path.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            if row["partial_period"] != "False" or not row["excise_detected_cases"]:
                continue
            values = monthly.get((row["district"], int(row["year"])), [])
            if len(values) != 12:
                continue
            published = int(row["excise_detected_cases"])
            output.append((row["district"], row["year"], published, sum(values), sum(values) - published))
    return output


def build():
    checks = manual_checks()
    panel, skipped = [], []
    with MANIFEST.open(encoding="utf-8", newline="") as stream:
        manifest = list(csv.DictReader(stream))
    for entry in manifest:
        month = statement_month(entry["original_url"])
        if month is None or date(*month, 1) < FIRST_MONTH:
            continue
        start = date(*month, 1)
        end = date(*month, calendar.monthrange(*month)[1])
        rows, how, reason = verified_statement(RAW / entry["file"], checks)
        if not how:
            skipped.append((start.isoformat(), reason))
            continue
        for district in LABELS:
            row = rows[district]
            panel.append({
                "district": district, "period_start": start.isoformat(), "period_end": end.isoformat(),
                "available_on": entry["released_by"],
                **{field: row.get(field, "") for field in PANEL_COLUMNS[4:10]},
                "verification": how, "source_file": entry["file"], "sha256": entry["sha256"],
            })
    panel.sort(key=lambda row: (row["period_start"], row["district"]))
    columns = (*PANEL_COLUMNS[:10], "verification", "source_file", "sha256")
    with PANEL.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, columns)
        writer.writeheader()
        writer.writerows(panel)
    with HISTORY.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(COLUMNS)
        for row in panel:
            writer.writerow(("excise", "ndps_registrations", row["district"], "month", row["period_start"],
                             row["period_end"], row["available_on"], "complete", row["ndps_cases"]))
    comparison = reconcile(panel)
    RECONCILIATION.parent.mkdir(parents=True, exist_ok=True)
    with RECONCILIATION.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(("district", "year", "published_annual", "monthly_sum", "difference"))
        writer.writerows(comparison)
    months = len({row["period_start"] for row in panel})
    exact = sum(1 for row in comparison if row[4] == 0)
    print(f"Verified {months} months for 14 districts. Skipped {len(skipped)} months.")
    for start, reason in skipped:
        print(f"  {start}: {reason}")
    if comparison:
        worst = max(abs(row[4]) for row in comparison)
        print(f"Annual reconciliation: {exact} of {len(comparison)} district-years match exactly; largest difference {worst}.")


LIVE_PAGE = "https://keralaexcise.gov.in/"
LIVE = ROOT / "excise_live_months.csv"


def snapshot(today=None):
    """Save today's Excise homepage and add its previous-month district panel to the live series.

    The homepage shows only the latest month, so a missed month cannot be recovered later.
    """
    from bs4 import BeautifulSoup
    from ml.data.public_intake import excise_month

    today = today or date.today()
    folder = RAW / "live"
    folder.mkdir(parents=True, exist_ok=True)
    page = fetch(LIVE_PAGE)
    (folder / f"{today.isoformat()}.html").write_bytes(page)
    rows = excise_month(BeautifulSoup(page.decode("utf-8", "replace"), "html.parser"), today.isoformat())
    existing = []
    if LIVE.exists():
        with LIVE.open(encoding="utf-8", newline="") as stream:
            existing = list(csv.reader(stream))[1:]
    known = {tuple(row[:6]) for row in existing}
    added = [tuple(str(value) for value in row) for row in rows if tuple(str(value) for value in row[:6]) not in known]
    with LIVE.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(COLUMNS)
        writer.writerows(sorted([*existing, *added], key=lambda row: (row[4], row[2])))
    month = rows[0][4] if rows else "no month"
    print(f"Homepage panel for {month}: {'added' if added else 'already recorded'}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--download", action="store_true", help="retrieve missing statements from the Internet Archive")
    parser.add_argument("--snapshot", action="store_true", help="record the month shown on the live Excise homepage")
    args = parser.parse_args()
    if args.snapshot:
        snapshot()
        return
    if args.download or not MANIFEST.exists():
        acquire()
    build()


if __name__ == "__main__":
    main()
