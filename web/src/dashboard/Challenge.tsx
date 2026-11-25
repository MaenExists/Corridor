import { ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarDays, Check, Eye, Play, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { dateLabel, DISTRICTS, pct } from "../data";
import type { Evaluation } from "../data";
import { ChallengeMap } from "./ChallengeMap";
import { interpret, loadChallenge, revealOutcome, runChallenge } from "./challengeModel";
import type { ChallengePack, Request, Trial } from "./challengeModel";

const examples=["Ernakulam, 28 days","Ernakulam, 7 days","Wayanad, 28 days"];
const questions=["Check reporting coverage","Request independent aggregate data","No further conclusion"] as const;
const n=(value:number|null)=>value?.toFixed(1)??"—";
const message=(e:unknown)=>e instanceof Error?e.message:"The local challenge is unavailable.";

function download(trial:Trial,district:string,observed:number,review:string) {
  const result=trial.estimates[district];
  const body={schema:"corridor-challenge-result-v1",synthetic:true,run_id:trial.runId,district,
    cutoff:trial.request.cutoff,window_start:trial.start,window_end:trial.end,horizon_days:trial.request.horizon,
    model_frozen_at:trial.frozenAt,model:"poisson_gbm",estimate:result.estimate,baseline_method:"last_56_days",
    baseline:result.baseline,observed_documented_cases:observed,withheld_reason:result.reason,
    model_absolute_error:result.estimate==null?null:Math.abs(result.estimate-observed),
    baseline_absolute_error:result.baseline==null?null:Math.abs(result.baseline-observed),
    reviewer_next_step:review||null,
    limitation:"One synthetic test window; not real-world accuracy, underlying drug movement, or evidence for action."};
  const url=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download="corridor-synthetic-challenge.json";link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function Challenge({report,onEvidence}:{report:Evaluation|null;onEvidence:(d:string,h:7|28)=>void}) {
  const [pack,setPack]=useState<ChallengePack|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [loadError,setLoadError]=useState(false);
  const [request,setRequest]=useState<Request>({district:"Ernakulam",horizon:28,cutoff:""});
  const [question,setQuestion]=useState("");
  const [trial,setTrial]=useState<Trial|null>(null);
  const [observed,setObserved]=useState<number|null>(null);
  const [revealing,setRevealing]=useState(false);
  const [error,setError]=useState("");
  const [revealError,setRevealError]=useState("");
  const [review,setReview]=useState("");
  const revealToken=useRef(0);
  const resultPanel=useRef<HTMLElement>(null);

  useEffect(()=>{
    let active=true;
    loadChallenge().then(p=>{
      if(!active)return;
      setPack(p);setRequest(r=>({...r,cutoff:p.tasks.find(t=>t.horizon===r.horizon)!.frames[0].cutoff}));
    }).catch(()=>{if(active)setLoadError(true);});
    return ()=>{active=false;};
  },[attempt]);
  useEffect(()=>{
    if(!trial)return;
    const panel=resultPanel.current;
    const reveal=panel?.querySelector(".trial-actions");
    if(panel&&reveal&&reveal.getBoundingClientRect().bottom>innerHeight-12){
      panel.scrollIntoView({block:"nearest",behavior:"instant"});
    }
  },[trial]);

  const clearReveal=()=>{
    revealToken.current++;setObserved(null);setRevealing(false);setRevealError("");setReview("");
  };
  const configure=(next:Request)=>{
    clearReveal();setTrial(null);setRequest(next);setError("");setQuestion("");
  };
  const chooseDistrict=(district:string)=>{
    if(request.district===district)return;
    clearReveal();setRequest({...request,district});setError("");setQuestion("");
  };
  const run=(text?:string)=>{
    if(!pack)return;
    try {
      const next=text?.trim()?interpret(text,request):request;
      const result=runChallenge(pack,next);
      clearReveal();setRequest(next);setTrial(result);setQuestion("");setError("");
    } catch(e){setError(message(e));}
  };
  const reveal=async()=>{
    if(!trial)return;
    const token=++revealToken.current;
    setRevealing(true);setRevealError("");
    try {
      const value=await revealOutcome(trial,request.district);
      if(token===revealToken.current)setObserved(value);
    } catch {if(token===revealToken.current)setRevealError("Couldn’t load the matching outcome. Try again; the forecast is unchanged.");}
    finally {if(token===revealToken.current)setRevealing(false);}
  };

  const result=trial?.estimates[request.district];
  const comparable=observed!==null&&result?.estimate!=null&&result.baseline!=null;
  const modelMiss=comparable?Math.abs(observed-result.estimate!):null;
  const baselineMiss=comparable?Math.abs(observed-result.baseline!):null;
  const difference=baselineMiss!==null&&modelMiss!==null?Number((Number(n(baselineMiss))-Number(n(modelMiss))).toFixed(1)):null;
  const validation=trial&&report?.run_id===trial.runId?report.tasks.find(t=>t.scope==="area"&&t.horizon_days===request.horizon):undefined;
  const wholeModel=validation?.metrics.poisson_gbm?.mae??null;
  const wholeBaseline=validation?.metrics.last_56_days?.mae??null;
  const wholeCount=validation?.metrics.poisson_gbm?.n;
  const wholeComparable=wholeModel!==null&&wholeBaseline!==null&&!!wholeCount&&wholeCount===validation?.metrics.last_56_days?.n;
  const dates=pack?.tasks.find(t=>t.horizon===request.horizon)?.frames??[];

  return <div className="trial-shell">
    <header className="trial-hero">
      <div><p className="console-eyebrow"><span className="trial-live-dot"/> Interactive synthetic experiment</p>
        <h1>Can we forecast what<br className="trial-title-break"/> gets documented?</h1>
        <p>More reports don’t always mean more harm. Corridor helps prevention teams test a forecast against a simple baseline and see where the records don’t support an answer.</p>
      </div>
      <ol aria-label="How the challenge works"><li>Choose a past date</li><li>Run the frozen model</li><li>Reveal what was recorded</li></ol>
    </header>
    <div className="trial-grid">
      <div className="trial-work">
        <section className="console-card trial-command" aria-label="Set up a forecast">
          <div className="trial-section-mark" aria-hidden="true">01 / SET UP</div>
          <h2>Ask Corridor</h2>
          <form onSubmit={e=>{e.preventDefault();run(question);}}>
            <label className="console-sr" htmlFor="trial-question">Ask for a forecast</label>
            <div className="trial-input"><span aria-hidden="true">›</span>
              <input id="trial-question" value={question} onChange={e=>setQuestion(e.target.value)}
                placeholder="Ernakulam, 28 days" maxLength={140} autoComplete="off" spellCheck={false}/>
              <button className="console-button solid" disabled={!pack} type="submit"><Play size={15}/>Run forecast</button></div>
            <div className="trial-examples">{examples.map(q=><button key={q} type="button" disabled={!pack} onClick={()=>run(q)}>{q}<ArrowUpRight size={12}/></button>)}</div>
            <div className="trial-fields">
              <label>District<select aria-label="Challenge district" value={request.district} onChange={e=>chooseDistrict(e.target.value)}>
                {DISTRICTS.map(d=><option key={d}>{d}</option>)}</select></label>
              <label>Window<select aria-label="Challenge window" value={request.horizon} onChange={e=>configure({...request,horizon:Number(e.target.value) as 7|28})}>
                <option value="7">7 days</option><option value="28">28 days</option></select></label>
              <label>As of<select aria-label="Challenge cutoff" value={request.cutoff} disabled={!pack} onChange={e=>configure({...request,cutoff:e.target.value})}>
                {!dates.length&&<option value="">Waiting for archive</option>}
                {dates.map(f=><option key={f.cutoff} value={f.cutoff}>{dateLabel(f.cutoff)}</option>)}</select></label>
            </div>
          </form>
          {error&&<p className="trial-help trial-error" role="alert">{error}</p>}
          {loadError?<div className="trial-help trial-error" role="alert">Challenge unavailable. Prepare it with <code>make challenge</code>.
            <button className="console-link" onClick={()=>{setLoadError(false);setAttempt(i=>i+1);}}><RotateCw size={13}/>Retry</button></div>:
            <p className="trial-help">{pack?"Understands district names, 7 or 28 days, and archive dates (YYYY-MM-DD). No prompt is sent or saved.":"Loading the local synthetic model…"}</p>}
        </section>
        <section ref={resultPanel} className="console-card trial-result" aria-label="Forecast experiment result">
          <div className="trial-section-mark">02 / PREDICT &amp; CHECK</div>
          {!trial||!result?<div className="trial-empty"><h2>Make a forecast before checking the answer</h2>
            <p>Each run computes district estimates using only information available by the date you choose. The actual count is hidden until you reveal it.</p></div>:<>
            <div aria-live="polite" className="trial-result-heading">
              <h2>{request.district} <span>· {request.horizon} days</span></h2>
              <p><CalendarDays size={14}/>{dateLabel(trial.start)} – {dateLabel(trial.end)}</p>
            </div>
            {result.estimate===null?<div className="trial-withheld"><strong>Forecast not issued</strong>
              <p>{result.reason??"Insufficient support"}. That is unknown, not zero or safe.</p></div>:
              <div className="trial-numbers">
                <div><span>Learned model</span><strong>{n(result.estimate)}</strong><small>{modelMiss===null?"Expected cases":`${n(modelMiss)} cases off`}</small></div>
                <div><span>Recent average</span><strong>{n(result.baseline)}</strong><small>{baselineMiss===null?"Simple baseline":`${n(baselineMiss)} cases off`}</small></div>
                <div data-revealed={observed!==null}><span>Later recorded</span><strong>{observed??"—"}</strong><small>{observed===null?"Not revealed":"Documented cases"}</small></div>
              </div>}
            {observed!==null&&<div className="trial-verdict" role="status"><Check size={17}/><p>
              {result.estimate===null?<>The archive later recorded <b>{observed}</b> {observed===1?"case":"cases"}. No forecast was issued or scored.</>:
                difference===null?"Outcome revealed. No comparable baseline score.":
                  difference===0?"A tie at the displayed precision.":<><b>{difference>0?"The learned model":"The simple baseline"} was closer</b> by {n(Math.abs(difference))} cases.</>}
              {" "}One window isn’t proof of reliability.</p></div>}
            {revealError&&<p className="trial-error" role="alert">{revealError}</p>}
            {observed!==null&&<label className="trial-followup">Human follow-up <select value={review} onChange={e=>setReview(e.target.value)}>
              <option value="">Optional · add to the local export</option>{questions.map(q=><option key={q}>{q}</option>)}
            </select></label>}
            <div className="trial-actions">
              {observed===null?<button className="console-button solid" disabled={revealing} onClick={()=>void reveal()}><Eye size={16}/>{revealing?"Loading outcome…":"Reveal recorded count"}</button>:
                <button className="console-button quiet-action" onClick={()=>download(trial,request.district,observed,review)}><ArrowDownToLine size={16}/>Download this run</button>}
              <button className="console-link" onClick={()=>onEvidence(request.district,request.horizon)}>Open full evaluation <ArrowRight size={14}/></button>
            </div>
            <details className="trial-method"><summary>What the model knew</summary>
              <p><b>{result.recent}</b> documented cases in the preceding 28 days for {request.district}. Inputs include past counts and seasonality. No later reports enter prediction.</p>
              <p>Poisson boosting was fitted once for this horizon on {trial.trainingWindows.toLocaleString("en-IN")} district-windows, using labels mature by {dateLabel(trial.frozenAt)}. This experiment tests the learned candidate, not necessarily the method chosen for the latest forecast.</p>
              {wholeComparable&&<p>Across {wholeCount} eligible held-out district-windows, average error was <b>{wholeModel.toFixed(2)}</b> cases for the model and <b>{wholeBaseline.toFixed(2)}</b> for the recent average. The full evaluation includes other baselines and shows how often ranges covered later counts ({pct(validation?.interval.coverage)} for the method chosen before testing).</p>}
            </details>
          </>}
        </section>
      </div>
      <ChallengeMap district={request.district} select={chooseDistrict} trial={trial}/>
    </div>
    <p className="trial-boundary"><b>What this can support:</b> a human review of reporting gaps and a request for independent aggregate data. It does not measure trafficking, harm or service need, and it does not recommend enforcement or allocate resources.</p>
  </div>;
}
