import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import geography from "../../shared/geography.json";
import type { Case } from "../../shared/schema";
import { CENTER, DISTRICTS, NODES, dateLabel, localJSON } from "./data";
import type { Cases, Forecasts, Place, Selection } from "./data";

type Layers = "forecast" | "history" | "movement" | "coverage" | "infrastructure";
const LAYERS: [Layers, string][] = [["forecast", "Forecast"], ["history", "History"], ["movement", "Documented connections"],
  ["coverage", "Coverage"], ["infrastructure", "Infrastructure hypotheses"]];
// Purely fictional and deliberately different from the generator's documented edges.
const EXAMPLE_INFRASTRUCTURE = [["Wayanad","Palakkad"],["Idukki","Kollam"],["Kannur","Malappuram"]];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const days = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
const shift = (start: string, n: number) => new Date(Date.parse(start) + n * 86400000).toISOString().slice(0, 10);
const areaOf = (name: string) => DISTRICTS.find(d => norm(d) === norm(name).replace(/ district$/, ""));
const line = (a: [number, number], b: [number, number]): L.LatLngExpression[] =>
  Array.from({ length: 26 }, (_, i) => {
    const t = i / 25;
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]) + Math.sin(Math.PI * t) * .15];
  });
const text = (t: string) => { const node = document.createElement("span"); node.textContent = t; return node; };
const hasPlace = (sel: Selection, d: string) => "area" in sel && sel.area === d;
function historical(c: Case, end: string, from: string) {
  return c.synthetic && c.event_date !== null && c.event_date >= from && c.event_date <= end &&
    c.first_available_date !== null && c.first_available_date <= end &&
    !c.correction_history.some(e => e.kind === "withdrawal" && typeof e.effective_at === "string" && e.effective_at <= end);
}

export function Atlas({ data, forecasts, selection, select, horizon, setHorizon, openCase, connections = true }:
  { data: Cases; forecasts: Forecasts; selection: Selection; select: (s: Selection)=>void;
    horizon: 7 | 28; setHorizon: (h: 7|28)=>void; openCase: (c: Case, cutoff: string)=>void; connections?: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const group = useRef<L.LayerGroup | null>(null);
  const [boundary,setBoundary] = useState<FeatureCollection | null>(null);
  const [places,setPlaces] = useState<Place[]>([]);
  const [layers,setLayers] = useState<Record<Layers,boolean>>({ forecast: true, history: false, movement: false, coverage: true, infrastructure:false });
  const [query,setQuery] = useState("");
  const [searchOpen,setSearchOpen] = useState(false);
  const [place,setPlace] = useState<Place | null>(null);
  const [date,setDate] = useState(data.as_of);
  const [period,setPeriod] = useState(90);
  const [district,setDistrict] = useState("");
  const [substance,setSubstance] = useState("");
  const [evidence,setEvidence] = useState("");
  const [sources,setSources] = useState("");
  const cutoff = shift(date, -period + 1);
  useEffect(() => {
    localJSON<FeatureCollection>("/geography/kerala-districts.geojson").then(setBoundary).catch(() => {});
    localJSON<{places: Place[]}>("/geography/places.json").then(v => setPlaces(v.places)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!holder.current) return;
    const m = L.map(holder.current, { zoomSnap: .25, preferCanvas: false, scrollWheelZoom: true, minZoom: 5, maxZoom: 13 });
    m.fitBounds([[8.22,74.45],[13.02,77.69]], { padding: [16,13] });
    m.attributionControl.setPrefix(false);
    m.attributionControl.addAttribution('Boundaries © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> / Open Data Kerala. Places: <a href="https://www.geonames.org/">GeoNames</a>');
    map.current = m; group.current = L.layerGroup().addTo(m);
    const observer = new ResizeObserver(() => m.invalidateSize()); observer.observe(holder.current);
    return () => { observer.disconnect(); m.remove(); map.current = null; group.current = null; };
  }, []);
  const byArea = useMemo(() => new Map(forecasts.forecasts.filter(r => r.horizon_days === horizon && r.area).map(r => [r.area!,r])), [forecasts,horizon]);
  const moves = useMemo(() => forecasts.forecasts.filter(r => r.horizon_days === horizon && r.connection), [forecasts,horizon]);
  const rows = useMemo(() => data.cases.filter(c => historical(c,date,cutoff) &&
    (!district || c.district === district) && (!substance || c.substance_category === substance) &&
    (!sources || (sources === "syndicated" ? c.source_ref.some(s => s.available_date && s.available_date <= date && s.ref.endsWith("-syndicated")) :
      c.source_ref.some(s => s.available_date && s.available_date <= date && !s.ref.endsWith("-syndicated")))) &&
    (!evidence || (evidence === "reviewed" ? c.verified_date && c.verified_date <= date : !c.verified_date || c.verified_date > date))),
    [data,date,cutoff,district,substance,evidence,sources]);
  const counts = useMemo(() => rows.reduce<Record<string, number>>((a, c) => {
    if(c.district) a[c.district] = (a[c.district] || 0) + 1; return a;
  }, {}),[rows]);
  const observedConnections = useMemo(() => new Set(rows.filter(c => c.movement_available_date && c.movement_available_date <= date &&
    c.origin.name && c.destination.name).map(c => `${c.origin.name}|${c.destination.name}`)),[rows,date]);
  const visibleRows = rows.filter(c => "area" in selection ? c.district === selection.area :
    c.movement_available_date && c.movement_available_date <= date &&
    c.origin.name === selection.connection[0] && c.destination.name === selection.connection[1])
    .sort((a,b) => (b.event_date || "").localeCompare(a.event_date || ""));
  const search = useMemo(() => {
    const q = norm(query.trim());
    return !q ? [] : [
      ...DISTRICTS.filter(n=>norm(n).includes(q)).map(name=>({ name, district: name, profile: null })),
      ...places.filter(p=>[p.name,p.local_name,...p.alias].some(n=>n && norm(n).includes(q))).map(p=>({name:p.name,district:p.district,profile:p}))
    ].slice(0,8);
  },[places,query]);
  const setArea = (name: string) => { setPlace(null); select({area:name}); };
  useEffect(() => {
    const g = group.current;
    if(!g) return;
    const chooseDistrict = (name: string) => { setPlace(null); select({area:name}); };
    g.clearLayers();
    const outline = geography.outline as L.LatLngTuple[];
    if (!boundary) L.polygon(outline, { color:"#6494a1", fillColor:"#192a2d", fillOpacity:.75, weight:1, interactive:false }).addTo(g);
    if(boundary) L.geoJSON(boundary,{
      style: f => {
        const name = areaOf(f?.properties?.name || "");
        const v = name ? byArea.get(name) : null;
        const unknown = !name || (data.coverage[name] ?? 0) < .35;
        const picked = !!name && hasPlace(selection,name);
        const color = picked ? "#e6f5e7" : unknown && layers.coverage ? "#d9ad79" : "#517477";
        return { color, weight:picked?2.3:1, fillColor:layers.coverage && unknown ? "#725b40" :
          layers.forecast && v?.estimate != null ? "#428b80" : "#193639",
          fillOpacity:layers.coverage && unknown ? .26 : layers.forecast && v?.estimate != null ? .23 + Math.min(v.estimate/(horizon/7*6),.59) : .55,
          dashArray: unknown && layers.coverage ? "5 5" : undefined };
      },
      onEachFeature: (f,l) => {
        const name = areaOf(f.properties?.name ?? "");
        if(!name) return;
        l.on("click", () => chooseDistrict(name));
        l.bindTooltip(text(name), { sticky: true, className:"atlas-tooltip" });
      }
    }).addTo(g);
    for(const name of DISTRICTS) {
      const center = CENTER[name], v = byArea.get(name), selected = hasPlace(selection,name);
      const unknown = data.coverage[name] == null || data.coverage[name] < .35;
      if (layers.history && counts[name]) L.circleMarker(center,{ radius:Math.min(24,4+Math.sqrt(counts[name])*2),
        color:"#65bdbd", weight:1, fillOpacity:.25, interactive:false }).addTo(g);
      if (layers.coverage && unknown) L.circleMarker(center,{radius:10,color:"#efb878",fillOpacity:0,weight:1.5,dashArray:"2 4",interactive:false}).addTo(g);
      L.circleMarker(center,{ radius:selected?5:3.5,color:selected?"#effcf4":"#a4d6cb",weight:1.5,
        fillColor:"#a4d6cb",fillOpacity:1}).addTo(g)
        .on("click",()=>chooseDistrict(name)).bindTooltip(text(name),{ permanent:selected, direction:"right", offset:[6,0],className:"atlas-tooltip" });
      if(layers.forecast && !selected && v?.estimate != null) {
        const marker = L.marker(center, { interactive:false, icon:L.divIcon({className:"atlas-number",html:String(Math.round(v.estimate)),iconSize:[30,15],iconAnchor:[-8,8]}) });
        marker.addTo(g);
      }
    }
    if (connections && layers.infrastructure) for(const [a,b] of EXAMPLE_INFRASTRUCTURE) {
      L.polyline([NODES[a],NODES[b]],{color:"#d0af80",opacity:.73,dashArray:"1 5",weight:2})
        .addTo(g).bindTooltip(text("Fictional infrastructure hypothesis · no movement evidence"),{className:"atlas-tooltip"});
    }
    for(const f of moves) {
      const pair=f.connection!;
      const marked="connection" in selection && selection.connection.join("|")===pair.join("|");
      const seen=observedConnections.has(pair.join("|"));
      if (!connections || !NODES[pair[0]] || !NODES[pair[1]] || (!marked && !(layers.movement && seen))) continue;
      L.polyline(line(NODES[pair[0]],NODES[pair[1]]),{weight:marked?3:2,color:marked?"#e6eff0":"#ad9ee1",dashArray:"5 7",opacity:.88})
        .addTo(g).bindTooltip(text(`${pair[0]} → ${pair[1]} (invented connection)`),{className:"atlas-tooltip"})
        .on("click",()=>{setPlace(null);select({connection:pair});});
    }
    if(place) L.circleMarker([place.lat,place.lon], {radius:9,color:"#e8bc83",weight:2,fillOpacity:.15}).addTo(g)
      .bindTooltip(text(place.name),{permanent:true,direction:"right",className:"atlas-tooltip"});
  },[boundary,layers,byArea,moves,selection,data,horizon,counts,observedConnections,place,select,connections]);
  function choose(option: {name:string;district:string;profile:Place|null}) {
    setQuery(option.name); setSearchOpen(false); setPlace(option.profile); select({area:option.district});
    map.current?.flyTo(option.profile ? [option.profile.lat,option.profile.lon] : CENTER[option.district], 9, {animate:false});
  }
  return <section className="atlas-column" aria-label="Kerala map workspace">
    <div className="atlas-controls">
      <form className="place-search" onSubmit={e=>{e.preventDefault();if(search[0]) choose(search[0]);}}>
        <label htmlFor="place-search">Find a place</label>
        <input id="place-search" type="search" autoComplete="off" placeholder="District or locality" value={query}
          onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);}}
          onKeyDown={e=>{if(e.key==="Escape") setSearchOpen(false);}}/>
        {searchOpen && query.trim() && <ul className="search-list">{search.length ? search.map(o=><li key={`${o.name}:${o.district}:${o.profile?.source ?? "district"}`}>
          <button type="button" onClick={()=>choose(o)}>{o.name} <small>{o.profile ? o.district : "District"}</small></button></li>) : <li>No matching offline place.</li>}</ul>}
      </form>
      <label>Forecast window<select value={horizon} onChange={e=>setHorizon(Number(e.target.value) as 7|28)}>
        <option value={7}>7 days</option><option value={28}>28 days</option></select></label>
      <label>District profile<select value={"area" in selection?selection.area:""} onChange={e=>{if(e.target.value)setArea(e.target.value);}}>
        <option value="" disabled>Pick district</option>{DISTRICTS.map(n=><option key={n}>{n}</option>)}</select></label>
      {connections && <label>Known connection<select value={"connection" in selection?selection.connection.join("|"):""} onChange={e=>{
        if(e.target.value){setPlace(null);setLayers(s=>({...s,movement:true}));select({connection:e.target.value.split("|") as [string,string]});}}}>
        <option value="" disabled>Choose invented link</option>{moves.map(r=><option key={r.connection!.join("|")} value={r.connection!.join("|")}>{r.connection!.join(" → ")}</option>)}</select></label>}
    </div>
    <div className="atlas-stage">
      <div ref={holder} className="leaflet-atlas" aria-label="Interactive Kerala map, district scale"/>
      <div className="chart-map-mark"><span>KERALA</span><small>8°–13° N / 74°–78° E</small></div>
      <div className="layer-tray">{LAYERS.filter(([key])=>connections || !["movement","infrastructure"].includes(key)).map(([key,label])=><label key={key} className={layers[key]?"on":""}>
        <input type="checkbox" checked={layers[key]} onChange={e=>setLayers(s=>({...s,[key]:e.target.checked}))}/>{label}
      </label>)}</div>
    </div>
    <div className="atlas-legend"><span><i className="swatch forecast"/>Forecast estimate</span>
      <span><i className="swatch unknown"/>Coverage unknown / thin</span>
      {connections && <span><i className="swatch movement"/>Invented documented connection</span>}
      {connections && layers.infrastructure && <span><i className="swatch infrastructure"/>Fictional infrastructure hypothesis · not evidence</span>}
      <button className="quiet" onClick={()=>{setPlace(null);map.current?.fitBounds([[8.22,74.45],[13.02,77.69]]);}}>Reset view</button></div>
    {place && <div className="locality"><strong>{place.name} {place.local_name && <span lang="ml">{place.local_name}</span>}</strong>
      <span>{place.district} · geographic context only; forecasts remain district-level.</span>
      <a href={`https://www.geonames.org/${place.source}/`}>GeoNames reference</a></div>}
    <details className="history-controls" open>
      <summary>Historical timeline and filters</summary>
      <div className="timeline"><label htmlFor="history-end">History through <strong>{dateLabel(date)}</strong></label>
        <input id="history-end" type="range" min={0} max={days(data.start,data.as_of)} value={days(data.start,date)}
          onChange={e=>setDate(shift(data.start,Number(e.target.value)))}/><span>{rows.length} shown in sample</span></div>
      <div className="filter-strip">
        <label>Period<select value={period} onChange={e=>setPeriod(Number(e.target.value))}><option value={28}>28 days</option><option value={90}>90 days</option><option value={365}>365 days</option></select></label>
        <label>Geography<select value={district} onChange={e=>setDistrict(e.target.value)}><option value="">All districts</option>{DISTRICTS.map(k=><option key={k}>{k}</option>)}</select></label>
        <label>Substance<select value={substance} onChange={e=>setSubstance(e.target.value)}><option value="">All</option>{["cannabis","mdma","methamphetamine","opioid"].map(k=><option key={k}>{k}</option>)}</select></label>
        <label>Evidence<select value={evidence} onChange={e=>setEvidence(e.target.value)}><option value="">All documentation</option><option value="reviewed">Reviewed by date</option><option value="reported">Not reviewed by date</option></select></label>
        <label>Source<select value={sources} onChange={e=>setSources(e.target.value)}><option value="">All fictional</option><option value="primary">Primary fixture</option><option value="syndicated">With syndicated copy</option></select></label>
      </div>
      <p className="small">Filters affect history, not the frozen forecasts.{connections && ` ${data.connections_label}.`}</p>
      <div className="case-links">{visibleRows.slice(0,5).map(c=><button className="quiet" key={c.case_id} onClick={()=>openCase(c,date)}>
        {c.event_date && dateLabel(c.event_date)} · {c.substance_category || "Unknown substance"}</button>)}
        {!visibleRows.length && <span>No documented entries for this selection and filter. This is not evidence of no activity.</span>}</div>
    </details>
  </section>;
}
