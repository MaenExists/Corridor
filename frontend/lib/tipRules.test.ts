// Run with: npm test (node --test with type stripping; no framework needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, blockOf, cellOf, centreOf, poissonTail, screenNote, type StoredTip } from "./tipRules.ts";

test("notes lose phones, vehicles, emails, house numbers and named people", () => {
  const n = screenNote("Call Mr Rajesh Kumar on +91 98470 12345, car KL-07-AB-1234, h.no 12/45, mail x.y@z.com");
  for (const bad of ["Rajesh", "98470", "1234", "12/45", "x.y@z.com"]) assert.ok(!n.text.includes(bad), `${bad} survived: ${n.text}`);
  assert.ok(n.redacted);
  assert.equal(screenNote("Packets passed at the bus shelter most evenings").redacted, false);
});

test("notes about groups of people are flagged, ordinary notes are not", () => {
  assert.ok(screenNote("some bengali workers selling").aboutGroup);
  assert.ok(screenNote("അതിഥി തൊഴിലാളികൾ").aboutGroup);
  assert.ok(screenNote("colony people again").aboutGroup);
  assert.equal(screenNote("Young men near the railway gate at night").aboutGroup, false);
  assert.equal(screenNote("behind the hindustan petroleum pump").aboutGroup, false);
});

test("snapping is stable on the access grid", () => {
  const [i, j] = cellOf(12.7871, 74.9946);
  const c = centreOf(i, j);
  assert.ok(Math.abs(c.lat - 12.7871) < 1e-3 && Math.abs(c.lon - 74.9946) < 1e-3);
  assert.deepEqual(cellOf(c.lat + 0.003, c.lon - 0.003), [i, j]);
});

test("poisson tail", () => {
  assert.equal(poissonTail(0, 3), 1);
  assert.ok(Math.abs(poissonTail(1, 1) - (1 - Math.exp(-1))) < 1e-12);
});

// A 30 x 30 km patch, 3,000 people per 1 km square.
const BASE = cellOf(10, 76);
const population = new Map<string, number>();
for (let di = -15; di < 15; di++) for (let dj = -15; dj < 15; dj++) population.set(`${BASE[0] + di}:${BASE[1] + dj}`, 3000);
const TODAY = "2026-11-26";
let seq = 0;
const tip = (over: Partial<StoredTip> & { at?: [number, number] }): StoredTip => {
  const [di, dj] = over.at ?? [0, 0];
  return { id: String(seq++), day: "2026-11-20", hour: 10, cell: `${BASE[0] + di}:${BASE[1] + dj}`, what: "selling", when: "week",
    seen: "saw", school: false, note: "", redacted: false, reporter: `r${seq}`, status: "counted", ...over };
};
const DAYS = ["2026-11-10", "2026-11-14", "2026-11-18", "2026-11-21", "2026-11-24", "2026-11-25"];
const genuine = () => DAYS.map((day, k) => tip({ day, reporter: `n${k}`, seen: k < 4 ? "saw" : "told", hour: 8 + k }));

test("several people on different days, above the surroundings, stand out", () => {
  const out = aggregate(genuine(), population, TODAY);
  assert.equal(out.blocks.length, 1);
  assert.equal(out.blocks[0].reporters, 6);
  assert.equal(out.blocks[0].firstHand, 4);
});

test("one person reporting again and again counts once", () => {
  const spam = Array.from({ length: 20 }, (_, k) => tip({ reporter: "same", day: DAYS[k % 6] }));
  const out = aggregate(spam, population, TODAY);
  assert.equal(out.blocks.length, 0);
  assert.equal(out.counted, 20);
  assert.equal(out.quiet, 1);
});

test("a burst within hours is held, not shown", () => {
  const burst = Array.from({ length: 8 }, (_, k) => tip({ reporter: `b${k}`, day: k < 7 ? "2026-11-20" : "2026-11-21", hour: 10 + (k % 3) }));
  const out = aggregate(burst, population, TODAY);
  assert.equal(out.blocks.length, 0);
  assert.equal(out.held.burst, 1);
});

test("people who report across many areas are left out", () => {
  const roaming = DAYS.flatMap((day, k) => [0, 1, 2, 3, 4].map(b => tip({ reporter: `c${k}`, day, at: [b * 3, 0], hour: 8 + k })));
  const out = aggregate(roaming, population, TODAY);
  assert.equal(out.blocks.length, 0);
  assert.equal(out.held.spread, roaming.length);
});

test("hearsay alone does not make an area stand out", () => {
  const told = genuine().map(t => ({ ...t, seen: "told" as const }));
  assert.equal(aggregate(told, population, TODAY).blocks.length, 0);
});

test("an area that reports as much as its neighbours is in line, not flagged", () => {
  // Every block around also has six reporters: a busy, well-connected area, not a hotspot.
  const busy: StoredTip[] = [];
  for (let bi = -4; bi <= 4; bi++) for (let bj = -4; bj <= 4; bj++)
    DAYS.forEach((day, k) => busy.push(tip({ day, reporter: `u${bi}.${bj}.${k}`, at: [bi * 3, bj * 3], hour: 8 + k })));
  const out = aggregate(busy, population, TODAY);
  assert.equal(out.blocks.length, 0);
  assert.ok(out.usual > 0);
});

test("old tips and held tips do not count", () => {
  const old = genuine().map(t => ({ ...t, day: "2026-06-01" }));
  assert.equal(aggregate(old, population, TODAY).received, 0);
  const held = genuine().map(t => ({ ...t, status: "held" as const, reason: "about_group" }));
  const out = aggregate(held, population, TODAY);
  assert.equal(out.blocks.length, 0);
  assert.equal(out.held.group, 6);
});

test("blocks are 3 x 3 squares", () => {
  assert.deepEqual(blockOf(5, 8), [1, 2]);
  assert.deepEqual(blockOf(-1, 0), [-1, 0]);
});

test("plurals and Malayalam suffixes are still caught", () => {
  assert.ok(screenNote("migrants near the canal").aboutGroup);
  assert.ok(screenNote("ബംഗാളികൾ വിൽക്കുന്നു").aboutGroup);
  assert.equal(screenNote("the bhaiya tea shop corner").aboutGroup, false);
});
