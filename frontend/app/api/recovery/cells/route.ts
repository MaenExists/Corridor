import { rawAccessMap } from "@/lib/publicData";

export const dynamic = "force-dynamic";

/** The 1 km access grid as flat arrays: latitude, longitude, km to the nearest centre, beds within reach per 100k. */
export async function GET() {
  const raw = await rawAccessMap();
  if (!raw) return Response.json({ error: "not built" }, { status: 404 });
  const lat: number[] = [], lon: number[] = [], km: number[] = [], beds: number[] = [];
  for (const [a, b, people, d, r] of raw.cells) {
    if (people <= 0) continue;
    lat.push(a); lon.push(b); km.push(d); beds.push(r);
  }
  return Response.json({ step: 1 / 120, lat, lon, km, beds }, { headers: { "Cache-Control": "private, max-age=300" } });
}
