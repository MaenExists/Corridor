from datetime import date, timedelta
from ml.evaluate.metrics import count_metrics, interval_coverage, top_k
from ml.evaluate.run import release_cell, split_dates, training_rows
from ml.features.build import Dataset


def test_metrics_by_hand():
    rows = [{"actual": 2, "pred": {"a": 1}, "key": "A", "interval": [0, 2]},
            {"actual": 0, "pred": {"a": 3}, "key": "B", "interval": [1, 4]}]
    got = count_metrics(rows, "a")
    assert got["mae"] == 2 and got["poisson_deviance"] == 3.3863
    assert top_k(rows, "a", 1)["events_missed"] == 2
    assert top_k(rows, "a", 1)["false_positives"] == 1 and interval_coverage(rows)["coverage"] == .5


def test_mature_training_labels_and_stage_gaps():
    cutoff = date(2024, 1, 1)
    a = {"origin": cutoff-timedelta(days=27), "eligible": True,
         "end": cutoff-timedelta(days=20), "label_known": cutoff+timedelta(days=1)}
    b = {**a, "label_known": cutoff}
    assert training_rows([a,b], cutoff) == [b]
    ds = Dataset({"synthetic": True, "cases": [], "as_of": "2026-11-21"}, True)
    sel, cal, final = split_dates(ds)
    assert sel[-1] + timedelta(days=49) <= cal[0] and cal[-1] + timedelta(days=49) <= final[0]
    assert len(final) == 14
    assert not release_cell(4, 20, 5) and not release_cell(9, 4, 5) and release_cell(5, 5, 5)
