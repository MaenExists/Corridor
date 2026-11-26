"use client";

import dynamic from "next/dynamic";
import { Header, Mark } from "@/components/Header";
import { useMemo, useState } from "react";
import type { EnforcementView } from "@/lib/types";
import type { Basemap, Focus, Layers, Pin } from "@/components/map/MapView";
import { PlaceSearch, type LocalItem, type Picked } from "@/components/map/PlaceSearch";
import { KIND, LEVEL, date } from "./copy";
import { WatchTab, WhyTab, DistrictTab } from "./Tabs";
import { DetailCard, type Selection } from "./DetailCard";
import { TrackRecord } from "./TrackRecord";
import { ConcernTab } from "./ConcernTab";
import { RisingTab } from "./RisingTab";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center label text-mute">Loading map</div>,
});

type Tab = "watch" | "rising" | "why" | "districts" | "tips";
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "watch", label: "Where to look", hint: "Four weeks" },
  { id: "rising", label: "New & rising", hint: "Active" },
  { id: "why", label: "Why there", hint: "Patterns" },
  { id: "districts", label: "Districts", hint: "Official" },
  { id: "tips", label: "Public tips", hint: "Unverified" },
];

export function EnforcementApp({ view }: { view: EnforcementView }) {
  const [tab, setTab] = useState<Tab>("watch");
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [layers, setLayers] = useState<Layers>({ places: true, kinds: false, gateways: true, concern: true, rising: true, lookAlike: false });
  const [selection, setSelection] = useState<Selection>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const [pin, setPin] = useState<Pin>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const select = (kind: "place" | "kind" | "gateway" | "rising" | "look", id: string) => {
    if (kind === "rising" || kind === "look") {
      const item = kind === "rising" ? view.v2?.rising.find(r => r.id === id) : view.v2?.lookAlike.find(l => l.id === id);
      if (!item) return;
      setSelection(null); setPicked(id); setPin({ lat: item.lat, lon: item.lon, name: item.name });
      setFocus({ lat: item.lat, lon: item.lon, zoom: kind === "rising" ? 11 : 13, ring: false });
      setLayers(l => ({ ...l, [kind === "rising" ? "rising" : "lookAlike"]: true }));
      if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setPicked(null);
    const item = kind === "place" ? view.places.find(p => p.id === id)
      : kind === "kind" ? view.kinds.find(k => k.id === id) : view.gateways.find(g => g.id === id);
    if (!item) return;
    setSelection({ kind, id } as Selection); setPin(null);
    setFocus({ lat: item.lat, lon: item.lon, zoom: kind === "gateway" ? 11 : 12.5 });
    if (kind === "kind") setLayers(l => ({ ...l, kinds: true }));
    // On small screens the list sits below the map: bring the map back into view.
    if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const onTab = (t: Tab) => {
    setTab(t);
    if (t === "why") setLayers(l => ({ ...l, kinds: true, gateways: true }));
    if (t === "tips") setLayers(l => ({ ...l, concern: true }));
    if (t === "rising") setLayers(l => ({ ...l, rising: true, lookAlike: true }));
  };
  const searchable = useMemo<LocalItem[]>(() => view.places.map(p => ({ id: p.id, name: p.name, sub: p.area, lat: p.lat, lon: p.lon,
    tag: "Watch list" })), [view.places]);
  const onSearch = (p: Picked) => {
    if (p.local) return select("place", p.local.id);
    setSelection(null); setPin({ lat: p.lat, lon: p.lon, name: p.name }); setFocus({ lat: p.lat, lon: p.lon, zoom: 14, ring: false });
    if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const latest = view.freshness[0]?.latest ?? view.asOf;
  const highCount = useMemo(() => view.places.filter(p => p.level === "high").length, [view.places]);

  return (
    <div className="min-h-dvh lg:h-dvh grid grid-rows-[56px_auto_auto] lg:grid-rows-[56px_minmax(0,1fr)_auto] bg-paper">
      <Header section="enforcement" tagline="Where reported drug seizures are most likely in the next four weeks." updated={date(latest)} />

      {/* Body: the map leads, a ruled rail on the right */}
      <main className="grid lg:grid-cols-[minmax(0,1fr)_420px] min-h-0">
        <section className="relative h-[62vh] lg:h-auto lg:min-h-0 border-b lg:border-b-0 border-ink overflow-hidden">
          <MapView cells={view.cells} places={view.places} kinds={view.kinds} gateways={view.gateways} concern={view.concern.blocks}
            rising={view.v2?.rising ?? []} lookAlike={view.v2?.lookAlikeCells ?? []}
            basemap={basemap} layers={layers} focus={focus} pin={pin} selectedId={selection?.id ?? null} onSelect={select} />

          {/* Legend, top left */}
          <div className="absolute left-3 top-3 md:left-4 md:top-4 z-[600] w-[196px] md:w-[248px] flex flex-col gap-2">
            <PlaceSearch onSelect={onSearch} local={searchable} placeholder="Search a place" />
          <div className="bg-paper border border-ink">
            <div className="px-3 py-2 border-b border-ink label">On the map</div>
            <div className="px-3 py-2.5 space-y-1.5 text-[12.5px]">
              <Toggle on={layers.places} onClick={() => setLayers(l => ({ ...l, places: !l.places }))}>
                <span className="flex gap-0.5">{(["high", "elevated", "watch"] as const).map(k =>
                  <i key={k} className="block size-3 border border-ink" style={{ background: LEVEL[k].fill }} />)}</span>
                Likely seizure areas
              </Toggle>
              <Toggle on={layers.rising} onClick={() => setLayers(l => ({ ...l, rising: !l.rising }))}>
                <span className="block size-3.5 rounded-full border-[1.5px] border-dashed border-signal" />
                Rising now
              </Toggle>
              <Toggle on={layers.lookAlike} onClick={() => setLayers(l => ({ ...l, lookAlike: !l.lookAlike }))}>
                <span className="block size-3 border border-ink" />
                Look-alike, no reports yet
              </Toggle>
              <Toggle on={layers.kinds} onClick={() => setLayers(l => ({ ...l, kinds: !l.kinds }))}>
                <span className="grid place-items-center size-4 border border-ink font-mono text-[9px] font-semibold">T</span>
                Hotspot types
              </Toggle>
              <Toggle on={layers.gateways} onClick={() => setLayers(l => ({ ...l, gateways: !l.gateways }))}>
                <span className="w-4 text-center">◆</span>
                Border crossings
              </Toggle>
              <Toggle on={layers.concern} onClick={() => setLayers(l => ({ ...l, concern: !l.concern }))}>
                <span className="block size-3.5 border border-dashed border-ink" />
                Public tips <span className="text-mute">· unverified</span>
              </Toggle>
            </div>
            <div className="hidden md:block px-3 py-2 border-t border-ink text-[11.5px] text-ink-2 leading-snug">
              Dots mark places. Zoom in to see the 1 km squares. Darker red means more likely.
            </div>
          </div>
          </div>

          {/* Basemap switch, top right */}
          <div className="absolute right-3 top-3 md:right-4 md:top-4 z-[500] flex border border-ink bg-paper" role="group" aria-label="Map style">
            {(["satellite", "street"] as const).map((b, i) => (
              <button key={b} onClick={() => setBasemap(b)} aria-pressed={basemap === b}
                className={`label px-3 py-2 ${i ? "border-l border-ink" : ""} ${basemap === b ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                {b === "satellite" ? "Satellite" : "Map"}
              </button>
            ))}
          </div>

          {selection && <DetailCard view={view} selection={selection} onClose={() => { setSelection(null); setFocus(null); }} />}

          {view.missing.length > 0 && (
            <div className="absolute inset-x-4 bottom-4 z-[500] bg-paper border border-ink p-3 text-[13px]">
              {view.missing.map(m => <p key={m}>{m}</p>)}
            </div>
          )}
        </section>

        <aside className="flex flex-col lg:min-h-0 lg:border-l border-ink bg-paper">
          <div className="grid grid-cols-5 border-b border-ink" role="tablist">
            {TABS.map((t, i) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}
                className={`min-w-0 text-left px-2 md:px-2.5 py-3 ${i ? "border-l border-ink" : ""} ${tab === t.id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                <span className="block text-[12.5px] font-medium leading-tight">{t.label}</span>
                <span className={`label ${tab === t.id ? "text-paper/60" : "text-mute"}`}>{t.hint}</span>
              </button>
            ))}
          </div>
          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto scroll-thin">
            {tab === "watch" && <WatchTab view={view} highCount={highCount} selectedId={selection?.id ?? null}
              onPick={id => select("place", id)} />}
            {tab === "rising" && <RisingTab v2={view.v2} selectedId={picked}
              onRising={r => select("rising", r.id)} onLook={l => select("look", l.id)} />}
            {tab === "why" && <WhyTab view={view} selectedId={selection?.id ?? null} onPick={select}
              onPlace={(lat, lon, name) => { setSelection(null); setPin({ lat, lon, name }); setFocus({ lat, lon, zoom: 12.5, ring: false }); }} />}
            {tab === "districts" && <DistrictTab view={view} />}
            {tab === "tips" && <ConcernTab concern={view.concern} onPick={b => {
              setSelection(null); setFocus({ lat: b.lat, lon: b.lon, zoom: 12 });
              if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
            }} />}
          </div>
        </aside>
      </main>

      <TrackRecord view={view} />
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`w-full flex items-center gap-2.5 text-left ${on ? "" : "opacity-40"} hover:opacity-100`}>
      <span className={`size-3.5 border border-ink grid place-items-center ${on ? "bg-ink" : ""}`}>
        {on && <svg viewBox="0 0 10 10" className="size-2.5"><path d="M1.5 5.2 4 7.6 8.6 2.6" fill="none" stroke="#0a0a0a" strokeWidth="1.6" /></svg>}
      </span>
      {children}
    </button>
  );
}

export { Mark };
export { KIND };
