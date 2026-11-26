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
  missing: string[];
};
