import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Atlas } from "./Map";
import { Evidence, Observation } from "./Evidence";
import { Reports, readSyntheticReport } from "./Reports";
import { Inbox } from "./Review";
import { Briefs, Leads } from "./Workflows";
import { DataCoverage, REAL_LABEL, REAL_UNIVERSE, RealResults } from "./Coverage";
import type { Role } from "../../shared/workspace";
import type { Case } from "../../shared/schema";
import { BANNER, dateLabel, localJSON } from "./data";
import type { Cases, Evaluation, Forecasts, Selection } from "./data";
import "./style.css";

const tabs = [["map","Map workspace"],["report","Model report"],["inbox","News inbox"],["leads","Leads"],["briefs","Briefs"],["coverage","Data & coverage"]] as const;
type View = (typeof tabs)[number][0];
function App() {
  const [cases,setCases] = useState<Cases|null>(null);
  const [forecasts,setForecasts] = useState<Forecasts|null>(null);
  const [selection,setSelection] = useState<Selection>({area:"Ernakulam"});
  const [horizon,setHorizon] = useState<7|28>(28);
  const [observation,setObservation] = useState<{row:Case;cutoff:string}|null>(null);
  const [report,setReport] = useState<Evaluation|null>(null);
  const [view,setView] = useState<View>("map");
  const [track,setTrack] = useState<"synthetic"|"real">("synthetic");
  const [role,setRole] = useState<Role>("analyst");
  const [reviewKey,setReviewKey] = useState("");
  const [fault,setFault] = useState("");
  const fetchForecast = useCallback(async () => {
    const f = await localJSON<Forecasts>("/generated/forecasts.json");
    if(f.synthetic !== true || f.forecasts.some(r=>r.synthetic!==true)) throw new Error("Unexpected forecast track.");
    setForecasts(f);
  },[]);
  useEffect(()=>{
    Promise.all([localJSON<Cases>("/generated/cases_synthetic.json").then(c=>{
      if(c.synthetic!==true || c.cases.some(r=>r.synthetic!==true)) throw new Error("Unexpected case track.");
      setCases(c);
    }),fetchForecast()]).catch(()=>setFault("Run `make demo` from the project folder to prepare the synthetic workspace."));
  },[fetchForecast]);
  useEffect(()=>{localJSON("/generated/eval_report.json").then(readSyntheticReport).then(setReport).catch(()=>{});},[]);
  const select=useCallback((s:Selection)=>{setSelection(s);setObservation(null);},[]);
  const forecast=forecasts?.forecasts.find(f=>f.horizon_days===horizon && ("area" in selection ? f.area===selection.area :
    f.connection?.join("|")===selection.connection.join("|")));
  const switchRole=(next:Role)=>{
    setRole(next);
    setReviewKey("");
    if(next==="planner"){
      if(view==="inbox")setView("map");
      if("connection" in selection)select({area:selection.connection[1]});
    }
  };
  return <>
    <div className="pinned-header">
      <div className="disclaimer">{BANNER}</div>
      <header className="masthead"><a href="/" className="brand"><span className="logomark" aria-hidden>╱╱</span> Corridor</a>
        <span className={`track-pill ${track==="real"?"real-text":""}`}>{track==="synthetic"?"SYNTHETIC DATA":REAL_LABEL}</span>
        {track==="synthetic" && <nav aria-label="Workspace">{tabs.filter(([target])=>role==="analyst" || target!=="inbox").map(([target,label])=>
          <button key={target} aria-current={view===target?"page":undefined} onClick={()=>setView(target)}>{label}</button>)}</nav>}
        <div className="top-options">
          <label>Data track<select value={track} onChange={e=>{setTrack(e.target.value as typeof track);setReviewKey("");}}>
            <option value="synthetic">Synthetic (demo)</option><option value="real">Real (aggregates)</option></select></label>
          {track==="synthetic" && <label>Demo role<select value={role} onChange={e=>switchRole(e.target.value as Role)}>
            <option value="analyst">Analyst</option><option value="planner">Planner</option></select></label>}
        </div>
      </header>
      {track==="real" && <div className="real-universe">{REAL_UNIVERSE}</div>}
    </div>
    <main className="main-shell">
      {track==="real" ? <RealResults/> : <>
      <p className="role-note">Demo only. Not a production authorization system. {role==="planner"?"Planner: district context only; no case implies a need for care.":"Analyst: synthetic review workspace."}</p>
      {view === "report" ? <Reports current={report}/> : view=== "inbox" ?
        <Inbox reviewKey={reviewKey} setKey={setReviewKey} refresh={fetchForecast}/> :
        view==="leads" ? <Leads reviewKey={reviewKey} setKey={setReviewKey} role={role}/> :
        view==="briefs" ? <Briefs forecasts={forecasts} selection={selection} horizon={horizon} role={role}/> :
        view==="coverage" ? <DataCoverage report={report}/> : <>
      <div className="workspace-header"><div><div className="section-kicker">Kerala case observatory</div><h1>Forecast atlas</h1>
        <p>Compare documented case patterns with the places where reporting is thin.</p></div>
        {forecasts && <div className="freshness"><span>Generated at <time dateTime={forecasts.generated_at}>{dateLabel(forecasts.generated_at)} {forecasts.generated_at.slice(11,16)} UTC</time></span>
          <span>Information cutoff <time dateTime={forecasts.data_cutoff}>{dateLabel(forecasts.data_cutoff)}</time></span>
          <span>Case snapshot <time dateTime={forecasts.case_snapshot_through}>{dateLabel(forecasts.case_snapshot_through)}</time></span></div>}
      </div>
      {fault && <div role="alert" className="notice">{fault}</div>}
      {!fault && !forecasts && <p aria-live="polite">Loading the synthetic archive…</p>}
      {cases && forecasts && <div className="atlas-layout">
        <Atlas data={cases} forecasts={forecasts} selection={selection} select={select} horizon={horizon} setHorizon={setHorizon} connections={role==="analyst"}
          openCase={(row,cutoff)=>setObservation({row,cutoff})}/>
        <div><Evidence selection={selection} forecast={forecast} report={report} openReport={()=>setView("report")} startBrief={()=>setView("briefs")}/>
          {observation && <Observation key={observation.row.case_id} {...observation} close={()=>setObservation(null)}/>}
        </div>
      </div>}
      </>}
      </>}
    </main>
  </>;
}

createRoot(document.getElementById("root")!).render(<App/>);
