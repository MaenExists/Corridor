"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Centre, PublicView } from "@/lib/types";
import { Header } from "@/components/Header";
import type { Basemap } from "@/components/map/base";
import { BED_STEPS, DISTANCE_STEPS, type AccessLayer, type Point } from "@/components/map/RecoveryMapView";
import { date, pct } from "@/components/enforcement/copy";
import { cellOf } from "@/lib/tipRules";
import { ReportTab } from "./ReportTab";
import { PlaceSearch, type LocalItem, type Picked } from "@/components/map/PlaceSearch";

const RecoveryMapView = dynamic(() => import("@/components/map/RecoveryMapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center label text-mute">Loading map</div>,
});

type Tab = "far" | "find" | "districts" | "report";
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "far", label: "Far away", hint: "Places" },
  { id: "find", label: "Find help", hint: "Centres" },
  { id: "districts", label: "Districts", hint: "Compare" },
  { id: "report", label: "Report", hint: "Tell us" },
];

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const people = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString()} thousand` : `${n}`;
const oneIn = (share: number) => share > 0 ? Math.round(1 / share) : 0;

export function PublicApp({ view }: { view: PublicView }) {
  const [tab, setTab] = useState<Tab>("far");
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [layer, setLayer] = useState<AccessLayer>("distance");
  const [showCentres, setShowCentres] = useState(true);
  const [probe, setProbe] = useState<Point>(null);
  const [probeLabel, setProbeLabel] = useState<string>("");
  const [focus, setFocus] = useState<Point>(null);
  const [centreId, setCentreId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyGov, setOnlyGov] = useState(false);
  const [gridState, setGridState] = useState<"loading" | "ready" | "missing">("loading");
  const [locating, setLocating] = useState<string | null>(null);
  const [pick, setPick] = useState<[number, number] | null>(null);
  const [pickInside, setPickInside] = useState(true);
  const [pickName, setPickName] = useState<string | null>(null);
  const reporting = tab === "report";
  const [formOpen, setFormOpen] = useState(false);
  // Marking a spot needs streets and buildings, so the shading steps aside while reporting.
  const [savedLayer, setSavedLayer] = useState<AccessLayer | null>(null);
  const chooseTab = (t: Tab) => {
    if (t === "report" && tab !== "report") { setSavedLayer(layer); setLayer("none"); }
    if (t !== "report" && tab === "report" && savedLayer) { setLayer(savedLayer); setSavedLayer(null); }
    setTab(t);
  };

  const nearest = useMemo(() => probe ? view.centres.map(c => ({ c, d: km(probe, c) })).sort((a, b) => a.d - b.d).slice(0, 3) : [],
    [probe, view.centres]);
  const centre = view.centres.find(c => c.id === centreId) ?? null;

  const showMapOnSmall = () => { if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "smooth" }); };
  const probeAt = (lat: number, lon: number, label: string, zoom?: number) => {
    setProbe({ lat, lon }); setProbeLabel(label); setCentreId(null);
    if (zoom) setFocus({ lat, lon, zoom });
    showMapOnSmall();
  };
  const pickCentre = (c: Centre) => { setCentreId(c.id); setProbe(null); setFocus({ lat: c.lat, lon: c.lon, zoom: 12 }); showMapOnSmall(); };
  const pickAt = (lat: number, lon: number, zoom?: number, name?: string) => {
    setPick(cellOf(lat, lon)); setPickName(name ?? null); setProbe(null); setCentreId(null);
    if (zoom) setFocus({ lat, lon, zoom });
  };
  const searchable = useMemo<LocalItem[]>(() => view.centres.map(c => ({ id: c.id, name: c.name, lat: c.lat, lon: c.lon,
    sub: `${c.government ? "Government centre" : "Registered centre"} · ${c.district}`, tag: "Centre" })), [view.centres]);
  const onSearch = (p: Picked) => {
    if (reporting) return pickAt(p.lat, p.lon, 15, p.name);
    const c = p.local && view.centres.find(x => x.id === p.local!.id);
    if (c) pickCentre(c); else probeAt(p.lat, p.lon, p.name, 14);
  };
  const locate = () => {
    if (!navigator.geolocation) { setLocating("This browser cannot share a location."); return; }
    setLocating("Finding you…");
    navigator.geolocation.getCurrentPosition(
      p => { setLocating(null); probeAt(p.coords.latitude, p.coords.longitude, "Your location", 11); },
      () => setLocating("Location was not shared. Tap the map instead."), { enableHighAccuracy: false, timeout: 10000 });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setProbe(null); setCentreId(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = view.centres.filter(c => (!onlyGov || c.government) &&
    (!query || `${c.name} ${c.district}`.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => Number(b.government) - Number(a.government) || a.district.localeCompare(b.district) || a.name.localeCompare(b.name));
  const worst = view.districts[0];
  const steps = layer === "beds" ? BED_STEPS : DISTANCE_STEPS;

  return (
    <div className="min-h-dvh lg:h-dvh grid grid-rows-[56px_auto_auto] lg:grid-rows-[56px_minmax(0,1fr)_auto] bg-paper">
      <Header section="public" tagline="Where help is far, where the nearest help is, and a safe way to report what you notice."
        updated={view.checkedOn ? date(view.checkedOn) : undefined} />

      <main className="grid lg:grid-cols-[minmax(0,1fr)_420px] min-h-0">
        <section className="relative h-[62vh] lg:h-auto lg:min-h-0 border-b lg:border-b-0 border-ink overflow-hidden">
          <RecoveryMapView centres={view.centres} basemap={basemap} layer={layer} showCentres={showCentres} focus={focus}
            probe={reporting ? null : probe} pick={reporting ? pick : null} onPickInside={setPickInside} selectedCentre={centreId}
            onProbe={(lat, lon) => reporting ? pickAt(lat, lon) : probeAt(lat, lon, "This spot")}
            onCentre={id => { const c = view.centres.find(x => x.id === id); if (c) reporting ? pickAt(c.lat, c.lon) : pickCentre(c); }}
            onGridReady={ok => setGridState(ok ? "ready" : "missing")} />

          <div className="absolute left-3 top-3 md:left-4 md:top-4 z-[600] w-[206px] md:w-[260px] flex flex-col gap-2">
            <PlaceSearch onSelect={onSearch} local={searchable}
              placeholder={reporting ? "Search where you noticed it" : "Search a place or centre"} />
          <div className="bg-paper border border-ink">
            <div className="grid grid-cols-3 border-b border-ink" role="group" aria-label="Shading">
              {([["distance", "Distance"], ["beds", "Beds"], ["none", "Off"]] as [AccessLayer, string][]).map(([id, label], i) => (
                <button key={id} onClick={() => setLayer(id)} aria-pressed={layer === id}
                  className={`label py-2 ${i ? "border-l border-ink" : ""} ${layer === id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>{label}</button>
              ))}
            </div>
            {layer !== "none" && (
              <div className="px-3 py-2.5">
                <p className="text-[12.5px] mb-2">{layer === "distance" ? "Straight-line distance to the nearest centre" : "Listed beds within 25 km, per 100,000 people"}</p>
                <div className="grid grid-cols-5 border border-ink">
                  {steps.map(([, fill], i) => <i key={i} className={`h-3 block ${i ? "border-l border-ink/30" : ""}`}
                    style={{ background: fill === "transparent" ? "repeating-linear-gradient(45deg,#0a0a0a 0 3px,#222220 3px 6px)" : fill }} />)}
                </div>
                <div className="flex justify-between mt-1 font-mono text-[9.5px] text-mute">
                  <span>{steps[0][2]}</span><span>{steps[steps.length - 1][2]}</span>
                </div>
                {gridState === "missing" && <p className="mt-2 text-[11.5px] text-signal">Grid not built. Run make recovery-refresh.</p>}
              </div>
            )}
            <button onClick={() => setShowCentres(v => !v)} aria-pressed={showCentres}
              className={`w-full flex items-center gap-2.5 px-3 py-2 border-t border-ink text-[12.5px] text-left ${showCentres ? "" : "opacity-45"}`}>
              <span className="flex items-center gap-1.5"><i className="block size-2.5 bg-ink" />Government</span>
              <span className="flex items-center gap-1.5"><i className="block size-2.5 rounded-full border-[1.5px] border-ink" />Registered</span>
            </button>
          </div>
          </div>

          <div className="absolute right-3 top-3 md:right-4 md:top-4 z-[500] flex flex-col items-end gap-2">
            <div className="flex border border-ink bg-paper" role="group" aria-label="Map style">
              {(["satellite", "street"] as const).map((b, i) => (
                <button key={b} onClick={() => setBasemap(b)} aria-pressed={basemap === b}
                  className={`label px-3 py-2 ${i ? "border-l border-ink" : ""} ${basemap === b ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                  {b === "satellite" ? "Satellite" : "Map"}
                </button>
              ))}
            </div>
            <button onClick={locate} className="label px-3 py-2 border border-ink bg-paper hover:bg-ink hover:text-paper">◎ Near me</button>
          </div>

          {reporting ? formOpen && (
            <div className={`absolute left-3 bottom-3 md:left-4 md:bottom-4 z-[500] border px-3 py-2 text-[12.5px] ${pick && pickInside ? "bg-paper border-ink" : "bg-signal border-signal text-white"}`}>
              {!pick ? "Tap the map where you noticed it." : pickInside ? "Marked. Tap again to move it." : "That spot is outside Kerala's populated area. Tap inside the outline."}
            </div>
          ) : !probe && !centre && (
            <div className="hidden md:block absolute left-4 bottom-4 z-[500] bg-paper border border-ink px-3 py-2 text-[12.5px]">
              {locating ?? "Tap anywhere on the map to see the nearest help."}
            </div>
          )}

          {probe && !reporting && (
            <Card onClose={() => setProbe(null)} eyebrow={probeLabel}
              title={nearest[0] ? `${nearest[0].d < 1 ? "Under 1" : Math.round(nearest[0].d)} km to the nearest help` : "No centre found"}>
              <ol>
                {nearest.map(({ c, d }, i) => (
                  <li key={c.id}>
                    <button onClick={() => pickCentre(c)} className="w-full grid grid-cols-[28px_1fr_auto] items-center text-left px-4 py-2.5 border-t border-ink/20 hover:bg-paper-2">
                      <span className="font-mono text-[11px] text-mute">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium truncate">{c.name}</span>
                        <span className="block text-[11.5px] text-mute">{c.government ? "Government (Vimukthi)" : "Registered centre"} · {c.district}</span>
                      </span>
                      <span className="font-mono tabular text-[13px] pl-2">{d.toFixed(d < 10 ? 1 : 0)} km</span>
                    </button>
                  </li>
                ))}
              </ol>
              <Note>Straight-line distance. Roads and hills make real journeys longer. Locations are approximate to a few km.</Note>
            </Card>
          )}

          {centre && !reporting && (
            <Card onClose={() => setCentreId(null)} eyebrow={centre.government ? "Government de-addiction centre" : "Registered de-addiction centre"}
              title={centre.name}>
              <div className="grid grid-cols-2 border-t border-ink">
                <div className="px-4 py-3">
                  <p className="text-[24px] leading-none font-medium tabular">{centre.beds ?? "—"}</p>
                  <p className="mt-1 text-[11.5px] text-mute">{centre.beds == null ? "beds not listed" : centre.bedsAreTotal ? "beds in the whole establishment" : "de-addiction beds"}</p>
                </div>
                <div className="px-4 py-3 border-l border-ink">
                  <p className="text-[15px] font-medium leading-tight">{centre.district || "—"}</p>
                  <p className="mt-1 text-[11.5px] text-mute">district</p>
                </div>
              </div>
              <Note>Placed at its {centre.basis.toLowerCase().startsWith("pin") ? "PIN-code area" : "town"}, so the pin is approximate. Call ahead to confirm services and beds.</Note>
            </Card>
          )}
        </section>

        <aside className="flex flex-col lg:min-h-0 lg:border-l border-ink bg-paper">
          <div className="grid grid-cols-4 border-b border-ink" role="tablist">
            {TABS.map((t, i) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => chooseTab(t.id)}
                className={`text-left px-2.5 md:px-3.5 py-3 ${i ? "border-l border-ink" : ""} ${tab === t.id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                <span className="block text-[13.5px] font-medium leading-tight">{t.label}</span>
                <span className={`label ${tab === t.id ? "text-paper/60" : "text-mute"}`}>{t.hint}</span>
              </button>
            ))}
          </div>
          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto scroll-thin">
            {tab === "report" && (
              <ReportTab pick={pick && pickInside ? pick : null} pickName={pickName} onPick={(lat, lon, name) => pickAt(lat, lon, name ? 15 : 13, name)} onClearPick={() => setPick(null)}
                onFindHelp={() => { chooseTab("find"); locate(); }} onFormOpen={setFormOpen} />
            )}
            {view.missing && <p className="m-5 p-3 border border-ink text-[13px]">{view.missing}</p>}

            {tab === "far" && !view.missing && (
              <div>
                <div className="px-5 py-5 border-b border-ink">
                  <p className="label text-mute mb-2">Kerala · 1 km squares</p>
                  <h2 className="text-[22px] leading-[1.15] tracking-[-0.015em] font-medium">
                    1 in {oneIn(view.shareOver10)} people live more than 10 km from a de-addiction centre.
                  </h2>
                  <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">
                    That is about {people(view.peopleOver10)} people. These places hold the most of them, and are where new help would reach the most.
                  </p>
                </div>
                <ol>
                  {view.far.map((p, i) => (
                    <li key={p.id}>
                      <button onClick={() => probeAt(p.lat, p.lon, `Around ${p.name}`, 11)}
                        className="w-full grid grid-cols-[40px_1fr_auto] items-center text-left border-b border-ink/15 hover:bg-paper-2">
                        <span className="font-mono text-[12px] text-center opacity-60">{String(i + 1).padStart(2, "0")}</span>
                        <span className="py-3 pr-2 min-w-0">
                          <span className="block text-[14.5px] font-medium truncate">{p.name}</span>
                          <span className="block text-[12px] text-mute truncate">{p.area}</span>
                        </span>
                        <span className="pr-5 text-right">
                          <span className="block text-[13px] tabular">{people(p.peopleFar)}</span>
                          <span className="block text-[11px] text-mute tabular">~{Math.round(p.averageKm)} km away</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {tab === "find" && !view.missing && (
              <div>
                <div className="px-5 pt-5 pb-4 border-b border-ink">
                  <p className="label text-mute mb-2">Find help</p>
                  <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">Search de-addiction centres by name or district.</h2>
                  <div className="mt-3 flex border border-ink">
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. Kozhikode"
                      className="flex-1 min-w-0 bg-transparent px-3 py-2 text-[14px] outline-none placeholder:text-mute" aria-label="Search centres" />
                    <button onClick={() => setOnlyGov(v => !v)} aria-pressed={onlyGov}
                      className={`label px-3 border-l border-ink ${onlyGov ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>Government</button>
                  </div>
                  <p className="mt-2 text-[11.5px] text-mute">{filtered.length} of {view.centres.length} centres · or use ◎ Near me on the map</p>
                </div>
                <ul>
                  {filtered.slice(0, 120).map(c => (
                    <li key={c.id}>
                      <button onClick={() => pickCentre(c)}
                        className={`w-full grid grid-cols-[26px_1fr_auto] items-center text-left border-b border-ink/15 ${centreId === c.id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                        <span className="flex justify-center">{c.government
                          ? <i className={`block size-2.5 ${centreId === c.id ? "bg-paper" : "bg-ink"}`} />
                          : <i className="block size-2.5 rounded-full border-[1.5px] border-current" />}</span>
                        <span className="py-2.5 pr-2 min-w-0">
                          <span className="block text-[13.5px] truncate">{c.name}</span>
                          <span className={`block text-[11.5px] ${centreId === c.id ? "text-paper/65" : "text-mute"}`}>{c.district}</span>
                        </span>
                        <span className="pr-5 text-[12px] tabular opacity-70">{c.beds != null ? `${c.beds} beds` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === "districts" && !view.missing && (
              <div>
                <div className="px-5 py-5 border-b border-ink">
                  <p className="label text-mute mb-2">By district</p>
                  <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">
                    {worst ? `${worst.name} has the most people far from help: ${pct(worst.shareOver10)} beyond 10 km.` : ""}
                  </h2>
                </div>
                <div className="px-5 py-2 grid grid-cols-[1fr_64px_64px] gap-x-3 label text-mute border-b border-ink/15">
                  <span>Share beyond 10 km</span><span className="text-right">Centres</span><span className="text-right">Beds/100k</span>
                </div>
                <ul>
                  {view.districts.map(d => (
                    <li key={d.name} className="px-5 py-2.5 grid grid-cols-[1fr_64px_64px] gap-x-3 items-center border-b border-ink/15">
                      <span className="min-w-0">
                        <span className="flex justify-between text-[14px]"><span>{d.name}</span><span className="tabular text-[13px]">{pct(d.shareOver10)}</span></span>
                        <span className="relative block h-1.5 mt-1.5 bg-paper-2">
                          <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${d.shareOver10 * 100 / .5}%` }} />
                          <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${d.shareOver20 * 100 / .5}%` }} title="beyond 20 km" />
                        </span>
                      </span>
                      <span className="text-right tabular text-[13px]">{d.centres}</span>
                      <span className="text-right tabular text-[13px]">{Math.round(d.bedsPer100k)}</span>
                    </li>
                  ))}
                </ul>
                <p className="px-5 py-4 text-[11.5px] text-mute leading-relaxed">
                  Red: share beyond 10 km. Black: beyond 20 km. Beds are as printed in the register; many rows give only a
                  whole-establishment figure, so beds per 100,000 run high in some districts.
                </p>
              </div>
            )}
          </div>
        </aside>
      </main>

      <footer className="grid grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.6fr] border-t border-ink">
        <Fact label="Far from help" first>
          <p className="text-[34px] leading-none tracking-[-0.03em] font-medium tabular">1 <span className="text-mute font-normal text-[20px]">in</span> {oneIn(view.shareOver10)}</p>
          <p className="mt-1.5 text-[12px] text-ink-2">live over 10 km from a centre ({pct(view.shareOver10)}).</p>
        </Fact>
        <Fact label="Centres on the map">
          <p className="text-[26px] leading-none font-medium tabular">{view.centresLocated}</p>
          <p className="mt-1.5 text-[12px] text-ink-2">{view.centresUnlocated} more could not be placed.</p>
        </Fact>
        <Fact label="Hardest to reach">
          <p className="text-[26px] leading-none font-medium tabular text-signal">{worst ? pct(worst.shareOver10) : "—"}</p>
          <p className="mt-1.5 text-[12px] text-ink-2">of {worst?.name ?? "—"} lives beyond 10 km.</p>
        </Fact>
        <Fact label="Read this map as">
          <p className="text-[12px] text-ink-2 leading-snug">Distance to services, not where drug users live; no such layer exists here.
            Distances are straight-line. Sources: KSMHA register and Vimukthi directory, checked {date(view.checkedOn)}.</p>
        </Fact>
      </footer>
    </div>
  );
}

function Card({ eyebrow, title, onClose, children }: { eyebrow: string; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute left-3 right-3 bottom-3 md:right-auto md:left-4 md:bottom-4 z-[600] md:w-[380px] max-h-[calc(100%-1.5rem)] overflow-y-auto bg-paper border border-ink">
      <button onClick={onClose} aria-label="Close" className="absolute right-0 top-0 size-9 grid place-items-center border-l border-b border-ink hover:bg-ink hover:text-paper">
        <svg viewBox="0 0 10 10" className="size-2.5"><path d="M1 1l8 8M9 1 1 9" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      <div className="px-4 pt-4 pb-3 pr-12">
        <p className="label text-mute">{eyebrow}</p>
        <h3 className="mt-1 text-[21px] leading-tight tracking-[-0.02em] font-medium">{title}</h3>
      </div>
      {children}
    </div>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-2.5 border-t border-ink bg-paper-2 text-[11.5px] text-ink-2 leading-snug">{children}</p>;
}
function Fact({ label, children, first }: { label: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div className={`px-4 md:px-5 py-3 border-ink border-b lg:border-b-0 ${first ? "" : "lg:border-l"} max-lg:[&:nth-child(even)]:border-l cross`}>
      <p className="label text-mute mb-2">{label}</p>
      {children}
    </div>
  );
}
