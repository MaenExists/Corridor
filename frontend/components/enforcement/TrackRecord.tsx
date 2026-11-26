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
          <Cell label="How often it is right" first>
            <p className="text-[34px] leading-none tracking-[-0.03em] font-medium tabular">{pct(r.caught / Math.max(r.total, 1))}</p>
            <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">
              A forecast frozen on {date(r.cutoff)} caught {r.caught} of {r.total} later seizures in 1% of Kerala
              {r.previous ? ` (previous model: ${r.previous.caught}; same place again: ${pct(r.repeatShare)})` : ""}.
            </p>
          </Cell>
          <Cell label="Month by month since then">
            <div className="flex items-end gap-2 h-[46px]">
              {r.months.map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1" title={`${m.caught} of ${m.total}`}>
                  <div className="w-full h-[30px] bg-paper-2 border border-ink/30 relative">
                    <div className="absolute bottom-0 inset-x-0 bg-ink" style={{ height: `${(m.caught / Math.max(m.total, 1)) * 100}%` }} />
                  </div>
                  <span className="font-mono text-[9.5px] text-mute">{month(m.month).split(" ")[0]} {pct(m.caught / Math.max(m.total, 1))}</span>
                </div>
              ))}
            </div>
          </Cell>
          <Cell label="Top places">
            <p className="text-[26px] leading-none tracking-[-0.02em] font-medium tabular">{r.topTwentyHit}<span className="text-mute text-[16px]">/20</span></p>
            <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">had a seizure afterwards.</p>
          </Cell>
          <Cell label={r.previous ? "New places" : "Its blind spot"}>
            <p className="text-[26px] leading-none tracking-[-0.02em] font-medium tabular text-signal">{r.newCaught}<span className="text-mute text-[16px]">/{r.newPlaces}</span></p>
            <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">
              {r.previous ? `brand-new places caught (previous model: ${r.previous.newCaught}).` : "brand-new places caught. It sees repeats, not firsts."}
            </p>
          </Cell>
          <Cell label="Live record">
            {view.ledger?.scoredPreRegistered ? (
              <>
                <p className="text-[26px] leading-none tracking-[-0.02em] font-medium tabular">{view.ledger.total.grid}<span className="text-mute text-[16px]">/{view.ledger.total.reports}</span></p>
                <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">caught by {view.ledger.scoredPreRegistered} frozen weekly forecasts; repeat map {view.ledger.total.repeat}.</p>
              </>
            ) : (
              <>
                <p className="text-[15px] leading-tight font-medium">{view.ledger?.pending ? `${view.ledger.pending} forecast${view.ledger.pending > 1 ? "s" : ""} locked` : "Not started"}</p>
                <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">
                  {view.ledger?.nextDue ? `Each week's list is frozen, then scored after four weeks. First score ${date(view.ledger.nextDue)}.`
                    : "Run make hotspot-weekly to start freezing weekly forecasts."}
                </p>
              </>
            )}
          </Cell>
        </>
      ) : <Cell label="Track record" first><p className="text-[13px]">Run make hotspot-cutoff to measure it.</p></Cell>}
      <Cell label={`Seizures reported per week · ${view.reportsUsed.toLocaleString()} used`}>
        <div className="flex items-end gap-[2px] h-[46px]">
          {weekly.map((v, i) => (
            <i key={i} className={`flex-1 block ${i >= weekly.length - 4 ? "bg-signal" : "bg-ink"}`}
              style={{ height: `${Math.max(3, (v / peak) * 100)}%` }} title={`${v}`} />
          ))}
        </div>
        <p className="mt-1 text-[11px] text-mute">Past year · last four weeks in red</p>
      </Cell>
    </footer>
  );
}

function Cell({ label, children, first }: { label: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div className={`px-4 md:px-5 py-3 border-ink border-b lg:border-b-0 ${first ? "" : "lg:border-l"} max-lg:[&:nth-child(even)]:border-l max-lg:last:col-span-2 cross`}>
      <p className="label text-mute mb-2">{label}</p>
      {children}
    </div>
  );
}
