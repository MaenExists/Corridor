import L from "leaflet";
import type { FeatureCollection } from "geojson";
import { ArrowRight, CalendarDays, Crosshair, Files, Layers3, MapPin, Minus, Plus, Search,
  TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Forecast } from "../../../shared/schema";
import { CENTER, dateLabel, DISTRICTS, localJSON, NODES, NOTICE, pct } from "../data";
import type { Cases, Forecasts, Place } from "../data";
import { districtName, pairId, pairLabel } from "../companion/model";
import { compactCount, datasetForecast, materialChange, shiftLabel } from "./metrics";
import type { Horizon, Overview, Range } from "./metrics";

export const BATHYSAT = "/geography/kerala-satellite.webp";
const KERALA: L.LatLngBoundsLiteral = [[8.20,74.82],[12.90,77.38]];
const SOURCE: L.LatLngBoundsLiteral = [[6.3,68.0],[15.1,83.2]];
const ONLINE_DETAIL: L.LatLngBoundsLiteral = [[7.55,73.85],[13.35,78.70]];
const WELD = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual/default/2000-12-01/GoogleMapsCompatible_Level12/{z}/{y}/{x}.jpeg";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
type Mode = "satellite" | "detail" | "street";
type Point = { x:number;y:number;w:number;h:number };
type Layers = { history:boolean; connections:boolean; coverage:boolean; forecasts:boolean; hypotheses:boolean };
const infrastructure: [string,string][]=[["Wayanad","Palakkad"],["Idukki","Kollam"],["Kannur","Malappuram"]];
const normalize=(v:string)=>v.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
const label=(s:string)=>{const el=document.createElement("span");el.textContent=s;return el;};
const ranges: {value:Range;title:string}[]=[{value:28,title:"Last 28 days"},{value:90,title:"Last 3 months"},{value:180,title:"Last 6 months"}];
const knownNodes=(p:[string,string])=>NODES[p[0]] && NODES[p[1]];

function curve([a,b]:[string,string]): L.LatLngTuple[] {
  const [p,q]=[NODES[a],NODES[b]];
  const bend=Math.max(-.16,Math.min(.22,(q[0]-p[0])*.16));
  return Array.from({length:22},(_,i)=>{
    const x=i/21;
    return [p[0]*(1-x)+q[0]*x,p[1]*(1-x)+q[1]*x+Math.sin(Math.PI*x)*bend];
  });
}
function keyTarget(layer:L.Path,description:string,activate:()=>void) {
  const el=layer.getElement();
  if(!el)return;
  el.setAttribute("tabindex","0");el.setAttribute("role","button");el.setAttribute("aria-label",description);
  el.addEventListener("keydown",e=>{
    if(["Enter"," "].includes((e as KeyboardEvent).key)){e.preventDefault();activate();}
  });
}
export function RangeControl({range,change,label:field="History range"}:{range:Range;change:(v:Range)=>void;label?:string}) {
  return <select aria-label={field} className="console-select" value={range} onChange={e=>change(Number(e.target.value) as Range)}>
    {ranges.map(r=><option value={r.value} key={r.value}>{r.title}</option>)}</select>;
}
function Highlight({value,kind}:{value?:Forecast;kind:string}) {
  return <div className="console-map-count">
    <div className="console-count-icon" aria-hidden>{kind==="issued"?<span/>:<span className="gap"/>}</div>
    <div><span>{value?.abstained?"Forecast withheld":`${value?.horizon_days??28}-day forecast`}</span>
      <strong>{value?.abstained?"Abstained":value?.estimate!=null?value.estimate.toFixed(1):"—"}</strong></div>
  </div>;
}
function DistrictInspector({data,stats,district,forecast,close,onDetails}:{data:Cases;stats:Overview;district:string;
  forecast?:Forecast;close:()=>void;onDetails:()=>void}) {
  const d=stats.districts[district];
  const count=stats.rows.filter(r=>r.district===district).length;
  const supported=stats.connections.filter(p=>p.includes(district)).length;
  const missing=forecast?.abstained;
  return <aside className="console-inspector" aria-label={`${district} district inspector`}>
    <header><h3><i/>{district} District</h3><button className="console-icon" title="Close district inspector" aria-label="Close district inspector" onClick={close}><X size={18}/></button></header>
    <div className="console-inspector-stats">
      <div><span><TrendingUp size={13}/> Reported change</span><strong>{shiftLabel(d.percent)}</strong></div>
      <Highlight value={forecast} kind={forecast?.estimate!=null?"issued":"unknown"}/>
    </div>
    <section><h4>What changed?</h4>
      <p><b>{d.current}</b> fictional reports in the last 28 days, versus <b>{d.previous}</b> in the previous 28 days. {materialChange(d)?"This could reflect reporting changes.":"Counts are not a measure of all movement."}</p>
      {forecast?.interval&&<p className="console-interval">Estimated range <b>{forecast.interval.join("–")}</b> documented cases. Not a confidence score.</p>}
      {missing&&<p className="console-unknown">{forecast?.abstain_reason ?? "Coverage unknown"}. This is not a safety finding.</p>}
    </section>
    <section><h4>Supporting evidence</h4>
      <div className="console-evidence-list"><span><Files size={15}/> {compactCount(count)} records in view</span>
        <span><MapPin size={15}/> {supported} invented {supported===1?"connection":"connections"} in view</span>
        <span><CalendarDays size={15}/> Archive through {dateLabel(data.as_of)}</span></div></section>
    <footer><button className="console-button outline" onClick={onDetails}>View detailed analysis <ArrowRight size={14}/></button></footer>
  </aside>;
}

export function SatelliteMap({ data, forecasts, stats, range, changeRange, district, select, horizon, onDetails, onConnection, planner=false, expanded=false, mode, setMode }:{
  data:Cases;forecasts:Forecasts|null;stats:Overview;range:Range;changeRange:(r:Range)=>void;district:string;select:(d:string)=>void;
  horizon:Horizon;onDetails:()=>void;onConnection:(p:[string,string])=>void;planner?:boolean;expanded?:boolean;mode:Mode;setMode:(m:Mode)=>void;
}) {
  const mapNode=useRef<HTMLDivElement>(null);
  const engine=useRef<{ map:L.Map;vectors:L.LayerGroup;tiles:L.TileLayer|null }|null>(null);
  const [ready,setReady]=useState(false);
  const [outline,setOutline]=useState<FeatureCollection|null>(null);
  const [locations,setLocations]=useState<Place[]>([]);
  const [layers,setLayers]=useState<Layers>({history:true,connections:true,coverage:true,forecasts:false,hypotheses:false});
  const [inspect,setInspect]=useState(true);
  const [onlineError,setOnlineError]=useState(false);
  const [query,setQuery]=useState("");
  const [searchOpen,setSearchOpen]=useState(false);
  const [leader,setLeader]=useState<Point|null>(null);
  const target=datasetForecast(forecasts,district,horizon);
  const districtRef=useRef(district);
  districtRef.current=district;
  const counts=useMemo(()=>{
    const c:Record<string,number>={};
    for(const r of stats.rows)c[r.district]=(c[r.district]??0)+1;
    return c;
  },[stats.rows]);
  const results=useMemo(()=>{
    const q=normalize(query.trim());
    if(!q)return [];
    return [...DISTRICTS.filter(d=>normalize(d).includes(q)).map(d=>({name:d,district:d,location:CENTER[d],districtOnly:true})),
      ...locations.filter(p=>[p.name,p.local_name,...p.alias].some(n=>n && normalize(n).includes(q)))
      .map(p=>({name:p.name,district:p.district,location:[p.lat,p.lon] as [number,number],districtOnly:false}))].slice(0,7);
  },[query,locations]);
  useEffect(()=>{
    let active=true;
    localJSON<FeatureCollection>("/geography/kerala-districts.geojson").then(x=>{if(active)setOutline(x);}).catch(()=>{});
    localJSON<{places:Place[]}>("/geography/places.json").then(x=>{if(active)setLocations(x.places);}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  const fit=(map:L.Map)=>{
    const w=map.getSize().x;
    map.fitBounds(KERALA,{paddingTopLeft:[w>670?100:17,26],paddingBottomRight:[w>670?320:18,33],animate:false});
  };
  useEffect(()=>{
    if(!mapNode.current)return;
    const root=mapNode.current;
    const map=L.map(root,{zoomControl:false,attributionControl:false,zoomSnap:.25,minZoom:5.75,maxZoom:17,
      maxBounds:[[6.5,70.6],[15,81.7]],maxBoundsViscosity:.72,zoomAnimation:false,fadeAnimation:false});
    map.createPane("console-base")!.style.zIndex="205";
    map.createPane("console-detail")!.style.zIndex="220";
    L.imageOverlay(BATHYSAT,SOURCE,{pane:"console-base",interactive:false,className:"console-base-satellite"}).addTo(map);
    const vectors=L.layerGroup().addTo(map);
    L.control.scale({position:"bottomleft",imperial:false,maxWidth:116}).addTo(map);
    const sync=()=>{
      const p=map.latLngToContainerPoint(CENTER[districtRef.current]);
      const s=map.getSize();
      setLeader({ x:p.x,y:p.y,w:s.x,h:s.y });
    };
    map.on("moveend zoomend resize",sync);
    let lastWidth=root.clientWidth;
    const observer=new ResizeObserver(()=>{
      if(!root.isConnected)return;
      map.invalidateSize({animate:false,pan:false});
      if((lastWidth>670)!==(root.clientWidth>670))fit(map);
      lastWidth=root.clientWidth;
    });
    observer.observe(root);
    fit(map);sync();engine.current={map,vectors,tiles:null};setReady(true);
    return ()=>{observer.disconnect();map.off("moveend zoomend resize",sync);map.stop().remove();engine.current=null;};
  },[]);
  useEffect(()=>{
    if(!ready || !engine.current)return;
    const e=engine.current;
    e.tiles?.remove();e.tiles=null;
    setOnlineError(false);
    if(mode==="satellite")return;
    const street=mode==="street";
    const layer=L.tileLayer(street?OSM:WELD,{pane:"console-detail",bounds:ONLINE_DETAIL,noWrap:true,
      maxNativeZoom:street?19:12, minZoom:street?5:8,opacity:street?.94:.8,keepBuffer:1,
      referrerPolicy:street?"origin":"no-referrer",className:street?"console-street-tiles":"console-nasa-tiles"});
    let errors=0, loaded=0;
    layer.on("tileerror",()=>{errors++;if(errors>=3 && !loaded){setOnlineError(true);layer.remove();}});
    layer.on("tileload",()=>{loaded++;});
    e.tiles=layer.addTo(e.map);
    if(!street && e.map.getZoom()<8)e.map.setView(CENTER[districtRef.current],8.75,{animate:false});
    return ()=>{layer.off();layer.remove();};
  },[mode,ready]);
  useEffect(()=>{
    const e=engine.current;
    if(!e || !ready)return;
    const v=e.vectors;
    v.clearLayers();
    const choose=(d:string)=>{select(d);setInspect(true);};
    if(outline)L.geoJSON(outline,{
      style:feature=>{
        const d=districtName(feature?.properties?.name??"");
        const active=d===district;
        return {color:active?"#d2f0e3":"#b0d1c4",weight:active?1.65:.9,opacity:active?.94:.74,
          fillColor:active?"#50ae98":"#1d3940",fillOpacity:active?.115:.045};
      },
      onEachFeature:(feature,layer)=>{
        const d=districtName(feature.properties?.name??"");
        if(d)layer.on("click",()=>choose(d));
      }
    }).addTo(v);
    const connect=(p:[string,string],highlight:boolean)=>{
      if(!knownNodes(p))return;
      const path=curve(p);
      const tone=highlight?"#f3b450":"#43e5cc";
      L.polyline(path,{color:tone,opacity:.17,weight:8,interactive:false,className:"console-arc-glow"}).addTo(v);
      const description=`${pairLabel(p)} · open invented connection evidence`;
      const edge=L.polyline(path,{color:tone,opacity:.83,weight:1.45,dashArray:highlight?"5 4":undefined,className:"console-documented-edge"})
        .bindTooltip(label(description),{className:"console-map-tooltip",sticky:true})
        .on("click",()=>onConnection(p)).addTo(v);
      keyTarget(edge,description,()=>onConnection(p));
    };
    if(!planner&&layers.connections) stats.connections.forEach(p=>connect(p,materialChange(stats.districts[p[1]])));
    if(!planner&&layers.hypotheses) infrastructure.forEach(p=>{
      L.polyline(curve(p),{color:"#e5c997",opacity:.72,weight:1.2,dashArray:"2 5",className:"console-hypothesis"})
        .bindTooltip(label("Fictional infrastructure hypothesis · not movement evidence"),{className:"console-map-tooltip"}).addTo(v);
    });
    for(const d of DISTRICTS){
      const center=CENTER[d];
      const chosen=d===district;
      const unknown=(data.coverage[d]??0)<(forecasts?.coverage_threshold??.35);
      const spike=materialChange(stats.districts[d]);
      const color=chosen?"#ff7768":spike?"#ffc46a":"#59e8d4";
      if(layers.history && (counts[d]??0)>0)
        L.circleMarker(center,{color,weight:0,radius:Math.min(14,5+Math.sqrt(counts[d])*.8),
          fillColor:color,fillOpacity:.24,interactive:false,className:"console-district-glow"}).addTo(v);
      if(chosen){
        L.circleMarker(center,{color,weight:1,opacity:.66,fillOpacity:0,radius:15,interactive:false}).addTo(v);
        L.circleMarker(center,{color,weight:1,opacity:.28,fillOpacity:0,radius:24,interactive:false}).addTo(v);
      }
      if(unknown&&layers.coverage)
        L.circleMarker(center,{color:"#e3d0a3",weight:1.4,dashArray:"2 4",fillOpacity:0,radius:9,interactive:false,
          className:"console-coverage-gap"}).addTo(v);
      const point=L.circleMarker(center,{color:chosen?"#ffe1c4":color,fillColor:color,fillOpacity:.93,weight:1.1,radius:chosen?5:3.7,
        className:"console-district-node"}).addTo(v);
      const f=datasetForecast(forecasts,d,horizon);
      const name=d+(layers.forecasts && f?.estimate!=null?` · ${f.estimate.toFixed(1)}`:"");
      const description=`${d}${unknown?", coverage unknown":""}, ${counts[d]??0} synthetic reports in view`;
      point.bindTooltip(label(name),{className:`console-map-tooltip ${chosen?"map-tooltip-selected":""}`,
        permanent:chosen||["Kasaragod","Kannur","Kozhikode","Palakkad","Thrissur","Ernakulam","Kottayam","Kollam","Thiruvananthapuram"].includes(d),
        direction:"right",opacity:1,offset:[7,0]});
      point.on("mouseover",()=>{point.setTooltipContent(label(description));});
      point.on("mouseout",()=>{point.setTooltipContent(label(name));});
      point.on("click",()=>choose(d));
      keyTarget(point,description,()=>choose(d));
    }
    const p=e.map.latLngToContainerPoint(CENTER[district]);const s=e.map.getSize();
    setLeader({x:p.x,y:p.y,w:s.x,h:s.y});
  },[ready,outline,district,layers,counts,stats,forecasts,horizon,data.coverage,select,planner,onConnection]);
  const choose=(result:typeof results[number])=>{
    select(result.district);setInspect(true);setQuery("");setSearchOpen(false);
    if(!result.districtOnly)engine.current?.map.setView(result.location,9.25,{animate:false});
  };
  const flip=(key:keyof Layers)=>setLayers(l=>({...l,[key]:!l[key]}));
  return <section className={`console-card console-map-panel ${expanded?"console-map-expanded":""}`} aria-label="Kerala forecast map">
    <div className="console-map-frame">
      <div ref={mapNode} className="console-leaflet" role="region" aria-label="Interactive satellite map of Kerala" tabIndex={0}/>
      <div className="console-map-heading"><div><MapPin size={17}/><h2>Kerala forecast workspace</h2></div>
        <RangeControl range={range} change={changeRange}/></div>
      <div className="console-map-controls"><button aria-label="Zoom in" title="Zoom in" onClick={()=>engine.current?.map.zoomIn()}><Plus size={19}/></button>
        <button aria-label="Zoom out" title="Zoom out" onClick={()=>engine.current?.map.zoomOut()}><Minus size={19}/></button>
        <button aria-label="Reset map view" title="Reset map view" onClick={()=>{if(engine.current)fit(engine.current.map);}}><Crosshair size={18}/></button></div>
      <div className="console-map-tools">
        <details className="console-layer-menu">
          <summary><Layers3 size={16}/><span>Layers</span></summary>
          <fieldset><legend>Basemap</legend>
            <label><input type="radio" name={expanded?"expanded-basemap":"overview-basemap"} checked={mode==="satellite"} onChange={()=>setMode("satellite")}/> Satellite archive · offline</label>
            <label><input type="radio" name={expanded?"expanded-basemap":"overview-basemap"} checked={mode==="detail"} onChange={()=>setMode("detail")}/> NASA satellite detail · online</label>
            <label><input type="radio" name={expanded?"expanded-basemap":"overview-basemap"} checked={mode==="street"} onChange={()=>setMode("street")}/> OpenStreetMap streets · online</label>
            <p className="console-muted">Online maps send map tile coordinates to the provider, not case data or searches.</p></fieldset>
          <fieldset><legend>Overlays</legend>
            <label><input type="checkbox" checked={layers.history} onChange={()=>flip("history")}/> Reported history</label>
            {!planner&&<label><input type="checkbox" checked={layers.connections} onChange={()=>flip("connections")}/> Documented connections</label>}
            <label><input type="checkbox" checked={layers.coverage} onChange={()=>flip("coverage")}/> Coverage gaps</label>
            <label><input type="checkbox" checked={layers.forecasts} onChange={()=>flip("forecasts")}/> Forecast labels ({horizon} days)</label>
            {!planner&&<label><input type="checkbox" checked={layers.hypotheses} onChange={()=>flip("hypotheses")}/> Infrastructure hypotheses</label>}
          </fieldset>
        </details>
        <form className="console-map-search" role="search" onSubmit={e=>{e.preventDefault();if(results[0])choose(results[0]);}}>
          <Search size={15}/><input type="search" aria-label="Find a district or place" placeholder="Find a place" value={query}
            onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);}}
            onKeyDown={e=>{if(e.key==="Escape")setSearchOpen(false);}}/>
          {searchOpen && query.trim()&&<div className="console-search-results">{results.length?results.map((p,i)=>
            <button type="button" key={`${p.name}-${i}`} onClick={()=>choose(p)}>{p.name}<small>{p.districtOnly?"District":p.district}</small></button>)
            :<p>No matching place in the local gazetteer.</p>}</div>}
        </form>
      </div>
      {onlineError&&<div className="console-map-error" role="status">Online imagery unavailable. The satellite archive remains visible.
        <button onClick={()=>setMode("satellite")}>Use archive</button></div>}
      <div className="console-map-legend">
        <div><i className="selected"/>Selected district</div><div><i className="jump"/>Reporting increase</div><div><i className="reported"/>Reported history</div>
        {layers.connections&&!planner&&<div><i className="edge"/>Invented connection</div>}
        <div><i className="thin"/>Coverage unknown</div>
        {layers.hypotheses&&!planner&&<div><i className="hypothesis"/>Infrastructure hypothesis</div>}
      </div>
      {inspect && leader && leader.w>670 && leader.x>2 && leader.y>50 && leader.y<leader.h-24 && leader.x<leader.w-310 &&
        <svg className="console-map-leader" viewBox={`0 0 ${leader.w} ${leader.h}`} aria-hidden><line x1={leader.x} y1={leader.y}
          x2={leader.w-308} y2={Math.min(119,leader.y+35)} stroke="#c0d1d3" strokeWidth="1.15"/></svg>}
      {!inspect&&<button className="console-reopen" onClick={()=>setInspect(true)}>Show {district} forecast <ArrowRight size={13}/></button>}
      {inspect&&<DistrictInspector data={data} stats={stats} district={district} forecast={target} close={()=>setInspect(false)} onDetails={onDetails}/>}
      <div className="console-map-credits">
        <a href="https://nasa-gibs.github.io/gibs-api-docs/" target="_blank" rel="noreferrer">NASA EOSDIS GIBS</a> / Landsat-WELD (2000) + Blue Marble
        {" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
        {" · "}<span>District scale only</span>
      </div>
    </div>
    {expanded&&<div className="console-map-disclaimer">{NOTICE} Imagery is archival geographic context, not evidence.</div>}
  </section>;
}
