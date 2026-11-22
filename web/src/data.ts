import geography from "../../shared/geography.json";
import type { Case, Forecast } from "../../shared/schema";

export const OSM_STREET_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const DISTRICTS = Object.keys(geography.districts);
const coordinates = (data: Record<string, number[]>): Record<string, [number, number]> =>
  Object.fromEntries(Object.entries(data).map(([k, [lat, lon]]) => [k, [lat, lon]]));
export const CENTER = coordinates(geography.districts);
export const NODES = { ...CENTER, ...coordinates(geography.outside) };
export const NOTICE = "Estimates documented cases, not all drug movement. Not proof of wrongdoing. Not a sole basis for searches, arrests or enforcement.";
export const BANNER = "Proposed by the team. Not an official agency system. Decision support only.";
export const dateLabel = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
export interface Cases {
  synthetic: true; cases: Case[]; as_of: string; start: string;
  connections: [string, string][]; connections_label: string; coverage: Record<string, number>;
}
export interface Forecasts {
  synthetic: true; forecasts: Forecast[]; generated_at: string; data_cutoff: string;
  case_snapshot_through: string; run_id: string; coverage_threshold?: number;
}
export type Selection = { area: string } | { connection: [string, string] };
export interface Place {
  name: string; local_name: string | null; alias: string[]; district: string;
  lat: number; lon: number; source: number;
}
export interface Stat { n: number; mae: number | null; poisson_deviance: number | null }
export interface RangeStat { n: number; coverage: number | null; mean_width: number | null }
export type Scores = Record<string, Stat>;
export interface EvaluationTask {
  scope: "area" | "corridor"; horizon_days: 7 | 28; selected_method: string | null;
  winner: string | null; metrics: Scores; interval: RangeStat; top_k: number;
  ranking: Record<string, Record<string, number | null>>;
  locations: { location: string; metrics: Scores; baseline_beats_candidate: string[]; interval: RangeStat }[];
  abstention_reasons: Record<string, number | null>; window_count: number; issued_windows: number;
  monitoring: string[]; notice: string | null;
  replay: { date: string; scores: Scores; observations: number; interval: RangeStat }[];
}
export interface Coverage {
  districts: { location: string; cases: number | null; ratios: {year: number; ratio: number | null}[]; coverage: number | null }[];
  months: { month: string; articles: number | null; mix_change: boolean; possible_break: boolean; campaign: boolean }[];
  sources: string[]; minimum_quantity_grams: number; before_quantity_rule: number; after_quantity_rule: number;
  campaign_markers: number; effort: string; note: string;
}
export interface Evaluation { schema: string; synthetic: true; label: string; universe: string; generated_at: string;
  data_cutoff: string; outcome_maturity_days: number; nominal_interval: number; run_id: string;
  splits: { selection: string[]; calibration: string[]; final: string[] };
  feedback: string; tasks: EvaluationTask[]; coverage: Coverage }
export const METHODS: Record<string, string> = { poisson_gbm: "Poisson boosting", last_56_days: "Recent 56-day average",
  seasonal_naive: "Seasonal average", same_period_last_year: "Same period last year" };
export const methodName = (method: string | null) => method ? METHODS[method] || method : "Not scored";
export const pct = (v: number | null | undefined) => v == null ? "Not established" : `${Math.round(100 * v)}%`;
export async function localJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json() as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || "Local file is unavailable.");
  return body as T;
}
