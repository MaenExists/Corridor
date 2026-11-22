import { ArrowRight, CalendarClock, FlaskConical, Gauge, Info, Layers2 } from "lucide-react";
import { useState } from "react";
import { DISTRICTS, NOTICE } from "../data";
import type { Cases, Forecasts } from "../data";
import { dayShift } from "../companion/model";
import type { MapRecord } from "../companion/model";
import { compactCount, datasetForecast } from "./metrics";
import type { Horizon } from "./metrics";
import { scenarios } from "./Panels";
import type { ScenarioPreset } from "./Panels";

type Result={base:number|null; projected:number|null; description:string; unit:string; district:string};
type Inputs={preset:ScenarioPreset;district:string;amount:number};

export function calculateScenario(input:Inputs, data:Cases, archive:MapRecord[], forecasts:Forecasts|null, horizon:Horizon, pending:number):Result {
  const {preset,district,amount}=input;
  if(preset==="Reporting volume") {
    const estimate=datasetForecast(forecasts,district,horizon);
    const base=estimate?.abstained?null:estimate?.estimate??null;
    return {base,projected:base===null?null:base*(1+amount/100),unit:`documented cases / ${horizon} days`,district,
      description:base===null?"No supported forecast for this district. A scenario cannot override abstention.":
        "The what-if scales documented reports only. It is not a retrained forecast or an effect of enforcement or outreach."};
  }
  if(preset==="Reporting delay") {
    const recent=archive.filter(r=>r.district===district && r.eventDate>=dayShift(data.as_of,-27));
    const projected=recent.filter(r=>dayShift(r.availableDate,amount)<=data.as_of).length;
    return {base:recent.length,projected,unit:"reports visible by archive cutoff",district,
      description:"Counts how many fictional reports from the last 28 days would still be visible if every publication were later."};
  }
  return {base:pending,projected:Math.max(0,pending-amount),unit:"items remaining in the local fixture queue",district:"Workspace",
    description:"Starts from the current fixture queue and subtracts the chosen number of completed reviews, with no new intake."};
}
export function Scenarios({initial,selected,data,archive,forecasts,horizon,pending}:{initial:ScenarioPreset;selected:string;data:Cases;archive:MapRecord[];
  forecasts:Forecasts|null;horizon:Horizon;pending:number}) {
  const [preset,setPreset]=useState(initial);
  const [district,setDistrict]=useState(selected);
  const [amount,setAmount]=useState(initial==="Reporting volume"?15:initial==="Reporting delay"?7:2);
  const [result,setResult]=useState<Result|null>(null);
  const controls=preset==="Reporting volume"?{title:"Change in documented reporting",unit:"%",min:-50,max:75,step:5}:
    preset==="Reporting delay"?{title:"Added publication delay",unit:" days",min:0,max:28,step:1}:
    {title:"Completed reviews",unit:" items",min:0,max:Math.max(4,pending),step:1};
  const pick=(s:ScenarioPreset)=>{setPreset(s);setAmount(s==="Reporting volume"?15:s==="Reporting delay"?7:2);setResult(null);};
  const fmt=(n:number|null)=>n===null?"—":Number.isInteger(n)?compactCount(n):n.toFixed(1);
  return <div className="console-page">
    <header className="console-page-heading"><div><p><FlaskConical size={15}/> Synthetic scenario lab</p><h1>Scenario planning</h1>
      <span>Change an assumption and compare it with the current documented-case baseline.</span></div><span className="console-tag">What-if only</span></header>
    <div className="console-scenarios-layout">
      <section className="console-card console-scenario-form">
        <header className="console-card-head"><div><Layers2 size={18} className="tone-teal"/><h2>Scenario settings</h2></div></header>
        <div className="console-chips" aria-label="Scenario type">{scenarios.map(s=><button key={s} aria-pressed={preset===s} onClick={()=>pick(s)}>
          {s==="Reporting delay"?<CalendarClock size={14}/>:s==="Review backlog"?<Gauge size={14}/>:<Layers2 size={14}/>} {s}</button>)}</div>
        <form className="console-fields" onSubmit={e=>{e.preventDefault();setResult(calculateScenario({preset,district,amount},data,archive,forecasts,horizon,pending));}}>
          {preset!=="Review backlog"&&<label>Scenario district<select value={district} onChange={e=>{setDistrict(e.target.value);setResult(null);}}>
            {DISTRICTS.map(d=><option key={d}>{d}</option>)}</select></label>}
          <label className="console-range-label">{controls.title}<output>{amount>0&&preset==="Reporting volume"?"+":""}{amount}{controls.unit}</output>
            <input type="range" min={controls.min} max={controls.max} step={controls.step} value={amount}
              onChange={e=>{setAmount(Number(e.target.value));setResult(null);}}/></label>
          <button type="submit" className="console-button solid">Run scenario <ArrowRight size={15}/></button>
        </form>
      </section>
      <section className="console-card console-scenario-result">
        <header className="console-card-head"><div><Gauge size={18} className="tone-teal"/><h2>Scenario result</h2></div></header>
        {result?<div className="console-scenario-output" role="status"><small>{result.district} · {result.unit}</small>
          <div><span>Baseline<strong>{fmt(result.base)}</strong></span><ArrowRight size={21}/><span>What-if result<strong>{fmt(result.projected)}</strong></span></div>
          <p>{result.description}</p></div>:<p className="console-empty">Run a scenario to see its result. The underlying forecast will not change.</p>}
        <div className="console-caution"><Info size={16}/><span>{NOTICE}</span></div>
      </section>
    </div>
  </div>;
}
