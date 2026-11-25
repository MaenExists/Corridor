"""Pair recorded detections with comparable enforcement effort for private review."""

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
import math

from scipy.stats import chi2

from ml.data.real_input import DISTRICTS
from ml.data.source_api import write_rows
from ml.data.training_prep import PREPARED, read_rows

EVIDENCE = (
    "district", "period_start", "period_end", "reported_window", "agency", "operation",
    "metric", "count", "unit", "published_on", "comparability", "source",
)
PAIRED_ROWS = (
    "district", "period_start", "period_end", "agency", "operation", "protocol",
    "effort_unit", "count", "status", "available_on", "forecast_influenced",
)
REVIEW_LOG = (
    "review_date", "district", "period_start", "period_end", "forecast_version",
    "forecast_influenced", "recorded_detections", "enforcement_effort", "effort_unit",
    "independent_care_metric", "independent_care_count", "coverage_status", "outcome_class",
)
HEALTH_METRICS = {"treatment_admissions", "helpline_calls"}
CARE_INPUT = (
    "district", "period_start", "period_end", "metric", "protocol", "referral_scope",
    "count", "status", "available_on",
)
HELP_SEEKING = {"self_referral", "self_or_family_referral", "self_initiated_helpline"}
EFFORT_UNITS = {"raids", "inspections", "checkpost_checks"}


@dataclass(frozen=True)
class MatchedEffort:
    district: str
    cases: int
    effort: int
    unit: str


def comparable_yield(detection, effort, cutoff):
    """Require two complete measures of one observation process at issuance."""
    keys = ("district", "period_start", "period_end", "agency", "operation", "protocol", "effort_unit")
    if any(not detection.get(key) or detection[key] != effort.get(key) for key in keys):
        return None
    if detection["effort_unit"] not in EFFORT_UNITS:
        return None
    for row in (detection, effort):
        if (row.get("status") != "complete" or row.get("forecast_influenced") != "no"
                or not row.get("available_on")):
            return None
        try:
            start, end, available = (date.fromisoformat(row[key]) for key in ("period_start", "period_end", "available_on"))
        except (TypeError, ValueError):
            return None
        if not start <= end <= available <= cutoff:
            return None
    try:
        cases, exposure = int(detection["count"]), int(effort["count"])
    except (KeyError, ValueError):
        return None
    if cases < 0 or exposure <= 0:
        return None
    return MatchedEffort(detection["district"], cases, exposure, effort["effort_unit"])


def yield_interval(observation, confidence=0.80):
    """Exact Poisson interval for observed cases per 100 actions of one kind."""
    tail = (1 - confidence) / 2
    lower = 0.0 if observation.cases == 0 else chi2.ppf(tail, 2 * observation.cases) / 2
    upper = chi2.ppf(1 - tail, 2 * (observation.cases + 1)) / 2
    return tuple(float(value * 100 / observation.effort) for value in (observation.cases, lower, upper))


def review_status(yield_band, care_direction, *, health_metric, independent, reference_rate):
    if yield_band is None:
        return "withheld_missing_comparable_effort"
    if (not independent or health_metric not in HEALTH_METRICS
            or care_direction not in {"higher", "lower", "similar"}):
        return "withheld_missing_independent_health"
    if not math.isfinite(reference_rate) or reference_rate < 0:
        raise ValueError("The yield reference must be a finite nonnegative rate.")
    _, lower, upper = yield_band
    if ((lower > reference_rate and care_direction == "lower")
            or (upper < reference_rate and care_direction == "higher")):
        return "uncertain_signals_disagree"
    if lower > reference_rate and care_direction == "higher":
        return "review_high_recorded_activity_relative_to_effort"
    return "uncertain_or_comparable_recorded_activity"


def eligible_care(row, cutoff):
    if (row["status"] != "complete" or not row["protocol"] or row["metric"] not in HEALTH_METRICS
            or row["referral_scope"] not in HELP_SEEKING):
        return False
    try:
        start, end, available = (date.fromisoformat(row[key]) for key in ("period_start", "period_end", "available_on"))
        return start <= end <= available <= cutoff and int(row["count"]) >= 0
    except (TypeError, ValueError):
        return False


def seasonal_reference(rows, start, end):
    try:
        old_start, old_end = start.replace(year=start.year - 1), end.replace(year=end.year - 1)
    except ValueError:
        return None
    return rows.get((old_start.isoformat(), old_end.isoformat()))


def care_signal(rows, location, start, end):
    directions = []
    for key, observations in rows.items():
        if key[0] != location or (start.isoformat(), end.isoformat()) not in observations:
            continue
        current = observations[(start.isoformat(), end.isoformat())]
        previous = seasonal_reference(observations, start, end)
        if previous is None:
            continue
        count = int(current["count"])
        prior = int(previous["count"])
        _, lower, upper = yield_interval(MatchedEffort(location, count, 100, "care"))
        direction = "higher" if lower > prior else "lower" if upper < prior else "similar"
        directions.append((current["metric"], direction))
    if not directions:
        return "", ""
    observed = {direction for _, direction in directions}
    if "higher" in observed and "lower" in observed:
        return "", "conflicting_care"
    return next((item for item in directions if item[1] != "similar"), directions[0])


def review_feedback_bucket(row):
    if row["forecast_influenced"] == "yes":
        return "forecast_influenced_separate"
    if row["forecast_influenced"] == "no" and row["coverage_status"] == "complete":
        return "independent_eligible"
    return "unknown_or_incomplete"


def prepare_effort(root=PREPARED, cutoff=date(2026, 6, 30)):
    for filename, header in (("detection_input.csv", PAIRED_ROWS), ("effort_input.csv", PAIRED_ROWS),
                             ("forecast_feedback_log.csv", REVIEW_LOG), ("independent_care_input.csv", CARE_INPUT)):
        path = root / filename
        if not path.exists():
            write_rows(path, header, [])

    keys = ("district", "period_start", "period_end", "agency", "operation", "protocol", "effort_unit")
    def keyed(filename):
        rows = read_rows(root / filename)
        index = {tuple(row[key] for key in keys): row for row in rows}
        if len(rows) != len(index):
            raise ValueError("Multiple rows share the same effort pairing key. Resolve revisions before pairing.")
        return index

    feedback_rows = read_rows(root / "forecast_feedback_log.csv")
    affected = {(row["district"], row["period_start"], row["period_end"]) for row in feedback_rows
                if review_feedback_bucket(row) != "independent_eligible"}
    efforts = keyed("effort_input.csv")
    matched = []
    panels = defaultdict(dict)
    for key, detection in keyed("detection_input.csv").items():
        if key[:3] in affected:
            continue
        if key in efforts and (observation := comparable_yield(detection, efforts[key], cutoff)):
            available = max(detection["available_on"], efforts[key]["available_on"])
            matched.append((*key, available, observation.cases, observation.effort, *yield_interval(observation)))
            district, start, end, *scope = key
            panels[(district, *scope)][(start, end)] = observation

    write_rows(root / "matched_effort_yield.csv", (
        *keys, "available_on", "recorded_detections", "enforcement_effort", "cases_per_100_actions", "lower_80", "upper_80",
    ), matched)
    care = defaultdict(dict)
    for row in read_rows(root / "independent_care_input.csv"):
        if eligible_care(row, cutoff):
            key = (row["district"], row["metric"], row["protocol"], row["referral_scope"])
            span = (row["period_start"], row["period_end"])
            if span in care[key]:
                raise ValueError("Resolve duplicate utilization observations before review.")
            care[key][span] = row

    statuses = []
    for key, observations in panels.items():
        district = key[0]
        for (a, b), observation in observations.items():
            start, end = date.fromisoformat(a), date.fromisoformat(b)
            reference = seasonal_reference(observations, start, end)
            metric, direction = care_signal(care, district, start, end)
            if direction == "conflicting_care":
                status = "uncertain_independent_care_signals_disagree"
            elif not metric:
                status = "withheld_missing_independent_health"
            elif reference is None:
                status = "withheld_missing_comparable_reference"
            else:
                status = review_status(
                    yield_interval(observation), direction, health_metric=metric,
                    independent=True, reference_rate=100 * reference.cases / reference.effort,
                )
            statuses.append((district, start, end, cutoff, *key[1:], status))
    backed = {row[0] for row in statuses}
    statuses.extend((district, "", "", cutoff, "", "", "", "", "withheld_missing_comparable_effort")
                    for district in DISTRICTS if district not in backed)
    write_rows(root / "district_effort_review_status.csv",
               ("district", "period_start", "period_end", "as_of", "agency", "operation", "protocol",
                "effort_unit", "review_status"), statuses)
    feedback = Counter(review_feedback_bucket(row) for row in feedback_rows)
    write_rows(root / "forecast_feedback_audit.csv", ("review_group", "observations"), sorted(feedback.items()))
    print(f"Enforcement-effort preparation: {len(matched)} supported count-and-effort pairs as of the cutoff.")


if __name__ == "__main__":
    prepare_effort()
