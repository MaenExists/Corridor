"use client";

import dynamic from "next/dynamic";
import { Header, Mark } from "@/components/Header";
import { useEffect, useMemo, useState } from "react";
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
  { id: "watch", label: "Priority", hint: "Next 28 days" },
  { id: "rising", label: "Emerging", hint: "New & rising" },
  { id: "why", label: "Patterns", hint: "Why there" },
  { id: "districts", label: "Districts", hint: "Official" },
  { id: "tips", label: "Tips", hint: "Unverified" },
];

const isSmall = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

export function EnforcementApp({ view }: { view: EnforcementView }) {
  const [tab, setTab] = useState<Tab>("watch");
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [layers, setLayers] = useState<Layers>({ places: true, kinds: false, gateways: true, concern: true, rising: true, lookAlike: false });
  const [selection, setSelection] = useState<Selection>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const [pin, setPin] = useState<Pin>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // The layer panel covers most of a phone screen, so it starts folded there.
  const [legendOpen, setLegendOpen] = useState(true);
  useEffect(() => { if (window.matchMedia("(max-width: 767px)").matches) setLegendOpen(false); }, []);

  const toMap = () => { if (isSmall()) window.scrollTo({ top: 0, behavior: "smooth" }); };
  const select = (kind: "place" | "kind" | "gateway" | "rising" | "look", id: string) => {
    if (kind === "rising" || kind === "look") {
      const item = kind === "rising" ? view.v2?.rising.find(r => r.id === id) : view.v2?.lookAlike.find(l => l.id === id);
      if (!item) return;
      setSelection(null); setPicked(id); setPin({ lat: item.lat, lon: item.lon, name: item.name });
      setFocus({ lat: item.lat, lon: item.lon, zoom: kind === "rising" ? 11 : 13, ring: false });
      setLayers(l => ({ ...l, [kind === "rising" ? "rising" : "lookAlike"]: true }));
      toMap();
      return;
    }
    setPicked(null);
    const item = kind === "place" ? view.places.find(p => p.id === id)
      : kind === "kind" ? view.kinds.find(k => k.id === id) : view.gateways.find(g => g.id === id);
    if (!item) return;
    setSelection({ kind, id } as Selection); setPin(null); setLegendOpen(false);
    setFocus({ lat: item.lat, lon: item.lon, zoom: kind === "gateway" ? 11 : 12.5 });
    if (kind === "kind") setLayers(l => ({ ...l, kinds: true }));
    toMap();
  };
  const onTab = (t: Tab) => {
    setTab(t);
    if (t === "why") setLayers(l => ({ ...l, kinds: true, gateways: true }));
    if (t === "tips") setLayers(l => ({ ...l, concern: true }));
    if (t === "rising") setLayers(l => ({ ...l, rising: true, lookAlike: true }));
  };
  const searchable = useMemo<LocalItem[]>(() => view.places.map(p => ({ id: p.id, name: p.name, sub: p.area, lat: p.lat, lon: p.lon,
    tag: `#${p.rank}` })), [view.places]);
  const onSearch = (p: Picked) => {
    if (p.local) return select("place", p.local.id);
    setSelection(null); setPin({ lat: p.lat, lon: p.lon, name: p.name }); setFocus({ lat: p.lat, lon: p.lon, zoom: 14, ring: false });
    toMap();
  };
  const latest = view.freshness[0]?.latest ?? view.asOf;
  const highCount = useMemo(() => view.places.filter(p => p.level === "high").length, [view.places]);
  const onLayers = Object.values(layers).filter(Boolean).length;

  return (
    <div className="theme-enforcement min-h-dvh lg:h-dvh grid grid-rows-[56px_auto_auto] lg:grid-rows-[56px_minmax(0,1fr)_auto] bg-paper">
      <Header section="enforcement" tagline="Kerala seizure outlook. Next 28 days, rebuilt every week." updated={date(latest)} />

      <main className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_440px] min-h-0">
        <section className="relative h-[58vh] min-h-[380px] lg:h-auto lg:min-h-0 border-b lg:border-b-0 border-ink overflow-hidden">
          <MapView cells={view.cells} places={view.places} kinds={view.kinds} gateways={view.gateways} concern={view.concern.blocks}
            rising={view.v2?.rising ?? []} lookAlike={view.v2?.lookAlikeCells ?? []}
            basemap={basemap} layers={layers} focus={focus} pin={pin} selectedId={selection?.id ?? null} onSelect={select} />
          <div className="scanlines absolute inset-0 z-[450]" aria-hidden />

          {/* Search and layers, top left */}
          <div className="absolute left-3 top-3 right-[132px] md:right-auto md:left-4 md:top-4 z-[600] md:w-[268px] flex flex-col gap-2">
            <PlaceSearch onSelect={onSearch} local={searchable} placeholder="Find a town, junction or station" />
            <div className="bg-paper border border-ink self-start w-full">
              <button onClick={() => setLegendOpen(o => !o)} aria-expanded={legendOpen}
                className="w-full flex items-center justify-between px-3 py-2 label hover:bg-paper-2">
                <span>Map layers <span className="text-mute">· {onLayers} on</span></span>
                <svg viewBox="0 0 10 6" className={`w-2.5 transition-transform ${legendOpen ? "rotate-180" : ""}`}><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
              </button>
              {legendOpen && (
                <>
                  <div className="px-3 py-2.5 space-y-1.5 text-[12.5px] border-t border-ink">
                    <Toggle on={layers.places} onClick={() => setLayers(l => ({ ...l, places: !l.places }))}>
                      <span className="flex gap-0.5">{(["high", "elevated", "watch"] as const).map(k =>
                        <i key={k} className="block size-3 border border-paper" style={{ background: LEVEL[k].fill }} />)}</span>
                      Priority zones
                    </Toggle>
                    <Toggle on={layers.rising} onClick={() => setLayers(l => ({ ...l, rising: !l.rising }))}>
                      <span className="block size-3.5 rounded-full border-[1.5px] border-dashed border-electric" />
                      Rising now
                    </Toggle>
                    <Toggle on={layers.lookAlike} onClick={() => setLayers(l => ({ ...l, lookAlike: !l.lookAlike }))}>
                      <span className="block size-3 border border-electric bg-electric/10" />
                      Look-alikes <span className="text-mute">· no reports yet</span>
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
                  <p className="px-3 py-2 border-t border-ink text-[11.5px] text-ink-2 leading-snug">
                    Brighter means more likely. Zoom in for the 1 km squares.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Basemap switch, top right */}
          <div className="absolute right-3 top-3 md:right-4 md:top-4 z-[500] flex border border-ink bg-paper" role="group" aria-label="Map style">
            {(["satellite", "street"] as const).map((b, i) => (
              <button key={b} onClick={() => setBasemap(b)} aria-pressed={basemap === b}
                className={`label px-2.5 md:px-3 py-2 ${i ? "border-l border-ink" : ""} ${basemap === b ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                {b === "satellite" ? "Satellite" : "Map"}
              </button>
            ))}
          </div>

          {selection && <DetailCard view={view} selection={selection} onClose={() => { setSelection(null); setFocus(null); }} />}

          {view.missing.length > 0 && (
            <div className="absolute inset-x-3 md:inset-x-4 bottom-3 md:bottom-4 z-[500] bg-paper border border-ink p-3 text-[13px]">
              {view.missing.map(m => <p key={m}>{m}</p>)}
            </div>
          )}
        </section>

        <aside className="flex flex-col min-w-0 lg:min-h-0 lg:border-l border-ink bg-paper">
          <div className="flex lg:grid lg:grid-cols-5 border-b border-ink overflow-x-auto no-scrollbar sticky top-0 z-[700] bg-paper lg:static" role="tablist">
            {TABS.map((t, i) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}
                className={`relative shrink-0 min-w-[104px] lg:min-w-0 text-left px-3 py-3 ${i ? "border-l border-ink" : ""}
                  ${tab === t.id ? "bg-paper-2" : "hover:bg-paper-2"}`}>
                <span className={`block text-[13.5px] font-medium leading-tight ${tab === t.id ? (t.id === "rising" ? "text-electric" : "text-signal") : ""}`}>{t.label}</span>
                <span className="label text-mute">{t.hint}</span>
                {tab === t.id && <span className={`absolute inset-x-0 bottom-0 h-[3px] ${t.id === "rising" ? "bg-electric" : "bg-signal"}`} aria-hidden />}
              </button>
            ))}
          </div>
          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto scroll-thin">
            {tab === "watch" && <WatchTab view={view} highCount={highCount} selectedId={selection?.id ?? null}
              onPick={id => select("place", id)} />}
            {tab === "rising" && <RisingTab v2={view.v2} selectedId={picked}
              onRising={r => select("rising", r.id)} onLook={l => select("look", l.id)} />}
            {tab === "why" && <WhyTab view={view} selectedId={selection?.id ?? null} onPick={select}
              onPlace={(lat, lon, name) => { setSelection(null); setPin({ lat, lon, name }); setFocus({ lat, lon, zoom: 12.5, ring: false }); toMap(); }} />}
            {tab === "districts" && <DistrictTab view={view} />}
            {tab === "tips" && <ConcernTab concern={view.concern} onPick={b => {
              setSelection(null); setFocus({ lat: b.lat, lon: b.lon, zoom: 12 }); toMap();
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
      <span className={`size-3.5 border grid place-items-center ${on ? "bg-signal border-signal" : "border-ink"}`}>
        {on && <svg viewBox="0 0 10 10" className="size-2.5"><path d="M1.5 5.2 4 7.6 8.6 2.6" fill="none" stroke="#0a0a0a" strokeWidth="1.6" /></svg>}
      </span>
      {children}
    </button>
  );
}

export { Mark };
export { KIND };
