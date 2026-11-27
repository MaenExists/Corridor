import type { EnforcementView } from "@/lib/types";
import { date, month, pct } from "./copy";

export function TrackRecord({ view }: { view: EnforcementView }) {
  const r = view.record;
  const weekly = view.weekly.slice(-52);
  const peak = Math.max(...weekly, 1);
  return (
    <footer className="grid grid-cols-2 lg:grid-cols-[1.2fr_1.3fr_.8fr_.9fr_1.1fr_1.2fr] border-t border-ink">
      {r ? (
        <>
          <Cell label="Frozen-forecast test" first wide>
            <p className="text-[34px] leading-none tracking-[-0.03em] font-medium tabular text-signal glow">{pct(r.caught / Math.max(r.total, 1))}</p>
            <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">
              Locked on {date(r.cutoff)}, it caught {r.caught} of the next {r.total} reported seizures inside 1% of Kerala
              {r.previous ? `. Previous model: ${r.previous.caught}. Same-place baseline: ${pct(r.repeatShare)}` : ""}.
            </p>
          </Cell>
          <Cell label="Month by month since" wide>
            <div className="flex items-end gap-2 h-[46px]">
              {r.months.map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1" title={`${m.caught} of ${m.total}`}>
                  <div className="w-full h-[30px] bg-paper-2 border border-ink/30 relative">
                    <div className="absolute bottom-0 inset-x-0 bg-signal" style={{ height: `${(m.caught / Math.max(m.total, 1)) * 100}%` }} />
                  </div>
                  <span className="font-mono text-[9.5px] text-mute">{month(m.month).split(" ")[0]} {pct(m.caught / Math.max(m.total, 1))}</span>
                </div>
              ))}
            </div>
          </Cell>
          <Cell label="Top places">
            <p className="text-[26px] leading-none tracking-[-0.02em] font-medium tabular">{r.topTwentyHit}<span className="text-mute text-[16px]">/20</span></p>
            <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">top places had a seizure reported nearby afterwards.</p>
          </Cell>
          <Cell label={r.previous ? "First-time places" : "Its blind spot"}>
            <p className="text-[26px] leading-none tracking-[-0.02em] font-medium tabular">{r.newCaught}<span className="text-mute text-[16px]">/{r.newPlaces}</span></p>
            <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">
              {r.previous ? `first-ever places caught. Still the hard part (previous model: ${r.previous.newCaught}).` : "first-ever places caught. It sees repeats, not firsts."}
            </p>
          </Cell>
          <Cell label="Live scorecard" wide>
            {view.ledger?.scoredPreRegistered ? (
              <>
                <p className="text-[26px] leading-none tracking-[-0.02em] font-medium tabular">{view.ledger.total.grid}<span className="text-mute text-[16px]">/{view.ledger.total.reports}</span></p>
                <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">caught by {view.ledger.scoredPreRegistered} locked weekly lists. Same-place baseline: {view.ledger.total.repeat}.</p>
              </>
            ) : (
              <>
                <p className="text-[15px] leading-tight font-medium text-electric flex items-center gap-2"><i className="pulse block size-2 rounded-full bg-electric shrink-0" />{view.ledger?.pending ? `${view.ledger.pending} weekly list${view.ledger.pending > 1 ? "s" : ""} locked` : "Not started"}</p>
                <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">
                  {view.ledger?.nextDue ? `Every list is locked on issue and scored four weeks later. First result ${date(view.ledger.nextDue)}.`
                    : "Run make hotspot-weekly to start freezing weekly forecasts."}
                </p>
              </>
            )}
          </Cell>
        </>
      ) : <Cell label="Track record" first><p className="text-[13px]">Run make hotspot-cutoff to measure it.</p></Cell>}
      <Cell label={`Reported seizures per week · ${view.reportsUsed.toLocaleString()} on file`}>
        <div className="flex items-end gap-[2px] h-[46px]">
          {weekly.map((v, i) => (
            <i key={i} className={`flex-1 block ${i >= weekly.length - 4 ? "bg-electric" : "bg-ink/80"}`}
              style={{ height: `${Math.max(3, (v / peak) * 100)}%` }} title={`${v}`} />
          ))}
        </div>
        <p className="mt-1 text-[11px] text-mute">Past year · last four weeks highlighted</p>
      </Cell>
    </footer>
  );
}

function Cell({ label, children, first, wide }: { label: string; children: React.ReactNode; first?: boolean; wide?: boolean }) {
  // On phones the wide cells take a full row; the short facts sit in pairs.
  return (
    <div className={`px-4 md:px-5 py-3 border-ink border-b lg:border-b-0 ${first ? "" : "lg:border-l"} max-lg:last:col-span-2 cross
      ${wide ? "max-lg:col-span-2" : "max-lg:[&:nth-child(even)]:border-l"}`}>
      <p className="label text-mute mb-2">{label}</p>
      {children}
    </div>
  );
}
