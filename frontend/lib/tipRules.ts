/**
 * Rules for public reports ("tips"), kept pure so they can be tested without a server.
 *
 * A tip records what was noticed and roughly where, never who. It is snapped to a 1 km square in the
 * browser, counted only once per person per 3 km block, and an area is shown to enforcement only when
 * several different people independently notice something there, on different days, more often than
 * the surrounding area's usual rate of reporting would explain. Tips never feed the forecast model.
 */

export const TIP_WHAT = {
  selling: { label: "Selling or handing over", hint: "Small packets changing hands, or a regular spot for sales" },
  using: { label: "Use in a public place", hint: "In a park, bus stand, lane or empty building" },
  stash: { label: "Dropped or hidden items", hint: "Packets, syringes or wrappers left or hidden" },
  traffic: { label: "Unusual comings and goings", hint: "Many short visits to one spot at odd hours" },
  moving: { label: "Goods being moved", hint: "Loads swapped between vehicles or carried in bulk" },
  other: { label: "Something else", hint: "Anything else that worried you" },
} as const;
export type TipWhat = keyof typeof TIP_WHAT;
export const TIP_WHEN = { today: "Today", week: "This week", month: "Earlier this month" } as const;
export type TipWhen = keyof typeof TIP_WHEN;
export const TIP_SEEN = { saw: "I saw it myself", told: "Someone told me" } as const;
export type TipSeen = keyof typeof TIP_SEEN;

// The access grid's 1 km squares: centres sit at (index + offset) / 120 degrees.
export const STEP = 1 / 120;
const A_LAT = 0.452, A_LON = 0.348;
export const BLOCK = 3;                       // squares per block side, about 3 km
export const cellOf = (lat: number, lon: number): [number, number] =>
  [Math.round(lat / STEP - A_LAT), Math.round(lon / STEP - A_LON)];
export const centreOf = (i: number, j: number) => ({ lat: (i + A_LAT) * STEP, lon: (j + A_LON) * STEP });
export const blockOf = (i: number, j: number): [number, number] => [Math.floor(i / BLOCK), Math.floor(j / BLOCK)];
export const blockCentre = (bi: number, bj: number) => centreOf(bi * BLOCK + (BLOCK - 1) / 2, bj * BLOCK + (BLOCK - 1) / 2);

export const LIMITS = {
  noteChars: 280,
  perDevicePerDay: 3,
  perDevicePer30Days: 12,
  windowDays: 90,
  minReporters: 5,          // distinct people, one vote each per block
  minFirstHand: 3,          // of whom at least this many saw it themselves
  minDays: 2,               // reported on at least two different days
  maxBlocksPerReporter: 3,  // more spread than this in the window looks like campaigning, not a neighbourhood
  burstShare: .6,           // most reporters inside one six-hour spell → held for a person to check
  ringBlocks: 8,            // surroundings used for the usual rate, about 25 km
  pValue: .01,
};

/* ---------- Notes: remove identifying details, hold notes about groups of people ---------- */

const REDACT: RegExp[] = [
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g,                                        // email
  /\bhttps?:\/\/\S+|\bwww\.\S+/gi,                                        // links
  /@\w{2,}/g,                                                             // social handles
  /\b[a-z]{2}[\s.-]?\d{1,2}[\s.-]?[a-z]{0,3}[\s.-]?\d{3,4}\b/gi,          // vehicle registrations (KL 07 AB 1234)
  /(?:\+?91[\s-]?)?\d(?:[\s-]?\d){6,}/g,                                  // phone and other long numbers
  /\b(?:house|h|door|flat|plot|building|bldg|room)\.?\s*(?:no|number|#)\.?\s*[:-]?\s*[\w/-]+/gi, // house numbers
  /\b(?:mr|mrs|ms|miss|shri|sri|smt|dr)\.?\s+[a-z][\w.]*(?:\s+[a-z][\w.]*)?/gi,  // honorific + name
];

// Notes that describe people by origin, faith, caste or community are held, not counted. This list is
// deliberately partial; a reviewer still reads every note behind an area before anyone acts on it.
const IDENTITY = new RegExp([
  "migrant", "bengali", "bihari", "assamese", "odia", "oriya", "north ?indian", "tamilian", "kannadiga", "bhai",
  "guest ?worker", "athithi", "african", "nigerian", "foreigner", "muslim", "hindu", "christian", "dalit", "adivasi",
  "tribal", "colony people", "caste", "ബംഗാളി", "അതിഥി", "ഭായി", "അന്യസംസ്ഥാന", "തമിഴൻ", "കോളനി",
].map(t => /^[\x00-\x7f ?]+$/.test(t)
  ? `(?:^|[^\\p{L}])${t}(?:s|es)?(?![\\p{L}])`   // English: whole words, plurals allowed ("hindustan" is not "hindu")
  : `(?:^|[^\\p{L}\\p{M}])${t}`                 // Malayalam: takes suffixes, so match the stem
).join("|"), "iu");

export function screenNote(raw: string) {
  let text = raw.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.noteChars);
  const before = text;
  for (const re of REDACT) text = text.replace(re, "[removed]");
  return { text, redacted: text !== before, aboutGroup: IDENTITY.test(before) };
}

/* ---------- Aggregation ---------- */

export type StoredTip = {
  id: string; day: string; hour: number; cell: string; what: TipWhat; when: TipWhen; seen: TipSeen; school: boolean;
  note: string; redacted: boolean; reporter: string; status: "counted" | "held"; reason?: string;
};

export type ConcernBlock = {
  id: string; lat: number; lon: number; reporters: number; firstHand: number; days: number;
  expected: number; ratio: number; what: TipWhat; nearSchool: boolean; first: string; last: string;
  near?: string;            // nearest named locality, filled in by the server
};
export type ConcernSummary = {
  windowDays: number; received: number; counted: number;
  held: { group: number; spread: number; burst: number };
  quiet: number;          // blocks with some tips but below the threshold
  usual: number;          // blocks over the threshold yet in line with their surroundings
  blocks: ConcernBlock[];
};

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 864e5;

/** Upper tail P(X >= k) for X ~ Poisson(lambda). */
export function poissonTail(k: number, lambda: number) {
  if (k <= 0) return 1;
  let term = Math.exp(-lambda), cdf = term;
  for (let x = 1; x < k; x++) { term *= lambda / x; cdf += term; }
  return Math.max(0, 1 - cdf);
}

export function aggregate(tips: StoredTip[], population: Map<string, number>, today: string): ConcernSummary {
  const end = dayNumber(today), start = end - LIMITS.windowDays;
  const recent = tips.filter(t => { const d = dayNumber(t.day); return d > start && d <= end; });
  const counted = recent.filter(t => t.status === "counted");
  const block = (t: StoredTip) => { const [i, j] = t.cell.split(":").map(Number); return blockOf(i, j).join(":"); };

  // People who report across many blocks look like a campaign rather than a neighbour.
  const reach = new Map<string, Set<string>>();
  for (const t of counted) reach.set(t.reporter, (reach.get(t.reporter) ?? new Set()).add(block(t)));
  const spread = new Set([...reach].filter(([, b]) => b.size > LIMITS.maxBlocksPerReporter).map(([r]) => r));
  const kept = counted.filter(t => !spread.has(t.reporter));

  // One vote per person per block: their latest tip.
  const votes = new Map<string, StoredTip>();
  for (const t of kept) {
    const key = `${t.reporter}|${block(t)}`, prev = votes.get(key);
    if (!prev || prev.day < t.day || (prev.day === t.day && prev.hour <= t.hour)) votes.set(key, t);
  }
  const byBlock = new Map<string, StoredTip[]>();
  for (const t of votes.values()) byBlock.set(block(t), [...(byBlock.get(block(t)) ?? []), t]);

  // Population per block, from the 1 km access grid.
  const blockPop = new Map<string, number>();
  for (const [cell, people] of population) {
    const [i, j] = cell.split(":").map(Number), key = blockOf(i, j).join(":");
    blockPop.set(key, (blockPop.get(key) ?? 0) + people);
  }
  const statePop = [...blockPop.values()].reduce((a, b) => a + b, 0) || 1;
  const stateRate = votes.size / statePop;

  let quiet = 0, usual = 0, burst = 0;
  const blocks: ConcernBlock[] = [];
  for (const [key, list] of byBlock) {
    const reporters = list.length, firstHand = list.filter(t => t.seen === "saw").length;
    const days = new Set(list.map(t => t.day)).size;
    if (reporters < LIMITS.minReporters || firstHand < LIMITS.minFirstHand || days < LIMITS.minDays) { quiet++; continue; }

    // A sudden burst (most reporters inside six hours) is how coordinated campaigns look; hold it for a person.
    const times = list.map(t => dayNumber(t.day) * 24 + t.hour).sort((a, b) => a - b);
    let peak = 0;
    for (let a = 0, b = 0; b < times.length; b++) { while (times[b] - times[a] >= 6) a++; peak = Math.max(peak, b - a + 1); }
    if (peak / reporters >= LIMITS.burstShare) { burst++; continue; }

    // The usual rate is the surroundings' own rate of reporting per person, so towns, connected areas and
    // places with awareness drives are compared with their neighbours, not with the quiet countryside.
    const [bi, bj] = key.split(":").map(Number);
    let ringVotes = 0, ringPop = 0;
    for (let di = -LIMITS.ringBlocks; di <= LIMITS.ringBlocks; di++) for (let dj = -LIMITS.ringBlocks; dj <= LIMITS.ringBlocks; dj++) {
      if (!di && !dj) continue;
      const k = `${bi + di}:${bj + dj}`;
      ringVotes += byBlock.get(k)?.length ?? 0; ringPop += blockPop.get(k) ?? 0;
    }
    const pop = blockPop.get(key) ?? 0;
    const rate = Math.max(ringPop ? ringVotes / ringPop : 0, stateRate);
    const expected = Math.max(.5, rate * pop);
    if (poissonTail(reporters, expected) >= LIMITS.pValue) { usual++; continue; }

    const tally = new Map<TipWhat, number>();
    for (const t of list) tally.set(t.what, (tally.get(t.what) ?? 0) + 1);
    const sortedDays = list.map(t => t.day).sort();
    blocks.push({
      id: `b${key}`, ...blockCentre(bi, bj), reporters, firstHand, days, expected: Math.round(expected * 10) / 10,
      ratio: Math.round(reporters / expected * 10) / 10, what: [...tally].sort((a, b) => b[1] - a[1])[0][0],
      nearSchool: list.filter(t => t.school).length * 2 >= reporters, first: sortedDays[0], last: sortedDays.at(-1)!,
    });
  }
  blocks.sort((a, b) => b.ratio - a.ratio || b.reporters - a.reporters);
  return {
    windowDays: LIMITS.windowDays, received: recent.length, counted: kept.length,
    held: { group: recent.filter(t => t.reason === "about_group").length,
      spread: counted.length - kept.length, burst },
    quiet, usual, blocks,
  };
}
