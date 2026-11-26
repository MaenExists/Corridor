"""Locate a seizure from Malayalam text: datelines, case endings and police-station context.

Malayalam news summaries name the place in an inflected form ("പാനൂരിൽ", in
Panoor; "കൊല്ലത്ത്", in Kollam) or as a dateline ("കണ്ണപുരം: ..."). The English
geocoder in news_incidents.py cannot read them. This module:

* takes Malayalam names from the local OpenStreetMap place list and ties each
  to the same GeoNames or post-office point the English geocoder would use
  (same folded English name within 6 km, else the nearest point within 2 km), so
  located reports stay on the same set of reachable points;
* strips common case endings and restores the nominative (chillu letters,
  -ം for -ത്ത്, -യ- glides);
* ranks a dateline above a place followed by "police/excise/station", above a
  locative; bare names elsewhere are ignored (they may be people's names);
* never uses a place followed by "സ്വദേശി" (native of) or "താമസ" (residing):
  that is where someone lives, not where the seizure happened.

Names shared by several districts are resolved by a district named in the text
or the English headline, and skipped otherwise.
"""

from functools import lru_cache
import json
from pathlib import Path
import re

import numpy as np
from scipy.spatial import cKDTree

PLACES = Path("web/public/generated/places/kerala_places.json")
KINDS = ("city", "town", "suburb", "village", "neighbourhood", "hamlet", "locality", "junction")

CHILLU = {"ര": "ർ", "ല": "ൽ", "ന": "ൻ", "ള": "ൾ", "ണ": "ൺ"}
# Longest first. Each ending says how to rebuild the plain name from what is left.
ENDINGS = [
    ("യിൽനിന്ന്", "x"), ("ിൽനിന്ന്", "x"), ("ത്തുനിന്ന്", "x"), ("യിലേക്ക്", "x"), ("ിലേക്ക്", "x"),
    ("ത്തേക്ക്", "x"), ("യിലുള്ള", "a"), ("ിലുള്ള", "c"), ("ത്തുള്ള", "m"), ("യിലെ", "a"), ("ിലെ", "c"),
    ("ത്തെ", "m"), ("യിലും", "x"), ("ിലും", "x"), ("ത്തും", "x"), ("യിൽ", "a"), ("ിൽ", "c"), ("ത്ത്", "m"),
    ("വിൽ", "a"), ("വിലെ", "a"), ("ൽ", "a"),
]
# Endings marked "x" name where drugs came from or went to ("from X", "to X") or a list ("also in X"):
# not the seizure place, so such words are skipped.
ORIGIN = re.compile(r"^(നിന്ന്|നിന്നും|നിന്നു|നിന്നാണ്|വഴി)")
CONTEXT = re.compile(r"^(പൊലീസ്|പോലീസ്|എക്സൈസ്|സ്റ്റേഷൻ|സ്റ്റേഷനിൽ|റേഞ്ച്|ജംഗ്ഷൻ|ജങ്ഷൻ|ടൗൺ|ബസ്|റെയിൽവേ)")
RESIDENT = re.compile(r"^(സ്വദേശ|താമസ|നിവാസ)")
DISTRICT_ML = {
    "തിരുവനന്തപുരം": "Thiruvananthapuram", "കൊല്ലം": "Kollam", "പത്തനംതിട്ട": "Pathanamthitta", "ആലപ്പുഴ": "Alappuzha",
    "കോട്ടയം": "Kottayam", "ഇടുക്കി": "Idukki", "എറണാകുളം": "Ernakulam", "തൃശൂർ": "Thrissur", "തൃശ്ശൂർ": "Thrissur",
    "പാലക്കാട്": "Palakkad", "മലപ്പുറം": "Malappuram", "കോഴിക്കോട്": "Kozhikode", "വയനാട്": "Wayanad",
    "കണ്ണൂർ": "Kannur", "കാസർകോട്": "Kasaragod", "കാസർഗോഡ്": "Kasaragod",
}
DISTRICT_TOWNS = {"കൊച്ചി", "തൃശ്ശൂർ", "തൃശൂർ", "പാലക്കാട്", "കോഴിക്കോട്", "കണ്ണൂർ", "കോട്ടയം", "കൊല്ലം", "ആലപ്പുഴ",
                  "മലപ്പുറം", "പത്തനംതിട്ട", "ഇടുക്കി", "വയനാട്", "കാസർകോട്", "തിരുവനന്തപുരം", "എറണാകുളം"}
# Names that are also everyday words in a seizure story.
STOP = {"പൊലീസ്", "എക്സൈസ്", "കേരളം", "കേരള", "ജില്ല", "സംസ്ഥാനം", "നഗരം", "ടൗൺ", "റോഡ്", "സ്റ്റേഷൻ", "കോളേജ്",
        "സ്കൂൾ", "പാലം", "മാർക്കറ്റ്", "ബീച്ച്", "കടവ്", "പുഴ", "മല", "കുന്ന്", "ചന്ത", "പള്ളി", "അമ്പലം", "ബസ്"}


def normalise(text):
    for c, chillu in CHILLU.items():
        text = text.replace(c + "്‍", chillu)
    return text.replace("‍", "").replace("‌", "")


def nominatives(word):
    """Possible plain forms of an inflected Malayalam word, with how strongly the ending marks a place."""
    out = [(word, "plain")]
    for ending, rule in ENDINGS:
        if word.endswith(ending) and len(word) > len(ending) + 1:
            stem = word[:-len(ending)]
            if rule == "x":
                return []
            if rule == "c":
                last = stem[-1]
                if last in CHILLU:
                    out.append((stem[:-1] + CHILLU[last], "case"))
                out.append((stem + "്", "case"))
                out.append((stem, "case"))
            elif rule == "m":
                out.append((stem + "ം", "case"))
            else:
                out.append((stem, "case"))
            break
    return out


@lru_cache(maxsize=1)
def name_index():
    """Malayalam name -> [(point, district)] on the English geocoder's reachable points."""
    from ml.data.news_incidents import fold, place_index
    from ml.train import hotspot_grid as g
    # Only points the English geocoder itself can choose (the best option per name and district), so both
    # geocoders place reports on one shared set of points.
    points = {}
    for key, options in place_index().items():
        districts = {o["district"] for o in options}
        groups = [options] if len(districts) == 1 else [[o for o in options if o["district"] == d] for d in districts]
        for group in groups:
            o = max(group, key=lambda o: (o["population"], o["feature"].startswith("PPLA"), o["feature"] != "POSTAL"))
            points[(o["lat"], o["lon"])] = (fold(o["name"].split()[0]) if o["name"] else "", o)
    keys = list(points)
    xy = g.to_km([k[0] for k in keys], [k[1] for k in keys])
    tree = cKDTree(xy)
    data = json.loads(PLACES.read_text())
    index = {}
    for name, ml, kind, rank, lat, lon, district in data["places"]:
        if kind not in KINDS or not ml or not district:
            continue
        ml = normalise(ml.strip())
        if ml in STOP or len(ml) < 3:
            continue
        here = g.to_km([lat], [lon])[0]
        near = tree.query_ball_point(here, 6.0)
        target = fold(name.split()[0]) if name else ""
        same = [i for i in near if points[keys[i]][0] == target]
        if same:
            best = min(same, key=lambda i: np.hypot(*(xy[i] - here)))
        else:
            d, best = tree.query(here)
            if d > 2.0:
                continue
        o = points[keys[best]][1]
        entry = {"name": o["name"], "name_ml": ml, "district": district, "lat": o["lat"], "lon": o["lon"]}
        if entry not in index.setdefault(ml, []):
            index[ml].append(entry)
    return index


TOKEN = re.compile(r"[ഀ-ൿ]+")


def locate_malayalam(text, district_hint=None):
    """The seizure place named in Malayalam text, or None. Returns the reachable point and how it was found."""
    if not text:
        return None
    text = normalise(text)
    index = name_index()
    hint = district_hint or next((d for w, d in DISTRICT_ML.items() if w in text), None)
    tokens = [(m.group(0), m.start(), m.end()) for m in TOKEN.finditer(text)]
    dateline = re.match(r"\s*([ഀ-ൿ]+(?:\s[ഀ-ൿ]+)?)\s*:", text)
    best = None
    for k, (word, start, end) in enumerate(tokens):
        following = tokens[k + 1][0] if k + 1 < len(tokens) else ""
        if RESIDENT.match(following) or ORIGIN.match(following):
            continue
        for form, how in nominatives(word):
            if form in DISTRICT_ML or form in DISTRICT_TOWNS:
                break  # a district name gives a district, not a locality (as in the English geocoder)
            options = index.get(form)
            if not options:
                continue
            at_dateline = bool(dateline) and start < dateline.end()
            context = bool(CONTEXT.match(following))
            if how == "plain" and not (at_dateline or context):
                continue
            local = [o for o in options if hint and o["district"] == hint]
            options = local or options
            if len({o["district"] for o in options}) > 1:
                continue
            strength = 3 if at_dateline else 2 if context else 1
            rank = (strength, -k)
            if best is None or rank > best[0]:
                best = (rank, options[0], ("dateline", "context", "case")[3 - strength])
            break
    if best is None:
        return None
    _, o, how = best
    return {"place": o["name"], "district": o["district"], "precision": "locality", "lat": o["lat"], "lon": o["lon"],
            "via": f"malayalam {how}"}
