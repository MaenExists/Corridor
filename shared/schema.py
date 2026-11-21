from typing import Literal, TypedDict


class Geo(TypedDict):
    name: str | None
    geo_precision: Literal["district", "place", "unknown"]
    uncertainty_km: float | None


class Source(TypedDict):
    source_type: str
    ref: str
    available_date: str | None


class Case(TypedDict):
    case_id: str
    source_ref: list[Source]
    agency: str | None
    evidence_status: str
    independent_corroboration: bool
    event_date: str | None
    first_available_date: str | None
    verified_date: str | None
    withdrawn: bool
    correction_history: list[dict]
    district: str | None
    seizure_location: Geo
    origin: Geo
    destination: Geo
    transit_points: list[Geo]
    substance_category: str | None
    quantity: float | None
    unit: str | None
    original_unit: str | None
    transport_mode: str | None
    linked_case_ids: list[str]
    source_permissions: str
    coverage_definition: str
    revisions: list[dict]
    extraction_date: str | None
    synthetic: bool
    source_type: str
    date_basis: str
    movement_available_date: str | None


class Forecast(TypedDict):
    prediction_date: str
    information_cutoff: str
    window_start: str
    window_end: str
    horizon_days: int
    area: str | None
    connection: tuple[str, str] | None
    transport_context: str | None
    target: str
    estimate: float | None
    interval: list[int] | None
    uncertainty_note: str
    supporting_patterns: list[str]
    recent_verified_cues: list[dict]
    source_availability: str
    coverage_gaps: list[str]
    model_version: str
    synthetic: bool
    abstained: bool
    abstain_reason: str | None
