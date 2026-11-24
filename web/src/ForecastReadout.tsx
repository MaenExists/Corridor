import { ArrowRight, ChartNoAxesCombined, FileText, Info, MapPin } from "lucide-react";
import type { Forecast } from "../../shared/schema";
import { dateLabel, methodName, pct } from "./data";
import type { Evaluation } from "./data";
import { evaluatedForecast, issuedMethod } from "./forecastEvidence";
import type { Comparison } from "./forecastEvidence";

export const formatError = (value:number) => value.toFixed(2);
export const forecastWindow = (f:Forecast) => `${dateLabel(f.window_start)} – ${dateLabel(f.window_end)}`;

export function HorizonControl({value,onChange}:{value:7|28;onChange:(v:7|28)=>void}) {
  return <div className="horizon-control" role="group" aria-label="Forecast window">
    {([7,28] as const).map(h=><button key={h} type="button" aria-pressed={value===h} onClick={()=>onChange(h)}>{h} days</button>)}
  </div>;
}

export function ForecastEstimate({forecast:f}:{forecast?:Forecast}) {
  if(!f)return <p className="forecast-unavailable">No forecast for this selection.</p>;
  if(f.abstained)return <div className="forecast-estimate withheld">
    <strong>Not issued</strong><span>Abstained · {f.abstain_reason??"insufficient support"}</span>
    <p>This is unknown, not zero or safe.</p>
  </div>;
  if(f.estimate==null)return <p className="forecast-unavailable">No count estimate available.</p>;
  return <div className="forecast-estimate"><div><strong>{f.estimate.toFixed(1)}</strong><span>expected documented cases</span></div>
    <p>{f.interval?<><b>{f.interval.join("–")}</b> estimated range</>:"Range not established"}</p></div>;
}

function ErrorComparison({title,comparison,unavailable}:{title:string;comparison:Comparison|null|undefined;unavailable:string}) {
  if(!comparison)return <div className="evidence-comparison"><h3>{title}</h3><p>{unavailable}</p></div>;
  const {baseline,error,method,n}=comparison;
  const diff=baseline?Number((Number(formatError(error))-Number(formatError(baseline.error))).toFixed(2)):null;
  return <div className="evidence-comparison"><h3>{title}</h3>
    <dl><div><dt>{methodName(method)}{baseline?.method===method?" · issued & best baseline":" · issued"}</dt><dd>{formatError(error)}</dd></div>
      {baseline&&baseline.method!==method&&<div><dt>{methodName(baseline.method)} · best baseline</dt><dd>{formatError(baseline.error)}</dd></div>}</dl>
    <p>{diff==null?"No comparable baseline score.":diff>0?<b className="tone-amber">Simple baseline missed by {formatError(diff)} fewer cases.</b>:
      diff<0?<b className="tone-teal">Issued method missed by {formatError(-diff)} fewer cases.</b>:"Same mean error at the displayed precision."} {n} scored windows.</p>
  </div>;
}

export function ModelEvidence({forecast:f,report,title,onMap,onBrief}:{forecast?:Forecast;report:Evaluation|null;title:string;
  onMap:()=>void;onBrief:()=>void}) {
  const test=evaluatedForecast(f,report);
  return <div className="model-evidence">
    <section className="console-card evidence-output" aria-label="Selected forecast">
      <div className="console-eyebrow">Saved model output</div><h2>{title}</h2>
      {f&&<p className="evidence-window">{forecastWindow(f)} · {f.horizon_days} days</p>}
      <ForecastEstimate forecast={f}/>
      {f&&<dl className="evidence-meta"><div><dt>Method chosen before testing</dt><dd>{methodName(issuedMethod(f))}</dd></div>
        <div><dt>Information cutoff</dt><dd>{dateLabel(f.information_cutoff)}</dd></div></dl>}
      <div className="evidence-actions"><button className="console-button solid" onClick={onBrief} disabled={!f}><FileText size={15}/> Draft a brief <ArrowRight size={14}/></button>
        <button className="console-button quiet-action" onClick={onMap}><MapPin size={15}/> Show on map</button></div>
    </section>
    <section className="console-card evidence-validation" aria-label="Baseline comparison">
      <div className="console-eyebrow"><ChartNoAxesCombined size={15}/> Synthetic holdout</div><h2>How did it perform?</h2>
      <p>Mean absolute error is the average miss in documented cases. Lower is better. A baseline is a simple forecast for comparison.</p>
      <div className="comparison-grid">
        <ErrorComparison title={f?.connection?"Across known connections":"Across eligible Kerala districts"} comparison={test?.overall} unavailable="No matching holdout comparison."/>
        <ErrorComparison title={`${title} only`} comparison={test?.local} unavailable={f?.abstained?"No eligible district or connection scores for this selection.":"No matching local holdout scores."}/>
      </div>
      {test&&<p className="range-observed"><Info size={15}/> Across eligible targets, ranges contained <b>{pct(test.task.interval.coverage)}</b> of later counts (target: <b>{pct(test.target)}</b>).
        {test.location?.interval.coverage!=null&&<> For {title}: <b>{pct(test.location.interval.coverage)}</b>.</>} This is not a probability for this forecast.</p>}
      {report&&test&&<p className="evidence-test-period">{report.splits.final.length} weekly test dates · {dateLabel(report.splits.final[0])} – {dateLabel(report.splits.final.at(-1)!)}.
        {f?.horizon_days===28?" Adjacent forecast windows overlap.":""}</p>}
    </section>
    {f&&<section className="console-card evidence-inputs"><div>
      <div className="console-eyebrow">Available at cutoff</div><h2>{f.abstained?"Why wasn’t a forecast issued?":"What was known at the cutoff?"}</h2>
      {f.abstained&&<p className="tone-amber">{f.abstain_reason??"Insufficient support"}. A data gap is not a safety finding.</p>}
      <ul>{f.supporting_patterns.map(s=><li key={s}>{s}</li>)}</ul>
      <p>These inputs describe the information available, not causal explanations or feature weights.</p>
    </div><div>
      <div className="console-eyebrow">Provenance</div><h2>Sources and limits</h2>
      <p>{f.source_availability}</p>
      <p>{f.recent_verified_cues.length} recent verified fictional {f.recent_verified_cues.length===1?"cue":"cues"}. Predictive benefit is not established.</p>
      <ul>{f.coverage_gaps.map(s=><li key={s}>{s}</li>)}</ul>
      <details><summary>Batch details</summary><dl className="evidence-meta">
        <div><dt>Target</dt><dd>{f.target}</dd></div><div><dt>Model version</dt><dd>{f.model_version}</dd></div>
        <div><dt>Range status</dt><dd>{f.uncertainty_note}</dd></div></dl></details>
    </div></section>}
  </div>;
}
