"""Rebuild the local NASA basemap from two fixed, public Kerala map requests.

Optional maintenance only: uv run --no-project --with pillow --with numpy scripts/prepare-basemap.py
No application records, keys, user coordinates or search text are accepted.
"""
from io import BytesIO
from math import log, pi, tan
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
import numpy as np
from PIL import Image

BASE = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?"
R = 6378137
FRAME = (68.0, 6.3, 83.2, 15.1)
LAND_DETAIL = (72.4, 7.7, 80.1, 13.45)
FRAME_PIXELS = (2380, 1430)


def mercator(lat):
    return R * log(tan(pi / 4 + lat * pi / 360))


def photo(layer, bounds, size, time=None):
    west, south, east, north = bounds
    bbox = (R * west * pi / 180, mercator(south), R * east * pi / 180, mercator(north))
    query = {"SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.1.1", "LAYERS": layer,
             "STYLES": "", "SRS": "EPSG:3857", "BBOX": ",".join(f"{v:.1f}" for v in bbox),
             "WIDTH": size[0], "HEIGHT": size[1], "FORMAT": "image/jpeg"}
    if time:
        query["TIME"] = time
    with urlopen(BASE + urlencode(query), timeout=25) as source:
        img = Image.open(BytesIO(source.read(3_000_000))).convert("RGB")
    if img.size != size:
        raise ValueError("Unexpected basemap dimensions")
    return img


def main():
    ocean = photo("BlueMarble_ShadedRelief_Bathymetry", FRAME, FRAME_PIXELS)
    detail = photo("Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual", LAND_DETAIL, (1840, 1400), "2000-12-01")
    west, south, east, north = FRAME
    x = lambda lon: round(FRAME_PIXELS[0] * (lon - west) / (east - west))
    y = lambda lat: round(FRAME_PIXELS[1] * (mercator(north) - mercator(lat)) / (mercator(north) - mercator(south)))
    a, b, c, d = LAND_DETAIL
    box = (x(a), y(d), x(c), y(b))
    width, height = box[2]-box[0], box[3]-box[1]
    detail = detail.resize((width, height), Image.Resampling.LANCZOS)
    copied = ocean.copy()
    copied.paste(detail, box[:2])
    sea_base = np.asarray(ocean, dtype=np.float32)
    land_base = np.asarray(copied, dtype=np.float32)
    r, g, b = sea_base.transpose((2, 0, 1))
    water = np.clip((b - np.maximum(r, g) + 3) / 25, 0, 1)[..., None]
    empty = np.max(land_base, axis=-1)[..., None] < 20
    dx = np.minimum(np.arange(width), np.arange(width)[::-1])
    dy = np.minimum(np.arange(height), np.arange(height)[::-1])
    strength = np.zeros(sea_base.shape[:2], dtype=np.float32)
    strength[box[1]:box[3], box[0]:box[2]] = np.clip(np.minimum(dx[None, :], dy[:, None]) / 22, 0, 1) * .82
    blend = np.where(empty, 0, strength[..., None])
    land = blend * land_base + (1 - blend) * sea_base
    land = (land * [.42, .58, .51]) + [0, 4, 7]
    sea = sea_base * [.14, .29, .29] + [2, 9, 13]
    mosaic = np.clip((1 - water) * land + water * sea, 0, 255).astype(np.uint8)
    Image.fromarray(mosaic).save(Path("web/public/geography/kerala-satellite.webp"), quality=86, method=6)


if __name__ == "__main__":
    main()
