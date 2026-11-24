import {
  Activity, ArrowRight, Bell, BookOpen, ChartNoAxesCombined, ChevronDown, CircleHelp, CircleUserRound, ClipboardList,
  FileText, Files, FlaskConical, LayoutDashboard, MapPin, PanelLeft, PanelsTopLeft, RotateCw, Settings, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { QueueItem, Role } from "../../../shared/workspace";
import { AskAtlas } from "../companion/AskAtlas";
import { Atlas } from "../companion/Atlas";
import { ForecastLab } from "../companion/ForecastLab";
import { Library, RecordDialog } from "../companion/Library";
import type { MapRecord } from "../companion/model";
import { DataCoverage, REAL_LABEL, REAL_UNIVERSE, RealResults } from "../Coverage";
import { Inbox } from "../Review";
import { Briefs, Leads } from "../Workflows";
import { BANNER, dateLabel, localJSON, NOTICE } from "../data";
import type { Cases, Evaluation, Forecasts, Selection } from "../data";
import { readSyntheticReport } from "../Reports";
import { Alerts, KeralaMark, ScenarioPreview, Trends } from "./Panels";
import type { ScenarioPreset } from "./Panels";
import { AnalystHub, Reporting, ReviewSummary } from "./ReviewDesk";
import { SatelliteMap } from "./SatelliteMap";
import type { BasemapMode } from "./SatelliteMap";
import { Scenarios } from "./Scenarios";
import { ExploreHeading, ForecastStats } from "./Showcase";
import { datasetForecast, history, overview } from "./metrics";
import type { Horizon, Range } from "./metrics";

const pages = [
  {id:"overview", label:"Forecasts", icon:LayoutDashboard}, {id:"map", label:"Map", icon:MapPin},
  {id:"patterns", label:"Model", icon:ChartNoAxesCombined}, {id:"evidence", label:"Evidence", icon:Files},
  {id:"scenarios", label:"Scenarios", icon:FlaskConical}, {id:"methodology", label:"Methodology", icon:BookOpen},
] as const;
type Page = typeof pages[number]["id"];
type EvidencePage = "library"|"inbox"|"leads"|"briefs";
type Layout = "overview"|"desk";
const evidencePages=[{id:"library",label:"Evidence library",icon:Files},{id:"inbox",label:"News inbox",icon:Bell},
  {id:"leads",label:"Community leads",icon:ClipboardList},{id:"briefs",label:"Planning briefs",icon:FileText}] as const;

const initialPage=():Page=>{
  const hash=location.hash.slice(1);
  if(pages.some(p=>p.id===hash))return hash as Page;
  return location.pathname==="/demo" || new URLSearchParams(location.search).get("demo")==="model"?"patterns":"overview";
};
const initialLayout=():Layout=>location.pathname==="/report" || new URLSearchParams(location.search).get("layout")==="desk"?"desk":"overview";
const offlineBasemap=()=>new URLSearchParams(location.search).get("offline")==="1";

export function Dashboard() {
  const [layout,setLayout]=useState<Layout>(initialLayout);
  const [page,setPage]=useState<Page>(initialPage);
  const [evidencePage,setEvidencePage]=useState<EvidencePage>("library");
  const [libraryQuery,setLibraryQuery]=useState("");
  const [track,setTrack]=useState<"synthetic"|"real">("synthetic");
  const [role,setRole]=useState<Role>("analyst");
  const [selection,selectSubject]=useState<Selection>({area:"Ernakulam"});
  const district="area" in selection?selection.area:selection.connection[1];
  const [advanced,setAdvanced]=useState(false);
  const [range,setRange]=useState<Range>(90);
  const [horizon,setHorizon]=useState<Horizon>(28);
  const [offlineMaps]=useState(offlineBasemap);
  const [preferredMode,setMode]=useState<BasemapMode>("street");
  const mode=offlineMaps?"satellite":preferredMode;
  const [scenario,setScenario]=useState<ScenarioPreset>("Reporting volume");
  const [methodView,setMethodView]=useState<"data"|"guide">("data");
  const [cases,setCases]=useState<Cases|null>(null);
  const [forecast,setForecast]=useState<Forecasts|null>(null);
  const [report,setReport]=useState<Evaluation|null>(null);
  const [queue,setQueue]=useState<QueueItem[]>([]);
  const [queueOffline,setQueueOffline]=useState(false);
  const [reviewKey,setReviewKey]=useState("");
  const [record,setRecord]=useState<{row:MapRecord;cutoff:string}|null>(null);
  const [snapshotErrors,setSnapshotErrors]=useState<string[]>([]);
  const real=track==="real", planner=role==="planner";
  const desk=layout==="desk" && !real;
  const historyRows=useMemo(()=>cases?history(cases):[],[cases]);
  const stats=useMemo(()=>cases?overview(cases,historyRows,forecast,range,horizon):null,[cases,historyRows,forecast,range,horizon]);
  const pending=queue.filter(q=>q.status==="new" || q.status==="possible_duplicate").length;
  const activeForecast=datasetForecast(forecast,district,horizon);
  const navLabel=real?"Real results":pages.find(p=>p.id===page)?.label;
  const [refreshing,setRefreshing]=useState(false);

  const fetchForecast=useCallback(async()=>{
    const f=await localJSON<Forecasts>("/generated/forecasts.json");
    if(f.synthetic!==true || f.forecasts.some(r=>r.synthetic!==true)) throw new Error("Unexpected forecast track");
    setForecast(f);
  },[]);
  const fetchQueue=useCallback(async()=>{
    try {
      const r=await localJSON<{synthetic:boolean;items:QueueItem[]}>("/api/review-queue");
      if(r.synthetic!==true || r.items.some(i=>i.synthetic!==true))throw new Error("Unexpected review track");
      setQueue(r.items);setQueueOffline(false);
    } catch { setQueueOffline(true); }
  },[]);
  const refresh=useCallback(async()=>{
    setRefreshing(true);
    const [archive,batch,evaluation]=await Promise.allSettled([
      localJSON<Cases>("/generated/cases_synthetic.json").then(c=>{
        if(c.synthetic!==true || c.cases.some(r=>r.synthetic!==true))throw new Error("Unexpected case track");
        setCases(c);
      }),
      fetchForecast(),
      localJSON("/generated/eval_report.json").then(readSyntheticReport).then(setReport),
      fetchQueue(),
    ]);
    const missing:string[]=[];
    if(archive.status==="rejected"){setCases(null);missing.push("Case history");}
    if(batch.status==="rejected"){setForecast(null);missing.push("Forecast batch");}
    if(evaluation.status==="rejected"){setReport(null);missing.push("Evaluation report");}
    setSnapshotErrors(missing);
    setRefreshing(false);
  },[fetchForecast,fetchQueue]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{if(!real&&(page==="overview"||page==="evidence"))void fetchQueue();},[page,real,fetchQueue]);
  const go=useCallback((p:Page)=>{
    setPage(p);setRecord(null);
    window.scrollTo({top:0,behavior:"instant"});
  },[]);
  const toEvidence=(target:EvidencePage,query="")=>{
    setEvidencePage(target);setLibraryQuery(query);go("evidence");
  };
  const switchLayout=()=>{
    setLayout(desk?"overview":"desk");go("overview");
  };
  const changeRole=(value:Role)=>{
    setRole(value);setReviewKey("");setRecord(null);
    if(value==="planner"){selectSubject({area:district});if(["inbox","library"].includes(evidencePage))setEvidencePage("briefs");}
  };
  const choose=useCallback((d:string)=>selectSubject({area:d}),[]);
  const openAtlas=useCallback((s:Selection,h:Horizon=horizon)=>{
    selectSubject(s);setAdvanced("connection" in s);setHorizon(h);go("map");
  },[go,horizon]);
  const openConnection=useCallback((connection:[string,string])=>openAtlas({connection},horizon),[openAtlas,horizon]);
  const openDistrictModel=()=>{choose(district);go("patterns");};
  const openScenario=(preset?:ScenarioPreset)=>{if(preset)setScenario(preset);go("scenarios");};
  const openRecord=(r:MapRecord,cutoff:string)=>setRecord({row:r,cutoff});
  const settings=<details className="console-settings"><summary aria-label="Workspace settings"><Settings size={19}/></summary>
    <div>
      <h2>Workspace settings</h2>
      <label>Data track<select value={track} onChange={e=>{
        setTrack(e.target.value as typeof track);setReviewKey("");setRecord(null);setMode("street");
      }}><option value="synthetic">Synthetic (demo)</option><option value="real">Real (aggregates)</option></select></label>
      {!real&&<><label>Forecast horizon<select value={horizon} onChange={e=>setHorizon(Number(e.target.value) as Horizon)}>
        <option value={7}>7 days</option><option value={28}>28 days</option></select></label>
      <label>Demo role<select value={role} onChange={e=>changeRole(e.target.value as Role)}><option value="analyst">Analyst</option><option value="planner">Planner</option></select></label>
       <button className="console-button outline" onClick={e=>{e.currentTarget.closest("details")?.removeAttribute("open");switchLayout();}}>
         {desk?"Return to forecasts":"Open review desk"} <PanelsTopLeft size={14}/></button></>}
      <p>Demo only. Not a production authorization system.</p>
    </div>
  </details>;
  const brand=<button className="console-brand" onClick={()=>{if(!real){setLayout("overview");go("overview");}}} aria-label="Corridor home">
    <KeralaMark className="console-brand-mark"/><span><strong>CORRIDOR</strong><small>Kerala Forecasting Lab</small></span></button>;
  const nav=<nav className="console-nav" aria-label="Main navigation">
    {pages.map(({id,label,icon:Icon})=>{
      const title=desk&&id==="overview"?"Review desk":label;
      return <button key={id} aria-current={page===id?"page":undefined} onClick={()=>go(id)} aria-label={title}>
        <Icon size={20}/><span>{title}</span></button>;
    })}
  </nav>;
  const satellite=(expanded=false)=>cases&&stats?<SatelliteMap key={expanded?"expanded":"overview"} data={cases} forecasts={forecast}
    stats={stats} range={range} changeRange={setRange} district={district} select={choose} horizon={horizon} changeHorizon={setHorizon}
    onDetails={openDistrictModel} onConnection={openConnection}
    planner={planner} expanded={expanded} mode={mode} setMode={setMode} offlineMaps={offlineMaps}/>:null;
  const quickActions=<section className="console-card console-quick"><header className="console-card-head">
    <div><Activity size={18} className="tone-teal"/><h2>Quick actions</h2></div></header>
    <button onClick={()=>toEvidence("briefs")}><FileText size={15}/> Prepare a brief <ArrowRight size={13}/></button>
    <button onClick={()=>toEvidence("leads")}><ClipboardList size={15}/> Practice leads <ArrowRight size={13}/></button>
    <button onClick={()=>go("patterns")}><ChartNoAxesCombined size={15}/> View model report <ArrowRight size={13}/></button>
  </section>;
  return <div className={`console ${desk?"console-desk-layout":""} ${real?"console-real-layout":""}`}>
    <a className="console-skip" href="#workspace-main" onClick={e=>{e.preventDefault();document.getElementById("workspace-main")?.focus();}}>Skip to workspace</a>
    {!desk&&<aside className="console-sidebar">
      {brand}<div className="console-brand-rule"/>
      {real?<div className="console-nav"><span className="console-real-section"><ShieldCheck size={19}/> Real results</span></div>:nav}
      {!real&&<div className="console-side-extra"><button onClick={switchLayout}><PanelsTopLeft size={18}/> Review desk <ArrowRight size={13}/></button></div>}
      <div className="console-side-art" aria-hidden/>
    </aside>}
    <div className="console-shell">
      <div className="console-chrome">
      <header className="console-topbar">
        {desk?brand:<><span className="console-crumb">Workspace <ChevronDown size={11}/> <strong>{navLabel}</strong></span>
          <div className="console-mobile-brand">{brand}</div></>}
        {desk&&nav}
        <div className="console-header-state">
          {real?<span className="console-mode-tag real">{REAL_LABEL}</span>:<div className="console-freshness">
            <span><i/> <strong>SYNTHETIC DATA</strong></span><small>{forecast?`Data cutoff ${dateLabel(forecast.data_cutoff)}`:"Snapshot not loaded"}</small>
          </div>}
          {!real&&desk&&<button title="Overview layout" aria-label="Overview layout" className="console-icon" onClick={switchLayout}><PanelLeft size={18}/></button>}
          {!real&&<button title="Reload local snapshot" aria-label="Reload local snapshot" className="console-icon console-reload" disabled={refreshing} onClick={()=>void refresh()}><RotateCw size={16}/></button>}
          {settings}
          <button className="console-profile" aria-label="Switch demo role" title={`Demo role: ${role}`} disabled={real}
            onClick={()=>changeRole(planner?"analyst":"planner")}><CircleUserRound size={20}/></button>
        </div>
      </header>
      {!real&&!desk&&<div className="console-mobile-nav">{nav}</div>}
      <div className={`console-notice-bar ${real?"real":""}`}><ShieldCheck size={14}/><div>{BANNER}{real&&<strong>{REAL_UNIVERSE}</strong>}</div>
        {!real&&forecast&&<small>Batch generated {dateLabel(forecast.generated_at)} · {forecast.generated_at.slice(11,16)} UTC</small>}</div>
      </div>
      <main className="console-main" id="workspace-main" tabIndex={-1}>
        {real?<div className="console-page companion-support"><RealResults/></div>:<>
          {!!snapshotErrors.length&&<div className="console-caution snapshot-error" role="alert">
            <span><b>Couldn’t load:</b> {snapshotErrors.join(", ")}. Start <code>make demo</code> to prepare missing files.</span>
            <button className="console-button quiet-action" disabled={refreshing} onClick={()=>void refresh()}>Retry loading</button>
          </div>}
          {page==="overview"&&!desk&&<ExploreHeading cutoff={forecast?.data_cutoff} openModel={openDistrictModel}/>}
          {page==="overview"&&desk&&<header className="showcase-heading review-heading"><div>
            <p className="console-eyebrow"><ClipboardList size={15}/> Local practice workspace</p><h1>Review desk</h1>
            <p>Review fictional cues and practice structured reports. Review notes and practice reports do not change forecasts.</p>
          </div></header>}
          {page==="overview"&&!stats&&!snapshotErrors.length&&<div className="console-card console-loading" role="status"><Activity/> Loading the local synthetic snapshot…</div>}
          {page==="overview"&&stats&&(!desk?
            <div className="console-overview">
              {satellite()}
              <ForecastStats stats={stats} forecast={activeForecast} report={report} horizon={horizon} openModel={openDistrictModel}/>
              <div className="showcase-secondary"><Trends monthly={stats.monthly} open={openDistrictModel}/>
                {!planner&&<Alerts items={queue} unavailable={queueOffline} open={()=>toEvidence("inbox")}/>}
                <ScenarioPreview open={openScenario}/></div>
            </div>:
              <div className="console-desk-grid">
                <Reporting district={district}/>
                {!planner?<AnalystHub district={district} items={queue} reviewKey={reviewKey} setReviewKey={setReviewKey}
                  openQueue={()=>toEvidence("inbox")} openBriefs={()=>toEvidence("briefs")}/>:quickActions}
                <div className="console-desk-center">{satellite()}
                  {!planner&&<ReviewSummary items={queue} open={()=>toEvidence("inbox")}/>}
                </div>
            </div>
          )}
          {page==="map"&&cases&&stats&&<div className="console-page">
            <header className="showcase-heading"><div><p className="console-eyebrow"><MapPin size={16}/> Geographic workspace</p><h1>{advanced?"Detailed atlas":"Explore the map"}</h1>
              <p>{advanced?"Inspect fictional sources, known connections and the reporting timeline.":"Switch between forecast availability, reporting history and coverage."}</p></div>
              <button className="console-button quiet-action" disabled={!forecast} onClick={()=>setAdvanced(!advanced)}><SlidersHorizontal size={15}/>{advanced&&forecast?"Forecast map":"Detailed atlas"}</button></header>
            {advanced&&forecast?<div className="console-legacy"><Atlas data={cases} forecasts={forecast} report={report} selection={selection}
              select={selectSubject} horizon={horizon} setHorizon={setHorizon}
              planner={planner} onCase={openRecord} onLibrary={q=>toEvidence("library",q)} onReport={()=>go("patterns")}
               onBrief={()=>toEvidence("briefs")} streetMap={mode==="street"} embedded/></div>:
              satellite(true)}
          </div>}
          {page==="patterns"&&<div className="console-page console-legacy console-patterns">
            <ForecastLab report={report} forecasts={forecast} planner={planner} onAtlas={openAtlas}
              focus={{selection,select:selectSubject,horizon,changeHorizon:setHorizon,onBrief:()=>toEvidence("briefs")}}/>
          </div>}
          {page==="evidence"&&<div className="console-page console-legacy">
            <div className="console-evidence-tabs">{evidencePages.filter(p=>!planner||!["library","inbox"].includes(p.id)).map(({id,label,icon:Icon})=>
              <button key={id} aria-pressed={evidencePage===id} onClick={()=>toEvidence(id)}><Icon size={15}/>{label}</button>)}</div>
            {evidencePage==="library"&&!planner&&cases&&<Library key={libraryQuery} data={cases} initialQuery={libraryQuery} onCase={openRecord}/>}
            {evidencePage==="inbox"&&!planner&&<div className="companion-support"><Inbox reviewKey={reviewKey} setKey={setReviewKey} refresh={fetchForecast}/></div>}
            {evidencePage==="leads"&&<div className="companion-support"><Leads reviewKey={reviewKey} setKey={setReviewKey} role={role}/></div>}
            {evidencePage==="briefs"&&<div className="companion-support"><Briefs forecasts={forecast} selection={selection} horizon={horizon} role={role}
              onModel={(s,h)=>{selectSubject(s);setHorizon(h);go("patterns");}}/></div>}
          </div>}
          {page==="scenarios"&&cases&&<Scenarios key={scenario} initial={scenario} selected={district} data={cases}
             archive={historyRows} forecasts={forecast} horizon={horizon} pending={queueOffline?null:pending}/>}
          {page==="methodology"&&<div className="console-page console-legacy">
            <div className="console-evidence-tabs"><button aria-pressed={methodView==="data"} onClick={()=>setMethodView("data")}><BookOpen size={16}/> Sources & coverage</button>
              <button aria-pressed={methodView==="guide"} onClick={()=>setMethodView("guide")}><CircleHelp size={16}/> Ask the Atlas</button></div>
            {methodView==="data"?<div className="companion-support"><DataCoverage report={report} coverageThreshold={forecast?.coverage_threshold}/></div>:
              <AskAtlas forecasts={forecast} report={report} onAtlas={openAtlas} horizon={horizon}/>}
          </div>}
          {record&&<RecordDialog selected={record} close={()=>setRecord(null)}/>}
        </>}
      </main>
      {!real&&<footer className="console-footer"><span>{NOTICE}</span><span><ShieldCheck size={13}/> {planner?"Demo planner":"Demo analyst"}</span></footer>}
    </div>
  </div>;
}
