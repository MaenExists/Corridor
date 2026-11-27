"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Centre, PublicView } from "@/lib/types";
import { Header } from "@/components/Header";
import type { Basemap } from "@/components/map/base";
import { BED_STEPS, DISTANCE_STEPS, NEED_STEPS, type AccessLayer, type Point, type SpotInfo } from "@/components/map/RecoveryMapView";
import { date, pct } from "@/components/enforcement/copy";
import { cellOf } from "@/lib/tipRules";
import { useLang } from "@/lib/i18n";
import { DISTRICT_ML } from "@/lib/strings";
import { ReportTab } from "./ReportTab";
import { PlaceSearch, type LocalItem, type Picked } from "@/components/map/PlaceSearch";

const RecoveryMapView = dynamic(() => import("@/components/map/RecoveryMapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center label text-mute">…</div>,
});

type Tab = "far" | "find" | "districts" | "report";
const TABS: Tab[] = ["far", "find", "districts", "report"];

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const oneIn = (share: number) => share > 0 ? Math.round(1 / share) : 0;
const GRADE_FILL = { high: "#c1121f", elevated: "#8a0303", some: "#4d0707" } as const;

export function PublicApp({ view }: { view: PublicView }) {
  const { t, lang, district, place } = useLang();
  const need = view.need;
  const [tab, setTab] = useState<Tab>("far");
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [layer, setLayer] = useState<AccessLayer>(need ? "need" : "distance");
  const [showCentres, setShowCentres] = useState(true);
  const [probe, setProbe] = useState<Point>(null);
  const [probeLabel, setProbeLabel] = useState<string>("");
  const [focus, setFocus] = useState<Point>(null);
  const [centreId, setCentreId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyGov, setOnlyGov] = useState(false);
  const [gridState, setGridState] = useState<"loading" | "ready" | "missing">("loading");
  const [gridNeed, setGridNeed] = useState(true);
  const [lookup, setLookup] = useState<{ fn: (lat: number, lon: number) => SpotInfo } | null>(null);
  const [locating, setLocating] = useState<string | null>(null);
  const [pick, setPick] = useState<[number, number] | null>(null);
  const [pickInside, setPickInside] = useState(true);
  const [pickName, setPickName] = useState<string | null>(null);
  const reporting = tab === "report";
  const [formOpen, setFormOpen] = useState(false);
  // Marking a spot needs streets and buildings, so the shading steps aside while reporting.
  const [savedLayer, setSavedLayer] = useState<AccessLayer | null>(null);
  const chooseTab = (next: Tab) => {
    if (next === "report" && tab !== "report") { setSavedLayer(layer); setLayer("none"); }
    if (next !== "report" && tab === "report" && savedLayer) { setLayer(savedLayer); setSavedLayer(null); }
    setTab(next);
  };

  const nearest = useMemo(() => probe ? view.centres.map(c => ({ c, d: km(probe, c) })).sort((a, b) => a.d - b.d).slice(0, 3) : [],
    [probe, view.centres]);
  const spot = probe && lookup ? lookup.fn(probe.lat, probe.lon) : null;
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
    sub: `${c.government ? t.govCentre : t.regCentre} · ${district(c.district)}`, tag: t.search.centreTag })), [view.centres, t, district]);
  const onSearch = (p: Picked) => {
    if (reporting) return pickAt(p.lat, p.lon, 15, p.name);
    const c = p.local && view.centres.find(x => x.id === p.local!.id);
    if (c) pickCentre(c); else probeAt(p.lat, p.lon, p.name, 14);
  };
  const locate = () => {
    if (!navigator.geolocation) { setLocating(t.noGeo); return; }
    setLocating(t.finding);
    navigator.geolocation.getCurrentPosition(
      p => { setLocating(null); probeAt(p.coords.latitude, p.coords.longitude, t.yourLocation, 11); },
      () => setLocating(t.geoDenied), { enableHighAccuracy: false, timeout: 10000 });
  };
  // App shortcuts and shared links can open a tab directly: /public?tab=report
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted && (TABS as string[]).includes(wanted)) chooseTab(wanted as Tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setProbe(null); setCentreId(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = view.centres.filter(c => (!onlyGov || c.government) &&
    (!q || `${c.name} ${c.district} ${DISTRICT_ML[c.district] ?? ""}`.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.government) - Number(a.government) || a.district.localeCompare(b.district) || a.name.localeCompare(b.name));
  const worst = view.districts[0];
  const steps = layer === "beds" ? BED_STEPS : layer === "need" ? NEED_STEPS : DISTANCE_STEPS;
  const ends = layer === "beds" ? t.legend.bedsEnds : t.legend.distanceEnds;

  return (
    <div className="theme-public min-h-dvh lg:h-dvh grid grid-rows-[56px_auto_auto] lg:grid-rows-[56px_minmax(0,1fr)_auto] bg-paper">
      <Header section="public" tagline={t.tagline} languages updated={view.checkedOn ? date(view.checkedOn) : undefined} />

      <main className="grid lg:grid-cols-[minmax(0,1fr)_420px] min-h-0">
        <section className="relative h-[62vh] lg:h-auto lg:min-h-0 border-b lg:border-b-0 border-ink overflow-hidden">
          <RecoveryMapView centres={view.centres} basemap={basemap} layer={layer} showCentres={showCentres} focus={focus} lang={lang}
            probe={reporting ? null : probe} pick={reporting ? pick : null} onPickInside={setPickInside} selectedCentre={centreId}
            onProbe={(lat, lon) => reporting ? pickAt(lat, lon) : probeAt(lat, lon, t.thisSpot)}
            onCentre={id => { const c = view.centres.find(x => x.id === id); if (c) reporting ? pickAt(c.lat, c.lon) : pickCentre(c); }}
            onGridReady={(ok, hasNeed, fn) => { setGridState(ok ? "ready" : "missing"); setGridNeed(hasNeed); setLookup({ fn }); }} />

          <div className="absolute left-3 top-3 md:left-4 md:top-4 z-[600] w-[214px] md:w-[272px] flex flex-col gap-2">
            <PlaceSearch onSelect={onSearch} local={searchable} placeholder={reporting ? t.searchReport : t.searchPlace} />
            <div className="bg-paper border border-ink">
              <div className="grid grid-cols-4 border-b border-ink" role="group" aria-label="Shading">
                {(["need", "distance", "beds", "none"] as AccessLayer[]).map((id, i) => (
                  <button key={id} onClick={() => setLayer(id)} aria-pressed={layer === id}
                    className={`label py-2 ${i ? "border-l border-ink" : ""} ${layer === id ? "bg-signal text-paper" : "hover:bg-paper-2"}`}>{t.layers[id]}</button>
                ))}
              </div>
              {layer !== "none" && (
                <div className="px-3 py-2.5">
                  <p className="text-[12.5px] mb-2 leading-snug">{t.legend[layer]}</p>
                  <div className="grid grid-cols-5 border border-ink">
                    {steps.map(([, fill], i) => <i key={i} className={`h-3 block ${i ? "border-l border-ink/30" : ""}`}
                      style={{ background: fill === "transparent" ? "repeating-linear-gradient(45deg,#0a0a0a 0 3px,#222220 3px 6px)" : fill }} />)}
                  </div>
                  <div className="flex justify-between mt-1 font-mono text-[9.5px] text-mute">
                    <span>{ends[0]}</span><span>{ends[1]}</span>
                  </div>
                  {layer === "need" && <p className="mt-1.5 text-[11px] text-mute leading-snug">{t.legend.needOther}</p>}
                  {gridState === "missing" && <p className="mt-2 text-[11.5px] text-signal">{t.gridMissing}</p>}
                  {layer === "need" && gridState === "ready" && !gridNeed && <p className="mt-2 text-[11.5px] text-signal">{t.needMissing}</p>}
                </div>
              )}
              <button onClick={() => setShowCentres(v => !v)} aria-pressed={showCentres}
                className={`w-full flex items-center gap-2.5 px-3 py-2 border-t border-ink text-[12.5px] text-left ${showCentres ? "" : "opacity-45"}`}>
                <span className="flex items-center gap-1.5 text-care"><i className="block size-2.5 bg-care" />{t.government}</span>
                <span className="flex items-center gap-1.5 text-care"><i className="block size-2.5 rounded-full border-[1.5px] border-care" />{t.registered}</span>
              </button>
            </div>
          </div>

          <div className="absolute right-3 top-3 md:right-4 md:top-4 z-[500] flex flex-col items-end gap-2">
            <div className="flex border border-ink bg-paper" role="group" aria-label="Map style">
              {(["satellite", "street"] as const).map((b, i) => (
                <button key={b} onClick={() => setBasemap(b)} aria-pressed={basemap === b}
                  className={`label px-3 py-2 ${i ? "border-l border-ink" : ""} ${basemap === b ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                  {b === "satellite" ? t.satellite : t.street}
                </button>
              ))}
            </div>
            <button onClick={locate} className="label px-3 py-2 border border-ink bg-paper hover:bg-ink hover:text-paper">{t.nearMe}</button>
          </div>

          {reporting ? formOpen && (
            <div className={`absolute left-3 bottom-3 md:left-4 md:bottom-4 z-[500] border px-3 py-2 text-[12.5px] ${pick && pickInside ? "bg-paper border-ink" : "bg-signal border-signal text-paper"}`}>
              {!pick ? t.reportTap : pickInside ? t.reportMarked : t.reportOutside}
            </div>
          ) : !probe && !centre && (
            <div className="hidden md:block absolute left-4 bottom-4 z-[500] bg-paper border border-ink px-3 py-2 text-[12.5px]">
              {locating ?? t.tapHint}
            </div>
          )}

          {probe && !reporting && (
            <Card onClose={() => setProbe(null)} eyebrow={probeLabel} closeLabel={t.close}
              title={nearest[0] ? t.kmToHelp(nearest[0].d) : t.noCentre}>
              {spot && gridNeed && (
                <p className="flex items-center gap-2 px-4 pb-3 -mt-1 text-[12.5px] text-ink-2">
                  <i className="block size-2.5 shrink-0" style={{ background: spot.grade ? GRADE_FILL[spot.grade] : "#4a4944" }} />
                  {t.spotGrade(spot.grade)}
                </p>
              )}
              <ol>
                {nearest.map(({ c, d }, i) => (
                  <li key={c.id}>
                    <button onClick={() => pickCentre(c)} className="w-full grid grid-cols-[28px_1fr_auto] items-center text-left px-4 py-2.5 border-t border-ink/20 hover:bg-paper-2">
                      <span className="font-mono text-[11px] text-mute">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium truncate text-care">{c.name}</span>
                        <span className="block text-[11.5px] text-mute">{c.government ? t.govVimukthi : t.registeredCentre} · {district(c.district)}</span>
                      </span>
                      <span className="font-mono tabular text-[13px] pl-2">{t.km(d)}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <Note>{t.straightNote}</Note>
            </Card>
          )}

          {centre && !reporting && (
            <Card onClose={() => setCentreId(null)} eyebrow={centre.government ? t.govCentre : t.regCentre} title={centre.name} titleClass="text-care" closeLabel={t.close}>
              <div className="grid grid-cols-2 border-t border-ink">
                <div className="px-4 py-3">
                  <p className="text-[24px] leading-none font-medium tabular">{centre.beds ?? "—"}</p>
                  <p className="mt-1 text-[11.5px] text-mute">{centre.beds == null ? t.bedsNotListed : centre.bedsAreTotal ? t.bedsTotal : t.bedsDeaddiction}</p>
                </div>
                <div className="px-4 py-3 border-l border-ink">
                  <p className="text-[15px] font-medium leading-tight">{centre.district ? district(centre.district) : "—"}</p>
                  <p className="mt-1 text-[11.5px] text-mute">{t.district}</p>
                </div>
              </div>
              <Note>{t.centreNote(centre.basis.toLowerCase().startsWith("pin"))}</Note>
            </Card>
          )}
        </section>

        <aside className="flex flex-col lg:min-h-0 lg:border-l border-ink bg-paper">
          <div className="grid grid-cols-4 border-b border-ink" role="tablist">
            {TABS.map((id, i) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => chooseTab(id)}
                className={`min-w-0 text-left py-3 ${lang === "ml" ? "px-2 md:px-2.5" : "px-2.5 md:px-3.5"} ${i ? "border-l border-ink" : ""} ${tab === id ? "bg-signal text-paper" : "hover:bg-paper-2"}`}>
                <span className={`block font-medium leading-tight ${lang === "ml" ? "text-[12.5px]" : "text-[13.5px]"}`}>{t.tabs[id][0]}</span>
                <span className={`label ${tab === id ? "text-paper/60" : "text-mute"}`}>{t.tabs[id][1]}</span>
              </button>
            ))}
          </div>
          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto scroll-thin">
            {tab === "report" && (
              <ReportTab pick={pick && pickInside ? pick : null} pickName={pickName} onPick={(lat, lon, name) => pickAt(lat, lon, name ? 15 : 13, name)} onClearPick={() => setPick(null)}
                onFindHelp={() => { chooseTab("find"); locate(); }} onFormOpen={setFormOpen} />
            )}
            {view.missing && <p className="m-5 p-3 border border-ink text-[13px]">{view.missing}</p>}

            {tab === "far" && !view.missing && (need ? (
              <div>
                <div className="px-5 py-5 border-b border-ink">
                  <p className="label text-mute mb-2">{t.farEyebrow}</p>
                  <h2 className="text-[22px] leading-[1.15] tracking-[-0.015em] font-medium">{t.farHeadline(t.people(need.affectedFarPeople))}</h2>
                  <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">{t.farSub(oneIn(need.affectedFarShare))}</p>
                </div>
                <ol>
                  {view.needPlaces.map((p, i) => (
                    <li key={p.id}>
                      <button onClick={() => probeAt(p.lat, p.lon, t.around(place(p.name, p.nameMl)), 11)}
                        className="w-full grid grid-cols-[40px_1fr_auto] items-center text-left border-b border-ink/15 hover:bg-paper-2">
                        <span className="font-mono text-[12px] text-center opacity-60">{String(i + 1).padStart(2, "0")}</span>
                        <span className="py-3 pr-2 min-w-0">
                          <span className="flex items-center gap-2 min-w-0">
                            <i className="block size-2 shrink-0" style={{ background: GRADE_FILL[p.grade] }} title={t.grade[p.grade]} />
                            <span className="text-[14.5px] font-medium truncate">{place(p.name, p.nameMl)}</span>
                          </span>
                          <span className="block text-[12px] text-mute truncate">{district(p.district)} · {t.grade[p.grade]}</span>
                        </span>
                        <span className="pr-5 text-right">
                          <span className="block text-[13px] tabular">{t.casesNearby(p.casesYear)}</span>
                          <span className="block text-[11px] text-mute tabular">{t.kmAway(p.averageKm)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <section className="px-5 py-5">
                  <p className="label text-mute mb-3">{t.howWorked}</p>
                  <ol className="space-y-2.5 text-[12.5px] leading-snug text-ink-2">
                    {t.method(need.periods.police, need.periods.excise).map((line, i) => (
                      <li key={i} className="grid grid-cols-[22px_1fr]"><span className="font-mono text-[11px] text-mute pt-px">{i + 1}</span><span>{line}</span></li>
                    ))}
                  </ol>
                </section>
              </div>
            ) : <p className="m-5 p-3 border border-ink text-[13px]">{t.needMissing}</p>)}

            {tab === "find" && !view.missing && (
              <div>
                <div className="px-5 pt-5 pb-4 border-b border-ink">
                  <p className="label text-mute mb-2">{t.findEyebrow}</p>
                  <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">{t.findTitle}</h2>
                  <div className="mt-3 flex border border-ink">
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t.findPlaceholder}
                      className="flex-1 min-w-0 bg-transparent px-3 py-2 text-[14px] outline-none placeholder:text-mute" aria-label={t.findTitle} />
                    <button onClick={() => setOnlyGov(v => !v)} aria-pressed={onlyGov}
                      className={`label px-3 border-l border-ink ${onlyGov ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>{t.government}</button>
                  </div>
                  <p className="mt-2 text-[11.5px] text-mute">{t.findCount(filtered.length, view.centres.length)}</p>
                </div>
                <ul>
                  {filtered.slice(0, 120).map(c => (
                    <li key={c.id}>
                      <button onClick={() => pickCentre(c)}
                        className={`w-full grid grid-cols-[26px_1fr_auto] items-center text-left border-b border-ink/15 ${centreId === c.id ? "bg-care text-paper" : "hover:bg-paper-2"}`}>
                        <span className="flex justify-center">{c.government
                          ? <i className={`block size-2.5 ${centreId === c.id ? "bg-paper" : "bg-care"}`} />
                          : <i className={`block size-2.5 rounded-full border-[1.5px] ${centreId === c.id ? "border-paper" : "border-care"}`} />}</span>
                        <span className="py-2.5 pr-2 min-w-0">
                          <span className={`block text-[13.5px] truncate ${centreId === c.id ? "font-medium" : "text-care"}`}>{c.name}</span>
                          <span className={`block text-[11.5px] ${centreId === c.id ? "text-paper/65" : "text-mute"}`}>{district(c.district)}</span>
                        </span>
                        <span className="pr-5 text-[12px] tabular opacity-70">{c.beds != null ? t.beds(c.beds) : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === "districts" && !view.missing && (need ? (
              <div>
                <div className="px-5 py-5 border-b border-ink">
                  <p className="label text-mute mb-2">{t.districtsEyebrow}</p>
                  <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">
                    {worst?.shareCasesFar != null ? t.districtsHeadline(district(worst.name), pct(worst.shareCasesFar)) : ""}
                  </h2>
                </div>
                <div className="px-5 py-2 grid grid-cols-[1fr_68px_56px] gap-x-3 label text-mute border-b border-ink/15">
                  <span>{t.colFar}</span><span className="text-right">{t.colRate}</span><span className="text-right">{t.colCentres}</span>
                </div>
                <ul>
                  {view.districts.map(d => (
                    <li key={d.name} className="px-5 py-2.5 grid grid-cols-[1fr_68px_56px] gap-x-3 items-center border-b border-ink/15">
                      <span className="min-w-0">
                        <span className="flex justify-between text-[14px]"><span>{district(d.name)}</span><span className="tabular text-[13px]">{pct(d.shareCasesFar ?? 0)}</span></span>
                        <span className="relative block h-1.5 mt-1.5 bg-paper-2">
                          <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${Math.min(100, (d.shareCasesFar ?? 0) * 100 / .5)}%` }} />
                        </span>
                      </span>
                      <span className="text-right tabular text-[13px]">{d.casesPer100k != null ? Math.round(d.casesPer100k) : "—"}</span>
                      <span className="text-right tabular text-[13px]">{d.centres}</span>
                    </li>
                  ))}
                </ul>
                <p className="px-5 py-4 text-[11.5px] text-mute leading-relaxed">{t.districtsNote(need.periods.police, need.periods.excise)}</p>
              </div>
            ) : (
              <div>
                <div className="px-5 py-5 border-b border-ink">
                  <p className="label text-mute mb-2">{t.districtsEyebrow}</p>
                  <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">
                    {worst ? t.districtsHeadlineAccess(district(worst.name), pct(worst.shareOver10)) : ""}
                  </h2>
                </div>
                <div className="px-5 py-2 grid grid-cols-[1fr_64px_64px] gap-x-3 label text-mute border-b border-ink/15">
                  <span>{t.colShare}</span><span className="text-right">{t.colCentres}</span><span className="text-right">{t.colBeds}</span>
                </div>
                <ul>
                  {view.districts.map(d => (
                    <li key={d.name} className="px-5 py-2.5 grid grid-cols-[1fr_64px_64px] gap-x-3 items-center border-b border-ink/15">
                      <span className="min-w-0">
                        <span className="flex justify-between text-[14px]"><span>{district(d.name)}</span><span className="tabular text-[13px]">{pct(d.shareOver10)}</span></span>
                        <span className="relative block h-1.5 mt-1.5 bg-paper-2">
                          <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${d.shareOver10 * 100 / .5}%` }} />
                          <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${d.shareOver20 * 100 / .5}%` }} />
                        </span>
                      </span>
                      <span className="text-right tabular text-[13px]">{d.centres}</span>
                      <span className="text-right tabular text-[13px]">{Math.round(d.bedsPer100k)}</span>
                    </li>
                  ))}
                </ul>
                <p className="px-5 py-4 text-[11.5px] text-mute leading-relaxed">{t.districtsNoteAccess}</p>
              </div>
            ))}
          </div>
        </aside>
      </main>

      <footer className="grid grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.6fr] border-t border-ink">
        {need ? (
          <>
            <Fact label={t.factAffectedFar} first>
              <p className="text-[30px] leading-none tracking-[-0.03em] font-medium tabular">{t.people(need.affectedFarPeople)}</p>
              <p className="mt-1.5 text-[12px] text-ink-2">{t.factAffectedFarSub}</p>
            </Fact>
            <Fact label={t.factCasesFar}>
              <p className="text-[26px] leading-none font-medium tabular text-signal">{pct(need.shareCasesFar)}</p>
              <p className="mt-1.5 text-[12px] text-ink-2">{t.factCasesFarSub}</p>
            </Fact>
          </>
        ) : (
          <>
            <Fact label={t.factFarAccess} first>
              <p className="text-[34px] leading-none tracking-[-0.03em] font-medium tabular">1 <span className="text-mute font-normal text-[20px]">{t.oneIn}</span> {oneIn(view.shareOver10)}</p>
              <p className="mt-1.5 text-[12px] text-ink-2">{t.factFarAccessSub(pct(view.shareOver10))}</p>
            </Fact>
            <div />
          </>
        )}
        <Fact label={t.factCentres}>
          <p className="text-[26px] leading-none font-medium tabular">{view.centresLocated}</p>
          <p className="mt-1.5 text-[12px] text-ink-2">{t.factCentresSub(view.centresUnlocated)}</p>
        </Fact>
        <Fact label={t.factRead}>
          <p className="text-[12px] text-ink-2 leading-snug">{t.factReadText(date(view.checkedOn))}</p>
        </Fact>
      </footer>
    </div>
  );
}

function Card({ eyebrow, title, titleClass = "", onClose, closeLabel, children }: { eyebrow: string; title: string; titleClass?: string; onClose: () => void; closeLabel: string; children: React.ReactNode }) {
  return (
    <div className="absolute left-3 right-3 bottom-3 md:right-auto md:left-4 md:bottom-4 z-[600] md:w-[380px] max-h-[calc(100%-1.5rem)] overflow-y-auto bg-paper border border-ink">
      <button onClick={onClose} aria-label={closeLabel} className="absolute right-0 top-0 size-9 grid place-items-center border-l border-b border-ink hover:bg-ink hover:text-paper">
        <svg viewBox="0 0 10 10" className="size-2.5"><path d="M1 1l8 8M9 1 1 9" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      <div className="px-4 pt-4 pb-3 pr-12">
        <p className="label text-mute">{eyebrow}</p>
        <h3 className={`mt-1 text-[21px] leading-tight tracking-[-0.02em] font-medium ${titleClass}`}>{title}</h3>
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
