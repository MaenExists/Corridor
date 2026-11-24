import { useCallback, useEffect, useState } from "react";
import type { QueueItem } from "../../shared/workspace";
import { dateLabel, localJSON } from "./data";

export function reviewHeaders(key: string): HeadersInit {
  return { "Content-Type": "application/json", "X-Corridor-Review-Key": key };
}
export function ReviewKey({ value, change }: { value:string;change:(v:string)=>void }) {
  return <label className="review-key">Local analyst review key<input type="password" value={value}
      placeholder="Printed in the demo terminal" autoComplete="off" onChange={e=>change(e.target.value)}/></label>;
}
type History = { id:string; subject_id:string; state:string; recorded_at:string; reviewer_role:string };
const stateLabel = { new:"Awaiting review", possible_duplicate:"Possible duplicate", verified:"Verified fixture", rejected:"Rejected" };

export function Inbox({ reviewKey, setKey, refresh }: { reviewKey:string;setKey:(key:string)=>void;refresh:()=>Promise<void> }) {
  const [items,setItems] = useState<QueueItem[]>([]);
  const [history,setHistory] = useState<History[]>([]);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const reload=useCallback(async()=>{
    const data=await localJSON<{synthetic:boolean;items:QueueItem[];history:History[]}>("/api/review-queue");
    if(data.synthetic!==true) throw new Error("Unexpected inbox track.");
    setItems(data.items);setHistory(data.history);
  },[]);
  useEffect(()=>{reload().catch(()=>setError("Start make demo to load the local fixture queue."));},[reload]);
  async function review(id:string,status:"verified"|"rejected") {
    setError("");setMessage("");setBusy(true);
    try {
      const result=await localJSON<{verified_at:string|null}>(`/api/review-queue/${id}`,{method:"PATCH",headers:reviewHeaders(reviewKey),body:JSON.stringify({status})});
      setMessage(result.verified_at ? `Verified at ${result.verified_at.slice(0,16)} UTC. Run make refresh to include it in new evidence.` : "Fixture rejected.");
      await reload();
    } catch(err){setError(err instanceof Error?err.message:"Could not save review.");}
    finally{setBusy(false);}
  }
  return <><div className="workspace-header"><div><div className="section-kicker">Synthetic review tools</div><h1>News inbox</h1>
    <p>Local RSS and Atom fixtures only. Nobody is reported to authorities.</p></div></div>
    <section className="paper"><p>A repeat headline is not a second source. A verified fictional cue is eligible only from its review timestamp. Reviews do not create case labels or retrain the model.</p>
      <div className="form-row"><ReviewKey value={reviewKey} change={setKey}/><button onClick={()=>refresh().then(()=>setMessage("Forecast file reloaded.")).catch(()=>setError("Could not reload forecast file."))}>Reload forecasts</button></div>
      {message && <p role="status" className="notice">{message}</p>}{error && <p role="alert" className="notice">{error}</p>}
    </section>
    {items.length===0 && <p>No fixtures yet. Start with <code>make demo</code>.</p>}
    <div className="queue-list">{items.map(r=><article className="paper" key={r.id}>
      <div className="queue-head"><span className="state-label">{stateLabel[r.status]}</span><span className="small">{r.district}</span></div>
      <h3>{r.title}</h3><p className="small">{r.source} · {r.source_ref}</p>
      <dl className="fact-list"><div><dt>Event</dt><dd>{r.event_date? dateLabel(r.event_date):"Unknown"}</dd></div>
        <div><dt>Publication</dt><dd>{dateLabel(r.publication_date)}</dd></div><div><dt>First seen locally</dt><dd>{r.first_seen_at.slice(0,16)} UTC</dd></div></dl>
      {r.duplicate_of && <p className="notice">Possible copy of {items.find(f=>f.id===r.duplicate_of)?.source || "another fixture"}. It cannot be verified independently here.</p>}
      {history.filter(h=>h.subject_id===r.id).map(h=><p className="small" key={h.id}>{h.state} by {h.reviewer_role}, {h.recorded_at.slice(0,16)} UTC</p>)}
      {["new","possible_duplicate"].includes(r.status) && <div className="form-row">
        {r.status==="new" && <button disabled={busy || !reviewKey || !r.event_date} onClick={()=>review(r.id,"verified")}>Verify fixture</button>}
        <button disabled={busy || !reviewKey} onClick={()=>review(r.id,"rejected")}>Reject</button></div>}
    </article>)}</div>
  </>;
}
