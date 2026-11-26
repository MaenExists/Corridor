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

export type DistrictAccess = {
  name: string;
  population: number;
  shareOver10: number;
  shareOver20: number;
  centres: number;
  bedsPer100k: number;
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
  districts: DistrictAccess[];
  limits: string[];
  missing: string | null;
};
