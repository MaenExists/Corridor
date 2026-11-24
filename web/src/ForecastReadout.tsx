import { ArrowRight, ChartNoAxesCombined, FileText, Info, MapPin } from "lucide-react";
import type { Forecast } from "../../shared/schema";
import { dateLabel, methodName, pct } from "./data";
import type { Evaluation } from "./data";
import { evaluatedForecast, issuedMethod } from "./forecastEvidence";
import type { Comparison } from "./forecastEvidence";

export const formatError = (value:number) => value.toFixed(2);
export const forecastWindow = (f:Forecast) => `${dateLabel(f.window_start)} – ${dateLabel(f.window_end)}`;

// Put zero on each ruler. Give paired comparisons the same scale so lengths are comparable.
function axisMaximum(...values:number[]) {
  const max=Math.max(1,...values);
  const magnitude=10**Math.floor(Math.log10(max));
  return ([1,1.5,2,2.5,3,4,5,6,8,10].find(step=>step*magnitude>=max)??10)*magnitude;
}
const axisPosition=(value:number,max:number)=>`${Math.max(0,Math.min(100,value/max*100))}%`;

export function HorizonControl({value,onChange}:{value:7|28;onChange:(v:7|28)=>void}) {
  return <div className="horizon-control" role="group" aria-label="Forecast window">
    {([7,28] as const).map(h=><button key={h} type="button" aria-pressed={value===h} onClick={()=>onChange(h)}>{h} days</button>)}
  </div>;
}

function EstimateBand({estimate,range}:{estimate:number;range:[number,number]}) {
  const [low,high]=range;
  const max=axisMaximum(high,estimate);
  return <div className="forecast-band" aria-hidden="true">
    <div className="forecast-band-track">
      <i className="forecast-band-interval" style={{left:axisPosition(low,max),right:axisPosition(max-high,max)}}/>
      <i className="forecast-band-point" style={{left:axisPosition(estimate,max)}}/>
    </div>
    <div className="ruler-endpoints"><span>0</span><span>{max} cases</span></div>
  </div>;
}

export function ForecastEstimate({forecast:f,showScale=false}:{forecast?:Forecast;showScale?:boolean}) {
  if(!f)return <p className="forecast-unavailable">No forecast for this selection.</p>;
  if(f.abstained)return <div className="forecast-estimate withheld">
    <strong>Not issued</strong><span>Abstained · {f.abstain_reason??"insufficient support"}</span>
    <p>This is unknown, not zero or safe.</p>
  </div>;
  if(f.estimate==null)return <p className="forecast-unavailable">No count estimate available.</p>;
  return <div className="forecast-estimate"><div><strong>{f.estimate.toFixed(1)}</strong><span>expected documented cases</span></div>
    <p>{f.interval?<><b>{f.interval.join("–")}</b> estimated range</>:"Range not established"}</p>
    {showScale&&f.interval&&<EstimateBand estimate={f.estimate} range={f.interval}/>}
  </div>;
}

function ErrorComparison({title,comparison,unavailable,axis}:{title:string;comparison:Comparison|null|undefined;unavailable:string;axis:number}) {
  if(!comparison)return <div className="evidence-comparison"><h3>{title}</h3><p>{unavailable}</p></div>;
  const {baseline,error,method,n}=comparison;
  const diff=baseline?Number((Number(formatError(error))-Number(formatError(baseline.error))).toFixed(2)):null;
  return <div className="evidence-comparison"><h3>{title}</h3>
    <dl><div><dt>{methodName(method)}{baseline?.method===method?" · issued & best baseline":" · issued"}</dt>
      <dd>{formatError(error)}<span className="error-track" aria-hidden="true"><i style={{width:axisPosition(error,axis)}}/></span></dd></div>
      {baseline&&baseline.method!==method&&<div><dt>{methodName(baseline.method)} · best baseline</dt>
        <dd>{formatError(baseline.error)}<span className="error-track baseline" aria-hidden="true"><i style={{width:axisPosition(baseline.error,axis)}}/></span></dd></div>}</dl>
    <p>{diff==null?"No comparable baseline score.":baseline?.method===method?"The issued method is also the best simple baseline here.":
      diff>0?<b className="tone-amber">Simple baseline missed {formatError(diff)} fewer cases on average.</b>:
      diff<0?<b className="tone-teal">Issued method missed {formatError(-diff)} fewer cases on average.</b>:"Same average error at the displayed precision."} {n} scored windows.</p>
  </div>;
}

function RangeScorecard({overall,local,target,title}:{overall:number|null;local?:number|null;target:number;title:string}) {
  const rows=[{label:"Across eligible targets",value:overall},{label:`${title} only`,value:local}];
  return <section className="range-observed" aria-label="Measured range coverage">
    <header><h3><Info size={14}/> Measured range coverage</h3><span><i aria-hidden="true"/> {pct(target)} target</span></header>
    <dl>{rows.map(({label,value})=><div key={label} className="range-coverage-row">
      <dt>{label}</dt><dd>{value==null?"Not measured":pct(value)}
      {value!=null&&<span className="range-coverage-track" aria-hidden="true">
        <i data-below-target={value<target} style={{width:axisPosition(value,1)}}/>
        <i className="range-coverage-target" style={{left:axisPosition(target,1)}}/>
      </span>}</dd>
    </div>)}</dl>
    <p>Share of later counts inside the estimated range. This is not a probability for this forecast.</p>
  </section>;
}

export function ModelEvidence({forecast:f,report,title,onMap,onBrief}:{forecast?:Forecast;report:Evaluation|null;title:string;
  onMap:()=>void;onBrief:()=>void}) {
  const test=evaluatedForecast(f,report);
  const errorAxis=axisMaximum(...[test?.overall,test?.local].flatMap(r=>r?[r.error,r.baseline?.error??0]:[]));
  return <div className="model-evidence">
    <section className="console-card evidence-output" aria-label="Selected forecast">
      <div className="console-eyebrow">Saved model output</div><h2>{title}</h2>
      {f&&<p className="evidence-window">{forecastWindow(f)} · {f.horizon_days} days</p>}
      <ForecastEstimate forecast={f} showScale/>
      {f&&<dl className="evidence-meta"><div><dt>Method chosen before testing</dt><dd>{methodName(issuedMethod(f))}</dd></div>
        <div><dt>Information cutoff</dt><dd>{dateLabel(f.information_cutoff)}</dd></div></dl>}
      <div className="evidence-actions"><button className="console-button solid" onClick={onBrief} disabled={!f}><FileText size={15}/> Draft a brief <ArrowRight size={14}/></button>
        <button className="console-button quiet-action" onClick={onMap}><MapPin size={15}/> Show on map</button></div>
    </section>
    <section className="console-card evidence-validation" aria-label="Baseline comparison">
      <div className="console-eyebrow"><ChartNoAxesCombined size={15}/> Synthetic holdout</div><h2>How did it perform?</h2>
      <p>Average miss in documented cases (mean absolute error). Lower is better. Baselines are simple forecasts used for comparison.</p>
      {(test?.overall||test?.local)&&<p className="comparison-scale">Bars share a <b>0–{errorAxis} case</b> scale.</p>}
      <div className="comparison-grid">
        <ErrorComparison title={f?.connection?"Across known connections":"Across eligible Kerala districts"} comparison={test?.overall} unavailable="No matching holdout comparison." axis={errorAxis}/>
        <ErrorComparison title={`${title} only`} comparison={test?.local} unavailable={f?.abstained?"No eligible district or connection scores for this selection.":"No matching local holdout scores."} axis={errorAxis}/>
      </div>
      {test&&<RangeScorecard overall={test.task.interval.coverage} local={test.location?.interval.coverage} target={test.target} title={title}/>}
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
