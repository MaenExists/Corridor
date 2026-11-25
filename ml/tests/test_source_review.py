from datetime import date

import pytest

pytest.importorskip("bs4")

from ml.data.local_press import public_release_url
from ml.data.source_api import media_search, month_windows
from ml.data.source_review import balanced_news_sample, court_clauses, dates_mentioned, find_candidates


def test_place_and_date_candidates_require_an_event_clause():
    text = """<p>High Court of Kerala at Ernakulam on 1 March 2026.</p>
    <p>The judgment describes a seizure in Wayanad on 12 February 2024.</p>"""
    assert find_candidates(court_clauses(text)) == [
        {"place_mentions": ["Wayanad"], "date_mentions": ["2024-02-12"], "directional_phrases": []},
    ]


def test_district_direction_requires_movement_language():
    moving = find_candidates(["The report alleges transport from Palakkad to Thrissur on 03.01.2025."])
    merely_named = find_candidates(["The seizure was described by someone from Palakkad to a reader in Thrissur."])
    assert moving[0]["directional_phrases"] == [["Palakkad", "Thrissur"]]
    assert merely_named[0]["directional_phrases"] == []


def test_date_forms_and_partial_archive_month():
    assert dates_mentioned("12 മാർച്ച് 2025 and January 1, 2024; 31.02.2025") == {
        "2025-03-12", "2024-01-01",
    }
    assert list(month_windows(date(2024, 2, 28), date(2024, 3, 2))) == [
        (date(2024, 2, 28), date(2024, 2, 29)), (date(2024, 3, 1), date(2024, 3, 2)),
    ]


def test_news_pagination_deduplicates_provider_ids_and_bounds_dates():
    class Client:
        calls = 0

        def get(self, _, params):
            self.calls += 1
            if self.calls == 1:
                return {"stories": [{"id": "a", "url": "https://example.com/a", "publish_date": "2025-01-01"},
                                    {"id": "old", "url": "https://example.com/old", "publish_date": "2024-12-31"}],
                        "pagination_token": "second"}
            assert params["pagination_token"] == "second"
            return {"stories": [{"id": "a", "url": "https://example.com/a", "publish_date": "2025-01-01"}]}

    stories, status = media_search(Client(), "NDPS", date(2025, 1, 1), date(2025, 1, 31), {}, 2)
    assert set(stories) == {"a"}
    assert status == "complete_query"


def test_local_press_only_accepts_government_release_hosts():
    assert public_release_url("https://palakkad.keralapolice.gov.in/news-and-events/a")
    assert not public_release_url("https://palakkad.keralapolice.gov.in.example.net/a")
    assert not public_release_url("https://example.net@prd.kerala.gov.in/ml/node/123")


def test_district_search_hint_does_not_confirm_location_and_article_ids_survive():
    base = {
        "title": "Seized material reported by district police",
        "query_memberships": ["district_archive|Idukki|2025-01-01|2025-12-31"],
        "publish_date": "2025-01-04",
    }
    stories = [
        dict(base, id="a", url="https://example.com/story?id=1&utm_source=mail", media_name="One", query_memberships=[]),
        dict(base, id="b", url="https://example.com/story?id=1&utm_source=web", media_name="One"),
        dict(base, id="c", url="https://example.com/story?id=2", media_name="Two"),
    ]
    queue, mentions, named, distinct = balanced_news_sample(stories)
    assert distinct == len(queue) == 2
    assert not mentions and not named
    assert {row["story_reference"] for row in queue} == {"a", "c"}
    for item in queue:
        assert item["review_district"] == "Idukki"
        assert item["district_basis"] == "district_query_only"
        assert item["district_mention"] is None
        assert item["confirmed_seizure_district"] is None
