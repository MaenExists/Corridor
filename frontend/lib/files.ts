import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import BUNDLE from "@nt/data-bundle";

/**
 * One place to read the generated data. Locally it reads files under the repository root at request time, so a
 * rebuilt model shows up without a restart. On Cloudflare there is no disk, so the build bundles a snapshot.
 * Paths are relative to the repository root.
 */
const ROOT = process.env.NARCOTRACE_ROOT ?? path.join(process.cwd(), "..");
const bundled = BUNDLE as Record<string, unknown> | null;

/** A stamp that changes when the file changes, for callers that cache parsed data. */
export async function stamp(rel: string): Promise<number | null> {
  if (bundled) return rel in bundled ? 0 : null;
  try { return (await stat(path.join(ROOT, rel))).mtimeMs; } catch { return null; }
}

export async function readJson<T>(rel: string): Promise<T | null> {
  if (bundled) return (bundled[rel] as T | undefined) ?? null;
  try { return JSON.parse(await readFile(path.join(ROOT, rel), "utf8")) as T; } catch { return null; }
}

export async function readText(rel: string): Promise<string | null> {
  if (bundled) { const v = bundled[rel]; return typeof v === "string" ? v : null; }
  try { return await readFile(path.join(ROOT, rel), "utf8"); } catch { return null; }
}
