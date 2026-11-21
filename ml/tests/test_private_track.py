"""Private tests never print, upload, or copy a matching source value."""
import csv
from datetime import date
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote
import pytest
from ml.data.real_input import ALLOWED_FIELDS, PRIVATE, ROOT, dedupe_cross_source, sanitise
from ml.evaluate.run import aggregate_for_picker, model_dir, report_dir
from ml.features.build import Dataset, movement, official_from


def git(*args):
    return subprocess.run(["git", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def test_private_inputs_ignored_and_no_source_identifiers_in_tracked_files():
    listed = git("ls-files", "-z")
    assert listed.returncode == 0, "Run privacy checks in a git checkout"
    files = [p.decode() for p in listed.stdout.split(b"\x00") if p]
    for path in ("training_dataset/input.csv", "ml/data/real/cases.json", "reports/real/ui_aggregate.json",
                 "docs/progress/DATA_AUDIT_REAL.md", "a_REAL.json", "batch.sqlite", ".env", "private.joblib"):
        assert git("check-ignore", "--quiet", path).returncode == 0, f"Required private path pattern not ignored: {path}"
    forbidden = ("training_dataset/", "ml/data/real/", "reports/real/", "artifacts/", "worker/.wrangler/")
    assert all(not f.startswith(forbidden) and not re.search(r"_real|\.sqlite|\.joblib",f,re.I) for f in files)
    if not ROOT.exists():
        return
    direct = {"case_id", "tid", "event_id", "fact_id", "source_event_key", "content_hash",
              "source_url", "title", "route_text", "notes", "crime_no"}
    embedded = {"source_urls", "source_fingerprints", "source_variants", "evidence_fields", "fact_ids",
                "membership_hash", "corroboration_ref"}
    candidates = set()
    archived_tokens = set()
    for path in ROOT.glob("*.csv"):
        if "official_stats" in path.name or "network_edges" in path.name:
            continue
        with path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                for col in direct | embedded:
                    v = (row.get(col) or "").strip()
                    if len(v) >= 18 and col in direct:
                        candidates.add(v.casefold().encode())
                    elif col in ("tid", "case_id", "crime_no") and len(v) >= 7:
                        archived_tokens.add(v.casefold().encode())
                    if col in embedded:
                        candidates.update(url.casefold().encode() for url in re.findall(r"https?://[^\s\"<>,\\]+", v) if len(url) >= 18)
                        candidates.update(x.casefold().encode() for x in re.findall(r"(?<![A-Za-z0-9])[A-Fa-f0-9]{22,}(?![A-Za-z0-9])",v))
    for f in files:
        p = Path(f)
        if not p.is_file():
            continue
        raw = p.read_bytes()
        decoded = raw.decode("utf-8", "replace")
        data = (decoded + "\n" + unquote(decoded)).casefold().encode()
        assert not any(t in data for t in candidates), "Tracked file matches private record content: " + f
        found = set(re.findall(rb'(?<![A-Za-z0-9])(?:[A-Za-z_-]*\d{7,}|[A-Za-z]+/[0-9]{5,})(?![A-Za-z0-9])',data))
        assert not archived_tokens & found, "Tracked file matches an archived identifier: " + f


def test_sanitisation_whitelists_values_and_local_derivative_when_present():
    personal = "private person at example apartment 817"
    raw = {"event_id": personal, "source_url": "https://example.invalid/opaque-path", "event_date": "2024-01-01",
           "publish_date": "2024-01-02", "district": personal, "place": personal, "origin_place": personal,
           "destination_place": personal, "drug_type": personal, "narrative": personal,
           "quantity_raw": personal, "quantity_g": personal, "title": personal, "notes": personal}
    case = sanitise(raw, "news", b"fixture")
    assert set(case) == ALLOWED_FIELDS and personal not in json.dumps(case)
    assert case["district"] is None and case["seizure_location"]["geo_precision"] == "unknown"
    assert case["quantity"] is None and case["first_available_date"] == "2024-01-02"
    assert all(re.fullmatch(r"[a-f0-9]{64}",r["ref"]) for r in case["source_ref"])
    assert "example.invalid" not in json.dumps(case)
    if (PRIVATE / "cases.json").exists():
        p = PRIVATE / "cases.json"
        cases = json.loads(p.read_text())["cases"]
        assert p.stat().st_mode & 0o077 == 0
        assert cases and all(set(r) == ALLOWED_FIELDS and r["synthetic"] is False for r in cases)
        assert all(all(re.fullmatch(r"[a-f0-9]{64}",s["ref"]) for s in r["source_ref"]) for r in cases)


def test_cross_source_match_keeps_news_available_and_court_endpoints_causal():
    base = {"event_date": "2024-01-05", "district": "Kannur", "quantity_g": "100"}
    news = sanitise({**base,"publish_date":"2024-01-06","drug_type":"ganja",
                     "source_url":"https://example.invalid/news"}, "news", b"test")
    court = sanitise({**base,"judgment_date":"2024-09-05","substance":"cannabis","origin_place":"Karnataka",
                      "destination_place":"Kannur","source_url":"https://example.invalid/court"}, "court", b"test")
    rows, merged = dedupe_cross_source([(news,"example-place")],[(court,"example-place")])
    assert merged == len(rows) == 1
    assert rows[0]["first_available_date"] == "2024-01-06" and len(rows[0]["source_ref"]) == 2
    assert movement(rows[0], date(2024,3,1)) is None
    assert movement(rows[0], date(2024,9,5)) == ("Karnataka","Kannur")


def test_cases_leads_tracks_and_buckets_cannot_mix():
    assert report_dir("real") != report_dir("synthetic") and model_dir("real") != model_dir("synthetic")
    assert not report_dir("real").is_relative_to("web") and model_dir("real").is_relative_to(PRIVATE)
    c = sanitise({"event_date":"2024-01-01","publish_date":"2024-01-02","district":"Kannur"}, "news", b"test")
    obj = {"synthetic":False,"cases":[c],"as_of":"2024-01-15"}
    with pytest.raises(ValueError,match="provenance"):
        Dataset(obj, True)
    with pytest.raises(ValueError,match="case inputs"):
        Dataset({**obj,"cases":[{**c,"source_type":"lead"}]}, False)
    with pytest.raises(ValueError,match="case inputs"):
        Dataset({"synthetic":True,"cases":[{"synthetic":True,"status":"reviewed"}],"as_of":"2024-01-15"}, True)
    edge = {**c,"origin":{"name":"Karnataka"},"destination":{"name":"Kannur"},"movement_available_date":"2024-01-04"}
    data = Dataset({**obj,"cases":[edge],"infrastructure":[["Karnataka","Kannur"]]}, False)
    assert data.groups("corridor",date(2024,1,15)) == []


def test_aggregate_suppresses_small_counts_and_has_no_record_fields():
    payload = {"minimum_group":5,"data_cutoff":"2024-10-01","generated_at":"2024-11-01",
        "tasks":[{"scope":"area","horizon_days":28,"locations":[
            {"location":"Kannur","distinct_event_support":4,"metrics":{"last_56_days":{"n":21,"mae":1}}}]}],
        "coverage":{"districts":[{"location":"Kannur","cases":3,"ratios":[{"year":2024,"observed_cases":3,"ratio":.2}]}],
                    "months":[{"month":"2024-01","articles":2,"campaign":False,"mix_change":True,"possible_break":True}]},
        "forbidden":"identifier never copied"}
    out = aggregate_for_picker(payload)
    assert out["synthetic"] is False
    assert out["districts"] == [{"district":"Kannur","cases":None,"metrics":[],"ratios":[]}]
    assert out["months"][0]["articles"] is None and out["months"][0]["mix_change"] is False
    assert "forbidden" not in out


def test_coverage_template_empty_and_denominator_availability(tmp_path):
    path = tmp_path / "official.csv"
    path.write_text("district,year,ndps_cases_police,ndps_cases_excise,source_url,retrieved_on,notes\nKannur,2024,,,,,\n")
    assert not official_from(path)
    path.write_text("district,year,ndps_cases_police,ndps_cases_excise,source_url,retrieved_on,notes\n"
                    "Kannur,2024,6,4,https://example.invalid/stats,2025-02-01,fictional test\n")
    c = sanitise({"event_date":"2024-01-01","publish_date":"2024-01-02","district":"Kannur"}, "news", b"test")
    ds = Dataset({"synthetic":False,"cases":[c],"as_of":"2025-03-01"},False,official=official_from(path))
    assert ds.ratio("Kannur",2024,date(2025,1,20)) is None
    assert ds.ratio("Kannur",2024,date(2025,3,1)) == .1
