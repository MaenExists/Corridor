import L from "leaflet";
import type { FeatureCollection } from "geojson";
import { ArrowRight, Crosshair, Layers3, MapPin, Minus, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Forecast } from "../../../shared/schema";
import { CENTER, dateLabel, DISTRICTS, localJSON, methodName, NODES, NOTICE, OSM_STREET_TILES } from "../data";
import type { Cases, Forecasts, Place } from "../data";
import { ForecastEstimate, forecastWindow, HorizonControl } from "../ForecastReadout";
import { issuedMethod } from "../forecastEvidence";
import { districtName, pairLabel } from "../companion/model";
import { datasetForecast, materialChange } from "./metrics";
import type { Horizon, Overview, Range } from "./metrics";

export const BATHYSAT = "/geography/kerala-satellite.webp";
const KERALA: L.LatLngBoundsLiteral = [[8.20,74.82],[12.90,77.38]];
const WORLD: L.LatLngBoundsLiteral = [[-85,-180],[85,180]];
const SOURCE: L.LatLngBoundsLiteral = [[6.3,68.0],[15.1,83.2]];
const ONLINE_DETAIL: L.LatLngBoundsLiteral = [[7.55,73.85],[13.35,78.70]];
const WELD = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual/default/2000-12-01/GoogleMapsCompatible_Level12/{z}/{y}/{x}.jpeg";
export type BasemapMode = "satellite" | "detail" | "street";
type TileStatus = "loading" | "ready" | "unavailable";
type Layers = { connections:boolean; forecasts:boolean; hypotheses:boolean };
const views=[{id:"forecast",label:"Forecast availability"},{id:"history",label:"Reported history"},{id:"coverage",label:"Reporting coverage"}] as const;
type MapView = typeof views[number]["id"];
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
function DistrictInspector({stats,district,forecast,close,onDetails,select,horizon,changeHorizon}:{stats:Overview;district:string;
  forecast?:Forecast;close:()=>void;onDetails:()=>void;select:(d:string)=>void;horizon:Horizon;changeHorizon:(h:Horizon)=>void}) {
  const d=stats.districts[district];
  return <aside className="console-inspector" aria-label={`${district} district inspector`}>
    <header><label className="console-eyebrow">District
      <select aria-label="Forecast district" value={district} onChange={e=>select(e.target.value)}>{DISTRICTS.map(name=><option key={name}>{name}</option>)}</select>
    </label><button className="console-icon" title="Close district inspector" aria-label="Close district inspector" onClick={close}><X size={17}/></button></header>
    <HorizonControl value={horizon} onChange={changeHorizon}/>
    <div className="inspector-output" aria-live="polite">
      <h3>{district} District</h3>
      {forecast&&<p className="evidence-window">{forecastWindow(forecast)}</p>}
      <ForecastEstimate forecast={forecast}/>
      {forecast&&!forecast.abstained&&<p className="inspector-method">Method: <b>{methodName(issuedMethod(forecast))}</b></p>}
      {forecast&&!forecast.abstained&&<p className="inspector-method">Documented counts only, not all movement.</p>}
    </div>
    <div className="inspector-actions"><button className="console-button solid" onClick={onDetails}>View model evidence <ArrowRight size={15}/></button></div>
    <div className="inspector-history"><h4>What was documented</h4>
      <p><b>{d.current}</b> reports in the latest 28 days vs <b>{d.previous}</b> in the prior 28. Archive through {dateLabel(stats.cutoff)}.</p>
      {materialChange(d)&&<p>Reporting increased. This does not establish increased movement.</p>}
    </div>
  </aside>;
}

export function SatelliteMap({ data, forecasts, stats, range, changeRange, district, select, horizon, changeHorizon, onDetails, onConnection, planner=false, expanded=false, mode, setMode, offlineMaps }:{
  data:Cases;forecasts:Forecasts|null;stats:Overview;range:Range;changeRange:(r:Range)=>void;district:string;select:(d:string)=>void;
  horizon:Horizon;changeHorizon:(h:Horizon)=>void;onDetails:()=>void;onConnection:(p:[string,string])=>void;planner?:boolean;expanded?:boolean;
  mode:BasemapMode;setMode:(m:BasemapMode)=>void;offlineMaps:boolean;
}) {
  const mapNode=useRef<HTMLDivElement>(null);
  const keepFit=useRef(true);
  const engine=useRef<{ map:L.Map;vectors:L.LayerGroup;tiles:L.TileLayer|null }|null>(null);
  const [ready,setReady]=useState(false);
  const [outline,setOutline]=useState<FeatureCollection|null>(null);
  const [locations,setLocations]=useState<Place[]>([]);
  const [view,setView]=useState<MapView>("forecast");
  const [layers,setLayers]=useState<Layers>({connections:false,forecasts:false,hypotheses:false});
  const [inspect,setInspect]=useState(true);
  const [tileStatus,setTileStatus]=useState<TileStatus>("loading");
  const [tileAttempt,setTileAttempt]=useState(0);
  const [query,setQuery]=useState("");
  const [searchOpen,setSearchOpen]=useState(false);
  const target=datasetForecast(forecasts,district,horizon);
  const useArchive=mode==="satellite" || tileStatus==="unavailable";
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
    map.fitBounds(KERALA,{padding:[25,24],maxZoom:8,animate:false});
    keepFit.current=true;
  };
  useEffect(()=>{
    if(!mapNode.current)return;
    const root=mapNode.current;
    const map=L.map(root,{zoomControl:false,attributionControl:false,zoomSnap:.25,minZoom:4,maxZoom:19,
      maxBounds:WORLD,maxBoundsViscosity:.85,zoomAnimation:false,fadeAnimation:false});
    map.createPane("console-base")!.style.zIndex="205";
    map.createPane("console-detail")!.style.zIndex="220";
    const vectors=L.layerGroup().addTo(map);
    L.control.scale({position:"bottomleft",imperial:false,maxWidth:116}).addTo(map);
    const notFitted=()=>{keepFit.current=false;};
    map.on("dragstart zoomstart",notFitted);
    const observer=new ResizeObserver(()=>{
      if(!root.isConnected)return;
      map.invalidateSize({animate:false,pan:false});
      if(keepFit.current)fit(map);
    });
    observer.observe(root);
    fit(map);engine.current={map,vectors,tiles:null};setReady(true);
    return ()=>{observer.disconnect();map.off("dragstart zoomstart",notFitted);map.stop().remove();engine.current=null;};
  },[]);
  useEffect(()=>{
    if(!ready || !engine.current)return;
    const e=engine.current;
    e.tiles?.remove();e.tiles=null;
    setTileStatus("loading");
    if(mode==="satellite")return;
    const street=mode==="street";
    if(!street && !L.latLngBounds(ONLINE_DETAIL).contains(e.map.getCenter()))fit(e.map);
    const layer=L.tileLayer(street?OSM_STREET_TILES:WELD,{pane:"console-detail",bounds:street?undefined:ONLINE_DETAIL,noWrap:true,
      maxNativeZoom:street?19:12,keepBuffer:1,referrerPolicy:street?"strict-origin-when-cross-origin":"no-referrer",
      className:street?"console-street-tiles":"console-nasa-tiles"});
    let errors=0, loaded=0, failed=false;
    layer.on("loading",()=>{errors=0;loaded=0;setTileStatus("loading");});
    layer.on("tileerror",()=>{errors++;});
    layer.on("tileload",()=>{loaded++;setTileStatus("ready");});
    layer.on("load",()=>{
      if(errors && !loaded && !failed){
        failed=true;
        // Leaflet still uses its map after firing "load".
        queueMicrotask(()=>{if(e.map.hasLayer(layer))layer.remove();});
        setTileStatus("unavailable");
      }
    });
    e.tiles=layer.addTo(e.map);
    return ()=>{layer.off();layer.remove();};
  },[mode,ready,tileAttempt]);
  useEffect(()=>{
    const map=engine.current?.map;
    if(!ready || !map)return;
    if(useArchive && !L.latLngBounds(SOURCE).contains(map.getCenter())) fit(map);
    map.setMaxZoom(useArchive?9:mode==="detail"?12:19);
    map.setMaxBounds(useArchive?SOURCE:mode==="detail"?ONLINE_DETAIL:WORLD);
    if(!useArchive)return;
    const archive=L.imageOverlay(BATHYSAT,SOURCE,{pane:"console-base",interactive:false,className:"console-base-satellite"}).addTo(map);
    return ()=>{archive.remove();};
  },[mode,useArchive,ready]);
  useEffect(()=>{
    const e=engine.current;
    if(!e || !ready)return;
    const v=e.vectors;
    v.clearLayers();
    const choose=(d:string)=>{select(d);setInspect(true);};
    const unknownCoverage=(d:string)=>(data.coverage[d]??0)<(forecasts?.coverage_threshold??.35);
    if(outline)L.geoJSON(outline,{
      style:feature=>{
        const d=districtName(feature?.properties?.name??"");
        const active=d===district;
        const gap=!!d && view==="coverage" && unknownCoverage(d);
        return {color:mode==="street"&&!useArchive ? (active?"#12493c":"#50665e") : active?"#e3fff3":"#aec5be",
          weight:active?2.2:1,opacity:active?.98:.73,
          fillColor:gap?"#e5af5d":active?"#50ae98":"#264e44",fillOpacity:gap?.3:active?.25:.09};
      },
      onEachFeature:(feature,layer)=>{
        const d=districtName(feature.properties?.name??"");
        if(d)layer.on("click",()=>choose(d));
      }
    }).addTo(v);
    const connect=(p:[string,string])=>{
      if(!knownNodes(p))return;
      const path=curve(p);
      const tone="#43e5cc";
      L.polyline(path,{color:tone,opacity:.17,weight:8,interactive:false,className:"console-arc-glow"}).addTo(v);
      const description=`${pairLabel(p)} · open invented connection evidence`;
      const edge=L.polyline(path,{color:tone,opacity:.83,weight:1.45,className:"console-documented-edge"})
        .bindTooltip(label(description),{className:"console-map-tooltip",sticky:true})
        .on("click",()=>onConnection(p)).addTo(v);
      keyTarget(edge,description,()=>onConnection(p));
    };
    if(!planner&&layers.connections) stats.connections.forEach(connect);
    if(!planner&&layers.hypotheses) infrastructure.forEach(p=>{
      L.polyline(curve(p),{color:"#e5c997",opacity:.72,weight:1.2,dashArray:"2 5",className:"console-hypothesis"})
        .bindTooltip(label("Fictional infrastructure hypothesis · not movement evidence"),{className:"console-map-tooltip"}).addTo(v);
    });
    for(const d of DISTRICTS){
      const center=CENTER[d];
      const chosen=d===district;
      const coverageGap=unknownCoverage(d);
      const f=datasetForecast(forecasts,d,horizon);
      const issueStatus=f?.abstained?"Not issued":f?.estimate!=null?"Forecast issued":"Forecast unavailable";
      const gap=view==="forecast"?!!f?.abstained:view==="coverage"&&coverageGap;
      const color=gap?"#f4c181":view==="forecast" && !f?"#aab4b5":"#55d8ba";
      if(view==="history" && (counts[d]??0)>0)
        L.circleMarker(center,{color,weight:1,radius:Math.min(25,6+Math.sqrt(counts[d])*1.55),
          fillColor:color,fillOpacity:.32,interactive:false}).addTo(v);
      if(chosen){
        L.circleMarker(center,{color:"#edfff8",weight:2,opacity:.92,fillOpacity:0,radius:13,interactive:false}).addTo(v);
      }
      if(gap)
        L.circleMarker(center,{color,weight:2,dashArray:"2 3",fillOpacity:0,radius:9,interactive:false,
          className:"console-coverage-gap"}).addTo(v);
      const point=L.circleMarker(center,{color:"#14342d",fillColor:color,fillOpacity:.96,weight:1.5,radius:chosen?7:5,
        className:"console-district-node"}).addTo(v);
      const showLabel=view==="forecast" && layers.forecasts && f?.estimate!=null;
      const name=showLabel?`${d} · ${f.estimate!.toFixed(1)}`:d;
      const status=view==="forecast"?issueStatus:view==="coverage"?coverageGap?"Coverage unknown":"Simulated coverage present":`${counts[d]??0} synthetic reports`;
      const description=`${d} · ${status}`;
      point.bindTooltip(label(chosen||showLabel?name:description),{className:`console-map-tooltip ${chosen?"map-tooltip-selected":""}`,
        permanent:chosen||showLabel,direction:"auto",opacity:1,offset:[3,0]});
      point.on("click",()=>choose(d));
      keyTarget(point,description,()=>choose(d));
    }
  },[ready,outline,district,view,layers,counts,stats,forecasts,horizon,data.coverage,select,planner,onConnection,mode,useArchive]);
  const choose=(result:typeof results[number])=>{
    select(result.district);setInspect(true);setQuery("");setSearchOpen(false);
    if(!result.districtOnly){
      keepFit.current=false;
      engine.current?.map.setView(result.location,mode==="street"&&!useArchive?12:9,{animate:false});
    }
  };
  const flip=(key:keyof Layers)=>setLayers(l=>({...l,[key]:!l[key]}));
  return <section className={`console-card console-map-panel ${expanded?"console-map-expanded":""}`} aria-label="Kerala forecast map">
    <div className="console-map-tools">
        <div className="console-map-heading"><MapPin size={18}/><h2>Kerala forecast map</h2></div>
        <form className="console-map-search" role="search" onSubmit={e=>{e.preventDefault();if(results[0])choose(results[0]);}}>
          <Search size={16}/><input type="search" aria-label="Find a district or place" placeholder="Find a district or place" value={query}
            onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);}}
            onKeyDown={e=>{if(e.key==="Escape")setSearchOpen(false);}}/>
          {searchOpen && query.trim()&&<div className="console-search-results">{results.length?results.map((p,i)=>
            <button type="button" key={`${p.name}-${i}`} onClick={()=>choose(p)}>{p.name}<small>{p.districtOnly?"District":p.district}</small></button>)
            :<p>No matching place in the local gazetteer.</p>}</div>}
        </form>
        <details className="console-layer-menu">
          <summary><Layers3 size={16}/><span>Layers</span></summary>
          <div className="console-layer-options">
          <fieldset><legend>Basemap</legend>
            {offlineMaps?<p className="console-muted">Offline rehearsal · bundled satellite archive. Online basemaps are disabled.</p>:<>
              <label><input type="radio" name={expanded?"expanded-basemap":"overview-basemap"} checked={mode==="street"} onChange={()=>setMode("street")}/> OpenStreetMap streets · online</label>
              <label><input type="radio" name={expanded?"expanded-basemap":"overview-basemap"} checked={mode==="detail"} onChange={()=>setMode("detail")}/> NASA satellite detail · online</label>
              <label><input type="radio" name={expanded?"expanded-basemap":"overview-basemap"} checked={mode==="satellite"} onChange={()=>setMode("satellite")}/> Satellite archive · offline</label>
              <p className="console-muted">Online maps send map tile coordinates to the provider, not case data or searches.</p>
            </>}</fieldset>
          <fieldset><legend>Overlays</legend>
             {!planner&&<label><input type="checkbox" checked={layers.connections} onChange={()=>flip("connections")}/> Documented connections</label>}
             {view==="forecast"&&<label><input type="checkbox" checked={layers.forecasts} onChange={()=>flip("forecasts")}/> Forecast labels ({horizon} days)</label>}
            {!planner&&<label><input type="checkbox" checked={layers.hypotheses} onChange={()=>flip("hypotheses")}/> Infrastructure hypotheses</label>}
          </fieldset>
          </div>
        </details>
         <button className="console-fit-map" aria-label="Fit Kerala" title="Fit Kerala" onClick={()=>{if(engine.current)fit(engine.current.map);}}><Crosshair size={16}/><span>Fit Kerala</span></button>
       </div>
       <div className="console-map-views">
         <div role="group" aria-label="Map view">{views.map(v=><button key={v.id} aria-pressed={view===v.id} onClick={()=>setView(v.id)}>{v.label}</button>)}</div>
         {view==="history"&&<RangeControl range={range} change={changeRange}/>}
       </div>
       <div className={`console-map-layout ${inspect?"has-inspector":""}`}>
         {inspect&&<DistrictInspector stats={stats} district={district} forecast={target} close={()=>setInspect(false)} onDetails={onDetails}
           select={select} horizon={horizon} changeHorizon={changeHorizon}/>}
         <div className="console-map-frame">
        <div ref={mapNode} className="console-leaflet" role="region" aria-label="Interactive map of Kerala" tabIndex={0}/>
        <div className="console-map-controls"><button aria-label="Zoom in" title="Zoom in" onClick={()=>engine.current?.map.zoomIn()}><Plus size={19}/></button>
          <button aria-label="Zoom out" title="Zoom out" onClick={()=>engine.current?.map.zoomOut()}><Minus size={19}/></button></div>
      {mode!=="satellite"&&tileStatus==="unavailable"&&<div className="console-map-error" role="status">
        {mode==="street"?"OpenStreetMap unavailable.":"NASA detail tiles unavailable."} Showing the satellite archive.
        <button onClick={()=>setTileAttempt(n=>n+1)}>Retry map</button><button onClick={()=>setMode("satellite")}>Use archive</button></div>}
       {!inspect&&<button className="console-reopen" onClick={()=>setInspect(true)}>Show {district} forecast <ArrowRight size={13}/></button>}
      <div className="console-map-credits">
        {mode!=="street"||useArchive ? <><a href="https://nasa-gibs.github.io/gibs-api-docs/" target="_blank" rel="noreferrer">NASA GIBS</a>
          {" · Landsat-WELD (2000)"}{useArchive&&" + Blue Marble"}{" · "}</>:null}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
      </div>
    </div>
    </div>
    <div className="console-map-key" aria-label="Map legend">
      <span><i className="selected"/>Selected district</span>
      {view==="forecast"&&<><span><i className="available"/>Forecast issued</span><span><i className="thin"/>Not issued</span>
        {!forecasts&&<span><i className="unavailable"/>Forecast unavailable</span>}</>}
      {view==="coverage"&&<><span><i className="available"/>Simulated coverage</span><span><i className="thin"/>Coverage unknown</span></>}
      {view==="history"&&<span><i className="available"/>Larger dots show more reports</span>}
      {layers.connections&&!planner&&<span><i className="edge"/>Invented documented connection</span>}
      {layers.hypotheses&&!planner&&<span><i className="hypothesis"/>Fictional infrastructure only</span>}
    </div>
    {expanded&&<div className="console-map-disclaimer">{NOTICE} Connections are schematic, not street journeys.</div>}
  </section>;
}
