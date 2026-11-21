from datetime import date
import numpy as np
from ml.data.real_input import sanitise
from ml.features.build import Dataset, movement


def fake_news():
    case = sanitise({"event_date": "2024-01-01", "publish_date": "2024-01-04", "district": "Kannur",
                     "event_id": "fixture", "source_url": "https://example.invalid/a"}, "news", b"test")
    return {**case, "source_type": "fixture", "source_ref": [{**s, "source_type": "fixture"} for s in case["source_ref"]],
            "synthetic": True}


def test_cutoff_and_unverified_cues_leave_every_feature_unchanged():
    before = date(2024, 1, 3)
    payload = {"synthetic": True, "cases": [], "as_of": "2024-02-01"}
    pending = {"synthetic": True, "status": "new", "event_date": "2024-01-01", "district": "Kannur"}
    after = {**pending, "status": "verified", "verified_at": "2024-01-04T10:00:00Z"}
    a = Dataset(payload, True).features("area", "Kannur", before, 7)
    ds = Dataset({**payload, "cases": [fake_news()]}, True, [pending, after])
    b = ds.features("area", "Kannur", before, 7)
    assert np.array_equal(a["x"], b["x"], equal_nan=True)
    assert a["baselines"] == b["baselines"] and b["cues"] == []
    assert len(ds.features("area", "Kannur", date(2024, 1, 4), 7)["cues"]) == 1
    assert a["abstain_reason"] == "coverage unknown"


def test_judgment_and_documented_movement_require_later_availability():
    c = sanitise({"event_date": "2024-01-01", "judgment_date": "2024-03-03", "district": "Kannur",
                  "origin_place": "Karnataka", "destination_place": "Kannur", "source_url": "https://example.invalid/a"},
                 "court", b"test")
    assert c["first_available_date"] == "2024-03-03"
    ds = Dataset({"synthetic": False, "cases": [c], "as_of": "2024-04-01"}, False)
    assert ds.features("area", "Kannur", date(2024, 2, 2), 7)["history_count"] == 0
    assert ds.features("area", "Kannur", date(2024, 4, 1), 7)["history_count"] == 1
    assert movement(c, date(2024, 2, 2)) is None
    assert movement(c, date(2024, 4, 1)) == ("Karnataka", "Kannur")
    assert movement({**c, "source_ref": [], "relation": "infrastructure hypothesis"}, date(2024, 4, 1)) is None
