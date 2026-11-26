import { placesInView, searchPlaces } from "@/lib/places";

export const dynamic = "force-dynamic";

/**
 * Place search (?q=) and map labels (?bbox=south,west,north,east&z=zoom) from the local OpenStreetMap
 * gazetteer. Queries are answered here and never logged or sent to another service.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  if (q != null) {
    const hits = await searchPlaces(q.slice(0, 60));
    return hits ? Response.json(hits, { headers: { "Cache-Control": "private, max-age=600" } })
      : Response.json({ error: "Place list not built. Run make place-names." }, { status: 404 });
  }
  const box = (url.searchParams.get("bbox") ?? "").split(",").map(Number);
  const z = Number(url.searchParams.get("z"));
  if (box.length !== 4 || box.some(n => !Number.isFinite(n)) || !Number.isFinite(z)) return Response.json({ error: "bad request" }, { status: 400 });
  const places = await placesInView(box[0], box[1], box[2], box[3], z);
  return places ? Response.json(places, { headers: { "Cache-Control": "private, max-age=600" } })
    : Response.json({ error: "Place list not built. Run make place-names." }, { status: 404 });
}
