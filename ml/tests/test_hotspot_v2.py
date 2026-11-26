import numpy as np

from ml.recovery.drug_burden import grade_cells
from ml.train.hotspot_v2 import scan


def synthetic_events(burst):
    """Steady background over three years at 30 places; optionally a burst of recent reports at place 0."""
    rng = np.random.default_rng(3)
    locations = rng.uniform(0, 200, size=(30, 2))
    t = list(rng.uniform(0, 1095, 300))
    loc = list(rng.integers(0, 30, 300))
    if burst:
        t += list(rng.uniform(1080, 1095, 8))
        loc += [0] * 8
    order = np.argsort(t)
    return {"t": np.array(t)[order], "loc": np.array(loc)[order], "locations_xy": locations}


def test_scan_finds_a_planted_burst_only():
    found = scan(synthetic_events(True), 1095.0, perms=99)
    assert found and np.allclose(found[0]["xy"], synthetic_events(True)["locations_xy"][0])
    assert found[0]["window_days"] == 28 and found[0]["observed"] >= 8
    assert scan(synthetic_events(False), 1095.0, perms=99) == []


def test_grades_follow_the_shares():
    area = np.arange(1000, dtype=float)
    populated = np.ones(1000, bool)
    populated[:100] = False
    grades, cuts = grade_cells(area, populated)
    assert (grades == "high").sum() == 90 and (grades == "elevated").sum() == 90 and (grades == "some").sum() == 90
    assert (grades[:100] == "low").all() and cuts["high"] > cuts["elevated"] > cuts["some"]
