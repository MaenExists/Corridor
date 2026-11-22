import { ArrowUpRight, Files, Info, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Observation } from "../Evidence";
import type { Cases } from "../data";
import { Badge } from "./Atlas";
import { observedCases, pairLabel } from "./model";
import type { MapRecord } from "./model";

export function RecordDialog({selected,close}:{selected:{row:MapRecord;cutoff:string};close:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current;if(!dialog)return;dialog.showModal();return()=>dialog.close();
  },[]);
  return <dialog ref={ref} className="modal record-modal companion-support" onCancel={close}
    onClick={e=>{if(e.target===e.currentTarget)close();}} aria-label="Fictional observation details">
    <div className="modal-head"><h2>Evidence record</h2><button aria-label="Close dialog" onClick={close}><X size={18}/></button></div>
    <Observation row={selected.row.row} cutoff={selected.cutoff} close={close}/>
  </dialog>;
}

export function Library({data,initialQuery,onCase}:{data:Cases;initialQuery:string;onCase:(row:MapRecord,cutoff:string)=>void}) {
  const [query,setQuery]=useState(initialQuery);
  const [status,setStatus]=useState("all");
  const [page,setPage]=useState(0);
  const archive=useMemo(()=>observedCases(data,data.as_of),[data]);
  const records=archive.filter(r=>(status==="all" || r.status===status) &&
    `${r.id} ${r.district} ${r.connection?pairLabel(r.connection):""} ${r.substance} ${r.row.substance_category ?? ""} ${r.row.source_ref.map(x=>x.ref).join(" ")}`
      .toLowerCase().includes(query.trim().toLowerCase()));
  const pages=Math.max(1,Math.ceil(records.length/15));
  return <div className="content-page">
    <div className="page-heading"><div><div className="location-kicker"><Files size={14}/> Source register</div><h1>Nothing without a source.</h1>
      <p>Inspect fictional provenance, reporting dates, geographic precision and simulated review history.</p></div></div>
    <div className="library-tools"><div className="searchbox"><Search size={16}/><input aria-label="Search evidence library" placeholder="Source ID, district, connection or substance"
      value={query} onChange={e=>{setPage(0);setQuery(e.target.value);}}/></div>
      <select aria-label="Library evidence status" value={status} onChange={e=>{setPage(0);setStatus(e.target.value);}}>
        <option value="all">All evidence</option><option value="documented">Reviewed fixture</option><option value="unreviewed">Reported fixture</option>
      </select><button onClick={()=>{setQuery("");setStatus("all");setPage(0);}}>Reset filters</button><span>{records.length} synthetic records</span>
    </div>
    <section className="panel"><div className="table-wrap"><table className="record-table">
      <thead><tr><th>Source reference</th><th>District / known connection</th><th>Event / available</th><th>Substance</th><th>Evidence</th><th>Inspect</th></tr></thead>
      <tbody>{records.slice(page*15,(page+1)*15).map(r=><tr key={r.id}><td><button className="source-link" onClick={()=>onCase(r,data.as_of)}>{r.id}</button>
          <small>Fictional source</small></td><td><strong>{r.district}</strong><small>{r.connection?pairLabel(r.connection):"Seizure observation only"}</small></td>
        <td>{r.eventDate}<small>{r.availableDate}</small></td><td>{r.row.substance_category??"Unknown"}<small>{r.row.quantity==null?"Unknown weight":`${r.row.quantity} ${r.row.unit}`}</small></td>
        <td><Badge row={r}/></td><td><button aria-label={`Inspect ${r.id}`} onClick={()=>onCase(r,data.as_of)}><ArrowUpRight size={15}/></button></td></tr>)}</tbody>
    </table>{!records.length&&<div className="empty-state"><Files size={28}/><h3>No matching source records</h3><p>Try another district or reset filters.</p></div>}</div>
      <div className="pagination"><span>Page {page+1} of {pages}</span><button disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button>
        <button disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)}>Next</button></div>
    </section>
    <div className="inspector-note"><Info size={16}/><p>No records can be imported here. Fictional records are generated offline and real aggregates use a separate browser-only view.</p></div>
  </div>;
}
