// Snapshot the generated data the server reads into .cf/bundle.json, for the Cloudflare build (no disk there).
// Public tips are NOT bundled: on Cloudflare they live in the D1 database.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const FILES = [
  "web/public/generated/hotspots/grid_forecast.json",
  "web/public/generated/hotspots/patterns.json",
  "web/public/generated/hotspots/patterns_v2.json",
  "web/public/generated/hotspots/ledger.json",
  "web/public/generated/recovery/access_map.json",
  "web/public/generated/recovery/need_map.json",
  "web/public/generated/places/kerala_places.json",
  "ml/data/real/public_sources/prepared/district_monthly/forecast_2026-11-30.json",
  "ml/data/real/public_sources/excise_live_months.csv",
  "ml/data/real/public_sources/excise_enforcement_monthly.csv",
];
const out = {};
for (const rel of FILES) {
  const text = readFileSync(path.join(root, rel), "utf8");
  out[rel] = rel.endsWith(".json") ? JSON.parse(text) : text;
}
mkdirSync(path.join(import.meta.dirname, "../.cf"), { recursive: true });
const file = path.join(import.meta.dirname, "../.cf/bundle.json");
writeFileSync(file, JSON.stringify(out));
console.log(`bundled ${FILES.length} files, ${(JSON.stringify(out).length / 1e6).toFixed(1)} MB`);
