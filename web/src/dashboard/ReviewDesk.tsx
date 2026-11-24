import { Activity, ArrowRight, Bell, CalendarDays, ClipboardList, ExternalLink, FileText, Info, LockKeyhole,
  MapPin, MessageCircle, Search, Send, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { LEAD_CATEGORIES, WORKSPACE_NOTES } from "../../../shared/workspace";
import type { QueueItem, WorkspaceNote } from "../../../shared/workspace";
import { dateLabel, DISTRICTS, localJSON } from "../data";
import { reviewHeaders } from "../Review";
import { stateMeta } from "./Panels";

const headers={"Content-Type":"application/json"};
const err=(e:unknown)=>e instanceof Error?e.message:"Local service is unavailable.";
const opts=(values:readonly string[])=>values.map(d=><option key={d}>{d}</option>);
function Course({idx,text}:{idx:number;text:string}) {
  return <div><span>{idx}</span>{text}</div>;
}
export function Reporting({district}:{district:string}) {
  const [tab,setTab]=useState<"submit"|"track">("submit");
  const [category,setCategory]=useState("");
  const [place,setPlace]=useState(district);
  const [receipt,setReceipt]=useState("");
  const [state,setState]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{setPlace(district);},[district]);
  async function submit() {
    setError("");setMessage("");setBusy(true);
    try {
      const r=await localJSON<{synthetic:boolean;receipt:string}>("/api/leads",{method:"POST",headers,body:JSON.stringify({district:place,category})});
      if(!r.synthetic)throw Error("Unexpected report track.");
      setReceipt(r.receipt);setState("");setMessage("Practice report stored locally. Save this receipt to check its status.");
    } catch(e){setError(err(e));}finally{setBusy(false);}
  }
  async function track() {
    setError("");setMessage("");setState("");setBusy(true);
    try {
      const r=await localJSON<{synthetic:boolean;status:string}>("/api/lead-status",{method:"POST",headers,body:JSON.stringify({receipt:receipt.trim().toLowerCase()})});
      if(!r.synthetic)throw Error("Unexpected report track.");
      setState(r.status==="new"?"Received":r.status==="reviewed"?"Reviewed":"Closed");
    } catch(e){setError(err(e));}finally{setBusy(false);}
  }
  return <section className="console-card console-reporting">
    <header className="console-card-head"><div><UsersRound size={21} className="tone-teal"/><h2>Practice reporting</h2></div><span className="console-tag">Local only</span></header>
    <p>Try the reporting flow without submitting a real allegation.</p>
    <div className="console-subtabs"><button aria-pressed={tab==="submit"} onClick={()=>{setTab("submit");setError("");}}><Send size={14}/> Submit a report</button>
      <button aria-pressed={tab==="track"} onClick={()=>{setTab("track");setError("");setMessage("");}}><Search size={14}/> Track a report</button></div>
    {tab==="submit"?<form className="console-fields" onSubmit={e=>{e.preventDefault();void submit();}}>
      <label>Report category<select required value={category} onChange={e=>setCategory(e.target.value)}>
        <option value="" disabled>Select a practice category</option>{opts(LEAD_CATEGORIES)}</select></label>
      <label>District<select value={place} onChange={e=>setPlace(e.target.value)}>{opts(DISTRICTS)}</select></label>
      <p className="console-form-note"><LockKeyhole size={13}/> No photos, addresses or personal details. Stored locally and not sent to an agency. Not an anonymous reporting service.</p>
      <button type="submit" className="console-button solid" disabled={!category||busy}>Submit practice report <ArrowRight size={14}/></button>
    </form>:<form className="console-fields" onSubmit={e=>{e.preventDefault();void track();}}>
      <label>Full receipt code<input value={receipt} onChange={e=>{setReceipt(e.target.value);setState("");}} autoComplete="off" placeholder="Paste your practice receipt" maxLength={36}/></label>
      <button type="submit" className="console-button outline" disabled={receipt.trim().length!==36||busy}>Check status <ArrowRight size={14}/></button>
      {state&&<p role="status" className="console-inline-message">Report status: <strong>{state}</strong></p>}
    </form>}
    {error&&<p role="alert" className="console-inline-message danger">{error}</p>}
    {message&&<div role="status" className="console-inline-message"><p>{message}</p><code>{receipt}</code></div>}
    <div className="console-how"><h3>How it works</h3>
      <Course idx={1} text="Your practice report is stored"/>
      <Course idx={2} text="An analyst can review it locally"/>
      <Course idx={3} text="Check the receipt for status"/>
    </div>
    <div className="console-report-foot"><ShieldCheck size={18}/><p>A report is not proof of wrongdoing. Practice reports never affect forecasts.</p></div>
  </section>;
}

export function AnalystHub({items,district,reviewKey,setReviewKey,openQueue,openBriefs}:{
  items:QueueItem[];district:string;reviewKey:string;setReviewKey:(s:string)=>void;openQueue:()=>void;openBriefs:()=>void;
}) {
  const [tab,setTab]=useState<"activity"|"queue"|"briefs">("activity");
  const [note,setNote]=useState<string>(WORKSPACE_NOTES[0]);
  const [notes,setNotes]=useState<WorkspaceNote[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [unlocked,setUnlocked]=useState(false);
  useEffect(()=>{setNotes([]);setUnlocked(false);setError("");},[reviewKey]);
  async function load() {
    setError("");setBusy(true);
    try {
      const r=await localJSON<{synthetic:boolean;items:WorkspaceNote[]}>("/api/workspace-notes",{headers:reviewHeaders(reviewKey)});
      if(!r.synthetic)throw Error("Unexpected workspace track.");
      setNotes(r.items);setUnlocked(true);
    } catch(e){setError(err(e));}finally{setBusy(false);}
  }
  async function add() {
    setError("");setBusy(true);
    try {
      const r=await localJSON<{synthetic:boolean;item:WorkspaceNote}>("/api/workspace-notes",{
        method:"POST",headers:reviewHeaders(reviewKey),body:JSON.stringify({district,note})
      });
      if(!r.synthetic)throw Error("Unexpected workspace track.");
      setNotes(old=>[r.item,...old]);
    } catch(e){setError(err(e));}finally{setBusy(false);}
  }
  return <section className="console-card console-hub">
    <header className="console-card-head"><div><ShieldCheck size={22} className="tone-teal"/><h2>Analyst hub</h2></div><span className="console-tag dot">Local demo</span></header>
    <p>Review workspace · not connected to an agency</p>
    <div className="console-subtabs">
      <button aria-pressed={tab==="activity"} onClick={()=>setTab("activity")}><MessageCircle size={14}/> Activity</button>
      <button aria-pressed={tab==="queue"} onClick={()=>setTab("queue")}><Bell size={14}/> Queue</button>
      <button aria-pressed={tab==="briefs"} onClick={()=>setTab("briefs")}><FileText size={14}/> Briefs</button>
    </div>
    {tab==="activity"&&<>
      <div className="console-hub-channel"><span><Activity size={14}/> Kerala / Local review</span><small>{items.filter(i=>i.status==="new"||i.status==="possible_duplicate").length} pending</small></div>
      <div className="console-activity-list">
        {notes.length?notes.map(n=><article key={n.id}><span className="console-activity-avatar"><ShieldCheck size={17}/></span>
          <div><header><strong>Analyst note</strong><time>{dateLabel(n.created_at)}</time></header><p>{n.note}</p><small>{n.district} · synthetic workspace</small></div></article>):
          <article><span className="console-activity-avatar"><Info size={17}/></span><div><header><strong>Workspace notice</strong></header>
            <p>{unlocked?"No notes yet. Choose a structured note below.":"Use the local review key to open the practice activity log."}</p>
            <small>No external messaging or real operational records</small></div></article>}
        {!unlocked&&items.length>0&&<article><span className="console-activity-avatar"><Bell size={16}/></span><div>
          <header><strong>Fixture inbox</strong><time>{dateLabel(items[0].publication_date)}</time></header>
          <p>{items[0].title.replace(/^\[FICTIONAL\]\s*/,"")}</p><small>From the local review queue</small></div></article>}
        {!unlocked&&<article><span className="console-activity-avatar"><FileText size={16}/></span><div>
          <header><strong>Planning briefs</strong></header><p>Prepare a documented-count summary for human review.</p>
          <button className="console-link" onClick={openBriefs}>Browse briefs <ArrowRight size={11}/></button></div></article>}
      </div>
      {unlocked?<form className="console-compose" onSubmit={e=>{e.preventDefault();void add();}}>
        <label><span className="console-sr">Review note</span><select aria-label="Review note" value={note} onChange={e=>setNote(e.target.value)}>{opts(WORKSPACE_NOTES)}</select></label>
        <button type="submit" aria-label="Add review note" className="console-button solid" disabled={busy}><Send size={16}/></button>
      </form>:<form className="console-compose" onSubmit={e=>{e.preventDefault();void load();}}>
        <label><span className="console-sr">Hub review key</span><input type="password" value={reviewKey} placeholder="Local review key"
          autoComplete="off" onChange={e=>setReviewKey(e.target.value)}/></label>
        <button type="submit" className="console-button outline" disabled={busy||!reviewKey}>Open <ArrowRight size={13}/></button>
      </form>}
    </>}
    {tab==="queue"&&<div className="console-hub-other">
      <p><ClipboardList size={17}/> {items.length} fictional items in the local review queue.</p>
      <button className="console-button outline" onClick={openQueue}>Open review inbox <ExternalLink size={14}/></button>
    </div>}
    {tab==="briefs"&&<div className="console-hub-other">
      <p><CalendarDays size={17}/> Draft and export aggregate synthetic forecasts without sharing case records.</p>
      <button className="console-button outline" onClick={openBriefs}>Open planning briefs <ExternalLink size={14}/></button>
    </div>}
    {error&&<p className="console-inline-message danger" role="alert">{error}</p>}
  </section>;
}

export function ReviewSummary({items,open}:{items:QueueItem[];open:()=>void}) {
  return <section className="console-card console-review-summary"><header className="console-card-head">
    <div><ClipboardList size={17} className="tone-teal"/><h2>Recent review items</h2></div><button className="console-link" onClick={open}>View all <ArrowRight size={13}/></button></header>
    {items.slice(0,3).map(i=>{const {label,tone,icon:Icon}=stateMeta[i.status];return <button className="console-review-row" key={i.id} onClick={open}>
      <Icon size={17} className={`tone-${tone}`}/><span>{i.title.replace(/^\[FICTIONAL\]\s*/,"")}<small><MapPin size={11}/>{i.district}</small></span>
      <em className={`tone-${tone}`}>{label}</em></button>;})}
    {!items.length&&<p className="console-empty">No fixture reports in the queue.</p>}
  </section>;
}
