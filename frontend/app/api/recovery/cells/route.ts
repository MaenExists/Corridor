import { rawAccessMap, rawNeedMap } from "@/lib/publicData";

export const dynamic = "force-dynamic";

/**
 * The 1 km access grid as flat arrays: latitude, longitude, km to the nearest centre, beds within reach per 100k,
 * and the drug-affected grade as one character per square (h high, e elevated, s some, - lower).
 */
export async function GET() {
  const raw = await rawAccessMap();
  if (!raw) return Response.json({ error: "not built" }, { status: 404 });
  const need = await rawNeedMap();
  const grades = need && need.grades.length === raw.cells.length ? need.grades : null;
  const lat: number[] = [], lon: number[] = [], km: number[] = [], beds: number[] = [];
  let grade = "";
  raw.cells.forEach(([a, b, people, d, r], i) => {
    if (people <= 0) return;
    lat.push(a); lon.push(b); km.push(d); beds.push(r);
    grade += grades ? grades[i] : "-";
  });
  return Response.json({ step: 1 / 120, lat, lon, km, beds, grade: grades ? grade : null },
    { headers: { "Cache-Control": "private, max-age=300" } });
}
