import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Cell, DistrictRow, EnforcementView, Gateway, HotspotKind, Level, WatchPlace } from "./types";

// Model outputs stay local and gitignored; the server reads them at request time.
const ROOT = process.env.NARCOTRACE_ROOT ?? path.join(process.cwd(), "..");
const GENERATED = path.join(ROOT, "web/public/generated/hotspots");
const PUBLIC = path.join(ROOT, "ml/data/real/public_sources");

const SOURCE: Record<string, string> = {
  nie: "New Indian Express", toi: "Times of India", asianet: "Asianet News", n18: "News18 Malayalam", onm: "Onmanorama",
};
const SURROUNDING: Record<string, string> = {
  railway_station: "a railway station", bus_station: "a bus station", national_highway: "a national highway",
  main_road: "a main road", railway_line: "a railway line", resort_homestay: "a resort or homestay",
  liquor_outlet: "a liquor outlet", school: "a school", college: "a college", tourist_site: "a tourist site",
  airport: "an airport", port: "a port or harbour", land_border: "the state border", border_gateway: "a border crossing",
};

async function json<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return null; }
}
async function csv(file: string): Promise<Record<string, string>[]> {
  try {
    const [head, ...lines] = (await readFile(file, "utf8")).trim().split(/\r?\n/);
    const keys = head.split(",");
    return lines.map(line => Object.fromEntries(line.split(",").map((v, i) => [keys[i], v])));
  } catch { return []; }
}

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const clean = (d?: string | null) => (d ?? "").replace(/ district$/i, "").replace(/ District$/, "").trim();

type GridCell = { rank: number; lat: number; lon: number; locality: string; taluk: string | null; district: string;
  reports_within_3km_28d: number; reports_within_3km_365d: number };
type Grid = { as_of: string; horizon_days: number; cells: GridCell[]; weekly_located_reports: number[];
  latest_report_by_source: Record<string, string>; located_reports_used: number;
  cutoff_check?: { cutoff: string; checked_through: string; post_cutoff_located_reports: number;
    total: { grid_ranker: number; new_place_reports: number; risk_terrain_watch: number };
    strict_hit_rate: Record<string, number>; top20_with_later_report: number;
    by_month: { month: string; located_reports: number; grid_ranker: number }[] } };
type Cluster = { lat: number; lon: number; locality: string; taluk: string | null; district: string; reports: number;
  types: string[]; recent_share: number; large_haul_share: number; synthetic_share: number; mean_km: Record<string, number> };
type Patterns = { clusters: Cluster[]; border_gateways: { lat: number; lon: number; near: string }[];
  risk_factors: { factor: string; band_km: [number, number]; relative_risk: number; kind: string }[] };

const KIND_REASON: Record<string, string> = {
  "entry gateway": "Sits in a cluster near a state-border crossing with large hauls.",
  "air or sea entry": "Sits in a cluster near an airport or port with large hauls.",
  "transit corridor": "Sits on a line of seizures along a highway or railway.",
  "retail market": "Sits in a dense town where small quantities keep being found.",
  "venue-linked": "Sits in a cluster close to resorts, tourist sites or colleges.",
  emerging: "Sits in a cluster where most reports are recent.",
};

function places(grid: Grid, patterns: Patterns | null): { places: WatchPlace[]; cells: Cell[] } {
  const total = grid.cells.length;
  const cellLevel = (rank: number): Level => rank <= total * .1 ? "high" : rank <= total * .35 ? "elevated" : "watch";
  const cells: Cell[] = grid.cells.map(c => ({ lat: c.lat, lon: c.lon, level: cellLevel(c.rank), place: c.locality }));
  const groups = new Map<string, GridCell[]>();
  for (const c of grid.cells) {
    const key = `${c.locality}|${clean(c.district)}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const ordered = [...groups.entries()].sort((a, b) => a[1][0].rank - b[1][0].rank);
  return {
    cells,
    places: ordered.slice(0, 60).map(([key, group], i) => {
      const top = group[0];
      const year = Math.max(...group.map(c => c.reports_within_3km_365d));
      const month = Math.max(...group.map(c => c.reports_within_3km_28d));
      const cluster = patterns?.clusters.find(k => km(k, top) < 3.5 && k.types[0] !== "unlabelled");
      const gate = patterns?.border_gateways.map(g => ({ g, d: km(g, top) })).sort((a, b) => a.d - b.d)[0];
      const why: string[] = [];
      if (year >= 3) why.push(`Seizures keep being reported here: ${year} within 3 km in the past year.`);
      else if (year > 0) why.push(`${year === 1 ? "One seizure" : `${year} seizures`} reported within 3 km in the past year.`);
      else why.push("Ranked up by the pattern of reports around it, not by reports of its own.");
      if (month > 0) why.push(`Reported again in the last four weeks (${month}).`);
      if (cluster) why.push(KIND_REASON[cluster.types[0]] ?? "");
      if (gate && gate.d < 15) why.push(`About ${Math.round(gate.d)} km from the border crossing near ${gate.g.near}.`);
      return {
        id: key, name: top.locality, area: [top.taluk, clean(top.district)].filter(Boolean).join(", "),
        district: clean(top.district), lat: top.lat, lon: top.lon,
        level: i < 8 ? "high" : i < 24 ? "elevated" : "watch", rank: i + 1, squares: group.length,
        reportsYear: year, reportsMonth: month, why: why.filter(Boolean), kind: cluster?.types[0] ?? null,
      } satisfies WatchPlace;
    }),
  };
}

async function districts(): Promise<{ rows: DistrictRow[] }> {
  const live = await csv(path.join(PUBLIC, "excise_live_months.csv"));
  const history = await csv(path.join(PUBLIC, "excise_enforcement_monthly.csv"));
  const latestStart = live.map(r => r.period_start).sort().at(-1);
  const byYear = new Map<string, Map<number, number>>();
  const months2024 = new Map<string, number[]>();
  for (const r of history) {
    const year = Number(r.period_start.slice(0, 4));
    const n = Number(r.ndps_cases);
    if (!Number.isFinite(n)) continue;
    const m = byYear.get(r.district) ?? new Map<number, number>();
    m.set(year, (m.get(year) ?? 0) + n);
    byYear.set(r.district, m);
    if (year === 2024) months2024.set(r.district, [...(months2024.get(r.district) ?? []), n]);
  }
  const rows = live.filter(r => r.period_start === latestStart && r.metric === "ndps_registrations").map(r => {
    const recent = months2024.get(r.district) ?? [];
    const usual = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const latest = Number(r.count);
    return {
      name: r.district, latestMonth: r.period_start.slice(0, 7), latest, usual: Math.round(usual),
      change: usual ? latest / usual - 1 : 0,
      years: [...(byYear.get(r.district) ?? new Map()).entries()].filter(([y]) => y <= 2023)
        .sort((a, b) => a[0] - b[0]).map(([year, total]) => ({ year, total })),
    };
  }).sort((a, b) => b.latest - a.latest);
  return { rows };
}

export async function enforcementView(): Promise<EnforcementView> {
  const [grid, patterns, district, forecasts] = await Promise.all([
    json<Grid>(path.join(GENERATED, "grid_forecast.json")),
    json<Patterns>(path.join(GENERATED, "patterns.json")),
    districts(),
    json<{ status: string; latest_complete_month: string; resume_after_gap_months: number }>(
      path.join(PUBLIC, "prepared/district_monthly/forecast_2026-11-30.json")),
  ]);
  const missing: string[] = [];
  if (!grid) missing.push("Grid forecast not built. Run make news-harvest hotspot-forecast.");
  if (!patterns) missing.push("Pattern brief not built. Run make patterns-forecast.");
  const { places: watch, cells } = grid ? places(grid, patterns) : { places: [], cells: [] };

  const kinds: HotspotKind[] = (patterns?.clusters ?? []).filter(c => c.types[0] !== "unlabelled").map((c, i) => ({
    id: `k${i}`, name: c.locality, area: [c.taluk, clean(c.district)].filter(Boolean).join(", "), district: clean(c.district),
    lat: c.lat, lon: c.lon, kinds: c.types.filter(t => t !== "unlabelled"), reports: c.reports, recentShare: c.recent_share,
    bigHaulShare: c.large_haul_share, syntheticShare: c.synthetic_share, borderKm: c.mean_km.land_border ?? 0,
  }));
  const gateways: Gateway[] = (patterns?.border_gateways ?? []).map((g, i) => ({
    id: `g${i}`, name: g.near, lat: g.lat, lon: g.lon,
    activeNearby: (patterns?.clusters ?? []).filter(c => km(c, g) < 15).reduce((a, c) => a + c.reports, 0),
  })).sort((a, b) => b.activeNearby - a.activeNearby);

  const best = new Map<string, number>();
  for (const f of patterns?.risk_factors ?? []) {
    if (f.kind !== "context" || !SURROUNDING[f.factor] || f.band_km[1] > 1) continue;
    best.set(f.factor, Math.max(best.get(f.factor) ?? 0, f.relative_risk));
  }
  const surroundings = [...best.entries()].filter(([, v]) => v > 1.2).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => ({ label: SURROUNDING[k], times: Math.round(v * 10) / 10 }));

  const cc = grid?.cutoff_check;
  return {
    asOf: grid?.as_of ?? "",
    horizonDays: grid?.horizon_days ?? 28,
    freshness: Object.entries(grid?.latest_report_by_source ?? {}).map(([k, v]) => ({ source: SOURCE[k] ?? k, latest: v }))
      .sort((a, b) => b.latest.localeCompare(a.latest)),
    reportsUsed: grid?.located_reports_used ?? 0,
    places: watch, cells, kinds, gateways, surroundings,
    districts: district.rows,
    districtForecast: forecasts?.status === "withheld_stale_data"
      ? { status: "paused", note: `The monthly district forecast is paused. Official monthly figures restarted after a two-year gap, and it needs ${forecasts.resume_after_gap_months} months in a row before it forecasts again.` }
      : { status: "unknown", note: "District forecast status unavailable." },
    weekly: grid?.weekly_located_reports ?? [],
    record: cc ? {
      cutoff: cc.cutoff, through: cc.checked_through, caught: cc.total.grid_ranker, total: cc.post_cutoff_located_reports,
      repeatShare: cc.strict_hit_rate.repeat_locality_1km, populationShare: cc.strict_hit_rate.population,
      months: cc.by_month.map(m => ({ month: m.month, caught: m.grid_ranker, total: m.located_reports })),
      topTwenty: 20, topTwentyHit: cc.top20_with_later_report,
      newPlaces: cc.total.new_place_reports, newCaught: cc.total.risk_terrain_watch,
    } : null,
    missing,
  };
}
