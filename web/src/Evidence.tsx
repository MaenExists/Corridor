import { useState } from "react";
import type { Case, Forecast } from "../../shared/schema";
import { NOTICE, dateLabel, methodName, pct } from "./data";
import type { Evaluation, Selection } from "./data";

export function Evidence({ selection, forecast, report, openReport, startBrief }:
  { selection: Selection; forecast?: Forecast; report?: Evaluation | null; openReport: ()=>void; startBrief:()=>void }) {
  const title = "area" in selection ? selection.area : selection.connection.join(" → ");
  const match = report?.tasks.find(t=>t.horizon_days===forecast?.horizon_days && t.scope===("area" in selection?"area":"corridor"));
  const local = match?.locations.find(r=>r.location===title);
  return <aside className="evidence-panel"><div className="section-kicker">Forecast evidence · Synthetic</div>
    <h2>{title}</h2>{forecast ? <>
    <div className="estimate">{forecast.abstained ? "Abstained" : forecast.estimate?.toFixed(1)}</div>
    <p>{forecast.abstained ? forecast.abstain_reason : "Expected documented cases"}</p>
    {forecast.interval && <div className="range-display"><strong>{forecast.interval.join("–")}</strong><span>Estimated count range<br/>{forecast.uncertainty_note}</span></div>}
    {!forecast.interval && <p className="small">{forecast.uncertainty_note}</p>}
    <p className="small">{dateLabel(forecast.window_start)} to {dateLabel(forecast.window_end)}</p>
    <p className="notice">{NOTICE}</p>
    <dl className="fact-list"><div><dt>Information cutoff</dt><dd>{dateLabel(forecast.information_cutoff)}</dd></div>
      <div><dt>Model version</dt><dd className="anywhere">{forecast.model_version}</dd></div>
      <div><dt>Target</dt><dd>{forecast.target}</dd></div></dl>
    {forecast.transport_context && <p className="small">{forecast.transport_context}. This connection is invented, not an actual route.</p>}
    <details open><summary>What the record supports</summary><ul>{forecast.supporting_patterns.map(n=><li key={n}>{n}</li>)}</ul>
      <p className="small">{forecast.source_availability} {forecast.coverage_gaps.join(". ")}.</p></details>
    <details><summary>Recent reviewed cues ({forecast.recent_verified_cues.length})</summary>
      {forecast.recent_verified_cues.length ? <ul>{forecast.recent_verified_cues.map(c=><li key={String(c.id)}>Fictional cue · reviewed {String(c.verified_at).slice(0,16)} UTC</li>)}</ul>
        : <p className="small">No verified inbox cues visible to this forecast batch.</p>}</details>
    {match && <details open><summary>Held-out comparison</summary>
      <p className="small">Issued method: {methodName(match.selected_method)}. Best overall count error: {methodName(match.winner)}.
      {" "}Measured range coverage: {pct(match.interval.coverage)}. These tests used fictional cases.</p>
      {local && (local.baseline_beats_candidate.length ? <p className="small">Baselines that beat the candidate here: {local.baseline_beats_candidate.map(methodName).join(", ")}.</p>
        : <p className="small">No baseline had a smaller mean error than the candidate here.</p>)}
      <button className="quiet" onClick={openReport}>Open report card</button>
    </details>}
    <button onClick={startBrief}>Start a brief</button>
    </> : <p>No dated forecast for this selection.</p>}</aside>;
}

export function Observation({ row, cutoff, close }: { row: Case; cutoff: string; close: ()=>void }) {
  const [ref, setRef] = useState<string|null>(null);
  const verified = row.verified_date && row.verified_date <= cutoff;
  const source = row.source_ref.filter(r=>r.available_date && r.available_date <= cutoff);
  const edits = row.correction_history.filter(r=>typeof r.effective_at==="string" && r.effective_at<=cutoff);
  const quantity = row.quantity == null ? "Unknown" : `${(row.quantity * edits.reduce((f,r)=>f*(r.kind==="quantity revised" ? Number(r.multiplier) : 1),1)).toFixed(2)} ${row.unit}`;
  return <section className="paper evidence-observation" aria-label="Observation details">
    <button className="quiet close" onClick={close} aria-label="Close observation">✕</button>
    <div className="section-kicker">Synthetic observation</div><h3>{row.district ?? "Unknown district"}</h3>
    <dl className="fact-list"><div><dt>Seizure date</dt><dd>{row.event_date ? dateLabel(row.event_date) : "Unknown"}</dd></div>
      <div><dt>First available</dt><dd>{row.first_available_date ? dateLabel(row.first_available_date) : "Unknown"}</dd></div>
      <div><dt>Geographic precision</dt><dd>{row.seizure_location.geo_precision}; no exact address</dd></div>
      <div><dt>Substance / weight</dt><dd>{row.substance_category ?? "Unknown"} / {quantity}</dd></div>
      <div><dt>Documentation</dt><dd>{verified ? `Simulated review ${dateLabel(row.verified_date!)}` : "Fictional report; not independently corroborated"}</dd></div>
      <div><dt>Review history</dt><dd>{edits.length ? edits.map(r=>`${r.kind} (${r.effective_at})`).join("; ") : "No revisions visible by selected date"}</dd></div></dl>
    <p className="small">A repeated report is not independent corroboration. Evidence quality is separate from forecast uncertainty.</p>
    <div className="case-links">{source.map(r=><button key={r.ref} className="quiet" onClick={()=>setRef(r.ref)}>{r.ref}</button>)}</div>
    {ref && source.some(r=>r.ref===ref) && <p className="small" role="status">Fictional source {ref}, available {source.find(r=>r.ref===ref)?.available_date}. No external article exists.</p>}
  </section>;
}
