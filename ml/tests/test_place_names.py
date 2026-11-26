import numpy as np

from ml.data.place_names import contains, landmark


def test_contains_square_with_hole():
    outer = np.array([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], dtype=float)
    hole = np.array([[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]], dtype=float)
    lon = np.array([1.0, 5.0, 11.0])
    lat = np.array([1.0, 5.0, 5.0])
    assert contains([[outer, hole]], lon, lat).tolist() == [True, False, False]


def test_landmarks_are_public_places_only():
    assert landmark({"railway": "station"}) == "railway station"
    assert landmark({"amenity": "bus_station"}) == "bus stand"
    assert landmark({"junction": "yes"}) == "junction"
    assert landmark({"building": "house"}) is None
    assert landmark({"amenity": "restaurant"}) is None
