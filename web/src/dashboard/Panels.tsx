import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Atom, ChartNoAxesCombined, CheckCircle2, CircleAlert, FlaskConical, Info,
  Lightbulb, Network, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import geography from "../../../shared/geography.json";
import type { QueueItem } from "../../../shared/workspace";
import { dateLabel } from "../data";
import { compactCount, REGIONS, shiftLabel } from "./metrics";
import type { Delta, Horizon, Overview } from "./metrics";

export const scenarios = ["Reporting volume", "Reporting delay", "Review backlog"] as const;
export type ScenarioPreset = typeof scenarios[number];

export function KeralaMark({className="",regions=false}:{className?:string;regions?:boolean}) {
  const path=geography.outline.map(([lat,lon])=>`${(lon-74.5)*29+5},${(12.95-lat)*24+2}`).join(" ");
  return <svg viewBox="0 0 91 118" className={className} aria-hidden>
    {regions&&<defs><linearGradient id="region-stripes" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#379b91"/><stop offset=".30" stopColor="#379b91"/><stop offset=".31" stopColor="#2c657e"/>
      <stop offset=".67" stopColor="#2c657e"/><stop offset=".68" stopColor="#328367"/><stop offset="1" stopColor="#328367"/>
    </linearGradient></defs>}
    <polygon points={path} fill={regions?"url(#region-stripes)":"#1a5d58"} fillOpacity={regions?.69:.65}
      stroke={regions?"#65a99d":"#57e8d5"} strokeWidth={regions?.75:1.6}/>
    {!regions&&<path d="m24 15 17 18-2 15 16 10-3 13 13 9M34 36l-3 10 14 10m8 18-4 7 17 8-2 14" stroke="#68e4cd" strokeOpacity=".7" fill="none" strokeWidth=".8"/>}
  </svg>;
}

function Spark({ series }: {series:number[]}) {
  const lo=Math.min(...series), span=Math.max(1,Math.max(...series)-lo);
  const points=series.map((n,i)=>`${i/(series.length-1)*106},${28-21*(n-lo)/span}`).join(" ");
  return <svg className="console-spark" viewBox="0 0 106 32" aria-hidden>
    <polygon points={`0,32 ${points} 106,32`} fill="currentColor" opacity=".09"/>
    <polyline points={points} stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function Change({ value }: {value:Delta}) {
  const Icon=(value.percent??0)<0?ArrowDownRight:ArrowUpRight;
  return <div className="console-stat-change"><strong>{value.percent!==null && value.percent!==0 && <Icon size={14}/>} {shiftLabel(value.percent)}</strong>
    <span>vs previous window</span></div>;
}

export function StatCards({stats,horizon}:{stats:Overview;horizon:Horizon}) {
  const support=stats.support;
  return <div className="console-stat-grid">
    <section className="console-card console-stat teal"><header><Network size={22}/><h2>Network activity</h2></header>
      <div className="console-stat-main"><div><strong>{stats.connections.length}</strong><span>Documented connections</span></div><Change value={stats.connectionDelta}/></div>
      <Spark series={stats.monthly.map(v=>v.connections)}/></section>
    <section className="console-card console-stat coral"><header><TriangleAlert size={22}/><h2>Observed signals</h2></header>
      <div className="console-stat-main"><div><strong>{compactCount(stats.recordDelta.current)}</strong><span>Fictional reports</span></div><Change value={stats.recordDelta}/></div>
      <Spark series={stats.monthly.map(v=>v.records)}/></section>
    <section className="console-card console-stat amber"><header><Atom size={22}/><h2>Emerging patterns</h2></header>
      <div className="console-stat-main"><div><strong>{stats.changes.length}</strong><span>Reporting increases</span></div>
        <div className="console-stat-change"><strong>≥25% higher</strong><span>with ≥3 more reports</span></div></div></section>
    <section className="console-card console-stat teal"><header><ShieldCheck size={22}/><h2>Forecast support</h2></header>
      <div className="console-stat-main"><div><strong>{support===null?"—":`${Math.round(support*100)}%`}</strong><span>{stats.issued} of {stats.total} districts issued</span></div>
        <div className="console-stat-change"><strong>{horizon} days</strong><span>Not model accuracy</span></div></div>
      <div className="console-stat-meter" aria-hidden><i style={{width:`${100*(support??0)}%`}}/></div></section>
  </div>;
}

export const stateMeta = {
  new: { label:"Awaiting review", tone:"coral", icon:CircleAlert },
  possible_duplicate: { label:"Possible duplicate", tone:"amber", icon:TriangleAlert },
  verified: { label:"Verified fixture", tone:"teal", icon:CheckCircle2 },
  rejected: { label:"Rejected fixture", tone:"blue", icon:Info },
};
export function Alerts({items,open,unavailable=false}:{items:QueueItem[];open:()=>void;unavailable?:boolean}) {
  return <section className="console-card console-alerts">
    <header className="console-card-head"><div><Activity size={19} className="tone-coral"/><h2>Recent alerts</h2></div>
      <button className="console-link" onClick={open}>View all <ArrowRight size={13}/></button></header>
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
    <header className="console-card-head"><div><h2>Reported activity trend</h2></div>
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
      <button className="console-link" onClick={open}>View lab <ArrowRight size={11}/></button></footer>
  </section>;
}

export function RegionOverview({stats}:{stats:Overview}) {
  const total=Math.max(1,stats.regionTotals.reduce((a,r)=>a+r.current,0));
  return <section className="console-card console-regions">
    <header className="console-card-head"><div><ChartNoAxesCombined size={17} className="tone-teal"/><h2>Corridor overview</h2></div>
      <small>Share of reports</small></header>
    <div className="console-region-body"><KeralaMark regions className="console-region-mark"/>
      <div>{REGIONS.map((region,i)=>{
        const r=stats.regionTotals[i], share=Math.round(r.current/total*100);
        return <div className="console-region-row" key={region.name}><span>{region.name} Kerala</span>
          <div><i style={{ width:`${share}%`,background:region.color }}/></div><strong>{share}%</strong>
          {(r.percent??0)<0?<ArrowDownRight size={12} className="tone-coral"/>:<ArrowUpRight size={12} className="tone-teal"/>}</div>;
      })}</div></div>
  </section>;
}

export function Insights({stats,district}:{stats:Overview;district:string}) {
  const biggest=stats.changes[0];
  return <section className="console-card console-insights">
    <header className="console-card-head"><div><Lightbulb size={18} className="tone-amber"/><h2>Key insights</h2></div></header>
    <ul><li>{biggest?<>{biggest[0]} has <b>{shiftLabel(biggest[1].percent)}</b> more reports than the preceding 28 days.</>:
      <>No district crossed the reporting-increase rule in the current snapshot.</>}</li>
      <li>{district}: <b>{stats.districts[district].current}</b> documented fictional reports in the latest 28 days.</li>
      <li>{stats.total-stats.issued} district forecasts withheld. Reporting and enforcement can affect what is documented.</li></ul>
  </section>;
}

export function ScenarioPreview({open}:{open:(preset?:ScenarioPreset)=>void}) {
  return <section className="console-card console-scenario-preview">
    <header className="console-card-head"><div><FlaskConical size={19} className="tone-teal"/><h2>Scenario planning</h2></div>
      <button className="console-button outline small" onClick={()=>open()}>Run simulation <ArrowRight size={13}/></button></header>
    <p>Explore how changes in reporting might affect documented counts. This does not estimate intervention outcomes.</p>
    <div className="console-chips">{scenarios.map(s=><button key={s} onClick={()=>open(s)}>{s}</button>)}</div>
  </section>;
}
