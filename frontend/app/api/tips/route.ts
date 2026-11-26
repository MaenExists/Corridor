import { createHash } from "node:crypto";
import { submitTip, type TipInput } from "@/lib/tips";

export const dynamic = "force-dynamic";

/** Receive one public report. The connection address is hashed for an in-memory rate limit and never stored. */
export async function POST(req: Request) {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return Response.json({ message: "Bad request." }, { status: 415 });
  const text = await req.text();
  if (text.length > 4000) return Response.json({ message: "Report too long." }, { status: 413 });
  let input: TipInput;
  try { input = JSON.parse(text); } catch { return Response.json({ message: "Bad request." }, { status: 400 }); }
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "local";
  const connection = createHash("sha256").update(forwarded).digest("hex").slice(0, 16);
  const result = await submitTip(input, connection);
  return result.ok
    ? Response.json({ ok: true, counted: result.counted }, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ message: result.message }, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
