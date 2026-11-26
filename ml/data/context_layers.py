"""What surrounds each 1 km cell: places that may explain where seizures happen.

From an OpenStreetMap extract (Geofabrik southern India, ODbL), clipped to
Kerala plus a margin, this builds point and line layers and then a distance
from every grid cell to each layer:

* movement: railway stations, railway lines, national highways (trunk and
  motorway), main roads (primary), bus stations, airports, ports and harbours;
* entry: the inter-state land border (the state outline away from the coast)
  and gateways, i.e. points where main roads or railway lines cross that border;
* demand and venues: colleges and universities, schools, tourist attractions,
  resorts and homestays, liquor shops and bars;
* enforcement presence: police stations and Excise offices. These are kept
  separate because seizures are booked where officers are, so this factor
  measures effort, not drug activity;
* extended layers (pattern engine v2 only, 26 Nov 2026): hotels and lodges,
  beaches, ferry and boat jetties, fuel stations, toll plazas, industrial
  areas, marketplaces, and cinemas or malls. The frozen v1 pattern model keeps
  the original layers (V1_POINTS).

Places of worship and anything describing who lives where are deliberately
not layers.

The OSM file and derived layers stay local. Only the per-cell distance table
is used by the model.
"""

import json
import math
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from ml.data.public_intake import ROOT

OSM = ROOT / "geo" / "osm" / "southern-zone-latest.osm.pbf"
LAYERS = ROOT / "geo" / "osm" / "kerala_context_layers.json"
STATE = Path("web/public/geography/kerala-state.geojson")
BOX = (7.9, 74.6, 13.1, 77.7)  # south, west, north, east (Kerala with a margin for the border)
LAT0, LON0 = 10.5, 76.3
KX, KY = 111.32 * math.cos(math.radians(LAT0)), 110.57
LINE_STEP_KM = 0.25


def to_km(lat, lon):
    return np.column_stack([(np.asarray(lon) - LON0) * KX, (np.asarray(lat) - LAT0) * KY])


def inside_box(lat, lon):
    return BOX[0] <= lat <= BOX[2] and BOX[1] <= lon <= BOX[3]


POINT_RULES = {
    "railway_station": lambda t: t.get("railway") in ("station", "halt"),
    "bus_station": lambda t: t.get("amenity") == "bus_station",
    "airport": lambda t: t.get("aeroway") == "aerodrome" and t.get("aerodrome:type") != "military",
    "port": lambda t: (t.get("harbour") is not None or t.get("landuse") == "port" or t.get("industrial") == "port"
                       or t.get("seamark:type") in ("harbour",) or t.get("leisure") == "marina"),
    "college": lambda t: t.get("amenity") in ("college", "university"),
    "school": lambda t: t.get("amenity") == "school",
    "tourist_site": lambda t: t.get("tourism") in ("attraction", "viewpoint", "theme_park"),
    "resort_homestay": lambda t: t.get("tourism") in ("resort", "guest_house", "hostel")
    or t.get("leisure") == "resort",
    "liquor_outlet": lambda t: t.get("shop") == "alcohol" or t.get("amenity") in ("bar", "pub"),
    "police_station": lambda t: t.get("amenity") == "police",
    "excise_office": lambda t: "excise" in t.get("name", "").casefold(),
    "hotel_lodge": lambda t: t.get("tourism") in ("hotel", "motel"),
    "beach": lambda t: t.get("natural") == "beach",
    "ferry_jetty": lambda t: t.get("amenity") == "ferry_terminal",
    "fuel_station": lambda t: t.get("amenity") == "fuel",
    "toll_booth": lambda t: t.get("barrier") == "toll_booth",
    "industrial_area": lambda t: t.get("landuse") == "industrial",
    "marketplace": lambda t: t.get("amenity") == "marketplace",
    "cinema_mall": lambda t: t.get("amenity") == "cinema" or t.get("shop") == "mall",
}
V1_POINTS = ("railway_station", "bus_station", "airport", "port", "college", "school", "tourist_site",
             "resort_homestay", "liquor_outlet", "police_station", "excise_office")
LINE_RULES = {
    "national_highway": lambda t: t.get("highway") in ("motorway", "trunk"),
    "main_road": lambda t: t.get("highway") == "primary",
    "railway_line": lambda t: t.get("railway") == "rail" and t.get("service") is None,
    "coastline": lambda t: t.get("natural") == "coastline",
}


def extract():
    """One pass over the OSM extract: points (nodes and way centroids) and sampled lines inside the box."""
    import osmium

    points = {name: [] for name in POINT_RULES}
    lines = {name: [] for name in LINE_RULES}
    keys = ("railway", "highway", "amenity", "tourism", "natural", "aeroway", "harbour", "landuse", "industrial",
            "leisure", "shop", "office", "seamark:type", "barrier")
    processor = osmium.FileProcessor(str(OSM)).with_locations().with_filter(osmium.filter.KeyFilter(*keys))
    for obj in processor:
        tags = {tag.k: tag.v for tag in obj.tags}
        if obj.is_node():
            if not obj.location.valid() or not inside_box(obj.location.lat, obj.location.lon):
                continue
            for name, rule in POINT_RULES.items():
                if rule(tags):
                    points[name].append([round(obj.location.lat, 5), round(obj.location.lon, 5)])
        elif obj.is_way():
            try:
                coords = [(n.location.lat, n.location.lon) for n in obj.nodes if n.location.valid()]
            except osmium.InvalidLocationError:
                continue
            if not coords or not any(inside_box(*c) for c in coords):
                continue
            for name, rule in LINE_RULES.items():
                if rule(tags):
                    lines[name].append([[round(a, 5), round(b, 5)] for a, b in coords])
            for name, rule in POINT_RULES.items():
                if rule(tags):
                    lat = sum(c[0] for c in coords) / len(coords)
                    lon = sum(c[1] for c in coords) / len(coords)
                    points[name].append([round(lat, 5), round(lon, 5)])
    LAYERS.write_text(json.dumps({"points": points, "lines": lines}))
    return {k: len(v) for k, v in points.items()} | {k: len(v) for k, v in lines.items()}


def sample_line(coords, step=LINE_STEP_KM):
    """Points every `step` km along a polyline, in km coordinates."""
    xy = to_km([c[0] for c in coords], [c[1] for c in coords])
    out = [xy[0]]
    for a, b in zip(xy[:-1], xy[1:]):
        length = float(np.hypot(*(b - a)))
        n = max(1, int(length / step))
        out.extend(a + (b - a) * (i / n) for i in range(1, n + 1))
    return np.array(out)


def state_outline_km():
    geometry = json.loads(STATE.read_text())["geometry"]
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    rings = [np.array(ring) for polygon in polygons for ring in polygon]
    return np.vstack([sample_line([[lat, lon] for lon, lat in ring]) for ring in rings])


def land_border(layers):
    """Outline samples more than 3 km from the sea: the inter-state border."""
    outline = state_outline_km()
    coast = [sample_line(line) for line in layers["lines"]["coastline"] if len(line) > 1]
    if not coast:
        return outline
    distance = cKDTree(np.vstack(coast)).query(outline)[0]
    return outline[distance > 3.0]


def gateways(layers, border):
    """Where national highways, main roads or railway lines meet the land border, merged within 5 km."""
    tree = cKDTree(border)
    hits = []
    for name in ("national_highway", "main_road", "railway_line"):
        for line in layers["lines"][name]:
            if len(line) < 2:
                continue
            xy = sample_line(line)
            near = tree.query(xy)[0] < 0.6
            if near.any():
                hits.append(xy[near].mean(0))
    merged = []
    for point in hits:
        if all(np.hypot(*(point - m)) > 5.0 for m in merged):
            merged.append(point)
    return np.array(merged)


def cell_context(cell_xy, extended=False):
    """Distance in km from every cell to every layer (the v1 layers unless extended)."""
    layers = json.loads(LAYERS.read_text())
    columns = {}
    for name, coords in layers["points"].items():
        if not extended and name not in V1_POINTS:
            continue
        columns[name] = (cKDTree(to_km(*np.array(coords).T)).query(cell_xy)[0] if coords
                         else np.full(len(cell_xy), 99.0))
    for name in ("national_highway", "main_road", "railway_line"):
        samples = [sample_line(line) for line in layers["lines"][name] if len(line) > 1]
        columns[name] = cKDTree(np.vstack(samples)).query(cell_xy)[0]
    border = land_border(layers)
    columns["land_border"] = cKDTree(border).query(cell_xy)[0]
    gates = gateways(layers, border)
    columns["border_gateway"] = cKDTree(gates).query(cell_xy)[0] if len(gates) else np.full(len(cell_xy), 99.0)
    return {name: np.minimum(values, 99.0) for name, values in columns.items()}, gates


def layer_counts(cell_xy, radius_km, names=None):
    """How many features of each point layer lie within radius_km of every cell."""
    layers = json.loads(LAYERS.read_text())
    out = {}
    for name, coords in layers["points"].items():
        if names and name not in names or not coords:
            continue
        tree = cKDTree(to_km(*np.array(coords).T))
        out[name] = np.array([len(n) for n in tree.query_ball_point(cell_xy, radius_km)], dtype=np.float32)
    return out


if __name__ == "__main__":
    print(json.dumps(extract(), indent=1))
