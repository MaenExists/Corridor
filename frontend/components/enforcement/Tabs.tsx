"use client";

import { Profiles } from "./RisingTab";
import type { EnforcementView } from "@/lib/types";
import { KIND, LEVEL, month, pct } from "./copy";

const DAYS = (n: number) => (n === 28 ? "four weeks" : `${n} days`);

export function WatchTab({ view, highCount, selectedId, onPick }: {
  view: EnforcementView; highCount: number; selectedId: string | null; onPick: (id: string) => void;
}) {
  return (
    <div>
      <div className="px-5 py-5 border-b border-ink">
        <p className="label text-mute mb-2">Next {DAYS(view.horizonDays)}</p>
        <h2 className="text-[22px] leading-[1.15] tracking-[-0.015em] font-medium">
          {highCount} places stand out. Start with these.
        </h2>
        <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">
          Ranked by how likely a seizure is to be reported around them, learned from past seizures and news coverage
          across Kerala.{view.places.some(p => p.expected != null) ? " The number is how many reports to expect in four weeks." : ""}
        </p>
      </div>
      <ol>
        {view.places.slice(0, 40).map(p => (
          <li key={p.id}>
            <button onClick={() => onPick(p.id)} aria-pressed={selectedId === p.id}
              className={`w-full grid grid-cols-[40px_1fr_auto] items-center text-left border-b border-ink/15
                ${selectedId === p.id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
              <span className="font-mono text-[12px] tabular text-center opacity-60">{String(p.rank).padStart(2, "0")}</span>
              <span className="py-3 pr-2 min-w-0">
                <span className="block text-[14.5px] font-medium truncate">{p.name}</span>
                <span className={`block text-[12px] truncate ${selectedId === p.id ? "text-paper/65" : "text-mute"}`}>{p.area}</span>
              </span>
              <span className="pr-5 flex items-center gap-2">
                <span className="text-[12px] tabular opacity-70" title="Reports expected in the next four weeks">
                  {p.expected != null ? `~${p.expected < 0.95 ? p.expected.toFixed(1) : Math.round(p.expected)}` : p.reportsYear > 0 ? `${p.reportsYear}/yr` : "new"}
                </span>
                <i className="block size-3 border border-ink" style={{ background: LEVEL[p.level].fill }} title={LEVEL[p.level].text} />
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="px-5 py-4 text-[12px] text-mute leading-relaxed">
        A square that is not shaded is not shown to be safe. The forecast only knows seizures that were reported.
      </p>
    </div>
  );
}

export function WhyTab({ view, selectedId, onPick, onPlace }: {
  view: EnforcementView; selectedId: string | null; onPick: (kind: "kind" | "gateway", id: string) => void;
  onPlace: (lat: number, lon: number, name: string) => void;
}) {
  const peak = Math.max(...view.surroundings.map(s => s.times), 1);
  const byKind = Object.keys(KIND).map(k => ({ k, items: view.kinds.filter(x => x.kinds[0] === k) })).filter(g => g.items.length);
  return (
    <div>
      {view.v2 && <Profiles profiles={view.v2.profiles} onPlace={onPlace} />}
      <section className="px-5 py-5 border-b border-ink">
        <p className="label text-mute mb-2">What surrounds hotspots</p>
        <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">Seizures cluster near places where people and goods move.</h2>
        <ul className="mt-4 space-y-2.5">
          {view.surroundings.map(s => (
            <li key={s.label} className="grid grid-cols-[1fr_auto] gap-3 items-center text-[13px]">
              <span>
                Within 1 km of {s.label}
                <span className="block h-1.5 mt-1 bg-paper-2 border border-ink/30">
                  <span className="block h-full bg-ink" style={{ width: `${(s.times / peak) * 100}%` }} />
                </span>
              </span>
              <span className="font-mono tabular text-[13px]">{s.times}×</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11.5px] text-mute leading-relaxed">
          How much more often seizures are reported there than elsewhere, with population held equal.
        </p>
      </section>

      <section className="border-b border-ink">
        <div className="px-5 pt-5 pb-3">
          <p className="label text-mute mb-2">Hotspot types · rules</p>
          <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">What each cluster looks like, by fixed rules.</h2>
        </div>
        {byKind.map(({ k, items }) => (
          <div key={k} className="border-t border-ink/15">
            <div className="px-5 pt-3 flex gap-3">
              <span className="shrink-0 grid place-items-center size-6 border-[1.5px] border-ink font-mono text-[11px] font-semibold">
                {KIND[k].letter}</span>
              <div>
                <p className="text-[14px] font-medium">{KIND[k].title}</p>
                <p className="text-[12.5px] text-ink-2 leading-snug">{KIND[k].plain}</p>
              </div>
            </div>
            <div className="px-5 pt-2 pb-3 pl-14 flex flex-wrap gap-1.5">
              {items.slice(0, 8).map(item => (
                <button key={item.id} onClick={() => onPick("kind", item.id)}
                  className={`text-[12px] px-2 py-1 border border-ink ${selectedId === item.id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                  {item.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section>
        <div className="px-5 pt-5 pb-3">
          <p className="label text-mute mb-2">Border crossings</p>
          <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">Where roads and railways enter Kerala.</h2>
          <p className="mt-2 text-[12.5px] text-ink-2 leading-relaxed">
            Sorted by reported seizures in clusters within 15 km. A quiet crossing is not shown to be clean; few seizures
            near the border reach the news.
          </p>
        </div>
        <ul>
          {view.gateways.map(g => (
            <li key={g.id}>
              <button onClick={() => onPick("gateway", g.id)}
                className={`w-full grid grid-cols-[32px_1fr_auto] items-center text-left px-0 border-t border-ink/15
                  ${selectedId === g.id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                <span className="text-center">◆</span>
                <span className="py-2.5 text-[13.5px]">{g.name}</span>
                <span className="pr-5 text-[12px] tabular opacity-70">{g.activeNearby ? `${g.activeNearby} nearby` : "quiet"}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function DistrictTab({ view }: { view: EnforcementView }) {
  const max = Math.max(...view.districts.map(d => Math.max(d.latest, d.usual)), 1);
  const latest = view.districts[0]?.latestMonth;
  return (
    <div>
      <div className="px-5 py-5 border-b border-ink">
        <p className="label text-mute mb-2">Official Excise figures · {latest ? month(latest) : "—"}</p>
        <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">Drug cases registered by Excise, district by district.</h2>
        <p className="mt-2 text-[12.5px] text-ink-2 leading-relaxed">{view.districtForecast.note}</p>
      </div>
      <div className="px-5 py-2 grid grid-cols-[1fr_auto_auto] gap-x-4 label text-mute border-b border-ink/15">
        <span>District</span><span>Cases</span><span className="w-[70px] text-right">vs usual</span>
      </div>
      <ul>
        {view.districts.map(d => (
          <li key={d.name} className="px-5 py-2.5 grid grid-cols-[1fr_auto_auto] gap-x-4 items-center border-b border-ink/15">
            <span className="min-w-0">
              <span className="block text-[14px]">{d.name}</span>
              <span className="relative block h-1.5 mt-1.5 bg-paper-2">
                <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${(d.latest / max) * 100}%` }} />
                <span className="absolute -top-0.5 -bottom-0.5 w-px bg-signal" style={{ left: `${(d.usual / max) * 100}%` }}
                  title={`Usual month: ${d.usual}`} />
              </span>
            </span>
            <span className="font-mono tabular text-[14px]">{d.latest}</span>
            <span className={`w-[70px] text-right text-[12.5px] tabular ${d.change > .15 ? "text-signal font-medium" : "text-ink-2"}`}>
              {d.change > .15 ? `▲ ${pct(d.change)}` : d.change < -.15 ? `▼ ${pct(-d.change)}` : "steady"}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-5 py-4 text-[11.5px] text-mute leading-relaxed">
        Bars show this month; the red tick is a usual month in 2024. Counts are cases registered, which follow
        enforcement effort as well as drug activity.
      </p>
    </div>
  );
}
