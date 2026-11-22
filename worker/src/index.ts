import geography from "../../shared/geography.json";
import { ASSESSMENTS, LEAD_CATEGORIES, NEXT_STEPS, WORKSPACE_NOTES } from "../../shared/workspace";
import type { Case } from "../../shared/schema";

interface Env { DB: D1Database; ASSETS: Fetcher; DEMO_REVIEW_KEY?: string; DEMO_WEB_ORIGIN?: string }
type Doc = Record<string, unknown>;
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const isDistrict = (v: unknown): v is string => typeof v === "string" && Object.hasOwn(geography.districts, v);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const tag = (v: Doc) => ({ ...v, synthetic: true as const });
function json(v: Doc, status = 200) {
  return Response.json(tag(v), { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
const problem = (error: string, status: number) => json({ error }, status);
async function body(r: Request): Promise<Doc> {
  if (!r.headers.get("Content-Type")?.startsWith("application/json")) throw new Error("json");
  const text = await r.text();
  if (text.length > 12000) throw new Error("size");
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("object");
  return data as Doc;
}
const only = (v: Doc, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
const ids = /^[A-Za-z0-9_-]{1,100}$/;
const fixtureRef = /^https:\/\/fixture\.invalid\/[A-Za-z0-9/_-]{1,110}$/;
const includes = (v: readonly string[], x: unknown): x is string => typeof x === "string" && v.includes(x);
async function all(db: D1Database, sql: string, values: unknown[] = []) {
  return (await db.prepare(sql).bind(...values).all<Doc>()).results.map(tag);
}

function analyst(req: Request, env: Env) {
  return !!env.DEMO_REVIEW_KEY && req.headers.get("X-Corridor-Review-Key") === env.DEMO_REVIEW_KEY;
}

async function assets(env: Env, url: URL, name: string) {
  const response = await env.ASSETS.fetch(new Request(new URL(`/${name}`, url)));
  if (!response.ok) throw new Error("asset missing");
  const data = await response.json<Doc>();
  if (data.synthetic !== true) throw new Error("asset provenance");
  return data;
}

async function api(req: Request, env: Env): Promise<Response> {
  const u = new URL(req.url);
  const path = u.pathname.replace(/\/$/, "");
  const method = req.method;
  const origin = req.headers.get("Origin");
  if (origin && !["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8787", "http://localhost:8787", env.DEMO_WEB_ORIGIN].includes(origin))
    return problem("This demo only accepts local requests.", 403);
  if (path === "/api/health" && method === "GET") return json({ service: "Corridor local demo", status: "ok" });
  if (path === "/api/forecasts/latest" && method === "GET") return json(await assets(env, u, "forecasts.json"));
  if (path === "/api/cases" && method === "GET") {
    const data = await assets(env, u, "cases_synthetic.json");
    const place = u.searchParams.get("district");
    const rows = (data.cases as Case[]).filter(c => c.synthetic === true && (!place || c.district === place));
    const page = Math.min(1000, Math.max(0, Math.floor(Number(u.searchParams.get("page")) || 0)));
    return json({ total: rows.length, page, items: rows.slice(page * 100, (page + 1) * 100) });
  }
  const db = env.DB;
  if (path === "/api/review-queue" && method === "GET") {
    return json({ items: await all(db, "SELECT * FROM review_items ORDER BY publication_date DESC,id LIMIT 250"),
      history: await all(db, "SELECT * FROM review_history WHERE subject_type='news' ORDER BY recorded_at DESC LIMIT 250") });
  }
  if (path === "/api/review-queue" && method === "POST") {
    if (!analyst(req, env)) return problem("Local review key required.", 403);
    const v = await body(req);
    if (!only(v, ["id","title","source","source_ref","event_date","publication_date","district","title_hash","duplicate_of","synthetic"])
      || v.synthetic !== true || typeof v.id !== "string" || !ids.test(v.id)
      || typeof v.title !== "string" || !v.title.startsWith("[FICTIONAL] ") || v.title.length > 180
      || typeof v.source !== "string" || !/^Fictional [a-zA-Z ]{3,42}$/.test(v.source)
      || typeof v.source_ref !== "string" || !fixtureRef.test(v.source_ref) || !isDistrict(v.district)
      || !isDate(v.publication_date) || (v.event_date !== null && (!isDate(v.event_date) || v.event_date > v.publication_date))
      || typeof v.title_hash !== "string" || !/^[a-f0-9]{64}$/.test(v.title_hash)
      || (v.duplicate_of !== null && (typeof v.duplicate_of !== "string" || !ids.test(v.duplicate_of))))
      return problem("Only labeled fictional feed metadata is accepted.", 400);
    const duplicate = v.duplicate_of ?? (await db.prepare(
      "SELECT id FROM review_items WHERE title_hash=? AND id<>? ORDER BY first_seen_at LIMIT 1"
    ).bind(v.title_hash, v.id).first<{id: string}>())?.id ?? null;
    await db.prepare(`INSERT OR IGNORE INTO review_items
       (id,title,source,source_ref,event_date,publication_date,first_seen_at,district,title_hash,duplicate_of,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(v.id,v.title,v.source,v.source_ref,v.event_date,v.publication_date,
       now(),v.district,v.title_hash,duplicate,duplicate ? "possible_duplicate" : "new").run();
    return json({ item: tag((await db.prepare("SELECT * FROM review_items WHERE source_ref=?").bind(v.source_ref).first<Doc>()) ?? {}) }, 201);
  }
  const review = path.match(/^\/api\/review-queue\/([a-zA-Z0-9_-]{1,100})$/);
  if (review && method === "PATCH") {
    if (!analyst(req, env)) return problem("Local review key required.", 403);
    const v = await body(req);
    if (!only(v, ["status"]) || !includes(["verified", "rejected"], v.status)) return problem("Choose verify or reject.", 400);
    const record = await db.prepare("SELECT status,event_date,publication_date FROM review_items WHERE id=?").bind(review[1])
      .first<{status: string; event_date: string | null; publication_date: string}>();
    if (!record) return problem("Item not found.", 404);
    if (!includes(["new","possible_duplicate"], record.status) || (v.status === "verified" &&
      (record.status === "possible_duplicate" || !record.event_date || record.publication_date > now().slice(0,10))))
      return problem("This item is final, duplicated, undated or not yet published.", 409);
    const t = now();
    const stmt = [
      db.prepare("UPDATE review_items SET status=?,verified_at=?,reviewer_role='analyst' WHERE id=? AND status=?")
        .bind(v.status,v.status === "verified" ? t : null,review[1],record.status),
      db.prepare(`INSERT INTO review_history SELECT ?, 'news', id, ?, 'analyst', ? FROM review_items
        WHERE id=? AND status=? AND changes()=1`).bind(uuid(),v.status,t,review[1],v.status),
    ];
    if (v.status === "verified") stmt.push(db.prepare(`INSERT OR IGNORE INTO cues
      SELECT ?,id,district,event_date,verified_at FROM review_items WHERE id=? AND verified_at=? AND status='verified'`)
      .bind(uuid(),review[1],t));
    const result = await db.batch(stmt);
    if (!result[0].meta.changes) return problem("Item was already reviewed.", 409);
    return json({ status: v.status, verified_at: v.status === "verified" ? t : null });
  }
  if (path === "/api/cues/verified" && method === "GET") {
    const before = u.searchParams.get("before");
    const upper = before && Number.isFinite(Date.parse(before)) ? new Date(Math.min(Date.parse(before), Date.now())).toISOString() : now();
    return json({ items: await all(db, "SELECT id, district, event_date, verified_at, 'verified' AS status FROM cues WHERE verified_at<=? ORDER BY verified_at", [upper]) });
  }
  if (path === "/api/leads" && method === "POST") {
    const v = await body(req);
    if (!only(v, ["district","category"]) || !isDistrict(v.district) || !includes(LEAD_CATEGORIES,v.category))
      return problem("Choose a district and an example topic. Do not submit personal information.", 400);
    const id = uuid();
    await db.prepare("INSERT INTO leads VALUES (?,?,?,?,'new')").bind(id,now(),v.district,v.category).run();
    return json({ receipt: id }, 201);
  }
  if (path === "/api/lead-status" && method === "POST") {
    const v=await body(req);
    if (!only(v,["receipt"]) || typeof v.receipt!=="string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v.receipt))
      return problem("Enter the full receipt for a practice report.",400);
    // Receipt holders only learn the state. No case data, topic, district, or identity is returned.
    const row=await db.prepare("SELECT status FROM leads WHERE id=?").bind(v.receipt).first<{status:string}>();
    return row ? json({status:row.status}) : problem("No practice report matches that receipt.",404);
  }
  if (path === "/api/leads" && method === "GET") {
    if (!analyst(req, env)) return problem("Local review key required.", 403);
    return json({ items: await all(db, "SELECT * FROM leads ORDER BY created_at DESC LIMIT 250") });
  }
  const lead = path.match(/^\/api\/leads\/([a-zA-Z0-9_-]{1,100})$/);
  if (lead && method === "PATCH") {
    if (!analyst(req, env)) return problem("Local review key required.", 403);
    const v = await body(req);
    if (!only(v, ["status"]) || !includes(["reviewed","closed"],v.status)) return problem("Choose reviewed or closed.", 400);
    const result = await db.batch([
      db.prepare("UPDATE leads SET status=? WHERE id=? AND status IN ('new','reviewed') AND status<>?").bind(v.status,lead[1],v.status),
      db.prepare(`INSERT INTO review_history SELECT ?,'lead',id,status,'analyst',? FROM leads WHERE id=? AND changes()=1`)
        .bind(uuid(),now(),lead[1]),
    ]);
    return result[0].meta.changes ? json({ status: v.status }) : problem("Lead not found or already in a final state.", 409);
  }
  if (path === "/api/briefs" && method === "GET") return json({ items: await all(db,"SELECT * FROM briefs ORDER BY updated_at DESC LIMIT 250") });
  if (path === "/api/workspace-notes" && (method === "GET" || method === "POST")) {
    if (!analyst(req,env)) return problem("Local review key required.",403);
    if (method==="GET") return json({items:await all(db,"SELECT id,district,note,created_at,role FROM workspace_notes ORDER BY created_at DESC LIMIT 80")});
    const v=await body(req);
    if (!only(v,["district","note"]) || !isDistrict(v.district) || !includes(WORKSPACE_NOTES,v.note))
      return problem("Choose a district and a practice review note.",400);
    const item={id:uuid(),district:v.district,note:v.note,created_at:now(),role:"analyst"};
    await db.prepare("INSERT INTO workspace_notes (id,district,note,created_at,role) VALUES (?,?,?,?,?)")
      .bind(item.id,item.district,item.note,item.created_at,item.role).run();
    return json({item:tag(item)},201);
  }
  const brief = path.match(/^\/api\/briefs\/([a-zA-Z0-9_-]{1,100})$/);
  if ((path === "/api/briefs" && method === "POST") || (brief && method === "PUT")) {
    const v = await body(req);
    if (!only(v,["district","horizon_days","assessment","next_step","role","connection"]) || !isDistrict(v.district) || ![7,28].includes(Number(v.horizon_days))
      || !includes(ASSESSMENTS,v.assessment) || !includes(NEXT_STEPS,v.next_step) || !includes(["analyst","planner"],v.role))
      return problem("Use the demo brief options; no personal or case details.", 400);
    if (v.connection != null) {
      const pair = await assets(env,u,"cases_synthetic.json");
      if (v.role!=="analyst" || typeof v.connection!=="string" ||
        !(pair.connections as string[][]).some(p=>p.join("|")===v.connection && p[1]===v.district))
        return problem("Use an invented known connection from the synthetic atlas.",400);
    }
    const id = brief?.[1] ?? uuid();
    const fields = [v.district,Number(v.horizon_days),v.assessment,v.next_step,now(),v.role,v.connection ?? null];
    const result = await (brief ? db.prepare("UPDATE briefs SET district=?,horizon_days=?,assessment=?,next_step=?,updated_at=?,role=?,connection=? WHERE id=?").bind(...fields,id) :
      db.prepare("INSERT INTO briefs (id,district,horizon_days,assessment,next_step,updated_at,role,connection) VALUES (?,?,?,?,?,?,?,?)").bind(id,...fields)).run();
    if (!result.meta.changes) return problem("Brief not found.", 404);
    return json({ item: tag((await db.prepare("SELECT * FROM briefs WHERE id=?").bind(id).first<Doc>()) ?? {}) }, brief ? 200 : 201);
  }
  return problem("Local endpoint not found.", 404);
}

export default {
  async fetch(req: Request, env: Env) {
    try { return await api(req, env); }
    catch (e) {
      if (e instanceof Error && ["json","size","object"].includes(e.message) || e instanceof SyntaxError)
        return problem("Invalid JSON request.", 400);
      return problem("Local data is unavailable. Check the demo command.", 503);
    }
  }
};
