import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Atlas } from "./Map";
import { Evidence, Observation } from "./Evidence";
import { Reports, readSyntheticReport } from "./Reports";
import type { Case } from "../../shared/schema";
import { BANNER, dateLabel, localJSON } from "./data";
import type { Cases, Evaluation, Forecasts, Selection } from "./data";
import "./style.css";

function App() {
  const [cases,setCases] = useState<Cases|null>(null);
  const [forecasts,setForecasts] = useState<Forecasts|null>(null);
  const [selection,setSelection] = useState<Selection>({area:"Ernakulam"});
  const [horizon,setHorizon] = useState<7|28>(28);
  const [observation,setObservation] = useState<{row:Case;cutoff:string}|null>(null);
  const [report,setReport] = useState<Evaluation|null>(null);
  const [view,setView] = useState<"map"|"report">("map");
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
  return <>
    <div className="pinned-header">
      <div className="disclaimer">{BANNER}</div>
      <header className="masthead"><a href="/" className="brand"><span className="logomark" aria-hidden>╱╱</span> Corridor</a>
        <span className="track-pill">SYNTHETIC DATA</span>
        <nav aria-label="Workspace"><button aria-current={view==="map"?"page":undefined} onClick={()=>setView("map")}>Map workspace</button>
          <button aria-current={view==="report"?"page":undefined} onClick={()=>setView("report")}>Model report</button></nav>
      </header>
    </div>
    <main className="main-shell">
      {view === "report" ? <Reports current={report}/> : <>
      <div className="workspace-header"><div><div className="section-kicker">Kerala case observatory</div><h1>Forecast atlas</h1>
        <p>Compare documented case patterns with the places where reporting is thin.</p></div>
        {forecasts && <div className="freshness"><span>Generated at <time dateTime={forecasts.generated_at}>{dateLabel(forecasts.generated_at)} {forecasts.generated_at.slice(11,16)} UTC</time></span>
          <span>Data cutoff <time dateTime={forecasts.data_cutoff}>{dateLabel(forecasts.data_cutoff)}</time></span></div>}
      </div>
      {fault && <div role="alert" className="notice">{fault}</div>}
      {!fault && !forecasts && <p aria-live="polite">Loading the synthetic archive…</p>}
      {cases && forecasts && <div className="atlas-layout">
        <Atlas data={cases} forecasts={forecasts} selection={selection} select={select} horizon={horizon} setHorizon={setHorizon}
          openCase={(row,cutoff)=>setObservation({row,cutoff})}/>
        <div><Evidence selection={selection} forecast={forecast} report={report} openReport={()=>setView("report")}/>
          {observation && <Observation key={observation.row.case_id} {...observation} close={()=>setObservation(null)}/>}
        </div>
      </div>}
      </>}
    </main>
  </>;
}

createRoot(document.getElementById("root")!).render(<App/>);
