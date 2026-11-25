"""Where-next simulation checks on a fictional panel."""

import numpy as np

from ml.train import district_where as where
from ml.tests.test_district_monthly import fictional_panel


def test_probabilities_are_consistent():
    panel = fictional_panel(months=36)
    rows = where.brief(panel, 35)
    assert len(rows) == 14
    assert abs(sum(row["p_top4"] for row in rows) - where.TOP_K) < 0.01
    assert all(0 <= row["p_hot"] <= 1 and row["range_80"][0] <= row["range_80"][1] for row in rows)


def test_replay_ignores_later_outcomes():
    panel = fictional_panel(months=40)
    window = (panel.months[30], panel.months[34])
    before = where.replay(panel, *window)
    changed = panel.counts.copy()
    changed[35:] *= 4
    after = where.replay(type(panel)(panel.months, changed), *window)
    for first, second in zip(before, after):
        assert np.array_equal(first["prob"]["hot"], second["prob"]["hot"])
