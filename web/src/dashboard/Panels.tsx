import { Activity, ArrowRight, CheckCircle2, CircleAlert, FlaskConical, Info, TriangleAlert } from "lucide-react";
import { useState } from "react";
import geography from "../../../shared/geography.json";
import type { QueueItem } from "../../../shared/workspace";
import { dateLabel } from "../data";
import { REGIONS } from "./metrics";
import type { Overview } from "./metrics";

export const scenarios = ["Reporting volume", "Reporting delay", "Review backlog"] as const;
export type ScenarioPreset = typeof scenarios[number];

export function KeralaMark({className=""}:{className?:string}) {
  const path=geography.outline.map(([lat,lon])=>`${(lon-74.5)*29+5},${(12.95-lat)*24+2}`).join(" ");
  return <svg viewBox="0 0 91 118" className={className} aria-hidden>
    <polygon points={path} fill="#1a5d58" fillOpacity=".65" stroke="#57e8d5" strokeWidth="1.6"/>
    <path d="m24 15 17 18-2 15 16 10-3 13 13 9M34 36l-3 10 14 10m8 18-4 7 17 8-2 14" stroke="#68e4cd" strokeOpacity=".7" fill="none" strokeWidth=".8"/>
  </svg>;
}

export const stateMeta = {
  new: { label:"Awaiting review", tone:"coral", icon:CircleAlert },
  possible_duplicate: { label:"Possible duplicate", tone:"amber", icon:TriangleAlert },
  verified: { label:"Verified fixture", tone:"teal", icon:CheckCircle2 },
  rejected: { label:"Rejected fixture", tone:"blue", icon:Info },
};
export function Alerts({items,open,unavailable=false}:{items:QueueItem[];open:()=>void;unavailable?:boolean}) {
  return <section className="console-card console-alerts">
    <header className="console-card-head"><div><Activity size={18} className="tone-amber"/><h2>Fixture review</h2></div>
      <button className="console-link" onClick={open}>Open inbox <ArrowRight size={13}/></button></header>
    {items.length ? <div className="console-alert-list">{items.slice(0,3).map(item=>{
      const {tone,icon:Icon,label}=stateMeta[item.status];
      return <button key={item.id} className={`console-alert tone-${tone}`} onClick={open}>
        <Icon size={19}/><span><strong>{label}</strong><small>{item.title.replace(/^\[FICTIONAL\]\s*/,"")}</small></span>
        <time dateTime={item.publication_date}>{dateLabel(item.publication_date).replace(/ \d{4}$/,"")}</time></button>;
    })}</div>:<p className="console-empty">{unavailable?"Local fixture review is unavailable. Start make demo.":"No review items in the local queue yet."}</p>}
  </section>;
}

export function Trends({monthly,open}:{monthly:Overview["monthly"];open:()=>void}) {
  const [span,setSpan]=useState(3);
  const shown=monthly.slice(-span);
  const top=Math.max(20,Math.ceil(Math.max(...shown.flatMap(m=>m.regions))/20)*20);
  const width=246, height=103, bottom=height+9;
  const x=(i:number)=>35+(i/(shown.length-1))*width;
  const y=(n:number)=>bottom-n/top*height;
  return <section className="console-card console-trend">
    <header className="console-card-head"><div><h2>Monthly documented reports</h2></div>
      <select aria-label="Trend months" className="console-select bare" value={span} onChange={e=>setSpan(Number(e.target.value))}>
        <option value={3}>3 months</option><option value={6}>6 months</option></select></header>
    <div className="console-chart-plate">
      <svg viewBox="0 0 299 138" role="img" aria-label={`Monthly fictional case counts for north, central and south Kerala across ${span} months`}>
        {[0,.25,.5,.75,1].map(v=><g key={v}><line x1="31" x2="283" y1={y(top*v)} y2={y(top*v)} stroke="#23343d" strokeWidth=".65"/>
          <text x="23" y={y(top*v)+3} textAnchor="end">{Math.round(top*v)}</text></g>)}
        {shown.map((m,i)=><g key={m.key}><line x1={x(i)} x2={x(i)} y1="11" y2={y(0)} stroke="#23343d" strokeWidth=".6"/>
          <text x={x(i)} y="129" textAnchor="middle">{m.label}{m.partial?"*":""}</text></g>)}
        {REGIONS.map((r,j)=><g key={r.name}><polyline points={shown.map((m,i)=>`${x(i)},${y(m.regions[j])}`).join(" ")}
          fill="none" stroke={r.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          {shown.map((m,i)=><circle key={m.key} cx={x(i)} cy={y(m.regions[j])} r="3.1" fill={r.color}><title>{r.name}: {m.regions[j]} reports, {m.key}</title></circle>)}</g>)}
      </svg>
      <div className="console-chart-legend">{REGIONS.map(r=><span key={r.name}><i style={{background:r.color}}/>{r.name}</span>)}</div>
    </div>
    <footer className="console-chart-footer">{shown.at(-1)?.partial&&<small>* Latest month is partial</small>}
      <button className="console-link" onClick={open}>View model <ArrowRight size={11}/></button></footer>
  </section>;
}

export function ScenarioPreview({open}:{open:(preset?:ScenarioPreset)=>void}) {
  return <section className="console-card console-scenario-preview">
    <header className="console-card-head"><div><FlaskConical size={19} className="tone-teal"/><h2>Reporting what-ifs</h2></div>
      <button className="console-button outline small" onClick={()=>open()}>Open scenarios <ArrowRight size={13}/></button></header>
    <p>Explore how changes in reporting might affect documented counts. This does not estimate intervention outcomes.</p>
    <div className="console-chips">{scenarios.map(s=><button key={s} onClick={()=>open(s)}>{s}</button>)}</div>
  </section>;
}
