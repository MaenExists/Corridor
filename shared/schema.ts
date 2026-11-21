export interface Geo {
  name: string | null;
  geo_precision: "district" | "place" | "unknown";
  uncertainty_km: number | null;
}
export interface Source { source_type: string; ref: string; available_date: string | null }
export interface Case {
  case_id: string; source_ref: Source[]; agency: string | null; evidence_status: string;
  independent_corroboration: boolean; event_date: string | null; first_available_date: string | null;
  verified_date: string | null; withdrawn: boolean; correction_history: Record<string, unknown>[];
  district: string | null; seizure_location: Geo; origin: Geo; destination: Geo; transit_points: Geo[];
  substance_category: string | null; quantity: number | null; unit: string | null; original_unit: string | null;
  transport_mode: string | null; linked_case_ids: string[]; source_permissions: string;
  coverage_definition: string; revisions: Record<string, unknown>[]; extraction_date: string | null;
  synthetic: boolean; source_type: string; date_basis: string; movement_available_date: string | null;
}
export interface Forecast {
  prediction_date: string; information_cutoff: string; window_start: string; window_end: string;
  horizon_days: 7 | 28; area: string | null; connection: [string, string] | null; transport_context: string | null;
  target: string; estimate: number | null; interval: [number, number] | null; uncertainty_note: string;
  supporting_patterns: string[]; recent_verified_cues: Record<string, unknown>[];
  source_availability: string; coverage_gaps: string[]; model_version: string;
  synthetic: boolean; abstained: boolean; abstain_reason: string | null;
}
