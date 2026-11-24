import { ArrowUpRight, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { DISTRICTS, methodName, NOTICE } from "../data";
import type { Evaluation, Forecasts, Selection } from "../data";
import { findForecast, issuedMethod } from "../forecastEvidence";
import { forecastWindow } from "../ForecastReadout";

const examples=["What does coverage unknown mean?", "What did the 28-day model beat?", "What is a documented connection?", "Show me Ernakulam"];

export function AskAtlas({ forecasts, report, onAtlas, horizon=28 }: { forecasts:Forecasts|null; report:Evaluation|null;
  onAtlas:(s:Selection,h:7|28)=>void;horizon?:7|28 }) {
  const [text,setText]=useState("");
  const [question,setQuestion]=useState("");
  const q=question.toLowerCase();
  const district=DISTRICTS.find(d=>q.includes(d.toLowerCase()));
  const windowDays=/\b7\s*[- ]?\s*days?\b/.test(q)?7:/\b28\s*[- ]?\s*days?\b/.test(q)?28:horizon;
  const f=district ? findForecast(forecasts,{area:district},windowDays) : undefined;
  const score=report?.tasks.find(t=>t.scope==="area" && t.horizon_days===windowDays);
  const answer=district ?
    (!f ? `There is no loaded ${windowDays}-day forecast for ${district}.` : f.abstained ? `${district}: abstained (${f.abstain_reason}). No forecast was issued; unknown is not safe.` :
      `${district}: ${f.estimate?.toFixed(1)} expected documented cases from ${forecastWindow(f)}; ${f.interval ? `estimated range ${f.interval.join("–")}`:"range not established"}. Method: ${methodName(issuedMethod(f))}.`) :
    /coverage|unknown|safe|zero/.test(q) ? "Coverage unknown means reporting is thin or unmeasured. Zero means no documented case in that specific sample. Neither is proof of safety." :
    /connection|corridor|route|transport/.test(q) ? "A documented connection joins explicit origin and destination in the synthetic archive. A line is schematic. It does not establish a street journey; infrastructure does not establish movement." :
    /model|beat|error|baseline|predict/.test(q) ? (score ? `For the synthetic ${windowDays}-day district holdout, the lowest overall average error came from ${methodName(score.winner)}. The method chosen before the holdout was ${methodName(score.selected_method)}. Model & validation shows losses and uncertainty.` :
      "Open the Forecast lab after generating the synthetic evaluation.") :
    "This offline guide handles district names and questions about coverage, forecasts, and documented connections. It does not accept reports or answer questions about people.";
  return <div className="content-page">
    <div className="page-heading"><div><div className="location-kicker"><Sparkles size={14}/> Local workspace guide</div><h1>Ask the Atlas</h1>
      <p>Find an explanation or jump to a district profile without sending a query anywhere.</p></div><span className="experimental">Offline lookup</span></div>
    <section className="panel companion-guide">
      <div className="panel-heading"><h2>Explore the synthetic workspace</h2><small>No external AI or uploads</small></div>
      <div className="guide-examples">{examples.map(x=><button key={x} onClick={()=>setQuestion(x)}>{x}</button>)}</div>
      <form className="searchbox" onSubmit={e=>{e.preventDefault();setQuestion(text.trim());}}>
        <Search size={15}/><input aria-label="Question about the atlas" placeholder="Ask about a district or method" value={text}
          maxLength={140} onChange={e=>setText(e.target.value)}/><button type="submit">Look up</button></form>
      {question && <div className="guide-answer" role="status"><strong>{question}</strong><p>{answer}</p>
        {district&&<button onClick={()=>onAtlas({area:district},windowDays)}>Show district <ArrowUpRight size={13}/></button>}</div>}
      <p className="fineprint">{NOTICE} This tool is a fixed local lookup, not a generative assistant.</p>
    </section>
  </div>;
}
