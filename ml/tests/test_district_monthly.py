"""District-month model checks on a fictional panel."""

from datetime import date

import numpy as np

from ml.train import district_monthly as model


def fictional_panel(months=48, seed=7):
    rng = np.random.default_rng(seed)
    shares = rng.dirichlet(np.full(14, 5.0))
    level = 500 * (1 + 0.2 * np.sin(np.arange(months) * 2 * np.pi / 12))
    counts = rng.poisson(level[:, None] * shares[None, :]).astype(float)
    starts = [model.add_months(date(2016, 1, 1), step) for step in range(months)]
    return model.Panel(starts, counts)


def test_share_state_mean_preserves_statewide_level_without_seasonality():
    panel = fictional_panel()
    mean = model.share_state_mean(panel, 30, 1, shrink=None)
    assert np.isclose(mean.sum(), panel.state[30])
    assert np.isclose(model.smoothed_share(panel, 30, 0.3).sum(), 1)


def test_replay_ignores_outcomes_after_each_origin():
    panel = fictional_panel()
    window = (panel.months[30], panel.months[35])
    before = model.replay(panel, 1, *window)
    changed = panel.counts.copy()
    changed[36:] *= 5
    after = model.replay(model.Panel(panel.months, changed), 1, *window)
    assert [row["pred"] for row in before] == [row["pred"] for row in after]
    assert [row["interval"] for row in before] == [row["interval"] for row in after]


def test_intervals_widen_with_dispersion():
    narrow = model.interval(40.0, 0.0)
    wide = model.interval(40.0, 0.1)
    assert narrow[0] >= wide[0] and narrow[1] <= wide[1]
    assert model.dispersion([(10.0, 10.0)] * 5) is None
