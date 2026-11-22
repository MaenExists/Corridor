import { useEffect, useState } from "react";
import { dateLabel, methodName, pct } from "./data";
import type { Evaluation, EvaluationTask, Scores } from "./data";

function get<T>(data: unknown, key: string): T | undefined {
  return data && typeof data === "object" ? (data as Record<string,T>)[key] : undefined;
}
export function readSyntheticReport(raw: unknown): Evaluation {
  const x = raw as Evaluation;
  if (get(raw,"schema") !== "corridor-eval-v1" || get(raw,"synthetic") !== true || !Array.isArray(x.tasks)
    || !Array.isArray(x.splits?.final) || !x.splits.final.length || !Number.isFinite(Date.parse(x.data_cutoff))
    || !Number.isFinite(Date.parse(x.generated_at)) || typeof x.feedback !== "string"
    || x.tasks.some(t=>!t || !Array.isArray(t.locations) || !Array.isArray(t.replay) || !t.metrics ||
      !t.abstention_reasons || !t.ranking || !t.interval || !Array.isArray(t.monitoring) || ![7,28].includes(t.horizon_days)
      || !["area","corridor"].includes(t.scope) || t.locations.some(r=>!Array.isArray(r.baseline_beats_candidate) || !r.metrics || !r.interval)
      || t.replay.some(r=>!r.scores || !r.interval || !Number.isFinite(Date.parse(r.date)))))
    throw new Error("Choose a Corridor synthetic eval_report.json file. Real aggregates have their own view.");
  return x;
}
const display = (v: number | null | undefined) => v != null && Number.isFinite(v) ? v.toLocaleString("en-IN",{maximumFractionDigits:3}) : "—";

function ScoreTable({ scores }: { scores: Scores }) {
  return <div className="table-scroll"><table><thead><tr><th>Method</th><th>Windows scored</th><th>Mean error (cases)</th><th>Count-error score</th></tr></thead>
    <tbody>{Object.entries(scores).map(([m,s])=><tr key={m}><th>{methodName(m)}</th>
      <td>{display(s?.n)}</td><td>{display(s?.mae)}</td><td>{display(s?.poisson_deviance)}</td></tr>)}</tbody></table></div>;
}

function Replay({ task }: { task: EvaluationTask }) {
  const [step,setStep] = useState(0);
  const [active,setActive] = useState(false);
  const n = task.replay.length;
  useEffect(()=>{
    if(!active || !n) return;
    const t = window.setInterval(()=>setStep(i=>(i+1)%n),1050);
    return ()=>window.clearInterval(t);
  },[active,n]);
  if (!n) return null;
  const frame = task.replay[Math.min(step,n-1)];
  return <section className="paper"><h3>Replay the held-out windows</h3>
    <p className="small">The model fit was frozen before this period. This view shows already measured outcomes, not a new prediction.</p>
    <div className="timeline"><button onClick={()=>setActive(!active)}>{active ? "Pause replay" : "Play replay"}</button>
      <label htmlFor="replay-week">Forecast date: {dateLabel(frame.date)}</label>
      <input id="replay-week" type="range" min="0" max={n-1} value={step} onChange={e=>{setActive(false);setStep(Number(e.target.value));}}/>
      <span>{frame.observations} documented cases (window) · {pct(frame.interval.coverage)} range coverage</span></div>
    <ScoreTable scores={frame.scores}/>
  </section>;
}

export function Reports({ current,allowConnections=true }: { current: Evaluation | null;allowConnections?:boolean }) {
  const [imported,setImported] = useState<Evaluation|null>(null);
  const [error,setError] = useState("");
  const [subject,setSubject] = useState("area:28");
  const selectedSubject=allowConnections?subject:subject.replace("corridor","area");
  const report = imported || current;
  const task = report?.tasks.find(t=>`${t.scope}:${t.horizon_days}`===selectedSubject);
  return <>
    <div className="workspace-header"><div><div className="section-kicker">Synthetic evaluated results</div><h1>Forecast report card</h1>
      <p>Later outcomes, simple comparisons, and the places where the model got it wrong.</p></div></div>
    <div className="paper report-controls">
      <label>Open a local synthetic report <input type="file" accept=".json,application/json" onChange={async e=>{
        const file=e.target.files?.[0];if(!file)return;
        try{if(file.size>8_000_000)throw new Error("Choose a report under 8 MB.");setImported(readSyntheticReport(JSON.parse(await file.text())));setError("");}
        catch(err){setError(err instanceof Error ? err.message : "Could not read report.");}
      }}/></label>
      <label>Forecast target<select value={selectedSubject} onChange={e=>setSubject(e.target.value)}>
        <option value="area:28">District · 28 days</option><option value="area:7">District · 7 days</option>
        {allowConnections&&<><option value="corridor:28">Connection · 28 days</option><option value="corridor:7">Connection · 7 days</option></>}
      </select></label>
      {imported && <button onClick={()=>setImported(null)}>Use built-in report</button>}
      <a href="/generated/eval_report.html">Open printable synthetic report</a>
      <p className="small">Nothing is uploaded. The report is read in this browser.</p>
      {error && <p role="alert" className="notice">{error}</p>}
    </div>
    {!report && <p role="status">No report loaded. Run <code>make evaluate</code> or choose a local synthetic report.</p>}
    {report && task && <>
      <div className="paper">
        <h2>Final holdout</h2><p className="small">Generated at {dateLabel(report.generated_at)} · data cutoff {dateLabel(report.data_cutoff)} · {report.splits.final.length} weekly origins · outcomes mature after {report.outcome_maturity_days} days.</p>
        <p>The holdout is the final period reserved to check the model. A baseline is a simple forecast used for comparison. Poisson boosting learns patterns for nonnegative counts.</p>
        <div className="stats-strip"><div><span>Chosen earlier</span><strong>{methodName(task.selected_method)}</strong></div>
          <div><span>Best final error</span><strong>{methodName(task.winner)}</strong></div>
          <div><span>Measured range coverage</span><strong>{pct(task.interval.coverage)} of outcomes</strong><small>{pct(report.nominal_interval)} target</small></div>
          <div><span>Abstained windows</span><strong>{task.window_count-task.issued_windows}</strong></div></div>
        {task.monitoring.map(m=><p className="notice" key={m}>{m}</p>)}
        <p className="small">Mean absolute error (MAE) is the average miss in cases. Poisson deviance is a count-error score that penalizes severe underestimates. Lower is better for both.</p>
        <ScoreTable scores={task.metrics}/>
      </div>
      <Replay task={task} key={selectedSubject + report.run_id}/>
      <section className="paper"><h3>What the rankings missed</h3>
        <p className="small">Top {task.top_k} eligible {task.scope === "area" ? "districts in Kerala" : "invented known connections"} per week, not probabilities. Adjacent 28-day windows can count an event more than once.</p>
        <div className="table-scroll"><table><thead><tr><th>Method</th><th>Records captured</th><th>Records missed</th><th>Selections with no record</th><th>Capture</th></tr></thead><tbody>
          {Object.entries(task.ranking).map(([m,r])=><tr key={m}><th>{methodName(m)}</th><td>{display(r.events_captured)}</td>
            <td>{display(r.events_missed)}</td><td>{display(r.false_positives)}</td><td>{pct(r.capture)}</td></tr>)}
        </tbody></table></div>
        <p className="small">Abstentions: {Object.entries(task.abstention_reasons).map(([k,n])=>`${k} (${n})`).join("; ") || "None in this slice."}</p>
      </section>
      <section className="paper"><h3>Where the candidate loses</h3><div className="table-scroll"><table><thead>
        <tr><th>Place</th><th>Candidate mean error</th><th>Baselines with lower error</th><th>Range coverage</th></tr></thead><tbody>
        {task.locations.map(r=><tr key={r.location}><th>{r.location}</th><td>{display(r.metrics.poisson_gbm?.mae)}</td>
          <td>{r.baseline_beats_candidate.map(methodName).join(", ") || "None"}</td><td>{pct(r.interval.coverage)}</td></tr>)}</tbody></table></div>
      </section>
      <section className="paper"><h3>Feedback-loop audit</h3><p>{report.feedback}</p></section>
    </>}
  </>;
}
