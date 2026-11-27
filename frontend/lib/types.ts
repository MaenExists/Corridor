import type { ConcernSummary } from "./tipRules";

export type Level = "high" | "elevated" | "watch";

export type WatchPlace = {
  id: string;
  name: string;
  area: string;            // "Kunnathunad, Ernakulam"
  district: string;
  lat: number;
  lon: number;
  level: Level;
  rank: number;
  squares: number;         // 1 km squares flagged around this place
  reportsYear: number;
  reportsMonth: number;
  why: string[];           // plain-language reasons
  expected: number | null; // reports expected around it in the next four weeks (calibrated model), if available
  kind: string | null;     // hotspot type, if the place sits in a labelled cluster
};

export type Cell = { lat: number; lon: number; level: Level; place: string };

export type HotspotKind = {
  id: string;
  name: string;
  area: string;
  district: string;
  lat: number;
  lon: number;
  kinds: string[];
  reports: number;
  recentShare: number;
  bigHaulShare: number;
  syntheticShare: number;
  borderKm: number;
};

export type Gateway = { id: string; name: string; lat: number; lon: number; activeNearby: number };

export type DistrictRow = {
  name: string;
  latestMonth: string;
  latest: number;
  usual: number;           // mean month in the last complete year
  change: number;          // latest / usual - 1
  years: { year: number; total: number }[];
};

export type Record = {
  cutoff: string;
  through: string;
  caught: number;
  total: number;
  repeatShare: number;
  populationShare: number;
  months: { month: string; caught: number; total: number }[];
  topTwenty: number;
  topTwentyHit: number;
  newPlaces: number;
  newCaught: number;
  /** The v1 list's figures on the same check, when v3 is the served list. */
  previous?: { caught: number; newCaught: number };
};

/** A learned hotspot profile (pattern engine v2): recurring surroundings of reported seizures. */
export type Profile = {
  id: string;
  name: string;
  traits: { text: string; here?: number; typical?: number; here_km?: number; typical_km?: number }[];
  reports: number;
  share: number;
  squares: number;
  examples: { name: string; district: string; lat: number; lon: number; reports: number }[];
};

/** A space-time cluster where reports are recent more often than the area's history explains. */
export type Rising = {
  id: string; name: string; district: string; lat: number; lon: number;
  radiusKm: number; windowDays: number; observed: number; expected: number; ratio: number; p: number;
};

/** A place with no report within 2 km that resembles where seizures are reported (new-place watch). */
export type LookAlike = {
  id: string; name: string; district: string; lat: number; lon: number; rank: number; squares: number;
  profile: string | null; kmToReport: number; reportsAround: number;
};

export type PatternsV2 = {
  asOf: string;
  profiles: Profile[];
  rising: Rising[];
  lookAlike: LookAlike[];
  lookAlikeCells: [number, number][];
  model: string;
  adopted: boolean;
  share: number;
  /** Fresh-list hit rates (new places) and top-1% hit rates per window, for the chosen model and its rivals. */
  evaluation: { stage: string; label: string; fresh: { [model: string]: number }; all: { [model: string]: number }; newPlaces: number;
    scanLift: number | null; busiestLift: number | null }[];
};

export type Ledger = {
  firstIssue: string | null;
  scored: number;
  scoredPreRegistered: number;
  pending: number;
  nextDue: string | null;
  total: { reports: number; grid: number; repeat: number; freshReports: number; watch: number; population: number };
};

export type EnforcementView = {
  asOf: string;
  horizonDays: number;
  freshness: { source: string; latest: string }[];
  reportsUsed: number;
  places: WatchPlace[];
  cells: Cell[];
  kinds: HotspotKind[];
  gateways: Gateway[];
  surroundings: { label: string; times: number }[];
  districts: DistrictRow[];
  districtForecast: { status: string; note: string };
  weekly: number[];
  record: Record | null;
  concern: ConcernSummary;
  v2: PatternsV2 | null;
  ledger: Ledger | null;
  /** The served model's measured skill on the most recent scored window (top-20 precision), if available. */
  skill: { top20: number; top1pct: number; window: string } | null;
  missing: string[];
};

export type Centre = {
  id: string;
  name: string;
  government: boolean;
  beds: number | null;
  bedsAreTotal: boolean;   // the register printed only a whole-establishment figure
  district: string;
  lat: number;
  lon: number;
  basis: string;
};

export type FarPlace = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lon: number;
  peopleFar: number;
  averageKm: number;
};

export type Grade = "high" | "elevated" | "some";

/** A drug-affected place far from help: grouped affected squares more than 10 km from a centre. */
export type NeedPlace = {
  id: string;
  name: string;
  nameMl: string;
  district: string;
  lat: number;
  lon: number;
  grade: Grade;
  casesYear: number;       // estimated recorded drug cases a year in its squares, rounded to tens
  people: number;
  averageKm: number;
};

export type DistrictAccess = {
  name: string;
  population: number;
  shareOver10: number;
  shareOver20: number;
  centres: number;
  bedsPer100k: number;
  casesYear: number | null;
  casesPer100k: number | null;
  shareCasesFar: number | null;   // share of its recorded drug cases placed more than 10 km from a centre
  affectedFarPeople: number | null;
};

export type NeedSummary = {
  casesYear: number;
  shareCasesFar: number;
  affectedPeople: number;
  affectedFarPeople: number;
  affectedFarShare: number;
  periods: { police: string; excise: string };
};

export type PublicView = {
  builtOn: string;
  checkedOn: string;
  shareOver10: number;
  peopleOver10: number;
  population: number;
  centresLocated: number;
  centresUnlocated: number;
  centres: Centre[];
  far: FarPlace[];
  need: NeedSummary | null;
  needPlaces: NeedPlace[];
  districts: DistrictAccess[];
  limits: string[];
  missing: string | null;
};
