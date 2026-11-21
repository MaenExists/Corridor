import { useState } from "react";
import { dateLabel, DISTRICTS, METHODS, methodName, pct } from "./data";
import type { Coverage, Evaluation } from "./data";

export const REAL_LABEL = "REAL DATA (publicly reported cases): aggregate results only";
export const REAL_UNIVERSE = "Publicly reported seizures (news + High Court judgments). A small, selective sample, not all cases. Not operational accuracy.";
type Month = Coverage["months"][number];
type RealMetrics = {horizon_days:7|28; distinct_event_support:number; windows:number; metrics:Record<string,number|null>};
type RealRow = { district:string; cases:number|null; ratios:{year:number;ratio:number|null}[]; metrics:RealMetrics[] };
type RealResult = { minimum:number; coverageFloor:number; districts:RealRow[]; months:Month[]; data_cutoff:string; generated_at:string };
const record = (v:unknown):Record<string,unknown>|null => v!==null && typeof v==="object" && !Array.isArray(v) ?
  v as Record<string,unknown> : null;
const count = (v:unknown):v is number => typeof v==="number" && Number.isSafeInteger(v) && v>=0;
const scalar = (v:unknown):v is number => typeof v==="number" && Number.isFinite(v) && v>=0;
const validDate = (v:unknown):v is string => typeof v==="string" && /^\d{4}-\d\d-\d\d(T[\d:.]+(Z|[+-]\d\d:\d\d))?$/.test(v) && Number.isFinite(Date.parse(v));
const exact = (v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));

export function decodeRealAggregate(input: unknown): RealResult {
  const obj=record(input);
  const fail=()=>new Error("Choose the reviewed reports/real/ui_aggregate.json file. Raw or unrecognised records are not accepted.");
  if(!obj || obj.synthetic!==false || obj.schema!=="corridor-real-aggregate-v1" ||
    !exact(obj,["schema","synthetic","label","universe","minimum_group","districts","generated_at","data_cutoff","coverage_minimum","months"])
    || !count(obj.minimum_group) || obj.minimum_group>1000 || !Array.isArray(obj.districts) || obj.districts.length>14 ||
    !validDate(obj.data_cutoff) || !validDate(obj.generated_at)) throw fail();
  const minimum=Math.max(5,obj.minimum_group), seen=new Set<string>();
  const districts=obj.districts.map((raw:unknown):RealRow=>{
    const r=record(raw);
    if(!r || !exact(r,["district","cases","metrics","ratios"]) || typeof r.district!=="string" || !DISTRICTS.includes(r.district) ||
      seen.has(r.district) || !Array.isArray(r.metrics) || r.metrics.length>2) throw fail();
    seen.add(r.district);
    const cases=count(r.cases) && r.cases>=minimum?r.cases:null;
    const metrics:RealMetrics[]=[];
    for(const v of r.metrics) {
      const s=record(v), m=record(s?.metrics);
      if(!s||!m||!exact(s,["horizon_days","distinct_event_support","windows","metrics"])||
        !(s.horizon_days===7 || s.horizon_days===28) || !exact(m,Object.keys(METHODS))) throw fail();
      if(!count(s.distinct_event_support) || s.distinct_event_support<minimum || !count(s.windows) || s.windows<minimum || cases===null)continue;
      metrics.push({horizon_days:s.horizon_days,distinct_event_support:s.distinct_event_support,windows:s.windows,
        metrics:Object.fromEntries(Object.keys(METHODS).map(k=>[k,scalar(m[k])?m[k]:null]))});
    }
    const ratios=Array.isArray(r.ratios)?r.ratios.slice(0,40).map(record).filter(y=>y && exact(y,["year","ratio","observed_cases"])&&
      count(y.year)&&y.year>=1990&&y.year<=2100&&count(y.observed_cases)&&y.observed_cases>=minimum)
      .map(y=>({year:y!.year as number,ratio:cases!==null && scalar(y!.ratio)?y!.ratio:null})):[];
    return {district:r.district,cases,ratios,metrics};
  });
  const months:Month[]=Array.isArray(obj.months) ? obj.months.slice(0,480).map(record).flatMap(r=>{
    if(!r||!exact(r,["month","articles","mix_change","possible_break","campaign"]) || typeof r.month!=="string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month))return [];
    const n=count(r.articles)&&r.articles>=minimum?r.articles:null;
    return [{month:r.month,articles:n,mix_change:n!==null&&r.mix_change===true,possible_break:n!==null&&r.possible_break===true,campaign:r.campaign===true}];
  }):[];
  return {districts,months,minimum,coverageFloor:scalar(obj.coverage_minimum)?obj.coverage_minimum:.05,data_cutoff:obj.data_cutoff,generated_at:obj.generated_at};
}

function SourceChart({ months }: {months:Month[]}) {
  if(!months.length) return <p className="small">No monthly source series is available.</p>;
  const high=Math.max(1,...months.map(m=>m.articles??0));
  return <>
    <div className="source-chart" role="img" aria-label="Monthly dated source volume chart; exact values in the following table">
      {months.map(m=><div key={m.month} className={"source-bar "+(m.campaign?"campaign ":"")+(m.mix_change||m.possible_break?"change":"")}
        title={`${m.month}: ${m.articles ?? "unknown or suppressed"}${m.mix_change ? " · source mix change" : ""}${m.possible_break ? " · possible structural break" : ""}${m.campaign ? " · campaign" : ""}`}
        style={{height:`${m.articles==null ? 4 : Math.max(4,m.articles/high*100)}%`}}/>)}
    </div>
    <div className="chart-axis"><span>{months[0].month}</span><span>{months.at(-1)?.month}</span></div>
    <p className="small">Mint = dated source volume. Amber = possible change in the mix or volume of reports, not confirmed change in underlying activity. A lilac marker denotes a supplied campaign.</p>
    <details><summary>Monthly totals and flags</summary><div className="table-scroll"><table><thead>
      <tr><th>Month</th><th>Dated source references</th><th>Flags</th></tr></thead><tbody>{months.map(m=><tr key={m.month}>
        <th>{m.month}</th><td>{m.articles ?? "Unknown / suppressed"}</td>
        <td>{[m.mix_change&&"Source mix change",m.possible_break&&"Possible reporting break",m.campaign&&"Campaign"].filter(Boolean).join("; ") || "—"}</td>
      </tr>)}</tbody></table></div></details>
  </>;
}

const legend = <p className="notice">Coverage unknown means reporting could be thin or unmeasured. Zero means no documented cases in that specific sample, not that no activity occurred.</p>;
const proxy = "Coverage ratio = publicly reported cases divided by comparable official police and excise counts. This rough proxy can miss activity and official counts include small possession cases. Incomplete or unvalidated denominators stay unknown.";

export function DataCoverage({report}:{report:Evaluation|null}) {
  const c=report?.coverage;
  return <><div className="workspace-header"><div><div className="section-kicker">Synthetic reporting audit</div><h1>Data &amp; coverage</h1>
    <p>See what enters the pipeline and where absence of evidence is easy to misread.</p></div></div>
    <section className="paper"><h2>Sources in use</h2>{legend}
      {report && <p className="small">Generated at {dateLabel(report.generated_at)} · data cutoff {dateLabel(report.data_cutoff)}.</p>}
      <p>Fictional reported cases and separately reviewed fictional cues. The simulation changes source volume and coverage over time. It is not a measure of actual reporting effort.</p>
      <p className="small">{c?.minimum_quantity_grams ? `Consistent case rule: at least ${c.minimum_quantity_grams} grams.` :
        "Consistent case rule: include every usable dated case regardless of weight; unknown weights stay unknown."}
      {c && ` ${c.before_quantity_rule} before the rule and ${c.after_quantity_rule} in the usable analysis sample.`}</p></section>
    {c && <><section className="paper"><h2>Monthly source volume</h2><SourceChart months={c.months}/><p className="small">No enforcement campaign dates configured for the demo.</p></section>
      <section className="paper"><h2>District coverage</h2><p>{proxy} The synthetic track shows illustrative simulation coverage only.</p>
        <div className="table-scroll"><table><thead><tr><th>District</th><th>Sample cases</th><th>Simulation coverage</th></tr></thead>
          <tbody>{c.districts.map(r=><tr key={r.location}><th>{r.location}</th><td>{r.cases ?? "Unknown"}</td>
            <td>{r.coverage==null || r.coverage<.35?"Coverage unknown / thin":pct(r.coverage)}</td></tr>)}</tbody></table></div>
      </section></>}
    <section className="paper"><h2>Feedback-loop audit</h2><p>{report?.feedback ?? "More attention can find more cases, making already-watched districts look busier. Independent coverage and outcome checks are needed."}</p>
      <p>Do not interpret a change in reported cases as a change in harm without checking observation effort, sources and definitions. No causal effect or operational performance has been measured.</p></section>
  </>;
}

export function RealResults() {
  const [reviewed,setReviewed]=useState(false);
  const [data,setData]=useState<RealResult|null>(null);
  const [error,setError]=useState("");
  const [h,setH]=useState<7|28>(28);
  return <><div className="workspace-header"><div><div className="section-kicker real-text">{REAL_LABEL}</div><h1>Real-data results</h1><p>{REAL_UNIVERSE}</p></div></div>
    <section className="paper">
      <p>Open only a disclosure-reviewed district aggregate. This browser will not upload it. A minimum-group check reduces risk but does not guarantee anonymity; differences across releases may reveal small groups.</p>
      <label className="inline-check"><input type="checkbox" checked={reviewed} onChange={e=>{setReviewed(e.target.checked);setData(null);setError("");}}/>
        I have reviewed this aggregate for disclosure.</label>
      <label>Open reviewed real aggregate<input type="file" disabled={!reviewed} accept=".json,application/json" onChange={async e=>{
        const f=e.target.files?.[0];if(!f)return;setData(null);setError("");
        try{if(f.size>1_500_000)throw new Error("Choose an aggregate file under 1.5 MB.");setData(decodeRealAggregate(JSON.parse(await f.text())));}
        catch(e){setError(e instanceof Error?e.message:"Could not load local aggregate.");}
      }}/></label>
      {error && <p role="alert" className="notice">{error}</p>}
      {!data && <p className="small">No real data is bundled. Local analysis prepares <code>reports/real/ui_aggregate.json</code> for private review.</p>}
    </section>
    {data&&<>
      <section className="paper"><h2>District aggregate</h2>
        <p className="small">Generated at {dateLabel(data.generated_at)} · data cutoff {dateLabel(data.data_cutoff)} · minimum group {data.minimum}.</p>
        <p>Average count error is the average miss in cases; lower is better. These are historical comparisons, not issued forecasts. The 7-day window is particularly sparse.</p>
        {legend}
        <label>Evaluation window<select value={h} onChange={e=>setH(Number(e.target.value) as 7|28)}><option value={28}>28 days</option><option value={7}>7 days</option></select></label>
        <div className="table-scroll"><table><thead><tr><th>District</th><th>Sample cases</th>
          {Object.keys(METHODS).map(m=><th key={m}>{methodName(m)}</th>)}<th>Coverage ratio</th></tr></thead>
          <tbody>{data.districts.map(r=>{
            const scores=r.metrics.find(s=>s.horizon_days===h)?.metrics;
            const a=r.ratios.filter(y=>y.ratio!==null && y.ratio>=data.coverageFloor);
            return <tr key={r.district}><th>{r.district}</th><td>{r.cases ?? "Suppressed / unknown"}</td>
              {Object.keys(METHODS).map(m=><td key={m}>{scores?.[m]?.toFixed(2) ?? "—"}</td>)}
              <td>{a.length?a.map(y=>`${y.year}: ${pct(y.ratio)}`).join("; "):"Coverage unknown"}</td></tr>;
          })}</tbody></table></div>
        <p className="small">{proxy}</p>
      </section>
      <section className="paper"><h2>Source and reporting audit</h2><p>Sources: publicly reported news and High Court judgments. Monthly totals count distinct dated primary references, not all publications or cases.</p>
        <SourceChart months={data.months}/><p className="small">{data.months.some(r=>r.campaign)?"Chart shows supplied dated campaigns, not confirmed causes.":"No campaign dates were supplied in this aggregate."}</p>
        <p>Focused attention can find more cases and reinforce the same geographic pattern. Compare coverage and errors with independent evidence before any agency-led evaluation.</p>
      </section>
    </>}
  </>;
}
