from datetime import date
from pathlib import Path

import numpy as np
import pytest

from ml.train import hotspot_grid as g

needs_data = pytest.mark.skipif(not g.INCIDENTS.exists() or not Path("ml/data/real/public_sources/prepared/hotspot_grid/news_prominence.npz").exists(),
                                reason="local incidents and news prominence not built")


@needs_data
def test_features_ignore_everything_after_the_origin():
    from ml.train.hotspot_v3 import State
    s = State()
    o = g.day_number(date(2024, 6, 3))
    before = s.features(o)
    # Push every later report and story far into the future: features at o must not move.
    s.t[:] = np.where(s.t >= o, s.t + 5000, s.t)
    s.events["t"] = s.t
    s.pair_day = s._first(s.ev * 100000 + s.t.astype(int))
    s.pair_source = s._first(s.ev * 100 + s.source)
    s.p_day = np.where(s.p_day >= o, s.p_day + 5000, s.p_day)
    assert np.allclose(before, s.features(o), equal_nan=True)


@needs_data
def test_every_located_report_is_reachable():
    from ml.train.hotspot_v3 import Candidates
    grid = g.Grid()
    cand = Candidates(grid)
    cells = g.event_cells(grid, g.load_events())
    assert (cand.pos[cells] >= 0).all()
    assert cand.n < 0.2 * grid.size
