"use client";

import { LIMITS, TIP_WHAT, type ConcernBlock, type ConcernSummary } from "@/lib/tipRules";
import { date } from "./copy";

/** Public tips, kept apart from the forecast: unverified, aggregated, and explained step by step. */
export function ConcernTab({ concern, onPick }: { concern: ConcernSummary; onPick: (b: ConcernBlock) => void }) {
  const { blocks, held } = concern;
  const heldTips = held.group + held.spread;
  return (
    <div>
      <div className="px-5 py-5 border-b border-ink">
        <p className="label text-mute mb-2">Public tips · last {concern.windowDays} days</p>
        <h2 className="text-[22px] leading-[1.15] tracking-[-0.015em] font-medium">
          {blocks.length ? `${blocks.length} ${blocks.length === 1 ? "area" : "areas"} where several people noticed something.`
            : "No area stands out from public tips yet."}
        </h2>
        <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">
          Unverified and kept out of the forecast. A tip is a reason to look, never a reason to act. No names are collected,
          and each area spans about 3 km.
        </p>
      </div>

      {blocks.length > 0 && (
        <ol>
          {blocks.map((b, i) => (
            <li key={b.id}>
              <button onClick={() => onPick(b)} className="w-full grid grid-cols-[40px_1fr_auto] items-center text-left border-b border-ink/15 hover:bg-paper-2">
                <span className="font-mono text-[12px] text-center opacity-60">{String(i + 1).padStart(2, "0")}</span>
                <span className="py-3 pr-2 min-w-0">
                  <span className="block text-[14.5px] font-medium truncate">{b.near ? `Near ${b.near}` : "Unnamed area"}</span>
                  <span className="block text-[12px] text-mute truncate">
                    {TIP_WHAT[b.what].label}{b.nearSchool ? " · near a school or college" : ""}
                  </span>
                  <span className="block text-[11.5px] text-mute">{b.reporters} people · {b.firstHand} saw it · {b.days} days · {date(b.first)} to {date(b.last)}</span>
                </span>
                <span className="pr-5 text-right">
                  <span className="block text-[15px] font-medium tabular text-signal">{b.ratio}×</span>
                  <span className="block text-[11px] text-mute">usual</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      <section className="px-5 py-5 border-b border-ink">
        <p className="label text-mute mb-3">What came in</p>
        <ul className="text-[13px]">
          <Row label="Tips received" value={concern.received} />
          <Row label="Counted, one per person per area" value={concern.counted} />
          <Row label="Held: note described a group of people" value={held.group} muted />
          <Row label="Held: one person across many areas" value={held.spread} muted />
          <Row label="Areas held: sudden burst, check by hand" value={held.burst} muted />
          <Row label="Areas with too few people so far" value={concern.quiet} muted />
          <Row label="Areas in line with their surroundings" value={concern.usual} muted />
          <Row label="Areas that stand out" value={blocks.length} strong />
        </ul>
        {heldTips + held.burst > 0 && (
          <p className="mt-3 text-[11.5px] text-mute leading-snug">Held tips stay in the private store for a person to read. They never reach the map.</p>
        )}
      </section>

      <section className="px-5 py-5">
        <p className="label text-mute mb-3">When an area shows here</p>
        <ol className="space-y-2.5 text-[12.5px] text-ink-2 leading-snug">
          <Rule n={1}>At least {LIMITS.minReporters} different people, each counted once, and at least {LIMITS.minFirstHand} who saw it themselves.</Rule>
          <Rule n={2}>Tips on at least {LIMITS.minDays} different days. A burst within a few hours is held, because that is how campaigns look.</Rule>
          <Rule n={3}>More tips than the surrounding 25 km usually sends for that many residents. Busy towns and areas with awareness
            drives are compared with their neighbours, not with quiet villages.</Rule>
          <Rule n={4}>People who send tips about many different areas are left out, and notes that describe people by origin,
            faith, caste or community are held.</Rule>
        </ol>
        <p className="mt-4 text-[11.5px] text-mute leading-relaxed">
          Few or no tips does not mean an area is clear. Some places have fewer phones, less trust or less reason to report.
          Check any area against other information before acting. Seizures that follow a tip are still reported seizures,
          so they can feed back into the forecast; this is a known limit.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: number; muted?: boolean; strong?: boolean }) {
  return (
    <li className={`flex justify-between py-1.5 border-b border-ink/15 ${muted ? "text-ink-2" : ""} ${strong ? "font-medium" : ""}`}>
      <span>{label}</span><span className="tabular font-mono text-[13px]">{value}</span>
    </li>
  );
}
function Rule({ n, children }: { n: number; children: React.ReactNode }) {
  return <li className="grid grid-cols-[22px_1fr]"><span className="font-mono text-[11px] text-mute pt-px">{n}</span><span>{children}</span></li>;
}
