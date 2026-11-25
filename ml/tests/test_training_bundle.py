import json

import pytest

from ml.data.model_bundle import (
    FEATURES, HOLDOUT_YEAR, METRIC, PARTIAL_YEAR, TRAIN_YEARS, prepare_bundle,
)
from ml.data.real_input import DISTRICTS
from ml.data.source_api import write_rows
from ml.data.training_prep import COLUMNS, PANEL_COLUMNS, district_panel, make_stat, read_rows


def archive(path, *, holdout_target=24, wrong_state_total=False):
    stats = []
    all_years = (*TRAIN_YEARS, HOLDOUT_YEAR, PARTIAL_YEAR)
    for year in all_years:
        for partial in (False, True):
            if year == PARTIAL_YEAR and not partial:
                continue
            count = holdout_target if year == HOLDOUT_YEAR else 9
            window = (f"{year}-01-01", f"{year}-08-31" if partial else f"{year}-12-31")
            for area in (*DISTRICTS, "Kerala"):
                is_state = area == "Kerala"
                value = count * len(DISTRICTS) if is_state else count
                if is_state and wrong_state_total:
                    value += 1
                stats.append(make_stat(
                    area, "state" if is_state else "revenue_district", *window, "kerala_excise",
                    METRIC, value, "cases", "year_to_date" if partial else "year", str(year),
                    f"economic_review_{year}", "2026-11-24",
                ))
    write_rows(path / "official_statistics.csv", COLUMNS,
               ((row[column] for column in COLUMNS) for row in stats))
    population = {(district, year): (900_000, "documented") for district in DISTRICTS
                  for year in (*TRAIN_YEARS, HOLDOUT_YEAR)}
    for partial, name in ((False, "district_year.csv"), (True, "district_jan_aug.csv")):
        write_rows(path / name, PANEL_COLUMNS, district_panel(stats, population, partial))
    for name in ("matched_effort_yield.csv", "independent_care_input.csv"):
        write_rows(path / name, ("district",), ())
    quality = path / "court_quality"
    quality.mkdir(exist_ok=True)
    (quality / "summary.json").write_text(json.dumps({"incident_training_rows": 0}))


def test_holdout_outcomes_cannot_change_training_or_holdout_features(tmp_path):
    archive(tmp_path)
    first = prepare_bundle(tmp_path)
    output = tmp_path / "training_bundle"
    train = read_rows(output / "train_features.csv")
    assert tuple(train[0]) == FEATURES
    assert {int(row["year"]) for row in train} == set(TRAIN_YEARS)
    assert len(train) == 56
    assert first["files"]["jan_aug_2025_check.csv"]["rows"] == 14
    assert first["documented_available_by_cutoff_train_rows"] == 0

    archive(tmp_path, holdout_target=900)
    second = prepare_bundle(tmp_path)
    for name in ("train_features.csv", "train_targets.csv", "holdout_2024_features.csv"):
        assert first["files"][name] == second["files"][name]
    assert first["files"]["holdout_2024_targets.csv"] != second["files"]["holdout_2024_targets.csv"]


def test_refuses_to_freeze_district_counts_that_fail_state_reconciliation(tmp_path):
    archive(tmp_path, wrong_state_total=True)
    with pytest.raises(ValueError, match="do not reconcile to the official state total"):
        prepare_bundle(tmp_path)
    assert not (tmp_path / "training_bundle").exists()


def test_frozen_annual_model_is_independent_of_holdout_labels(tmp_path):
    from ml.train.annual_counts import run

    archive(tmp_path)
    prepare_bundle(tmp_path)
    bundle = tmp_path / "training_bundle"
    output = tmp_path / "fit"
    first, first_report = run(bundle, output)
    assert first["training_rows"] == 56
    assert first_report["holdout_scores"]["poisson"]["n"] == 14
    assert first["parameters"]["iterations"] < first["optimization"]["iteration_cap"]

    archive(tmp_path, holdout_target=900)
    prepare_bundle(tmp_path)
    second, second_report = run(bundle, output)
    assert first == second
    assert first_report["model_sha256"] == second_report["model_sha256"]
    assert first_report["holdout_scores"] != second_report["holdout_scores"]
    assert not second_report["future_predictions_issued"]


def test_annual_fit_rejects_changed_training_data(tmp_path):
    from ml.train.annual_counts import run

    archive(tmp_path)
    prepare_bundle(tmp_path)
    bundle = tmp_path / "training_bundle"
    with (bundle / "train_targets.csv").open("a") as stream:
        stream.write("\n")
    with pytest.raises(ValueError, match="checksum for train_targets.csv"):
        run(bundle, tmp_path / "fit")


def test_boosting_features_use_only_earlier_same_window_counts():
    from ml.train.count_boosting import examples, matrix, supervised

    import numpy as np

    history = {year: {district: year - 2018 for district in DISTRICTS}
               for year in (*TRAIN_YEARS, HOLDOUT_YEAR)}
    before = matrix(examples(history, 2023))
    history[2023] = dict.fromkeys(DISTRICTS, 900)
    history[2024] = dict.fromkeys(DISTRICTS, 1200)
    np.testing.assert_array_equal(before, matrix(examples(history, 2023)))
    assert len(supervised(history, 2023)) == 28
    assert {row["year"] for row in supervised(history, 2023)} == {2021, 2022}
    history.pop(2021)
    with pytest.raises(ValueError, match="consecutive"):
        examples(history, 2023)


def test_boosted_replay_freezes_both_models_before_reading_outcomes(tmp_path, monkeypatch):
    from ml.train import count_boosting

    archive(tmp_path)
    prepare_bundle(tmp_path)
    monkeypatch.setattr(count_boosting, "ROUND_CHECKPOINTS", (2, 4))
    output = tmp_path / "fit"
    scoring_files = {"holdout_2024_targets.csv", "jan_aug_2025_check.csv"}
    verified_rows = count_boosting.verified_rows

    def verify(bundle, manifest, name, columns):
        if name in scoring_files:
            assert all((output / saved).is_file() for saved in ("annual.joblib", "jan_aug.joblib", "fit.json"))
        return verified_rows(bundle, manifest, name, columns)

    monkeypatch.setattr(count_boosting, "verified_rows", verify)
    model, report = count_boosting.run(tmp_path / "training_bundle", output)
    assert (model["annual"]["rows"], model["january_august"]["rows"]) == (42, 56)
    for replay in ("annual_2024_replay", "january_august_2025_replay"):
        assert report[replay]["scores"]["boosted"]["n"] == 14
    assert report["future_predictions_issued"] == 0


def test_count_comparison_scores_the_same_windows_for_all_models(tmp_path, monkeypatch):
    from ml.evaluate import compare_counts
    from ml.train import annual_counts, count_boosting

    archive(tmp_path)
    prepare_bundle(tmp_path)
    bundle = tmp_path / "training_bundle"
    poisson_fit = tmp_path / "poisson"
    tree_fit = tmp_path / "trees"
    monkeypatch.setattr(count_boosting, "ROUND_CHECKPOINTS", (2, 4))
    annual_checkpoint, annual_report = annual_counts.run(bundle, poisson_fit)
    _, tree_report = count_boosting.run(bundle, tree_fit)
    report = compare_counts.run(bundle, poisson_fit, tree_fit, tmp_path / "comparison")
    for window in ("annual_2024", "january_august_2025"):
        assert sum(report[window]["absolute_error_head_to_head"].values()) == 14
        assert all(score["n"] == 14 for score in report[window]["scores"].values())
    assert report["annual_2024"]["scores"]["poisson"]["mae"] == annual_report["holdout_scores"]["poisson"]["mae"]
    assert report["january_august_2025"]["scores"]["boosted"]["mae"] == (
        tree_report["january_august_2025_replay"]["scores"]["boosted"]["mae"]
    )
    assert report["partial_poisson"]["settings"] == annual_checkpoint["settings"]
    assert report["partial_poisson"]["prediction_population_year"] == HOLDOUT_YEAR
    assert not report["prospective_accuracy_verified"]

    manifest_path = bundle / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    for name in ("holdout_2024_targets.csv", "jan_aug_2025_check.csv"):
        path = bundle / name
        rows = read_rows(path)
        target = "recorded_excise_ndps_detections"
        rows[0][target] = str(int(rows[0][target]) + 1000)
        write_rows(path, rows[0], (row.values() for row in rows))
        manifest["files"][name]["sha256"] = compare_counts.digest(path)
    manifest_path.write_text(json.dumps(manifest))
    rescored = compare_counts.run(bundle, poisson_fit, tree_fit, tmp_path / "comparison")
    assert report["model_artifacts"]["lagged_poisson"] == rescored["model_artifacts"]["lagged_poisson"]
    for name in ("annual_2024", "january_august_2025"):
        assert report[name]["scores"]["lagged_poisson"] != rescored[name]["scores"]["lagged_poisson"]

    with (tree_fit / "annual.joblib").open("ab") as stream:
        stream.write(b"changed")
    with pytest.raises(ValueError, match="artifact does not match"):
        compare_counts.run(bundle, poisson_fit, tree_fit, tmp_path / "comparison")


def test_lagged_poisson_requires_a_real_gain_over_previous_year_for_promotion():
    from ml.train.lagged_poisson import adoption_status

    def scores(lagged, previous, original):
        return {"lagged_poisson": {"mae": lagged}, "previous_year": {"mae": previous}, "poisson": {"mae": original}}

    checkpoint = {"development_scores": scores(8, 10, 10)}
    assert not adoption_status(checkpoint, scores(9.9, 10, 12))["baseline_gate_passed"]
    assert not adoption_status(checkpoint, scores(8, 10, 7))["lagged_model_promoted_for_retrospective_research"]
    assert adoption_status(checkpoint, scores(8, 10, 9))["lagged_model_promoted_for_retrospective_research"]


def test_court_screen_separates_case_charge_background_and_missing_facts():
    pytest.importorskip("bs4")
    from ml.data.court_quality import group_status, screen

    supporting = (
        "The petitioner is accused in Crime No. 321 of 2022 and seeks regular bail. "
        "The offences alleged are punishable under Section 22 of the N.D.P.S. Act. "
    )
    factual = "The prosecution alleges that the police seized MDMA from the accused during the incident."
    unrelated = (
        "The petitioner seeks bail for Crime No. 321 of 2022, registered under the Indian Penal Code.\n\n"
        "In the case of a Supreme Court precedent, Section 37 of the NDPS Act was discussed."
    )
    assert screen(supporting + factual).status == "retain_evidence"
    assert screen(supporting.replace("punishable under", "punishable\n\nunder") + factual).status == "retain_evidence"
    assert screen(supporting + "The application was heard and the records were considered.").status == "relevant_charge_only"
    assert screen(unrelated).status == "exclude_supported_other_case"
    title_only = (
        "Before the Special Court for NDPS Act matters. "
        "The petitioner seeks regular bail for Crime No. 321 of 2022, registered under the Indian Penal Code. "
        "The prosecution says the petitioner gave a false declaration."
    )
    assert screen(title_only).status == "exclude_supported_other_case"
    assert group_status(["exclude_supported_other_case", "retain_evidence"]) == "unresolved"
    assert screen("NDPS").status == "unreadable"


def test_independent_court_precision_requires_resolved_review_pairs():
    pytest.importorskip("bs4")
    from ml.data.court_quality import audit_results

    def review(first, second):
        return dict(reviewer_a_relevance=first, reviewer_b_relevance=second)

    rows = [review("yes", "yes"), review("no", "no")]
    result = audit_results(rows)
    lower, upper = result["precision_wilson_95"]
    assert lower < result["precision"] == 0.5 < upper
    incomplete = audit_results([*rows, review("yes", "no"), review("yes", "")])
    assert incomplete["precision"] is None
    assert (incomplete["unresolved"], incomplete["pending"]) == (1, 1)
