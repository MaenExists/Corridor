from datetime import date
from io import StringIO

import pytest

from ml.data.aggregate_intake import COLUMNS, as_of, read_releases

HEADER = ",".join(COLUMNS)
WEEK = "excise,seizure_events,Kottayam,week,2026-06-01,2026-06-07"


def load(*rows):
    return read_releases(StringIO("\n".join([HEADER, *rows])))


def test_later_release_does_not_change_earlier_snapshot():
    original = f"{WEEK},2026-06-09,complete,0"
    correction = f"{WEEK},2026-07-02,suppressed,"
    cutoff = date(2026, 6, 30)
    snapshot = as_of(load(correction, original), cutoff)
    assert snapshot == as_of(load(original), cutoff)
    assert next(iter(snapshot.values())).count == 0
    revised = as_of(load(correction, original), date(2026, 7, 2))
    assert next(iter(revised.values())).status == "suppressed"
    assert next(iter(revised.values())).count is None


@pytest.mark.parametrize(
    ("row", "message"),
    [
        (f"{WEEK},2026-06-06,complete,0", "Invalid reporting period or release date"),
        (f"{WEEK},2026-06-10,partial,0", "Leave count blank"),
        (f"{WEEK},2026-06-10,complete,", "needs a nonnegative integer"),
        (
            "excise,seizure_events,Kottayam,month,2026-06-01,2026-06-29,2026-06-30,complete,4",
            "Invalid reporting period or release date",
        ),
    ],
)
def test_rejects_rows_that_could_imply_false_coverage(row, message):
    with pytest.raises(ValueError, match=message):
        load(row)


def test_conflicting_same_day_versions_are_rejected():
    with pytest.raises(ValueError, match="Duplicate period and release date"):
        load(f"{WEEK},2026-06-09,complete,2", f"{WEEK},2026-06-09,complete,0")
