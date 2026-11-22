import { Activity, BrainCircuit, FileText, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { Forecast } from "../../../shared/schema";
import { dateLabel, localJSON, METHODS, methodName, NOTICE, pct } from "../data";
import type { Evaluation, EvaluationTask, Forecasts, Selection } from "../data";
import { Reports } from "../Reports";
import { isIssued } from "./model";

type Frame = { origin:string; rows:{location:string; observed:number; predicted:Record<string,number|null>; abstain_reason:string|null}[] };
type Replay = { synthetic:true; run_id:string; tasks:{scope:EvaluationTask["scope"];horizon_days:7|28; windows:Frame[]}[] };
const fmt = (v:number|null|undefined) => v == null ? "—" : v.toFixed(2);

function Holdout({report,task,windows}:{report:Evaluation;task:EvaluationTask;windows:Frame[]}) {
  const [method,setMethod]=useState(task.selected_method ?? "poisson_gbm");
  const [step,setStep]=useState(Math.max(0,windows.length-1));
  const [playing,setPlaying]=useState(false);
  useEffect(()=>{
    if(!playing || !windows.length)return;
    const t=window.setInterval(()=>setStep(i=>(i+1)%windows.length),1100);
    return ()=>window.clearInterval(t);
  },[playing,windows.length]);
  const frame=windows[step];
  const score=task.metrics[method];
  const ranking=task.ranking[method];
  const rows=frame ? [...frame.rows].sort((a,b)=>(b.predicted[method]??-1)-(a.predicted[method]??-1) || a.location.localeCompare(b.location)) : [];
  const max=Math.max(1,...windows.flatMap(w=>w.rows.flatMap(r=>[r.observed,r.predicted[method]??0])));
  return <div className="news-model">
    <div className="news-model-context"><div><h2>How close were the predictions?</h2>
      <p>Compare expected and later documented synthetic counts. The fit was frozen before the final test period; pressing play does not run a new prediction.</p>
    </div><aside className="news-model-selection"><strong>Selected before holdout</strong><span>{methodName(task.selected_method)}</span>
      <small>Final lowest average count error: {methodName(task.winner)}</small></aside></div>
    <section className="news-model-grid" aria-label="Holdout replay and performance">
      <div className="news-model-replay">
        <div className="news-model-replay-head"><div><h3>Holdout replay</h3>
          <p>{dateLabel(report.splits.final[0])} – {dateLabel(report.splits.final.at(-1)!)}</p></div>
          {windows.length>0 && <label>Test week<select value={step} onChange={e=>{setPlaying(false);setStep(Number(e.target.value));}}>
            {windows.map((w,i)=><option key={w.origin} value={i}>{dateLabel(w.origin)}</option>)}</select></label>}
        </div>
        {!frame ? <p role="status">Replay details are not ready. Run <code>make replay</code> or use Report details for saved scores.</p> : <>
          <div className="news-model-legend"><span><i/> Predicted count</span><span><i/> Observed in sample</span>
            <button onClick={()=>setPlaying(!playing)}>{playing?<Pause size={13}/>:<Play size={13}/>} {playing?"Pause replay":"Play replay"}</button></div>
          <div className="table-wrap"><table className="news-model-districts"><thead><tr><th>{task.scope==="area"?"District":"Invented connection"}</th>
            <th>Predicted</th><th>Observed</th></tr></thead><tbody>{rows.map(r=><tr key={r.location}><th>{r.location}</th>
              <td>{r.predicted[method]==null ? <small>{r.abstain_reason?"Abstained":"Not scored"}</small> :
                <div className="news-model-bar"><b>{fmt(r.predicted[method])}</b><span style={{width:`${r.predicted[method]!/max*100}%`}}/></div>}</td>
              <td><div className="news-model-bar observed"><b>{r.observed}</b><span style={{width:`${r.observed/max*100}%`}}/></div></td>
            </tr>)}</tbody></table></div>
        </>}
      </div>
      <aside className="news-model-score">
        <h3>Test performance</h3><label>Method<select value={method} onChange={e=>setMethod(e.target.value)}>
          {Object.keys(METHODS).map(m=><option key={m} value={m}>{methodName(m)}</option>)}</select></label>
        <p>Scores use eligible windows in the entire holdout. The table at left shows one test week at a time.</p>
        <dl className="news-model-metrics">
          <div><dt>Mean count error</dt><dd>{fmt(score?.mae)}</dd><small>Average miss in documented cases</small></div>
          <div><dt>Top {task.top_k} capture</dt><dd>{pct(ranking?.capture)}</dd><small>Share of observed counts in highest estimates</small></div>
          <div><dt>Poisson deviance</dt><dd>{fmt(score?.poisson_deviance)}</dd><small>Penalizes severe underestimates</small></div>
          <div><dt>Issued-method range coverage</dt><dd>{pct(task.interval.coverage)}</dd><small>{pct(report.nominal_interval)} target, not a guarantee</small></div>
          <div><dt>Recorded counts missed</dt><dd>{ranking?.events_missed??"—"}</dd><small>Outside top {task.top_k}; overlap can repeat cases</small></div>
          <div><dt>Abstentions</dt><dd>{task.window_count-task.issued_windows}</dd><small>Insufficient support, not a safety finding</small></div>
        </dl>
        {task.monitoring.map(m=><p className="forecast-note" key={m}>{m}</p>)}
      </aside>
    </section>
    <section className="news-model-methods"><h3>Simple forecasts are the benchmark</h3>
      <p>A baseline is a simple comparison. Poisson boosting learns patterns in nonnegative counts. Neither method measures undetected activity.</p>
      <div className="table-wrap"><table><thead><tr><th>Method</th><th>Mean count error</th><th>Windows</th></tr></thead><tbody>
        {Object.entries(task.metrics).map(([m,s])=><tr key={m}><th>{methodName(m)}</th><td>{fmt(s.mae)}</td><td>{s.n}</td></tr>)}
      </tbody></table></div>
    </section>
  </div>;
}

function Issued({ rows, onAtlas }: {rows:Forecast[];onAtlas:(s:Selection,horizon:7|28)=>void}) {
  const max=Math.max(1,...rows.flatMap(r=>r.interval??(r.estimate==null?[]:[r.estimate])));
  return <section className="panel"><div className="panel-heading"><div><h2>Learned forecast</h2><small>Expected documented counts, not probabilities.</small></div><span className="model-range-key"><i/> Estimated range</span></div>
    <div className="table-wrap"><table className="learned-forecast-table"><thead><tr><th>Forecast target</th><th>Expected count</th><th>Range / abstention</th><th>Window</th></tr></thead><tbody>
      {rows.map(r=>{
        const key=r.area??r.connection?.join(" → ")??"Unspecified";
        return <tr key={key}><th><button onClick={()=>r.area ? onAtlas({area:r.area},r.horizon_days) :
          r.connection && onAtlas({connection:r.connection},r.horizon_days)}>{key}</button></th>
          <td>{isIssued(r) ? <div className="news-model-bar"><b>{fmt(r.estimate)}</b><span style={{width:`${r.estimate!/max*100}%`}}/></div> : "Abstained"}</td>
          <td>{r.abstain_reason ?? (r.interval ? r.interval.join("–") : r.uncertainty_note)}</td><td>{r.window_start} → {r.window_end}</td></tr>;
      })}
    </tbody></table></div>
    <p className="companion-notice">{NOTICE}</p></section>;
}

export function ForecastLab({report,forecasts,planner,onAtlas,initialHorizon=28}:{report:Evaluation|null;forecasts:Forecasts|null;
  planner:boolean;onAtlas:(s:Selection,horizon:7|28)=>void;initialHorizon?:7|28}) {
  const [view,setView]=useState<"replay"|"issued"|"report">("replay");
  const [scope,setScope]=useState<"area"|"corridor">("area");
  const [horizon,setHorizon]=useState<7|28>(initialHorizon);
  const [data,setData]=useState<Replay|null>(null);
  useEffect(()=>{
    localJSON<Replay>("/generated/replay.json").then(value=>{
      if(value.synthetic===true && value.run_id===report?.run_id) setData(value);
    }).catch(()=>{});
  },[report?.run_id]);
  const target=planner?"area":scope;
  const task=report?.tasks.find(t=>t.scope===target && t.horizon_days===horizon);
  const windows=data?.tasks.find(t=>t.scope===target && t.horizon_days===horizon)?.windows??[];
  return <>
    <div className="page-heading"><div><div className="location-kicker"><Activity size={14}/> Transparent forecasting</div>
      <h1>{target==="area"?"Kerala district model":"Known-connection model"}</h1>
      <p>Compare predictions for documented case counts with later synthetic outcomes.</p></div><span className="experimental">Experimental · human review</span></div>
    <div className="forecast-tabs companion-forecast-tabs">
      <button aria-pressed={view==="replay"} onClick={()=>setView("replay")}><Play size={14}/> Held-out replay</button>
      <button aria-pressed={view==="issued"} onClick={()=>setView("issued")}><BrainCircuit size={14}/> Issued forecasts</button>
      <button aria-pressed={view==="report"} onClick={()=>setView("report")}><FileText size={14}/> Report details</button>
      {view!=="report"&&<><label><span className="sr-only">Forecast geography</span><select value={target} disabled={planner} onChange={e=>setScope(e.target.value as typeof scope)}>
        <option value="area">District</option><option value="corridor">Known connection</option></select></label>
        <label><span className="sr-only">Model horizon</span><select value={horizon} onChange={e=>setHorizon(Number(e.target.value) as 7|28)}><option value={7}>7 days</option><option value={28}>28 days</option></select></label></>}
    </div>
    {view==="replay" && (report && task ? <Holdout key={`${target}:${horizon}:${windows.length}`} report={report} task={task} windows={windows}/>
      : <div className="panel"><p role="status">No synthetic evaluation loaded. Start with <code>make demo</code>.</p></div>)}
    {view==="issued" && <Issued rows={forecasts?.forecasts.filter(r=>r.horizon_days===horizon && (target==="area" ? !!r.area : !!r.connection))??[]} onAtlas={onAtlas}/>}
    {view==="report" && <div className="companion-support"><Reports current={report} allowConnections={!planner}/></div>}
  </>;
}
