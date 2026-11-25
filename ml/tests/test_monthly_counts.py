from datetime import date, timedelta

from ml.data.aggregate_intake import Period, Release
from ml.data.real_input import DISTRICTS
from ml.forecast import monthly_counts as model


def synthetic_archive():
    releases = []
    for index in range(60):
        start = model.shift(date(2021, 1, 1), index)
        end = model.shift(start, 1) - timedelta(days=1)
        for district_index, district in enumerate(DISTRICTS):
            period = Period("excise", "ndps_registrations", district, "month", start, end)
            # Stable seasonality, with a five-day publication delay.
            releases.append(Release(period, end + timedelta(days=5), "complete",
                                    50 + (index % 12) * 8 + district_index * 2))
    return releases


def test_monthly_replay_selects_the_seasonal_reference_and_issues_interval():
    archive = synthetic_archive()
    result = model.run(archive, date(2025, 12, 31))
    assert result["status"] == "issued_private_next_month"
    assert result["method"] == "seasonal_naive"
    assert result["target_month"] == "2026-01-01"
    assert result["scorable_backtest_months"] == {"development": 6, "calibration": 12, "test": 12}
    assert result["holdout_quality"]["covered_months"] == 12
    assert result["test"]["poisson"]["n"] == 168
    assert result["issued_count"] == 14
    assert all(row["interval"] == (row["mean"], row["mean"]) for row in result["forecasts"])


def test_poisson_challenger_can_win_both_stages_and_refit():
    growing = []
    for index, release in enumerate(synthetic_archive()):
        month, district = divmod(index, len(DISTRICTS))
        growing.append(Release(release.period, release.available_on, "complete", 60 + 5 * month + district))
    result = model.run(growing, date(2025, 12, 31))
    assert result["status"] == "issued_private_next_month"
    assert result["method"] == "poisson"
    assert result["test"]["poisson"]["mae"] < result["test"]["last_reported"]["mae"]
    assert result["holdout_quality"]["covered_months"] >= 10
    assert result["issued_count"] == 14


def test_future_revisions_cannot_change_as_of_forecast_and_backtest():
    archive = synthetic_archive()
    cutoff = date(2025, 12, 31)
    past = next(release for release in archive if release.period.start == date(2024, 1, 1))
    amended = Release(past.period, date(2026, 1, 10), "complete", 9999)
    original = model.run(archive, cutoff)
    replay = model.run([amended, *archive], cutoff)
    assert original == replay


def test_development_scores_ignore_revisions_first_seen_in_final_test():
    archive = synthetic_archive()
    cutoff = date(2025, 12, 31)
    before = model.run(archive, cutoff)
    start = date.fromisoformat(before["stage_windows"]["development"][0])
    test_start = date.fromisoformat(before["stage_windows"]["test"][0])
    past = next(release for release in archive if release.period.start == start)
    revised = model.run([*archive, Release(past.period, test_start + timedelta(days=1), "complete", 9999)], cutoff)
    assert revised["development"] == before["development"]
    assert revised["method"] == before["method"]


def test_forecast_withheld_on_recent_suppression_or_failed_backtest():
    archive = synthetic_archive()
    cutoff = date(2025, 12, 31)
    recent = next(release for release in archive if release.period.start == date(2025, 8, 1))
    withdrawn = Release(recent.period, cutoff, "suppressed", None)
    incomplete = model.run([withdrawn, *archive], cutoff)
    assert incomplete["status"] == "withheld_incomplete_recent_history"
    assert incomplete["issued_count"] == 0

    # Several sharp changes in the independent test stage should make the
    # selected baseline fail its error or interval checks.
    changes = [Release(release.period, release.available_on + timedelta(days=1), "complete", release.count * 3)
               for release in archive if release.period.start.month in (2, 4, 6, 8, 10)
               and release.period.start.year == 2025]
    poor = model.run([*archive, *changes], cutoff)
    assert poor["status"] == "withheld_validation_gates"
    assert poor["issued_count"] == 0


def test_single_month_cannot_train_and_preserves_release_cutoff():
    archive = synthetic_archive()[:len(DISTRICTS)]
    early = model.run(archive, date(2021, 1, 31))
    assert early["status"] == "withheld_no_complete_month_known_at_cutoff"
    assert early["archive_complete_months"] == 1
    assert model.run(archive, date(2021, 2, 28))["status"] == "withheld_insufficient_monthly_history"
