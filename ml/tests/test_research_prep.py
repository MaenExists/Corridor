from datetime import date
from math import log1p

import pytest

from ml.data.effort_prep import (
    comparable_yield, eligible_care, review_feedback_bucket, review_status, yield_interval,
)
from ml.data.training_prep import district_panel, make_stat, quantity_features
from ml.train.effort_yield import fit

CUTOFF = date(2026, 6, 30)


def observation(**changes):
    return dict(
        dict(district="Kottayam", period_start="2025-01-01", period_end="2025-01-31",
             agency="excise", operation="standard", protocol="ndps_checks",
             effort_unit="inspections", count="10", status="complete",
             available_on="2025-02-07", forecast_influenced="no"),
        **changes,
    )


def test_matching_requires_comparable_scope_dates_and_independent_provenance():
    for changes in (
        {"protocol": "alcohol_checks"}, {"operation": "festival_drive"}, {"count": "0"},
        {"period_end": "2025-02-28"}, {"forecast_influenced": "unknown"},
        {"forecast_influenced": "yes"}, {"available_on": "2026-07-01"}, {"status": "partial"},
    ):
        assert comparable_yield(observation(), observation(**changes), CUTOFF) is None
    result = comparable_yield(observation(count="0"), observation(count="100"), CUTOFF)
    assert result is not None
    estimate, lower, upper = yield_interval(result)
    assert estimate == lower == 0 < upper


def test_care_disagreement_withholds_ranking_and_proxy_is_ineligible():
    band = (50, 30, 70)
    assert review_status(band, "lower", health_metric="treatment_admissions",
                         independent=True, reference_rate=20) == "uncertain_signals_disagree"
    assert review_status(band, "higher", health_metric="recorded_personal_possession_proxy",
                         independent=True, reference_rate=20) == "withheld_missing_independent_health"
    care = observation(metric="helpline_calls", referral_scope="self_initiated_helpline")
    assert eligible_care(care, CUTOFF)
    assert not eligible_care(dict(care, referral_scope="police_referral"), CUTOFF)


def test_forecast_influenced_records_are_separated_from_independent_checks():
    assert review_feedback_bucket({"forecast_influenced": "yes", "coverage_status": "complete"}) == "forecast_influenced_separate"
    assert review_feedback_bucket({"forecast_influenced": "no", "coverage_status": "complete"}) == "independent_eligible"
    assert review_feedback_bucket({"forecast_influenced": "unknown", "coverage_status": "complete"}) == "unknown_or_incomplete"


def test_class_and_reported_unit_are_preserved_for_quantity():
    drug, unit, logged = quantity_features("300", "synthetic", "mg")
    assert (drug, unit) == ("synthetic", "mg")
    assert logged == pytest.approx(log1p(300))
    assert quantity_features("300", "", "tablets")[:2] == ("unspecified", "tablets")
    with pytest.raises(ValueError):
        quantity_features("-5", "synthetic", "mg")


def test_partial_annual_panel_never_becomes_a_full_year_or_infers_population():
    partial = make_stat("Kottayam", "revenue_district", "2025-01-01", "2025-08-31", "kerala_excise",
                        "excise_ndps_cases_detected", 100, "cases", "year_to_date", "2025",
                        "economic_review_2025", "2026-11-24")
    result = [row for row in district_panel([partial], {}, True) if row[:2] == ("Kottayam", 2025)][0]
    assert result[6:10] == (100, "", True, "observed_comparable_window")
    assert result[12] is False
    full = [row for row in district_panel([partial], {}, False) if row[:2] == ("Kottayam", 2025)][0]
    assert full[6:10] == ("", "", False, "unknown")


def test_exposure_fit_preserves_equal_yield_and_blocks_future_input():
    first = observation(district="Kottayam", recorded_detections="10", enforcement_effort="100")
    second = observation(district="Thrissur", recorded_detections="50", enforcement_effort="500")
    future = observation(district="Thrissur", recorded_detections="999", enforcement_effort="500",
                         available_on="2026-07-01")
    model = fit([first, second], CUTOFF)
    assert model == fit([first, second, future], CUTOFF)
    assert model.district_rates["Kottayam"] == pytest.approx(model.district_rates["Thrissur"], rel=1e-5)
    assert model.estimate("Kottayam", 100)[0] == pytest.approx(10, rel=1e-5)
    assert model.estimate("Kottayam", 0) is None
    assert model.estimate("Idukki", 100) is None


def test_same_case_and_decision_date_merges_only_evidenced_orders():
    pytest.importorskip("bs4")
    from ml.data.evidence_prep import docket_keys, group_orders

    key = next(iter(docket_keys("Bail Appl. No. 123 of 2023")))
    assert key in docket_keys("B.A. No. 123/2023")
    orders = [
        {"source_id": "open", "source_type": "open", "order_keys": {key + "/2023-09-08"},
         "crime_station_year_key": "hashed", "court_decision_date": "2023-09-08"},
        {"source_id": "other", "source_type": "court_api", "order_keys": {key + "/2023-09-08"},
         "crime_station_year_key": "hashed", "court_decision_date": "2023-09-08"},
        {"source_id": "missing-date", "source_type": "court_api", "order_keys": set(),
         "crime_station_year_key": "hashed", "court_decision_date": None},
    ]
    groups = group_orders(orders)
    assert len(groups) == 2
    assert sorted(len(row["source_ids"]) for row in groups) == [1, 2]
    assert all(row["incident_date"] is None for row in groups)


def test_effort_pipeline_uses_independent_care_to_flag_disagreement(tmp_path):
    from ml.data.effort_prep import CARE_INPUT, PAIRED_ROWS, REVIEW_LOG, prepare_effort
    from ml.data.source_api import write_rows
    from ml.data.training_prep import read_rows

    def save(filename, header, records):
        write_rows(tmp_path / filename, header, ((row[key] for key in header) for row in records))

    past = observation(period_start="2024-01-01", period_end="2024-01-31", available_on="2024-02-07")
    recent = observation(count="60")
    save("detection_input.csv", PAIRED_ROWS, [past, recent])
    save("effort_input.csv", PAIRED_ROWS, [dict(past, count="100"), dict(recent, count="100")])
    save("independent_care_input.csv", CARE_INPUT, [
        dict(past, metric="treatment_admissions", referral_scope="self_referral", count="100"),
        dict(recent, metric="treatment_admissions", referral_scope="self_referral", count="20"),
    ])
    prepare_effort(tmp_path, CUTOFF)
    reports = read_rows(tmp_path / "district_effort_review_status.csv")
    current = next(row for row in reports if row["period_start"] == recent["period_start"])
    assert current["review_status"] == "uncertain_signals_disagree"
    assert any(row["review_status"] == "withheld_missing_comparable_effort" for row in reports)


    feedback = {key: "" for key in REVIEW_LOG}
    feedback.update(district=recent["district"], period_start=recent["period_start"],
                    period_end=recent["period_end"], forecast_influenced="yes", coverage_status="complete")
    save("forecast_feedback_log.csv", REVIEW_LOG, [feedback])
    prepare_effort(tmp_path, CUTOFF)
    matched = read_rows(tmp_path / "matched_effort_yield.csv")
    assert {row["period_start"] for row in matched} == {past["period_start"]}
