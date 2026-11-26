import { ArrowUpRight, BookOpen, ChartNoAxesCombined, ChevronRight, FileText, Files, Info, Mail, Map, MessageSquare,
  Network, Play, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Role } from "../../../shared/workspace";
import { BANNER, dateLabel, localJSON } from "../data";
import type { Cases, Evaluation, Forecasts, Selection } from "../data";
import { DataCoverage, REAL_LABEL, REAL_UNIVERSE, RealResults } from "../Coverage";
import { Inbox } from "../Review";
import { Briefs, Leads } from "../Workflows";
import { readSyntheticReport } from "../Reports";
import { Atlas } from "./Atlas";
import { ForecastLab } from "./ForecastLab";
import { Library, RecordDialog } from "./Library";
import { AskAtlas } from "./AskAtlas";
import type { MapRecord } from "./model";

const nav=[
  {id:"map",name:"NarcoTrace atlas",icon:Map},
  {id:"forecast",name:"Forecast lab",icon:ChartNoAxesCombined},
  {id:"ask",name:"Ask the Atlas",icon:Sparkles},
  {id:"records",name:"Evidence library",icon:Files},
  {id:"inbox",name:"News inbox",icon:Mail},
  {id:"tips",name:"Community leads",icon:MessageSquare},
  {id:"briefs",name:"Planning briefs",icon:FileText},
  {id:"sources",name:"Sources & methods",icon:BookOpen},
] as const;
type Tab = typeof nav[number]["id"];
const stops: {tab:Tab;title:string;summary:string}[]=[
  {tab:"map",title:"Read the map",summary:"Select a district or invented known connection. Amber means coverage unknown, not safety."},
  {tab:"forecast",title:"Replay the final test",summary:"See what the fixed model estimated and what was later documented, then check the simpler comparisons."},
  {tab:"records",title:"Trace the evidence",summary:"Open a fictional record to distinguish when it happened, when it became available, and what the source can support."},
  {tab:"inbox",title:"Review a cue",summary:"A syndicated headline isn't independent evidence. Use the local key to review a fixture."},
  {tab:"briefs",title:"Prepare a brief",summary:"Summarize the uncertainty for human review. Exports are aggregate-only and never sent automatically."},
];
const firstTab = ():Tab => window.location.pathname==="/demo" || new URLSearchParams(window.location.search).get("demo")==="model" ?
  "forecast" : window.location.pathname==="/report" ? "tips" : "map";

export function Workspace() {
  const [data,setData]=useState<Cases|null>(null);
  const [forecasts,setForecasts]=useState<Forecasts|null>(null);
  const [report,setReport]=useState<Evaluation|null>(null);
  const [fault,setFault]=useState("");
  const [tab,setTab]=useState<Tab>(firstTab);
  const [track,setTrack]=useState<"synthetic"|"real">("synthetic");
  const [role,setRole]=useState<Role>("analyst");
  const [selection,setSelection]=useState<Selection>({connection:["Thrissur","Ernakulam"]});
  const [horizon,setHorizon]=useState<7|28>(28);
  const [record,setRecord]=useState<{row:MapRecord;cutoff:string}|null>(null);
  const [libraryQuery,setLibraryQuery]=useState("");
  const [key,setKey]=useState("");
  const [tour,setTour]=useState<number|null>(null);
  const planner=role==="planner";
  const real=track==="real";

  const reloadForecast=useCallback(async()=>{
    const f=await localJSON<Forecasts>("/generated/forecasts.json");
    if(f.synthetic!==true || f.forecasts.some(r=>r.synthetic!==true))throw Error("Unexpected forecast track");
    setForecasts(f);
  },[]);
  const load=useCallback(async()=>{
    setFault("");
    try {
      await Promise.all([localJSON<Cases>("/generated/cases_synthetic.json").then(c=>{
        if(c.synthetic!==true || c.cases.some(r=>r.synthetic!==true))throw Error("Unexpected archive track");
        setData(c);
      }),reloadForecast(),localJSON("/generated/eval_report.json").then(readSyntheticReport).then(setReport)]);
    } catch {
      setFault("Could not read the synthetic archive or model output. Run make demo from the project folder, then refresh.");
    }
  },[reloadForecast]);
  useEffect(()=>{void load();},[load]);
  const go=useCallback((next:Tab)=>{
    setTab(next);setRecord(null);
    if(next!=="records")setLibraryQuery("");
    window.scrollTo({top:0,behavior:"instant"});
  },[]);
  const openAtlas=(next:Selection,nextHorizon:7|28=28)=>{setSelection(next);setHorizon(nextHorizon);go("map");};
  const openLibrary=(query:string)=>{setLibraryQuery(query);go("records");};
  const openRecord=(row:MapRecord,cutoff:string)=>setRecord({row,cutoff});
  const switchRole=()=>{
    const next:Role=planner?"analyst":"planner";
    setRole(next);setKey("");setRecord(null);setTour(null);
    if(!planner && "connection" in selection)setSelection({area:selection.connection[1]});
    if(!planner && ["records","inbox"].includes(tab))go("map");
  };
  const changeTrack=(next:"synthetic"|"real")=>{
    setTrack(next);setKey("");setRecord(null);setTour(null);
  };
  const nextStop=(index:number)=>{
    if(index>=stops.length){setTour(null);return;}
    setTour(index);go(stops[index].tab);
  };
  return <div className="app-shell companion-shell">
    <aside className="sidebar">
      <a href="/" className="brand"><span className="brand-symbol"><Network size={25}/></span>
        <span>narcotrace<span className="brand-sub">Kerala forecasting lab</span></span></a>
      <div className="workspace-label"><span className="signal-dot"/> {real?"Private aggregate review":"Demonstration workspace"}</div>
      <nav aria-label="Main navigation">
        {real ? <button className="active" aria-current="page"><ChartNoAxesCombined size={18}/><span>Real-data results</span><ChevronRight className="nav-arrow" size={14}/></button> :
          nav.filter(n=>!planner || !["records","inbox"].includes(n.id)).map(({id,name,icon:Icon})=><button key={id} onClick={()=>go(id)} aria-label={name}
            className={tab===id?"active":""} aria-current={tab===id?"page":undefined}><Icon size={18}/><span>{name}</span>
            {tab===id&&<ChevronRight className="nav-arrow" size={14}/>}</button>)}
      </nav>
      <div className="sidebar-bottom">
        {!real&&!planner&&<button className="tour-launch" onClick={()=>nextStop(0)}><Play size={16}/>
          <span>Take the guided demo<small>A five-stop evidence journey</small></span></button>}
        <div className="prototype-note"><ShieldCheck size={17}/><p>Independent research prototype<span>No agency access or affiliation</span></p></div>
        {!real&&<div className="profile"><span className="avatar">{planner?"P":"A"}</span><div><strong>{planner?"Service planner":"District analyst"}</strong>
          <small>Demo role · <button onClick={switchRole}>Switch role</button></small></div></div>}
      </div>
    </aside>
    <div className="main-shell">
      <div className="companion-sticky">
        <header className="topbar"><div className="breadcrumbs">Workspace <ChevronRight size={13}/>
          <strong>{real?"Real-data results":nav.find(n=>n.id===tab)?.name}</strong></div>
          <div className="header-right">
            <span className={`demo-pill ${real?"real-chip":""}`}><span/>{real?REAL_LABEL:"SYNTHETIC DATA"}</span>
            {!real&&forecasts&&<div className="snapshot snapshot-times">
              <span>Generated at {dateLabel(forecasts.generated_at)} {forecasts.generated_at.slice(11,16)} UTC</span>
              <span>Data cutoff {dateLabel(forecasts.data_cutoff)}</span>
            </div>}
            <label><span className="sr-only">Data track</span><select value={track} onChange={e=>changeTrack(e.target.value as typeof track)}>
              <option value="synthetic">Synthetic (demo)</option><option value="real">Real (aggregates)</option></select></label>
            {!real&&<button className="compact-role" aria-label="Switch role" onClick={switchRole}>{planner?"Planner":"Analyst"}</button>}
            {!real&&<button aria-label="Refresh workspace" onClick={()=>void load()}><RefreshCw size={16}/></button>}
          </div>
        </header>
        <div className={`demo-banner ${real?"real-banner":""}`}><Info size={14}/><div>{BANNER}{real&&<span className="real-universe-inline">{REAL_UNIVERSE}</span>}
          {!real&&forecasts&&<span className="mobile-freshness">Generated at {dateLabel(forecasts.generated_at)} {forecasts.generated_at.slice(11,16)} UTC · Data cutoff {dateLabel(forecasts.data_cutoff)}</span>}</div>
          {!real&&<button onClick={()=>go("sources")}>About the data <ArrowUpRight size={13}/></button>}</div>
      </div>
      <main>
        {real ? <div className="content-page companion-support"><RealResults/></div> : <>
          {fault&&<p role="alert" className="companion-notice">{fault}</p>}
          {planner&&<p className="companion-role-note">Planner · district context only. A forecast does not establish service need.</p>}
          {tab==="map"&&(data&&forecasts?<Atlas data={data} forecasts={forecasts} report={report} selection={selection}
            select={setSelection} horizon={horizon} setHorizon={setHorizon} planner={planner} onCase={openRecord}
            onLibrary={openLibrary} onReport={()=>go("forecast")} onBrief={()=>go("briefs")}/>:
            <div className="loading-screen"><Network size={30}/><h1>Opening the geographic workspace…</h1><p>Loading the synthetic archive and batch forecasts.</p></div>)}
          {tab==="forecast"&&<div className="content-page"><ForecastLab report={report} forecasts={forecasts} planner={planner} onAtlas={openAtlas}/></div>}
          {tab==="ask"&&<AskAtlas report={report} forecasts={forecasts} onAtlas={openAtlas}/>}
          {tab==="records"&&!planner&&data&&<Library data={data} initialQuery={libraryQuery} onCase={openRecord}/>}
          {tab==="inbox"&&!planner&&<div className="content-page companion-support"><Inbox reviewKey={key} setKey={setKey} refresh={reloadForecast}/></div>}
          {tab==="tips"&&<div className="content-page companion-support"><Leads reviewKey={key} setKey={setKey} role={role}/></div>}
          {tab==="briefs"&&<div className="content-page companion-support"><Briefs forecasts={forecasts} selection={selection} horizon={horizon} role={role}/></div>}
          {tab==="sources"&&<div className="content-page companion-support"><DataCoverage report={report} coverageThreshold={forecasts?.coverage_threshold}/></div>}
          {tour!==null&&<div className="tour-panel" aria-label="Guided demo"><div>Guided demo · {tour+1} of {stops.length}
            <button aria-label="Close tour" onClick={()=>setTour(null)}><X size={16}/></button></div>
            <h2>{stops[tour].title}</h2><p>{stops[tour].summary}</p>
            <button className="primary" onClick={()=>nextStop(tour+1)}>{tour+1===stops.length?"Finish tour":"Next stop"} <ChevronRight size={14}/></button></div>}
          {record&&<RecordDialog selected={record} close={()=>setRecord(null)}/>}
        </>}
      </main>
      <footer className="app-footer"><span>NarcoTrace · independent hackathon prototype</span><span>Evidence informs. People decide.</span>
        <span><i className="signal-dot"/> {real?"Local aggregate review":"Frozen synthetic scenario"}</span></footer>
      {!real&&<p className="companion-footer-role">Demo only. Not a production authorization system.</p>}
    </div>
  </div>;
}
