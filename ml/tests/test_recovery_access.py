"""Recovery access map checks. Register text and places are fictional."""

import numpy as np

from ml.recovery import access_map

REGISTER = """
SL. Name of            Name & Address of the Applicant     Prov. Reg. No.    Psychiatrist    Date
01    Hope Example     The Director                        F/1/2025/SMHA Dr. Example A      27.05.2020 10     2     1    13 40    F
      Care Centre      Hope Example Care Centre
                       Sample.P.O, Town–695000,
                       Ph:0000-000000
02    River Example    The Secretary                       C/2/2025/SMHA Dr. Example B      19/03/2025   25   C
      Home             River Example Home, Village – 686 000
"""


def test_register_rows_keep_names_beds_and_pins():
    first, second = access_map.parse_register(REGISTER)
    assert first["name"] == "Hope Example Care Centre"
    assert (first["deaddiction_beds"], first["bed_figure"], first["register_category"]) == (13, "deaddiction_split", "F")
    assert first["pin"] == "695000"
    assert (second["deaddiction_beds"], second["bed_figure"], second["pin"]) == (25, "establishment_total", "686000")


def test_two_step_access_shares_beds_among_people_in_reach():
    lat = np.array([10.0, 10.0, 11.0])
    lon = np.array([76.0, 76.01, 76.0])
    population = np.array([50000.0, 50000.0, 10000.0])
    access = access_map.two_step_access(lat, lon, population, np.array([10.0]), np.array([76.0]), [20])
    assert np.allclose(access[:2], 20 / 100000 * 100000)
    assert access[2] == 0


def test_haversine_distance():
    assert abs(access_map.haversine(10.0, 76.0, 10.0, 76.0) - 0) < 1e-9
    assert 110 < float(access_map.haversine(10.0, 76.0, 11.0, 76.0)) < 112
