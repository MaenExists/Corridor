"""Grid hotspot checks on simulated events and fictional headlines."""

import math

import numpy as np

from ml.data import news_incidents as news
from ml.train import hotspot_grid as grid


def test_spelling_variants_fold_together():
    assert news.fold("Manjeswaram") == news.fold("Manjeshwar")
    assert news.fold("Kozhikode") == news.fold("Kolikode")


def test_seizure_headlines_are_selected_and_court_stories_are_not():
    assert news.is_seizure("two-youths-held-with-2-kg-ganja-at-example-town")
    assert news.is_seizure("mdma-worth-rs-5-lakh-seized")
    assert not news.is_seizure("hc-grants-bail-to-accused-in-ganja-case")
    assert not news.is_seizure("awareness-campaign-against-drugs-in-schools")
    assert not news.is_seizure("price-of-life-saving-drugs-rises")


def _index():
    entry = lambda name, district, lat: {"name": name, "district": district, "lat": lat, "lon": 76.0,
                                         "population": 0, "feature": "PPL"}
    return {
        news.fold("Exampura"): [entry("Exampura", "Kollam", 9.0)],
        news.fold("Twinvale"): [entry("Twinvale", "Kollam", 9.1), entry("Twinvale", "Kannur", 12.0)],
        news.fold("Kollam"): [entry("Kollam", "Kollam", 8.9)],
    }


def test_locality_beats_district_and_desk_resolves_shared_names():
    found = news.locate("man-held-with-ganja", "kerala", _index(), "KOLLAM: Exampura police arrested a man.")
    assert (found["place"], found["precision"]) == ("Exampura", "locality")
    shared = news.locate("youth-held-at-twinvale", "kerala", _index(), "")
    assert shared is None  # two districts, no hint
    hinted = news.locate("youth-held-at-twinvale-kollam", "kerala", _index(), "")
    assert (hinted["place"], hinted["lat"]) == ("Twinvale", 9.1)
    desk = news.locate("two-held-with-mdma", "kochi", _index(), "")
    assert desk["precision"] == "district_or_desk"


def test_out_of_state_headlines_are_dropped():
    assert news.locate("keralites-held-with-mdma-in-bengaluru", "kochi", _index(), "") is None


def test_syndicated_reports_merge_within_two_days():
    rows = [{"place": "Exampura", "published": "2024-01-01"}, {"place": "Exampura", "published": "2024-01-02"},
            {"place": "Exampura", "published": "2024-01-09"}]
    merged = news.dedupe(rows)
    assert [r["reports"] for r in merged] == [2, 1]


def _simulate_hawkes(rng, mu=0.5, theta=0.4, omega=0.1, sigma=1.5, days=1500):
    centres = rng.uniform(-40, 40, (30, 2))
    t = rng.uniform(0, days, rng.poisson(mu * days))
    xy = centres[rng.integers(0, 30, len(t))] + rng.normal(0, 2.0, (len(t), 2))
    queue = list(zip(t, xy))
    times, places = list(t), list(xy)
    while queue:
        t0, x0 = queue.pop()
        for _ in range(rng.poisson(theta)):
            t1 = t0 + rng.exponential(1 / omega)
            if t1 < days:
                x1 = x0 + rng.normal(0, sigma, 2)
                times.append(t1)
                places.append(x1)
                queue.append((t1, x1))
    order = np.argsort(times)
    return np.array(times)[order], np.array(places)[order]


def test_etas_em_recovers_triggering_on_simulated_data():
    rng = np.random.default_rng(3)
    t, xy = _simulate_hawkes(rng)
    fit = grid.fit_etas(t, xy, end_day=1500)
    assert 0.25 < fit["theta"] < 0.6
    assert 1 / 25 < fit["omega"] < 1 / 4
    assert 1.0 <= fit["sigma_km"] < 3.0


def test_ranking_counts_hits_in_flagged_area():
    score = np.arange(200, dtype=float)
    counts = np.zeros(200, int)
    counts[199] = 3  # in the top 1% (two cells)
    counts[0] = 1  # bottom cell
    result = grid.evaluate_ranking(score, counts, np.zeros(200))
    assert result["events"] == 4 and result["hits_0.01"] == 3
    assert math.isclose(grid.summarise([result], 200)["pai_0.01"], 75.0)


def test_summary_words_need_place_context_and_headline_district_wins():
    index = _index()
    index[news.fold("Prakashville")] = [{"name": "Prakashville", "district": "Kannur", "lat": 12.0, "lon": 75.5,
                                         "population": 0, "feature": "PPL"}]
    # A bare summary word in another district (likely a person's name) is ignored.
    found = news.locate("drugs-seized-in-kollam", "kerala", index, "Officials arrested Prakashville, 32.")
    assert found["precision"] == "district_or_desk" and found["district"] == "Kollam"
    # A summary locality with place context in the headline district is used.
    found = news.locate("drugs-seized-in-kollam", "kerala", index, "Arrested at Exampura on Monday.")
    assert found["place"] == "Exampura"
