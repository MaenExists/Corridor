import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { ASSESSMENTS, LEAD_CATEGORIES, NEXT_STEPS } from "../../shared/workspace";
import type { Brief, Lead, Role } from "../../shared/workspace";
import { BANNER, dateLabel, DISTRICTS, localJSON, NOTICE } from "./data";
import type { Forecasts, Selection } from "./data";
import { ReviewKey, reviewHeaders } from "./Review";
import { ForecastEstimate, forecastWindow } from "./ForecastReadout";
import { findForecast } from "./forecastEvidence";

const jsonHeaders = { "Content-Type": "application/json" };
const errText = (e: unknown) => e instanceof Error ? e.message : "Local service unavailable.";
const options = (values: readonly string[]) => values.map(v=><option key={v}>{v}</option>);
const verify = <T extends {synthetic:boolean},>(v:T) => {if(v.synthetic!==true)throw new Error("Unexpected local response track.");return v;};

export function Leads({ reviewKey, setKey, role }: { reviewKey:string;setKey:(v:string)=>void;role:Role }) {
  const [district,setDistrict] = useState("Ernakulam");
  const [category,setCategory] = useState<string>(LEAD_CATEGORIES[0]);
  const [items,setItems] = useState<Lead[]>([]);
  const [open,setOpen] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const reload=useCallback(async ()=>{
    const r=verify(await localJSON<{synthetic:boolean;items:Lead[]}>("/api/leads",{headers:reviewHeaders(reviewKey)}));
    setItems(r.items);setOpen(true);
  },[reviewKey]);
  useEffect(()=>{setOpen(false);setItems([]);},[reviewKey,role]);
  const perform=async (f:()=>Promise<void>)=>{setMessage("");setError("");setBusy(true);try{await f();}
    catch(e){setError(errText(e));}finally{setBusy(false);}};
  return <><div className="workspace-header"><div><div className="section-kicker">Synthetic workflow</div><h1>Community leads</h1>
    <p>Practice a private review without entering a real allegation.</p></div></div>
    <section className="paper"><h2>Submit a practice lead</h2>
      <p>This form records only a district and topic in a database on this machine. It has no name, contact or narrative fields.
      No account is required for this practice form. It is not a secure or anonymous reporting service.</p>
      <form className="form-row" onSubmit={e=>{e.preventDefault();perform(async()=>{
        const r=verify(await localJSON<{synthetic:boolean;receipt:string}>("/api/leads",{method:"POST",headers:jsonHeaders,body:JSON.stringify({district,category})}));
        setMessage(`Practice lead stored locally. Receipt ${r.receipt.slice(0,8)}.`);
        if(open)await reload();
      });}}>
        <label>Lead district<select value={district} onChange={e=>setDistrict(e.target.value)}>{options(DISTRICTS)}</select></label>
        <label>Practice topic<select value={category} onChange={e=>setCategory(e.target.value)}>{options(LEAD_CATEGORIES)}</select></label>
        <button disabled={busy}>Submit practice lead</button>
      </form>
      <p className="small">Leads never appear on the map, enter the case dataset, influence the model, or get sent to an agency.</p>
      {message && <p role="status" className="notice">{message}</p>}{error && <p role="alert" className="notice">{error}</p>}
    </section>
    {role === "analyst" && <section className="paper"><h2>Private local queue</h2>
      <div className="form-row"><ReviewKey value={reviewKey} change={setKey}/><button disabled={!reviewKey || busy} onClick={()=>perform(reload)}>Open review queue</button></div>
      {open && (items.length ? <div className="table-scroll"><table><thead><tr><th>District and topic</th><th>State</th><th>Review</th></tr></thead>
        <tbody>{items.map(i=><tr key={i.id}><th>{i.district}<br/><small>{i.category} · {dateLabel(i.created_at)}</small></th><td>{i.status}</td>
          <td><div className="form-row">{(i.status==="new" || i.status==="reviewed") && (["reviewed","closed"] as const).filter(s=>s!==i.status).map(status=>
            <button disabled={busy} key={status} onClick={()=>perform(async()=>{
              verify(await localJSON<{synthetic:boolean}>(`/api/leads/${i.id}`,{method:"PATCH",headers:reviewHeaders(reviewKey),body:JSON.stringify({status})}));
              setMessage("Lead review saved locally.");await reload();
            })}>{status==="reviewed"?"Mark reviewed":"Close lead"}</button>)}</div></td></tr>)}</tbody></table></div> : <p>No practice leads.</p>)}
    </section>}
  </>;
}

type Draft = Pick<Brief,"district"|"assessment"|"next_step"|"horizon_days"|"role"|"connection">;
const blank = (selection:Selection,horizon:7|28,role:Role):Draft => ({ district:"area" in selection?selection.area:selection.connection[1],
  horizon_days:horizon,assessment:ASSESSMENTS[3],next_step:NEXT_STEPS[0],role,
  connection:role==="analyst" && "connection" in selection?selection.connection.join("|"):null });
function saveBlob(content:string,type:string,extension:string) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement("a");a.href=url;a.download=`narcotrace-synthetic-brief.${extension}`;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const html = (v:unknown) => String(v ?? "Unknown").replace(/[&<>"']/g,k=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[k] || k);
const selectionOf = (r:Draft):Selection => {
  const [a,b]=r.connection?.split("|")??[];
  return a&&b ? {connection:[a,b]} : {area:r.district};
};

export function Briefs({ forecasts, selection, horizon, role, onModel }: { forecasts:Forecasts|null;selection:Selection;horizon:7|28;role:Role;
  onModel?:(s:Selection,h:7|28)=>void }) {
  const [draft,setDraft]=useState<Draft>(()=>blank(selection,horizon,role));
  const [items,setItems]=useState<Brief[]>([]);
  const [edit,setEdit]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const reload=useCallback(async()=>{
    setItems(verify(await localJSON<{synthetic:boolean;items:Brief[]}>("/api/briefs")).items);
  },[]);
  useEffect(()=>{reload().catch(()=>setError("Start make demo to load local briefs."));},[reload]);
  useEffect(()=>{setDraft(blank(selection,horizon,role));setEdit(null);},[selection,horizon,role]);
  const choices=forecasts?.forecasts.filter(r=>r.connection && r.horizon_days===draft.horizon_days) || [];
  const title=(r:Draft)=>r.connection?r.connection.split("|").join(" → "):r.district;
  const preview=findForecast(forecasts,selectionOf(draft),draft.horizon_days);
  const saved=items.filter(i=>i.role===role);
  const write=async()=>{
    setError("");setMessage("");setBusy(true);
    try {
      const r=verify(await localJSON<{synthetic:boolean;item:Brief}>(edit?`/api/briefs/${edit}`:"/api/briefs",{method:edit?"PUT":"POST",
        headers:jsonHeaders,body:JSON.stringify(draft)}));
      setEdit(r.item.id);setMessage("Brief saved on this machine.");await reload();
    } catch(e){setError(errText(e));} finally{setBusy(false);}
  };
  function exportBrief(b:Brief, format:"json"|"html") {
    const f=findForecast(forecasts,selectionOf(b),b.horizon_days);
    const out={synthetic:true,label:"SYNTHETIC DATA",disclaimer:BANNER,limitation:NOTICE,subject:title(b),horizon_days:b.horizon_days,
      role:b.role,assessment:b.assessment,next_step:b.next_step,brief_last_saved:b.updated_at,
      forecast_at_export:f?{target:f.target,model_version:f.model_version,data_cutoff:f.information_cutoff,
        generated_at:forecasts?.generated_at,window_start:f.window_start,window_end:f.window_end,estimate:f.estimate,interval:f.interval,
        abstain_reason:f.abstain_reason,uncertainty:f.uncertainty_note,coverage:f.coverage_gaps.join("; ")}:null};
    if(format==="json")saveBlob(JSON.stringify(out,null,2),"application/json",format);
    else saveBlob(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
      <title>Synthetic NarcoTrace brief</title><style>
      *{box-sizing:border-box}body{margin:0;background:#f0f5f3;color:#192826;font:16px/1.55 system-ui,sans-serif}
      main{width:min(94%,760px);margin:28px auto;background:#fff;padding:clamp(18px,5vw,48px);border-top:6px solid #237163}
      h1{line-height:1.15;letter-spacing:-.03em;margin:.35em 0}h2{font-size:1.18rem;margin:1.6em 0 .5em}
      .tag{letter-spacing:.12em;color:#175c50;font-size:.75rem}.notice{padding:12px;background:#edf4ef;border-left:3px solid #237163}
      dl{display:grid;grid-template-columns:minmax(7em,1fr) 2fr;margin:0}dt,dd{border-bottom:1px solid #dbe5e0;padding:6px;margin:0;overflow-wrap:anywhere}
      dt{font-weight:650}small{color:#455b54}@media print{body{background:white}main{width:100%;margin:0;padding:0;border:0}dt,dd{break-inside:avoid}}
      </style><main><strong class="tag">NARCOTRACE · SYNTHETIC DATA</strong>
      <h1>${html(out.subject)} · ${out.horizon_days} days</h1><p><small>${html(out.disclaimer)}</small></p>
      <h2>Review assessment</h2><p>${html(out.assessment)}</p><p>Suggested follow-up: ${html(out.next_step)}.</p>
      <h2>Aggregate forecast at export</h2>
      ${f?`<p>${html(f.abstained?`Not issued: ${f.abstain_reason??"insufficient support"}. This is not a safety finding.`:
        `${f.estimate?.toFixed(1)??"Unknown"} expected documented cases${f.interval?` · estimated range ${f.interval.join("–")}`:" · range not established"}.`)} ${html(forecastWindow(f))}.</p>`:"<p>No matching batch forecast was available at export.</p>"}
      <dl>${Object.entries(out.forecast_at_export||{}).map(([k,v])=>`<dt>${html(k.replaceAll("_"," "))}</dt><dd>${html(v ?? "Unknown")}</dd>`).join("")}</dl>
      <p class="notice">${html(out.limitation)}</p></main></html>`,
      "text/html",format);
  }
  return <div className="brief-workspace"><header className="showcase-heading"><div><div className="console-eyebrow"><FileText size={15}/> Synthetic review workflow</div><h1>Planning briefs</h1>
    <p>{role==="planner"?"Capture a district-level question for prevention planning.":"Summarize a forecast for human review. Save and export locally; nothing is sent."}</p></div></header>
    <div className="brief-grid">
    <section className="paper brief-context" aria-label="Forecast in this brief">
      <div className="console-eyebrow">Forecast in this brief</div><h2>{title(draft)}</h2>
      {preview&&<p className="evidence-window">{forecastWindow(preview)} · {draft.horizon_days} days</p>}
      <ForecastEstimate forecast={preview}/>
      <p className="small">Synthetic snapshot. An export uses the matching aggregate available when you export.</p>
      {onModel&&<button className="console-button quiet-action" onClick={()=>onModel(selectionOf(draft),draft.horizon_days)}><ArrowLeft size={15}/> Review this forecast</button>}
    </section>
    <section className="paper"><h2>{edit?"Edit brief":"Draft a brief"}</h2>
      <p>{role==="planner"?"Forecasts do not establish who needs care or where a service should be placed. Independent needs and capacity evidence matters.":
        "Use the structured fields to record what the synthetic forecast supports and a next step. Nothing is sent automatically."}</p>
      <form className="brief-form" onSubmit={e=>{e.preventDefault();void write();}}>
        <label>Brief district<select value={draft.district} onChange={e=>setDraft({...draft,district:e.target.value,connection:null})}>{options(DISTRICTS)}</select></label>
        {role==="analyst" && <label>Brief connection<select value={draft.connection||""} onChange={e=>{
          const c=choices.find(r=>r.connection!.join("|")===e.target.value)?.connection;
          setDraft({...draft,connection:c?c.join("|"):null,district:c?c[1]:draft.district});}}>
          <option value="">District only</option>{choices.map(r=><option key={r.connection!.join("|")} value={r.connection!.join("|")}>{r.connection!.join(" → ")}</option>)}</select></label>}
        <label>Brief horizon<select value={draft.horizon_days} onChange={e=>setDraft({...draft,horizon_days:Number(e.target.value) as 7|28})}>
          <option value={7}>7 days</option><option value={28}>28 days</option></select></label>
        <label>Assessment<select value={draft.assessment} onChange={e=>setDraft({...draft,assessment:e.target.value})}>{options(ASSESSMENTS)}</select></label>
        <label>Suggested follow-up<select value={draft.next_step} onChange={e=>setDraft({...draft,next_step:e.target.value})}>{options(NEXT_STEPS)}</select></label>
        <div className="brief-form-actions"><button className="console-button solid" disabled={busy}>Save brief</button>
          {edit && <button type="button" className="console-button quiet-action" onClick={()=>{setEdit(null);setDraft(blank(selection,horizon,role));setMessage("");}}>New brief</button>}</div>
      </form>
      {message && <p role="status" className="notice">{message}</p>}{error && <p role="alert" className="notice">{error}</p>}
    </section></div>
    <section className="paper"><h2>Saved {role} briefs</h2>
      <p className="small">Exports contain only synthetic aggregates and these structured selections, no case records or leads.</p>
      {saved.length===0&&<p className="small">No briefs saved yet.</p>}
      {saved.map(i=><div className="saved-brief" key={i.id}><div><strong>{title(i)} · {i.horizon_days} days</strong><br/>
        <small>{i.assessment} · {i.next_step}</small></div><div className="form-row">
          <button onClick={()=>{const {district,assessment,next_step,horizon_days,role,connection}=i;setDraft({district,assessment,next_step,horizon_days,role,connection});
            setEdit(i.id);setMessage("");}}>Edit</button>
          <button onClick={()=>exportBrief(i,"json")}>Export JSON</button><button onClick={()=>exportBrief(i,"html")}>Export HTML</button></div></div>)}
    </section>
  </div>;
}
