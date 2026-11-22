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
import { Alerts, Insights, KeralaMark, RegionOverview, ScenarioPreview, StatCards, Trends } from "./Panels";
import type { ScenarioPreset } from "./Panels";
import { AnalystHub, Reporting, ReviewSummary } from "./ReviewDesk";
import { SatelliteMap } from "./SatelliteMap";
import { Scenarios } from "./Scenarios";
import { datasetForecast, history, overview } from "./metrics";
import type { Horizon, Range } from "./metrics";

const pages = [
  {id:"overview", label:"Overview", icon:LayoutDashboard}, {id:"map", label:"Map", icon:MapPin},
  {id:"patterns", label:"Patterns", icon:ChartNoAxesCombined}, {id:"evidence", label:"Evidence", icon:Files},
  {id:"scenarios", label:"Scenarios", icon:FlaskConical}, {id:"methodology", label:"Methodology", icon:BookOpen},
] as const;
type Page = typeof pages[number]["id"];
type EvidencePage = "library"|"inbox"|"leads"|"briefs";
type MapMode = "satellite"|"detail"|"street";
type Layout = "overview"|"desk";
const evidencePages=[{id:"library",label:"Evidence library",icon:Files},{id:"inbox",label:"News inbox",icon:Bell},
  {id:"leads",label:"Community leads",icon:ClipboardList},{id:"briefs",label:"Planning briefs",icon:FileText}] as const;

const initialPage=():Page=>{
  const hash=location.hash.slice(1);
  if(pages.some(p=>p.id===hash))return hash as Page;
  return location.pathname==="/demo" || new URLSearchParams(location.search).get("demo")==="model"?"patterns":"overview";
};
const initialLayout=():Layout=>location.pathname==="/report" || new URLSearchParams(location.search).get("layout")==="desk"?"desk":"overview";

export function Dashboard() {
  const [layout,setLayout]=useState<Layout>(initialLayout);
  const [page,setPage]=useState<Page>(initialPage);
  const [evidencePage,setEvidencePage]=useState<EvidencePage>("library");
  const [libraryQuery,setLibraryQuery]=useState("");
  const [track,setTrack]=useState<"synthetic"|"real">("synthetic");
  const [role,setRole]=useState<Role>("analyst");
  const [district,setDistrict]=useState("Malappuram");
  const [selection,setSelection]=useState<Selection>({area:"Malappuram"});
  const [advanced,setAdvanced]=useState(false);
  const [range,setRange]=useState<Range>(90);
  const [horizon,setHorizon]=useState<Horizon>(28);
  const [mode,setMode]=useState<MapMode>("street");
  const [scenario,setScenario]=useState<ScenarioPreset>("Reporting volume");
  const [methodView,setMethodView]=useState<"data"|"guide">("data");
  const [cases,setCases]=useState<Cases|null>(null);
  const [forecast,setForecast]=useState<Forecasts|null>(null);
  const [report,setReport]=useState<Evaluation|null>(null);
  const [queue,setQueue]=useState<QueueItem[]>([]);
  const [queueOffline,setQueueOffline]=useState(false);
  const [reviewKey,setReviewKey]=useState("");
  const [record,setRecord]=useState<{row:MapRecord;cutoff:string}|null>(null);
  const [fault,setFault]=useState("");
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
    setFault("");setRefreshing(true);
    try{
      await Promise.all([
        localJSON<Cases>("/generated/cases_synthetic.json").then(c=>{
          if(c.synthetic!==true || c.cases.some(r=>r.synthetic!==true))throw new Error("Unexpected case track");
          setCases(c);
        }),
        fetchForecast(),
        localJSON("/generated/eval_report.json").then(readSyntheticReport).then(setReport),
        fetchQueue(),
      ]);
    } catch {setFault("The synthetic archive is unavailable. Start make demo, then refresh.");}
    finally {setRefreshing(false);}
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
    if(value==="planner"){setSelection({area:district});if(["inbox","library"].includes(evidencePage))setEvidencePage("briefs");}
  };
  const choose=useCallback((d:string)=>{setDistrict(d);setSelection({area:d});},[]);
  const openAtlas=useCallback((s:Selection,h:Horizon=28)=>{
    if("area" in s){choose(s.area);setAdvanced(false);}
    else {setDistrict(s.connection[1]);setSelection(s);setAdvanced(true);}
    setHorizon(h);go("map");
  },[choose,go]);
  const openConnection=useCallback((connection:[string,string])=>openAtlas({connection},horizon),[openAtlas,horizon]);
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
      <button className="console-button outline" onClick={switchLayout}>{desk?"Use overview layout":"Open review desk"} <PanelsTopLeft size={14}/></button></>}
      <p>Demo only. Not a production authorization system.</p>
    </div>
  </details>;
  const brand=<button className="console-brand" onClick={()=>{if(!real)go("overview");}} aria-label="Corridor home">
    <KeralaMark className="console-brand-mark"/><span><strong>CORRIDOR</strong><small>Kerala Forecasting Lab</small></span></button>;
  const nav=<nav className="console-nav" aria-label="Main navigation">
    {pages.map(({id,label,icon:Icon})=><button key={id} aria-current={page===id?"page":undefined} onClick={()=>go(id)} aria-label={label}>
      <Icon size={20}/><span>{label}</span></button>)}
  </nav>;
  const satellite=(expanded=false)=>cases&&stats?<SatelliteMap key={expanded?"expanded":"overview"} data={cases} forecasts={forecast}
    stats={stats} range={range} changeRange={setRange} district={district} select={choose} horizon={horizon} onDetails={()=>go("patterns")} onConnection={openConnection}
    planner={planner} expanded={expanded} mode={mode} setMode={setMode}/>:null;
  const quickActions=<section className="console-card console-quick"><header className="console-card-head">
    <div><Activity size={18} className="tone-teal"/><h2>Quick actions</h2></div></header>
    <button onClick={()=>toEvidence("briefs")}><FileText size={15}/> Prepare a brief <ArrowRight size={13}/></button>
    <button onClick={()=>toEvidence("leads")}><ClipboardList size={15}/> Practice leads <ArrowRight size={13}/></button>
    <button onClick={()=>go("patterns")}><ChartNoAxesCombined size={15}/> View model report <ArrowRight size={13}/></button>
  </section>;
  return <div className={`console ${desk?"console-desk-layout":""} ${real?"console-real-layout":""}`}>
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
      <main className="console-main">
        {real?<div className="console-page companion-support"><RealResults/></div>:<>
          {fault&&<p className="console-caution" role="alert">{fault}</p>}
          {page==="overview"&&!stats&&<div className="console-card console-loading" role="status"><Activity/> Loading the local synthetic snapshot…</div>}
          {page==="overview"&&stats&&(!desk?
            <div className="console-overview">
              <StatCards stats={stats} horizon={horizon}/>
              <div className="console-feature-grid">{satellite()}
                <div className="console-rail"><Alerts items={queue} unavailable={queueOffline} open={()=>toEvidence(planner?"briefs":"inbox")}/>
                  <Trends monthly={stats.monthly} open={()=>go("patterns")}/></div></div>
              <div className="console-bottom-grid"><RegionOverview stats={stats}/><Insights stats={stats} district={district}/>
                <ScenarioPreview open={openScenario}/></div>
            </div>:
            <div className="console-desk-grid">
              <Reporting district={district}/>
              <div className="console-desk-center"><StatCards stats={stats} horizon={horizon}/>{satellite()}</div>
              {!planner?<AnalystHub district={district} items={queue} reviewKey={reviewKey} setReviewKey={setReviewKey}
                openQueue={()=>toEvidence("inbox")} openBriefs={()=>toEvidence("briefs")}/>:quickActions}
              <div className="console-desk-bottom">
                <ReviewSummary items={queue} open={()=>toEvidence(planner?"briefs":"inbox")}/><Trends monthly={stats.monthly} open={()=>go("patterns")}/>
                <ScenarioPreview open={openScenario}/>
              </div>
            </div>
          )}
          {page==="map"&&cases&&forecast&&stats&&<div className="console-page">
            <header className="console-page-heading"><div><p><MapPin size={16}/> Geographic workspace</p><h1>Map</h1>
              <span>Explore districts, documented connections and reporting coverage.</span></div>
              <button className="console-button outline" onClick={()=>setAdvanced(!advanced)}><SlidersHorizontal size={15}/>{advanced?"Satellite workspace":"Detailed atlas"}</button></header>
            {advanced?<div className="console-legacy"><Atlas data={cases} forecasts={forecast} report={report} selection={selection}
              select={s=>{setSelection(s);setDistrict("area" in s?s.area:s.connection[1]);}} horizon={horizon} setHorizon={setHorizon}
              planner={planner} onCase={openRecord} onLibrary={q=>toEvidence("library",q)} onReport={()=>go("patterns")}
              onBrief={()=>toEvidence("briefs")} streetMap={mode==="street"}/></div>:
              satellite(true)}
          </div>}
          {page==="patterns"&&<div className="console-page console-legacy console-patterns">
            <div className="console-forecast-summary"><span><strong>{district}</strong> · {horizon}-day district target</span>
              <span>{activeForecast?.abstained?`Abstained: ${activeForecast.abstain_reason}`:activeForecast?.estimate!=null?
                `${activeForecast.estimate.toFixed(1)} expected documented cases${activeForecast.interval?` · range ${activeForecast.interval.join("–")}`:""}`:"No batch forecast loaded"}</span></div>
            <ForecastLab report={report} forecasts={forecast} planner={planner} onAtlas={openAtlas} initialHorizon={horizon}/>
          </div>}
          {page==="evidence"&&<div className="console-page console-legacy">
            <div className="console-evidence-tabs">{evidencePages.filter(p=>!planner||!["library","inbox"].includes(p.id)).map(({id,label,icon:Icon})=>
              <button key={id} aria-pressed={evidencePage===id} onClick={()=>toEvidence(id)}><Icon size={15}/>{label}</button>)}</div>
            {evidencePage==="library"&&!planner&&cases&&<Library key={libraryQuery} data={cases} initialQuery={libraryQuery} onCase={openRecord}/>}
            {evidencePage==="inbox"&&!planner&&<div className="companion-support"><Inbox reviewKey={reviewKey} setKey={setReviewKey} refresh={fetchForecast}/></div>}
            {evidencePage==="leads"&&<div className="companion-support"><Leads reviewKey={reviewKey} setKey={setReviewKey} role={role}/></div>}
            {evidencePage==="briefs"&&<div className="companion-support"><Briefs forecasts={forecast} selection={selection} horizon={horizon} role={role}/></div>}
          </div>}
          {page==="scenarios"&&cases&&<Scenarios key={scenario} initial={scenario} selected={district} data={cases}
            archive={historyRows} forecasts={forecast} horizon={horizon} pending={pending}/>}
          {page==="methodology"&&<div className="console-page console-legacy">
            <div className="console-evidence-tabs"><button aria-pressed={methodView==="data"} onClick={()=>setMethodView("data")}><BookOpen size={16}/> Sources & coverage</button>
              <button aria-pressed={methodView==="guide"} onClick={()=>setMethodView("guide")}><CircleHelp size={16}/> Ask the Atlas</button></div>
            {methodView==="data"?<div className="companion-support"><DataCoverage report={report} coverageThreshold={forecast?.coverage_threshold}/></div>:
              <AskAtlas forecasts={forecast} report={report} onAtlas={openAtlas}/>}
          </div>}
          {record&&<RecordDialog selected={record} close={()=>setRecord(null)}/>}
        </>}
      </main>
      {!real&&<footer className="console-footer"><span>{NOTICE}</span><span><ShieldCheck size={13}/> {planner?"Demo planner":"Demo analyst"}</span></footer>}
    </div>
  </div>;
}
