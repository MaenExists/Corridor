import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Centre, DistrictAccess, FarPlace, Grade, NeedPlace, PublicView } from "./types";

const ROOT = process.env.NARCOTRACE_ROOT ?? path.join(process.cwd(), "..");
export const ACCESS_MAP = path.join(ROOT, "web/public/generated/recovery/access_map.json");
// Built by `make recovery-need` (ml/recovery/drug_burden.py): coarse grades only, no seizure locations.
export const NEED_MAP = path.join(ROOT, "web/public/generated/recovery/need_map.json");

type Raw = {
  meta: { built_on: string; far_km: number; centres_located: number; centres_unlocated: number; limits: string[];
    freshness: { registered_centres?: { checked_on: string } } };
  centres: { name: string; kind: string; deaddiction_beds: number | null; bed_figure?: string; district: string | null;
    lat: number; lon: number; location_basis: string }[];
  priority_places: { place: string; taluk: string | null; district: string | null; lat: number; lon: number;
    people_far_from_help: number; mean_distance_km: number }[];
  districts: Record<string, { population_2020: number; share_over_10km_from_centre: number; share_over_20km_from_centre: number;
    centres: number; listed_beds_per_100k: number }>;
  cells: [number, number, number, number, number][];
};

type RawNeed = {
  meta: { periods: { police: string; excise: string }; cases_a_year: number; share_cases_far: number;
    affected_people: number; affected_far_people: number; affected_far_share: number };
  districts: Record<string, { cases_a_year: number; per_100k: number; share_far: number; affected_far_people: number }>;
  places: { place: string; place_ml: string; district: string; lat: number; lon: number; grade: Grade;
    cases_a_year: number; people: number; mean_km: number }[];
  grades: string[];
};

let needCache: { mtime: number; raw: RawNeed } | null = null;
export async function rawNeedMap(): Promise<RawNeed | null> {
  try {
    const { stat } = await import("node:fs/promises");
    const mtime = (await stat(NEED_MAP)).mtimeMs;
    if (!needCache || needCache.mtime !== mtime) needCache = { mtime, raw: JSON.parse(await readFile(NEED_MAP, "utf8")) };
    return needCache.raw;
  } catch { return null; }
}

let cache: { mtime: number; raw: Raw } | null = null;
export async function rawAccessMap(): Promise<Raw | null> {
  try {
    const { stat } = await import("node:fs/promises");
    const mtime = (await stat(ACCESS_MAP)).mtimeMs;
    if (!cache || cache.mtime !== mtime) cache = { mtime, raw: JSON.parse(await readFile(ACCESS_MAP, "utf8")) };
    return cache.raw;
  } catch { return null; }
}

export async function publicView(): Promise<PublicView> {
  const raw = await rawAccessMap();
  if (!raw) return { builtOn: "", checkedOn: "", shareOver10: 0, peopleOver10: 0, population: 0, centresLocated: 0,
    centresUnlocated: 0, centres: [], far: [], need: null, needPlaces: [], districts: [], limits: [],
    missing: "The recovery access map is not built. Run make recovery-refresh." };
  let population = 0, far = 0;
  for (const [, , people, km] of raw.cells) { population += people; if (km > raw.meta.far_km) far += people; }
  const centres: Centre[] = raw.centres.map((c, i) => ({
    id: `c${i}`, name: c.name, government: c.kind === "vimukthi_government_centre", beds: c.deaddiction_beds,
    bedsAreTotal: c.bed_figure === "establishment_total", district: c.district ?? "", lat: c.lat, lon: c.lon,
    basis: c.location_basis,
  }));
  const places: FarPlace[] = raw.priority_places.slice(0, 40).map((p, i) => ({
    id: `p${i}`, name: p.place, area: [p.taluk, p.district].filter(Boolean).join(", "), lat: p.lat, lon: p.lon,
    peopleFar: p.people_far_from_help, averageKm: p.mean_distance_km,
  }));
  const need = await rawNeedMap();
  const districts: DistrictAccess[] = Object.entries(raw.districts).map(([name, d]) => {
    const n = need?.districts[name];
    return {
      name, population: d.population_2020, shareOver10: d.share_over_10km_from_centre, shareOver20: d.share_over_20km_from_centre,
      centres: d.centres, bedsPer100k: d.listed_beds_per_100k,
      casesYear: n?.cases_a_year ?? null, casesPer100k: n?.per_100k ?? null, shareCasesFar: n?.share_far ?? null,
      affectedFarPeople: n?.affected_far_people ?? null,
    };
  }).sort((a, b) => (b.shareCasesFar ?? b.shareOver10) - (a.shareCasesFar ?? a.shareOver10));
  const needPlaces: NeedPlace[] = (need?.places ?? []).map((p, i) => ({
    id: `n${i}`, name: p.place, nameMl: p.place_ml, district: p.district, lat: p.lat, lon: p.lon, grade: p.grade,
    casesYear: p.cases_a_year, people: p.people, averageKm: p.mean_km,
  }));
  return {
    builtOn: raw.meta.built_on, checkedOn: raw.meta.freshness.registered_centres?.checked_on ?? raw.meta.built_on,
    shareOver10: far / population, peopleOver10: far, population, centresLocated: raw.meta.centres_located,
    centresUnlocated: raw.meta.centres_unlocated, centres, far: places, districts, limits: raw.meta.limits, missing: null,
    need: need && {
      casesYear: need.meta.cases_a_year, shareCasesFar: need.meta.share_cases_far, affectedPeople: need.meta.affected_people,
      affectedFarPeople: need.meta.affected_far_people, affectedFarShare: need.meta.affected_far_share, periods: need.meta.periods,
    },
    needPlaces,
  };
}
