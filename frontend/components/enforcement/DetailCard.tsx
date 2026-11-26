"use client";

import type { EnforcementView } from "@/lib/types";
import { KIND, LEVEL, pct } from "./copy";

export type Selection = { kind: "place" | "kind" | "gateway"; id: string } | null;

export function DetailCard({ view, selection, onClose }: {
  view: EnforcementView; selection: NonNullable<Selection>; onClose: () => void;
}) {
  return (
    <div className="absolute left-3 right-3 bottom-3 md:right-auto md:left-4 md:bottom-4 z-[600] md:w-[380px] max-h-[calc(100%-1.5rem)] overflow-y-auto bg-paper border border-ink">
      <button onClick={onClose} aria-label="Close"
        className="absolute right-0 top-0 size-9 grid place-items-center border-l border-b border-ink hover:bg-ink hover:text-paper">
        <svg viewBox="0 0 10 10" className="size-2.5"><path d="M1 1l8 8M9 1 1 9" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      {selection.kind === "place" && <Place view={view} id={selection.id} />}
      {selection.kind === "kind" && <Kind view={view} id={selection.id} />}
      {selection.kind === "gateway" && <Gate view={view} id={selection.id} />}
    </div>
  );
}

function Place({ view, id }: { view: EnforcementView; id: string }) {
  const p = view.places.find(x => x.id === id);
  if (!p) return null;
  const level = LEVEL[p.level];
  return (
    <>
      <div className="px-4 pt-4 pb-3 pr-12 border-b border-ink">
        <p className="label text-mute">#{p.rank} · {p.area}</p>
        <h3 className="mt-1 text-[24px] leading-tight tracking-[-0.02em] font-medium">{p.name}</h3>
        <p className="mt-2 inline-flex items-center gap-2 text-[12.5px]">
          <i className="block size-3 border border-ink" style={{ background: level.fill }} />{level.text} in the next four weeks
        </p>
      </div>
      <div className={`grid ${p.expected != null ? "grid-cols-3" : "grid-cols-2"} border-b border-ink`}>
        <Stat value={p.reportsYear} label="seizures reported nearby, past year" />
        <Stat value={p.reportsMonth} label="in the last four weeks" border />
        {p.expected != null && <Stat value={p.expected < 0.95 ? p.expected.toFixed(1) : String(Math.round(p.expected))} label="reports expected, next four weeks" border />}
      </div>
      <div className="px-4 py-3">
        <p className="label text-mute mb-2">Why it is flagged</p>
        <ul className="space-y-1.5 text-[13px] leading-snug">
          {p.why.map(w => <li key={w} className="flex gap-2"><span className="mt-[7px] size-1 bg-ink shrink-0" />{w}</li>)}
        </ul>
      </div>
      {p.kind && KIND[p.kind] && (
        <div className="px-4 py-3 border-t border-ink flex gap-3">
          <span className="shrink-0 grid place-items-center size-6 border-[1.5px] border-ink font-mono text-[11px] font-semibold">{KIND[p.kind].letter}</span>
          <p className="text-[12.5px] text-ink-2 leading-snug"><b className="text-ink font-medium">{KIND[p.kind].title}.</b> {KIND[p.kind].plain}</p>
        </div>
      )}
      <Note>Covers about {p.squares} km² around {p.name}. A likelihood from reported seizures, not a confirmed location.</Note>
    </>
  );
}

function Kind({ view, id }: { view: EnforcementView; id: string }) {
  const k = view.kinds.find(x => x.id === id);
  if (!k) return null;
  return (
    <>
      <div className="px-4 pt-4 pb-3 pr-12 border-b border-ink">
        <p className="label text-mute">Hotspot · {k.area}</p>
        <h3 className="mt-1 text-[24px] leading-tight tracking-[-0.02em] font-medium">{k.name}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {k.kinds.map(t => <span key={t} className="text-[11.5px] px-1.5 py-0.5 border border-ink">{KIND[t]?.title ?? t}</span>)}
        </div>
      </div>
      <div className="grid grid-cols-3 border-b border-ink">
        <Stat value={k.reports} label="reports, 2 years" />
        <Stat value={pct(k.bigHaulShare)} label="hauls of 1 kg+" border />
        <Stat value={pct(k.syntheticShare)} label="synthetic drugs" border />
      </div>
      <div className="px-4 py-3 space-y-2 text-[13px] leading-snug">
        {k.kinds.map(t => KIND[t] && <p key={t}><b className="font-medium">{KIND[t].title}:</b> {KIND[t].plain}</p>)}
        <p className="text-ink-2">{pct(k.recentShare)} of its reports are from the last six months. About {Math.round(k.borderKm)} km from the state border.</p>
      </div>
      <Note>Types come from simple rules about place and haul size. They describe a pattern; they do not prove a route.</Note>
    </>
  );
}

function Gate({ view, id }: { view: EnforcementView; id: string }) {
  const g = view.gateways.find(x => x.id === id);
  if (!g) return null;
  return (
    <>
      <div className="px-4 pt-4 pb-3 pr-12 border-b border-ink">
        <p className="label text-mute">Border crossing</p>
        <h3 className="mt-1 text-[24px] leading-tight tracking-[-0.02em] font-medium">Near {g.name}</h3>
      </div>
      <div className="grid grid-cols-1 border-b border-ink">
        <Stat value={g.activeNearby} label="reported seizures in hotspot clusters within 15 km" />
      </div>
      <Note>
        A main road or railway crosses the state border here. {g.activeNearby ? "Seizures are being reported nearby." :
          "Few seizures nearby reach the news, so quiet here means unknown, not clean."}
      </Note>
    </>
  );
}

function Stat({ value, label, border }: { value: number | string; label: string; border?: boolean }) {
  return (
    <div className={`px-4 py-3 ${border ? "border-l border-ink" : ""}`}>
      <p className="text-[26px] leading-none tracking-[-0.02em] font-medium tabular">{value}</p>
      <p className="mt-1.5 text-[11.5px] text-mute leading-tight">{label}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-2.5 border-t border-ink bg-paper-2 text-[11.5px] text-ink-2 leading-snug">{children}</p>;
}
