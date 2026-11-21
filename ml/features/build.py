"""Every input with a knowledge date passes an explicit as-of boundary."""
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
import csv
import json
import math
import numpy as np
from ml.data.real_input import DISTRICTS, PRIVATE

CFG = json.loads(Path("ml/config.json").read_text())
LAGS = (7, 14, 28, 56, 90)
GROUPS = ("cannabis", "mdma", "methamphetamine", "opioid")


def d(value):
    return date.fromisoformat(value[:10])


def known(value, cutoff):
    if not value:
        return False
    return value <= cutoff.isoformat() if "T" not in value else value[:10] <= cutoff.isoformat()


def visible_cases(cases, cutoff):
    for row in cases:
        if not (known(row["first_available_date"], cutoff) and known(row["event_date"], cutoff)):
            continue
        edits = [e for e in row.get("correction_history", ()) if known(e.get("effective_at"), cutoff)]
        if any(e.get("kind") == "withdrawal" for e in edits):
            continue
        if row.get("withdrawn") and not row.get("correction_history"):
            continue
        q = row.get("quantity")
        for e in edits:
            if q is not None and e.get("kind") == "quantity revised":
                q *= e["multiplier"]
        yield {**row, "quantity": q} if q != row.get("quantity") else row


def movement(row, cutoff):
    """Infrastructure never enters here, and a later court route can't backfill features."""
    if not known(row.get("movement_available_date"), cutoff):
        return None
    if not row["synthetic"] and not any(s["source_type"] == "court" and known(s["available_date"], cutoff)
                                        for s in row["source_ref"]):
        return None
    a, b = row["origin"]["name"], row["destination"]["name"]
    return (a, b) if a and b and a != b else None


def visible_cues(cues, cutoff):
    return [c for c in cues if c.get("status") == "verified" and c.get("synthetic") is True
            and known(c.get("verified_at"), cutoff) and known(c.get("event_date"), cutoff)]


def campaigns_from(path):
    if not path.exists():
        return []
    result = []
    with path.open(newline="") as f:
        for r in csv.DictReader(f):
            try:
                start, end = d(r["start"]), d(r["end"])
                if r["scope"] in (*DISTRICTS, "Kerala") and r["source_note"].strip() and start <= end:
                    result.append((start, end, r["scope"]))
            except (KeyError, ValueError, TypeError):
                continue
    return result


def campaign_on(campaigns, district, start, end):
    return any(a <= end and b >= start and scope in (district, "Kerala") for a, b, scope in campaigns)


def official_from(path):
    if not path.exists():
        return {}
    result = {}
    with path.open(newline="") as f:
        for row in csv.DictReader(f):
            try:
                both = [int(row[k]) for k in ("ndps_cases_police", "ndps_cases_excise")]
                retrieved = d(row["retrieved_on"])
                if min(both) >= 0 and sum(both) > 0 and row["source_url"].startswith(("http://", "https://")):
                    result[(row["district"], int(row["year"]))] = (sum(both), retrieved)
            except (KeyError, ValueError, TypeError):
                pass
    return result


class Dataset:
    def __init__(self, payload, synthetic, cues=(), official=None, campaigns=None, cfg=None):
        if payload.get("synthetic") is not synthetic or any(r.get("synthetic") is not synthetic for r in payload["cases"]):
            raise ValueError("Track isolation guard: unexpected record provenance")
        from shared.schema import Case
        family = {"fixture"} if synthetic else {"news", "court"}
        if any(set(r) != Case.__required_keys__ or r["source_type"] not in family
               or any(s.get("source_type") not in family for s in r["source_ref"]) for r in payload["cases"]):
            raise ValueError("Only canonical documented case inputs can enter features")
        self.synthetic = synthetic
        self.cfg = cfg or CFG
        self.as_of = d(payload["as_of"])
        self.trim = d(payload.get("exclude_on_or_after", (self.as_of + timedelta(days=1)).isoformat()))
        self.start = d(payload.get("start", "2023-11-13"))
        self.cases = payload["cases"]
        self.coverage = payload.get("coverage", {}) if synthetic else {}
        self.cues = cues if synthetic else ()
        self.official = {} if synthetic else (official or {})
        self.campaigns = campaigns or []
        self.cache = {}

    def accepted(self, row):
        floor = self.cfg["minimum_quantity_grams"]
        return not floor or (row.get("quantity") is not None and row["quantity"] >= floor)

    def snapshot(self, cutoff):
        if cutoff in self.cache:
            return self.cache[cutoff]
        area, corridors, sources = defaultdict(list), defaultdict(list), {}
        # Metadata-only source volume keeps the reporting denominator separate from case inclusion.
        for r in self.cases:
            for source in r["source_ref"]:
                on = source["available_date"]
                key = (source["source_type"], source["ref"])
                if known(on, cutoff) and (key not in sources or on < sources[key]):
                    sources[key] = on
        for r in visible_cases(self.cases, cutoff):
            if not self.accepted(r) or d(r["event_date"]) >= self.trim:
                continue
            if r["district"]:
                area[r["district"]].append(r)
            key = movement(r, cutoff)
            if key:
                corridors[key].append(r)
        self.cache[cutoff] = area, corridors, [(k[0], d(v)) for k, v in sources.items()]
        return self.cache[cutoff]

    def ratio(self, district, year, cutoff=None):
        rec = self.official.get((district, year))
        if not rec:
            return None
        official_count, retrieved = rec
        watermark = cutoff or self.as_of
        year_end = date(year, 12, 31)
        if watermark < year_end or self.start > date(year, 1, 1) or self.trim <= year_end or (cutoff and retrieved > cutoff):
            return None
        area = self.snapshot(watermark)[0]
        return sum(d(r["event_date"]).year == year for r in area.get(district, ())) / official_count

    def groups(self, scope, cutoff):
        if scope == "area":
            return DISTRICTS
        return sorted(self.snapshot(cutoff)[1])

    def label(self, scope, key, cutoff, horizon):
        end = cutoff + timedelta(days=horizon)
        matured = end + timedelta(days=self.cfg["outcome_maturity_days"])
        if matured > self.as_of or end >= self.trim:
            raise ValueError("Target not mature or in incomplete period")
        areas, routes, _ = self.snapshot(matured)
        return sum(cutoff < d(r["event_date"]) <= end for r in (areas if scope == "area" else routes).get(key, ()))

    def features(self, scope, key, cutoff, horizon):
        areas, routes, source_days = self.snapshot(cutoff)
        is_area = scope == "area"
        district = key if is_area else key[1]
        rows = (areas if is_area else routes).get(key, ())
        dated = [(d(r["event_date"]), r) for r in rows if d(r["event_date"]) >= self.start]
        lags = [sum((cutoff - on).days < lag for on, _ in dated) for lag in LAGS]
        recent = [r for on, r in dated if (cutoff - on).days < 90]
        weights = [math.log1p(r["quantity"]) for r in recent if r["quantity"] is not None]
        mix = Counter(r["substance_category"] for r in recent)
        phase = cutoff.timetuple().tm_yday * 2 * math.pi / 365.25
        effort = np.nan  # no independently observed effort series in either model input
        cover = self.coverage.get(district) if self.synthetic else (self.ratio(district, cutoff.year - 1, cutoff) if is_area else None)
        fresh_sources = [k for k, on in source_days if 0 <= (cutoff - on).days < 30]
        previous = [k for k, on in source_days if 30 <= (cutoff - on).days < 60]
        source_shift = (abs(fresh_sources.count("court") / len(fresh_sources) -
                           previous.count("court") / len(previous)) if fresh_sources and previous else np.nan)
        cue_items = [c for c in visible_cues(self.cues, cutoff) if is_area and c.get("district") == district
                     and 0 <= (cutoff - d(c["verified_at"])).days < 28]
        recent_support = sum((cutoff - on).days < self.cfg["recent_support_days"] for on, _ in dated)
        weeks = max(0, (min(cutoff, self.trim - timedelta(days=1)) - self.start).days // 7)
        route_weeks = 1 + (cutoff - min(on for on, _ in dated)).days // 7 if dated else 0
        covered_weeks = weeks if is_area and cover is not None else route_weeks if cover is not None else 0
        support_reason = None
        if not is_area and len(dated) < self.cfg["corridor_min_cases"]:
            support_reason = "fewer documented cases than the connection threshold"
        elif cover is None:
            support_reason = "coverage unknown"
        elif cover < self.cfg["synthetic_min_coverage" if self.synthetic else "real_min_coverage_ratio"]:
            support_reason = "coverage below threshold"
        elif covered_weeks < self.cfg["min_covered_weeks"]:
            support_reason = "insufficient covered history"
        elif recent_support < self.cfg["min_recent_cases"]:
            support_reason = "insufficient recent documented cases"
        counts = Counter(on for on, _ in dated)
        last_n = self.cfg["last_n_days"]
        available_days = max(0, (cutoff - self.start).days + 1)
        last_avg = sum((cutoff - on).days < last_n for on, _ in dated) * horizon / min(last_n, available_days) if available_days else None
        prior = cutoff - timedelta(days=364)
        same = sum(counts[prior + timedelta(days=i)] for i in range(1, horizon + 1)) if prior >= self.start else None
        seasonal = []
        for years_back in range(1, available_days // 364 + 1):
            anchor = cutoff - timedelta(weeks=52 * years_back)
            for offset in (-28, -14, 0, 14, 28):
                ref = anchor + timedelta(days=offset)
                if ref >= self.start:
                    seasonal.append(sum(counts[ref + timedelta(days=i)] for i in range(1, horizon + 1)))
        bases = {"last_56_days": last_avg, "seasonal_naive": float(np.mean(seasonal)) if seasonal else None,
                 "same_period_last_year": same}
        break_warning = len(fresh_sources) >= max(10, 2 * len(previous)) or lags[2] >= max(7, 2 * (lags[3] - lags[2]))
        x = [*lags, *(c / n for c, n in zip(lags, LAGS)), math.sin(phase), math.cos(phase), cutoff.month,
             *(float(district == a) for a in DISTRICTS),
             *[mix[g] / max(1, len(recent)) for g in GROUPS],
             float(np.mean(weights)) if weights else np.nan, cover if cover is not None else np.nan, effort,
             len(fresh_sources), source_shift, int(campaign_on(self.campaigns, district, cutoff, cutoff)),
             len(cue_items), int(break_warning)]
        if not is_area:
            # Deterministically mapped one-hot origin; extra unseen categories share an unknown bin.
            from ml.data.real_input import PLACES
            origins = sorted(set(PLACES.values()) | {"North Gate (fictional)", "East Gate (fictional)", "South Gate (fictional)"})
            x += [float(key[0] == a) for a in origins]
        return {"x": x, "baselines": bases, "abstain_reason": support_reason, "coverage": cover,
                "recent": recent_support, "history_count": len(dated), "cues": cue_items,
                "break_warning": bool(break_warning), "source_total": len(fresh_sources), "lags": lags}


def load_dataset(track, cues=()):
    synthetic = track == "synthetic"
    if track not in ("real", "synthetic"):
        raise ValueError("Unknown track")
    from ml.data.synthetic import WEB
    path = WEB / "cases_synthetic.json" if synthetic else PRIVATE / "cases.json"
    return Dataset(json.loads(path.read_text()), synthetic, cues,
                   official_from(PRIVATE / "official_counts_TEMPLATE.csv") if not synthetic else None,
                   campaigns_from(PRIVATE / "campaigns.csv") if not synthetic else None)
