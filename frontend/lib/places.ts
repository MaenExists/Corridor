import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fold, labelRank, type PlaceHit } from "./placeRules";

// Built by `make place-names` from the local OpenStreetMap extract; local and gitignored.
const ROOT = process.env.NARCOTRACE_ROOT ?? path.join(process.cwd(), "..");
const FILE = path.join(ROOT, "web/public/generated/places/kerala_places.json");

type Row = [string, string, string, number, number, number, string];
type Indexed = { row: Row; key: string; words: string[] };
let cache: { mtime: number; rows: Indexed[] } | null = null;

async function load() {
  try {
    const mtime = (await stat(FILE)).mtimeMs;
    if (!cache || cache.mtime !== mtime) {
      const rows = (JSON.parse(await readFile(FILE, "utf8")).places as Row[]).map(row => ({
        row, key: fold(row[0]), words: row[0].split(/[\s,()/-]+/).map(fold).filter(Boolean),
      }));
      cache = { mtime, rows };
    }
    return cache.rows;
  } catch { return null; }
}

const hit = ([name, ml, kind, rank, lat, lon, district]: Row): PlaceHit => ({ name, ml, kind, rank, lat, lon, district });

/** Rank matches: exact name, then name start, then a word start, then anywhere; bigger places first. */
export async function searchPlaces(query: string, limit = 8): Promise<PlaceHit[] | null> {
  const rows = await load();
  if (!rows) return null;
  const q = query.trim();
  const fq = fold(q), malayalam = /[ഀ-ൿ]/.test(q);
  if (!fq && !malayalam) return [];
  const scored: [number, Indexed][] = [];
  for (const r of rows) {
    let s: number;
    if (malayalam) s = r.row[1] && r.row[1].includes(q) ? (r.row[1].startsWith(q) ? 1 : 3) : -1;
    else if (r.key === fq) s = 0;
    else if (r.key.startsWith(fq)) s = 1;
    else if (fq.length >= 3 && r.words.some(w => w.startsWith(fq))) s = 2;
    else if (fq.length >= 4 && r.key.includes(fq)) s = 3;
    else s = -1;
    if (s >= 0) scored.push([s * 10 + r.row[3], r]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].row[0].length - b[1].row[0].length);
  return scored.slice(0, limit).map(([, r]) => hit(r.row));
}

/** Places to label inside a view, most important first. The client decides which fit without overlapping. */
export async function placesInView(south: number, west: number, north: number, east: number, zoom: number) {
  const rows = await load();
  if (!rows) return null;
  const max = labelRank(zoom);
  const out: PlaceHit[] = [];
  for (const { row } of rows) {
    if (row[3] > max || row[4] < south || row[4] > north || row[5] < west || row[5] > east) continue;
    out.push(hit(row));
  }
  out.sort((a, b) => a.rank - b.rank);
  return out.slice(0, 700);
}
