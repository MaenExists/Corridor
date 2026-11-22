import { ArrowUpRight, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { DISTRICTS, methodName, NOTICE } from "../data";
import type { Evaluation, Forecasts, Selection } from "../data";

const examples=["What does coverage unknown mean?", "What did the 28-day model beat?", "What is a documented connection?", "Show me Ernakulam"];

export function AskAtlas({ forecasts, report, onAtlas }: { forecasts:Forecasts|null; report:Evaluation|null; onAtlas:(s:Selection)=>void }) {
  const [text,setText]=useState("");
  const [question,setQuestion]=useState("");
  const q=question.toLowerCase();
  const district=DISTRICTS.find(d=>q.includes(d.toLowerCase()));
  const f=district ? forecasts?.forecasts.find(x=>x.area===district && x.horizon_days===28) : undefined;
  const score=report?.tasks.find(t=>t.scope==="area" && t.horizon_days===28);
  const answer=district ?
    (!f ? `There is no loaded 28-day forecast for ${district}.` : f.abstained ? `${district}: abstained (${f.abstain_reason}). No forecast was issued.` :
      `${district}: ${f.estimate?.toFixed(1)} expected documented cases in the synthetic 28-day window; ${f.interval ? `estimated range ${f.interval.join("–")}`:"range not established"}.`) :
    /coverage|unknown|safe|zero/.test(q) ? "Coverage unknown means reporting is thin or unmeasured. Zero means no documented case in that specific sample. Neither is proof of safety." :
    /connection|corridor|route|transport/.test(q) ? "A documented connection joins explicit origin and destination in the synthetic archive. A line is schematic. It does not establish a street journey; infrastructure does not establish movement." :
    /model|beat|error|baseline|predict/.test(q) ? (score ? `For the synthetic 28-day district holdout, the lowest overall average error came from ${methodName(score.winner)}. The method chosen before the holdout was ${methodName(score.selected_method)}. The Forecast lab shows losses and uncertainty.` :
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
        {district&&<button onClick={()=>onAtlas({area:district})}>Show district <ArrowUpRight size={13}/></button>}</div>}
      <p className="fineprint">{NOTICE} This tool is a fixed local lookup, not a generative assistant.</p>
    </section>
  </div>;
}
