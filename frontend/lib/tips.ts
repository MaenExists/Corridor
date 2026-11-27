import "server-only";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rawAccessMap } from "./publicData";
import {
  aggregate, cellOf, LIMITS, screenNote, TIP_SEEN, TIP_WHAT, TIP_WHEN,
  type ConcernSummary, type StoredTip, type TipSeen, type TipWhat, type TipWhen,
} from "./tipRules";

// Public tips are private real data: local, gitignored, never committed or served raw.
const ROOT = process.env.NARCOTRACE_ROOT ?? path.join(process.cwd(), "..");
const DIR = process.env.NARCOTRACE_TIPS_DIR ?? path.join(ROOT, "ml/data/real/public_tips");
const FILE = path.join(DIR, "tips.jsonl");

/** Minimal D1 surface, so the app does not need the Workers type package. */
type D1 = {
  prepare(sql: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }>; run(): Promise<unknown> } };
};
type CfEnv = { DB?: D1; TIPS_SALT?: string };

/** On Cloudflare, tips live in D1 and the salt is a Worker secret. Locally there is no Cloudflare context. */
async function cloudflare(): Promise<CfEnv | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = getCloudflareContext().env as CfEnv;
    return env.DB ? env : null;
  } catch { return null; }
}

/** A server-side secret, so stored reporter keys cannot be linked back to a browser's own key. */
let salt: Buffer | null = null;
async function secret() {
  if (salt) return salt;
  const cf = await cloudflare();
  if (cf) {
    if (!cf.TIPS_SALT || !/^[0-9a-f]{64}$/.test(cf.TIPS_SALT)) throw new Error("TIPS_SALT secret is not set");
    return (salt = Buffer.from(cf.TIPS_SALT, "hex"));
  }
  await mkdir(DIR, { recursive: true, mode: 0o700 });
  const file = path.join(DIR, "salt");
  try { salt = Buffer.from((await readFile(file, "utf8")).trim(), "hex"); }
  catch { salt = randomBytes(32); await writeFile(file, salt.toString("hex"), { mode: 0o600, flag: "wx" }).catch(() => {}); }
  return salt;
}

async function load(): Promise<StoredTip[]> {
  const cf = await cloudflare();
  if (cf) {
    // Only the last 120 days matter: 90 for the areas, 30 for the per-device limit.
    const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
    const { results } = await cf.DB!.prepare("SELECT data FROM tips WHERE day >= ? ORDER BY day").bind(since).all<{ data: string }>();
    return results.map(r => JSON.parse(r.data) as StoredTip);
  }
  try {
    return (await readFile(FILE, "utf8")).split("\n").filter(Boolean).map(l => JSON.parse(l) as StoredTip);
  } catch { return []; }
}

let gridCache: { at: number; cells: Map<string, number> } | null = null;
async function kerala() {
  if (gridCache && Date.now() - gridCache.at < 6e5) return gridCache.cells;
  const raw = await rawAccessMap();
  const cells = new Map<string, number>();
  for (const [lat, lon, people] of raw?.cells ?? []) cells.set(cellOf(lat, lon).join(":"), people);
  gridCache = { at: Date.now(), cells };
  return cells;
}

const ist = () => { const d = new Date(Date.now() + 5.5 * 36e5); return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() }; };

// Connection-level limit kept in memory only; addresses are never written down.
const recentByConnection = new Map<string, number[]>();
function connectionAllowed(conn: string) {
  const now = Date.now(), list = (recentByConnection.get(conn) ?? []).filter(t => now - t < 36e5);
  if (list.length >= 10) return false;
  list.push(now); recentByConnection.set(conn, list);
  if (recentByConnection.size > 5000) recentByConnection.clear();
  return true;
}

export type TipInput = {
  cell?: unknown; what?: unknown; when?: unknown; seen?: unknown; school?: unknown; note?: unknown;
  device?: unknown; elapsed?: unknown; website?: unknown;
};
/** Error codes let the browser show the message in the reader's language. */
export type TipError = "slow" | "connection" | "reload" | "place" | "outside" | "what" | "when" | "seen" | "note" | "day" | "month";
export type TipResult = { ok: true; counted: boolean } | { ok: false; status: number; code: TipError; message: string };

export async function submitTip(input: TipInput, connection: string): Promise<TipResult> {
  const bad = (code: TipError, message: string, status = 400): TipResult => ({ ok: false, status, code, message });
  // Bots fill the hidden field or submit instantly; accept silently so they learn nothing.
  if (typeof input.website === "string" && input.website) return { ok: true, counted: false };
  if (typeof input.elapsed !== "number" || input.elapsed < 4000) return bad("slow", "Please take a moment to fill in the form.");
  if (!connectionAllowed(connection)) return bad("connection", "Too many reports from this connection. Try again later.", 429);

  if (typeof input.device !== "string" || !/^[0-9a-f]{32}$/.test(input.device)) return bad("reload", "Reload the page and try again.");
  if (typeof input.cell !== "string" || !/^\d{1,5}:\d{1,5}$/.test(input.cell)) return bad("place", "Choose a place on the map.");
  if (!(await kerala()).has(input.cell)) return bad("outside", "Choose a place inside Kerala.");
  if (typeof input.what !== "string" || !(input.what in TIP_WHAT)) return bad("what", "Choose what you noticed.");
  if (typeof input.when !== "string" || !(input.when in TIP_WHEN)) return bad("when", "Choose when it happened.");
  if (typeof input.seen !== "string" || !(input.seen in TIP_SEEN)) return bad("seen", "Say how you know.");
  if (input.note != null && typeof input.note !== "string") return bad("note", "The note must be text.");

  const reporter = createHmac("sha256", await secret()).update(input.device).digest("hex").slice(0, 20);
  const tips = await load();
  const now = ist();
  const mine = tips.filter(t => t.reporter === reporter);
  const since = (days: number) => mine.filter(t => Date.parse(now.day) - Date.parse(t.day) < days * 864e5).length;
  if (since(1) >= LIMITS.perDevicePerDay) return bad("day", `You have sent ${LIMITS.perDevicePerDay} reports today. Thank you. Please come back tomorrow.`, 429);
  if (since(30) >= LIMITS.perDevicePer30Days) return bad("month", "You have reached this month's limit of reports. Thank you.", 429);

  const note = screenNote((input.note as string | undefined) ?? "");
  const tip: StoredTip = {
    id: randomUUID(), day: now.day, hour: now.hour, cell: input.cell, what: input.what as TipWhat,
    when: input.when as TipWhen, seen: input.seen as TipSeen, school: input.school === true,
    note: note.text, redacted: note.redacted, reporter,
    status: note.aboutGroup ? "held" : "counted", ...(note.aboutGroup ? { reason: "about_group" } : {}),
  };
  const cf = await cloudflare();
  if (cf) {
    await cf.DB!.prepare("INSERT INTO tips (id, day, reporter, data) VALUES (?, ?, ?, ?)")
      .bind(tip.id, tip.day, tip.reporter, JSON.stringify(tip)).run();
  } else {
    await mkdir(DIR, { recursive: true, mode: 0o700 });
    await appendFile(FILE, JSON.stringify(tip) + "\n", { mode: 0o600 });
  }
  return { ok: true, counted: tip.status === "counted" };
}

/** Areas several people independently flagged, for enforcement review only. Never shown to the public. */
export async function concernSummary(): Promise<ConcernSummary> {
  return aggregate(await load(), await kerala(), ist().day);
}
