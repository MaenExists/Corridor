import { Activity, ArrowRight, ArrowUpRight, ChartNoAxesCombined, Check, ChevronRight, Clock, FileText, Info, MapPin,
  Pause, Play, Route, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Forecast } from "../../../shared/schema";
import { dateLabel, DISTRICTS, methodName, NOTICE, pct } from "../data";
import type { Cases, Evaluation, Forecasts, Selection } from "../data";
import NarcoTraceMap from "./components/narcotrace-map";
import { dayShift, observedCases, pairId, pairLabel } from "./model";
import type { MapRecord } from "./model";

const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const distinct = (value:Selection) => "area" in value ? value.area : pairLabel(value.connection);
const categories=["Cannabis","Stimulants","Opioids","Other","Unknown"];

export function Badge({row}:{row:MapRecord}) {
  return <span className={`badge ${row.status}`}>{row.status==="documented" ? <ShieldCheck size={11}/> : <Clock size={11}/>}
    {row.status==="documented" ? "Reviewed fixture" : "Reported fixture"}</span>;
}

function ForecastEvidence({forecast,report,title,onReport}:{forecast?:Forecast;report:Evaluation|null;title:string;onReport:()=>void}) {
  const task=report?.tasks.find(t=>t.horizon_days===forecast?.horizon_days && t.scope===(forecast.area?"area":"corridor"));
  const sameRun=forecast && report && forecast.model_version.startsWith(`synthetic-${report.run_id}:`);
  const local = sameRun ? task?.locations.find(r=>r.location===title) : undefined;
  return <div className="inspector-forecast">
    <div className="section-line"><span className="small-label">Batch forecast</span><Activity size={15}/></div>
    {!forecast ? <p className="muted">No dated result for this target.</p> : <>
      <strong className="inspector-estimate">{forecast.abstained ? "Abstained" : `${forecast.estimate?.toFixed(1)} expected cases`}</strong>
      <p>{forecast.abstain_reason || (forecast.interval ? `Estimated range ${forecast.interval.join("–")} · ${forecast.horizon_days} days` : forecast.uncertainty_note)}</p>
      <small>{dateLabel(forecast.window_start)} – {dateLabel(forecast.window_end)}</small>
      <details><summary>Forecast evidence and limitations</summary>
        <dl className="detail-grid"><div><dt>Information cutoff</dt><dd>{dateLabel(forecast.information_cutoff)}</dd></div>
          <div><dt>Target</dt><dd>{forecast.target}</dd></div><div><dt>Model version</dt><dd>{forecast.model_version}</dd></div>
          <div><dt>Range status</dt><dd>{forecast.uncertainty_note}</dd></div></dl>
        <ul>{forecast.supporting_patterns.map(v=><li key={v}>{v}</li>)}</ul>
        <p>{forecast.source_availability} {forecast.coverage_gaps.join("; ")}.</p>
        <p>{forecast.recent_verified_cues.length} recent verified synthetic {forecast.recent_verified_cues.length===1?"cue":"cues"}. Review does not establish predictive benefit.</p>
        {forecast.recent_verified_cues.length>0 && <ul>{forecast.recent_verified_cues.map((c,i)=>
          <li key={i}>Fictional cue reviewed {String(c.verified_at).slice(0,16)} UTC</li>)}</ul>}
      </details>
      {sameRun && task && <p className="confidence-footnote">Held-out range coverage {pct(task.interval.coverage)}.
        {local?.baseline_beats_candidate.length ? ` Simpler methods with lower error here: ${local.baseline_beats_candidate.map(methodName).join(", ")}.` : ""}
      </p>}
      <button className="source-link" onClick={onReport}>Open model validation <ChevronRight size={13}/></button>
    </>}
  </div>;
}

export function Atlas({ data, forecasts, report, selection, select, horizon, setHorizon, planner, onCase, onLibrary, onReport, onBrief, streetMap, embedded=false }:{
  data:Cases; forecasts:Forecasts; report:Evaluation|null; selection:Selection; select:(s:Selection)=>void; horizon:7|28;
  setHorizon:(h:7|28)=>void; planner:boolean; onCase:(row:MapRecord,cutoff:string)=>void; onLibrary:(query:string)=>void;
  onReport:()=>void; onBrief:()=>void; streetMap?:boolean;embedded?:boolean;
}) {
  const year=data.as_of.slice(0,4);
  const maxMonth=Number(data.as_of.slice(5,7));
  const [month,setMonth]=useState(maxMonth-1);
  const [playing,setPlaying]=useState(false);
  const [period,setPeriod]=useState("90");
  const [district,setDistrict]=useState("all");
  const [substance,setSubstance]=useState("all");
  const [status,setStatus]=useState("all");
  const [source,setSource]=useState("all");
  const [query,setQuery]=useState("");
  const [searchRequest,setSearchRequest]=useState(0);
  const [showForecast,setShowForecast]=useState(true);
  const [points,setPoints]=useState(true);
  const searchRef=useRef<HTMLInputElement>(null);
  const archive=useMemo(()=>observedCases(data,data.as_of),[data]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(e.key==="/" && !(e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]"))){
        e.preventDefault();searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  },[]);
  useEffect(()=>{
    if(!playing)return;
    const t=window.setTimeout(()=>{
      if(month+1>=maxMonth-1){setMonth(maxMonth-1);setPlaying(false);}
      else setMonth(month+1);
    },1000);
    return ()=>window.clearTimeout(t);
  },[playing,month,maxMonth]);
  const cutoff=month===maxMonth-1 ? data.as_of : new Date(Date.UTC(Number(year),month+1,0)).toISOString().slice(0,10);
  const start=period==="all"?data.start:period==="year"?`${year}-01-01`:dayShift(cutoff,1-Number(period));
  const filtered=useMemo(()=>observedCases(data,cutoff,start).filter(r=>
    (district==="all" || r.district===district || r.connection?.includes(district)) &&
    (substance==="all" || r.substance===substance) && (status==="all" || r.status===status) &&
    (source==="all" || (source==="connection" ? !!r.connectionId : source==="seizure" ? !r.connectionId :
      r.row.source_ref.some(s=>s.ref.endsWith("-syndicated") && !!s.available_date && s.available_date<=cutoff)))),
    [data,cutoff,start,district,substance,status,source]);
  const connections=planner?[]:data.connections;
  const found=new Map<string,number>();
  for(const r of filtered) if(r.connectionId) found.set(r.connectionId,(found.get(r.connectionId)??0)+1);
  const active=[...connections].filter(c=>found.has(pairId(c))).sort((a,b)=>found.get(pairId(b))!-found.get(pairId(a))!);
  const chart=months.slice(0,maxMonth).map((_,i)=>archive.filter(c=>c.eventDate.startsWith(`${year}-${String(i+1).padStart(2,"0")}`)).length);
  const title=distinct(selection);
  const records=filtered.filter(r=>"area" in selection ? r.district===selection.area : r.connectionId===pairId(selection.connection));
  const current=forecasts.forecasts.filter(r=>r.horizon_days===horizon);
  const forecast=current.find(r=>r.area===title || (r.connection && pairLabel(r.connection)===title));
  const coverageThreshold=forecasts.coverage_threshold??.35;
  const knownCoverage = "area" in selection ? data.coverage[selection.area] : data.coverage[selection.connection[1]];
  const coverageGap=knownCoverage==null || knownCoverage<coverageThreshold;
  const chooseMonth=(i:number)=>{setPlaying(false);setMonth(i);setPeriod("year");};
  return <>
    <div className={embedded?"atlas-local-actions":"page-heading"}>
      {!embedded&&<div><div className="location-kicker"><span className="flag-mark"/> Kerala, India <span>/</span> Regional analysis</div>
        <h1>Follow the evidence.</h1><p>Documented connections. Every fictional source within reach.</p></div>}
      <div className="heading-actions"><button onClick={onReport}><ChartNoAxesCombined size={15}/> See model results</button>
        <button className="primary" onClick={onBrief}><FileText size={15}/> Prepare brief</button></div>
    </div>
    <div className="filterbar companion-atlas-filters">
      <form className="searchbox primary-map-search" onSubmit={e=>{e.preventDefault();setSearchRequest(n=>n+1);}}>
        <Search size={16}/><input ref={searchRef} aria-label="Search map features" placeholder="Find a town, station or district…" value={query}
          maxLength={150} onChange={e=>setQuery(e.target.value)}/><kbd>/</kbd><button type="submit" aria-label="Search map">Search</button></form>
      <select aria-label="Date range" value={period} onChange={e=>setPeriod(e.target.value)}>
        <option value="90">Last 90 days</option><option value="28">Last 28 days</option><option value="year">Year to date</option><option value="all">Full archive</option></select>
      <select aria-label="Filter history by district" value={district} onChange={e=>{setDistrict(e.target.value);if(e.target.value!=="all")select({area:e.target.value});}}>
        <option value="all">All districts</option>{DISTRICTS.map(d=><option key={d}>{d}</option>)}</select>
      <select aria-label="Substance" value={substance} onChange={e=>setSubstance(e.target.value)}><option value="all">All substances</option>
        {categories.map(v=><option key={v}>{v}</option>)}</select>
      <select aria-label="Evidence status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All evidence</option>
        <option value="documented">Reviewed fixtures</option><option value="unreviewed">Reported fixtures</option></select>
      <select aria-label="Source type" value={source} onChange={e=>setSource(e.target.value)}><option value="all">All sources</option>
        <option value="seizure">Seizure observations only</option>{!planner&&<option value="connection">Documented connections</option>}
        <option value="syndicated">Has syndicated copy</option></select>
    </div>
    <div className="atlas-workspace">
      <section className="map-column">
        <div className="map-statbar"><span><strong>{planner?DISTRICTS.length:active.length}</strong> {planner?"districts":"connections"}</span>
          <span><strong>{filtered.length}</strong> source records</span><span><strong>{filtered.filter(r=>r.status==="documented").length}</strong> reviewed fixtures</span>
          <button className={`toggle ${showForecast?"active":""}`} aria-pressed={showForecast} onClick={()=>setShowForecast(!showForecast)}>
            <span className="switch"/> Forecast layer <span className="experimental">Experimental</span></button></div>
        <NarcoTraceMap records={filtered} selected={selection} onSelect={select} forecast={current} connections={connections}
          showForecast={showForecast} coverage={data.coverage} coverageThreshold={coverageThreshold} showPoints={points}
          setShowPoints={setPoints} focusedDistrict={district} searchText={query} onSearchTextChange={setQuery} searchRequest={searchRequest}
          streetMap={streetMap}/>
        <div className="timeline">
          <div className="timeline-top"><div><Clock size={14}/> Explore over time <span>{year} · known through {dateLabel(cutoff)}</span></div>
            <button aria-label={playing?"Pause timeline":"Play timeline"} onClick={()=>{
              if(!playing && month>=maxMonth-1){setMonth(0);setPeriod("year");}
              setPlaying(!playing);
            }}>{playing?<Pause size={13}/>:<Play size={13}/>} {playing?"Pause":"Play scenario"}</button></div>
          <div className="timeline-chart">{chart.map((n,i)=><button key={i} aria-label={`Show through ${months[i]} ${year}`}
            className={i<=month?"included":""} onClick={()=>chooseMonth(i)}>
            <span style={{height:`${Math.max(n/Math.max(...chart,1)*35,2)}px`}}/><small>{months[i]}</small></button>)}</div>
          <input type="range" aria-label="Timeline month" min={0} max={maxMonth-1} value={month} onChange={e=>chooseMonth(Number(e.target.value))}/>
          <p className="fineprint">Bars show the archive snapshot. Filters and dates affect history, not the latest batch forecast.</p>
        </div>
      </section>
      <aside className="inspector">
        <div className="inspector-top"><span>{planner?"District explorer":"Connection explorer"}</span><span className="count-pill">{planner?DISTRICTS.length:active.length}</span></div>
        <div className="connection-picker">
          {active.slice(0,2).map(p=><button key={pairId(p)} className={pairLabel(p)===title?"selected":""} onClick={()=>select({connection:p})}>
            <span className="route-dot"/><span>{p[0]}<small>{p[1]}</small></span><span className="route-count">{found.get(pairId(p))}</span><ChevronRight size={14}/>
          </button>)}
          {!!connections.length&&<select aria-label="Known connection" value={"connection" in selection?pairId(selection.connection):""}
            onChange={e=>{const p=connections.find(c=>pairId(c)===e.target.value);if(p)select({connection:p});}}>
            <option value="" disabled>Choose any connection…</option>{connections.map(p=><option key={pairId(p)} value={pairId(p)}>{pairLabel(p)}</option>)}</select>}
          <div className="companion-subject-controls">
            <label><span>District profile</span><select value={"area" in selection?selection.area:""} onChange={e=>select({area:e.target.value})}>
              <option value="" disabled>Choose district…</option>{DISTRICTS.map(d=><option key={d}>{d}</option>)}</select></label>
            <label><span>Forecast window</span><select value={horizon} onChange={e=>setHorizon(Number(e.target.value) as 7|28)}>
              <option value={7}>7 days</option><option value={28}>28 days</option></select></label>
          </div>
        </div>
        <div className="selected-detail">
          <div className="section-line"><span className="small-label">{"connection" in selection?"Selected connection":"Selected district"}</span>
            {"connection" in selection?<Route size={16}/>:<MapPin size={16}/>}</div>
          <h2>{"connection" in selection?<>{selection.connection[0]} <ArrowRight size={16}/> {selection.connection[1]}</>:title}</h2>
          {"connection" in selection && <div className="route-stops">{selection.connection.map((d,i)=><div key={d}><i/>{d}<span>{i?"Destination":"Origin"}</span></div>)}</div>}
          <div className="detail-grid">
            <div><small>Precision</small><strong>{"area" in selection?"District level":"Schematic endpoints"}</strong></div>
            <div><small>Sources in view</small><strong>{records.length} records</strong></div>
            <div><small>Coverage</small><strong className={coverageGap?"coverage-warning":""}>{coverageGap?"Coverage unknown":"Simulated support"}</strong></div>
            <div><small>Evidence status</small><strong>{records.some(r=>r.status==="documented")?<><Check size={12}/> Reviewed fixtures</>:"Not reviewed in view"}</strong></div>
          </div>
          <ForecastEvidence forecast={forecast} report={report} title={title} onReport={onReport}/>
          {!planner&&<><div className="section-line"><h3>Trace the evidence</h3><button onClick={()=>onLibrary(title)}>View all <ChevronRight size={12}/></button></div>
            {records.slice(0,2).map(r=><button className="evidence-card" key={r.id} onClick={()=>onCase(r,cutoff)}><div><span>{r.id}</span><Badge row={r}/></div>
              <strong>{r.row.substance_category??"Unknown substance"} · {r.district}</strong><small>{r.eventDate}<span>Fictional source <ArrowUpRight size={12}/></span></small></button>)}
            {!records.length&&<p className="muted">No reports in this filter. This is not evidence of safety.</p>}
          </>}
          <div className="inspector-note"><Info size={15}/><p>{NOTICE} Connections are schematic, not journeys.</p></div>
        </div>
      </aside>
    </div>
  </>;
}
