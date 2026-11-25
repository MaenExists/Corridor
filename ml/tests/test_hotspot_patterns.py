"""Pattern-layer checks on simulated cells and fictional incidents."""

import numpy as np

from ml.data import news_incidents as news
from ml.train import hotspot_patterns as patterns


def test_risk_terrain_recovers_a_known_relative_risk():
    rng = np.random.default_rng(5)
    n = 20000
    near_station = rng.uniform(0, 10, n)
    far = rng.uniform(3, 10, n)
    population = np.full(n, 1000.0)
    rate = 0.05 * np.where(near_station < 0.5, 4.0, 1.0)
    counts = rng.poisson(rate)
    terrain = patterns.RiskTerrain({"railway_station": near_station, "college": far}, population).fit(counts)
    factors = {(f["factor"], tuple(f["band_km"])): f["relative_risk"] for f in terrain.factors(counts) if "band_km" in f}
    empirical = counts[near_station < 0.5].mean() / counts[near_station >= 0.5].mean()
    assert abs(factors[("railway_station", (0.0, 0.5))] - empirical) < 0.3 and 3.0 < empirical < 5.0
    assert 0.7 < factors[("college", (0.0, 0.5))] <= 1.3  # no cells there, no signal


def test_drug_family_and_largest_quantity_are_read_from_text():
    assert news.drug_and_quantity("two-held-with-2-kg-ganja", "") == ("cannabis", 2000.0)
    assert news.drug_and_quantity("youth-held", "Police seized 20 grams of MDMA and 1.5 kg ganja.") == ("synthetic", 1500.0)
    assert news.drug_and_quantity("drugs-seized", "") == ("other", None)


def _events(points, days):
    xy = np.array(points, float)
    return {"t": np.array(days, float), "loc": np.arange(len(points)), "locations_xy": xy}


def test_cluster_rules_label_a_border_haul_cluster_as_entry_gateway():
    events = _events([[0, 0], [0.5, 0.2], [0.2, 0.6], [50, 50]], [10, 20, 30, 40])
    near_border = {name: 50.0 for name in ("land_border", "border_gateway", "airport", "port", "national_highway",
                                            "railway_line", "railway_station", "college", "resort_homestay",
                                            "tourist_site", "log_population_5km")}
    near_border.update(border_gateway=3.0, land_border=2.0, log_population_5km=10.0)
    found = patterns.clusters(events, 100, lambda xy: near_border, [5000.0, 2000.0, 10.0, None],
                              ["cannabis"] * 4)
    assert len(found) == 1 and found[0]["reports"] == 3
    assert "entry gateway" in found[0]["types"] and "emerging" in found[0]["types"]


def test_new_place_mask_excludes_cells_near_earlier_reports():
    class Grid:
        xy = np.array([[0.0, 0.0], [1.0, 0.0], [10.0, 0.0]])
        size = 3
    events = _events([[0, 0]], [5])
    assert patterns.new_place_mask(events, 10, Grid()).tolist() == [False, False, True]
    assert patterns.new_place_mask(events, 1, Grid()).tolist() == [True, True, True]
