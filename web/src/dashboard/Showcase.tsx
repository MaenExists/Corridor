import { ArrowRight, ChartNoAxesCombined, Crosshair, Info } from "lucide-react";
import type { Forecast } from "../../../shared/schema";
import { dateLabel, pct } from "../data";
import type { Evaluation } from "../data";
import { evaluatedForecast } from "../forecastEvidence";
import { formatError } from "../ForecastReadout";
import type { Horizon, Overview } from "./metrics";

export function ExploreHeading({cutoff,openModel}:{cutoff?:string;openModel:()=>void}) {
  return <header className="showcase-heading showcase-hero">
    <div><p className="console-eyebrow"><Crosshair size={15}/> Forecast explorer</p>
      <h1>Kerala case forecasts</h1>
      <p>Explore 7- and 28-day forecasts of documented seizure cases. Choose a district to see the estimate and how the model was tested on synthetic data.</p>
    </div>
    <div className="showcase-hero-actions">
      <button className="console-button quiet-action" onClick={openModel}><ChartNoAxesCombined size={16}/> Model & validation <ArrowRight size={15}/></button>
      {cutoff&&<span>Information through <time dateTime={cutoff}>{dateLabel(cutoff)}</time></span>}
    </div>
  </header>;
}

export function ForecastStats({stats,forecast,report,horizon,openModel}:{stats:Overview;forecast?:Forecast;report:Evaluation|null;
  horizon:Horizon;openModel:()=>void}) {
  const result=evaluatedForecast(forecast,report);
  const score=result?.overall;
  const coverage=result?.task.interval.coverage;
  return <section className="showcase-snapshot" aria-label="Forecast snapshot">
    <div className="console-card">
      <div className="console-eyebrow">District availability · {horizon} days</div>
      <strong>{stats.total?`${stats.issued} / ${stats.total}`:"—"}</strong>
      <p>{stats.total?`${stats.total-stats.issued} forecasts not issued. A gap is not a safety finding.`:"Waiting for the saved forecast batch."}</p>
    </div>
    <div className="console-card">
      <div className="console-eyebrow">Average test error · Kerala</div>
      <strong>{score?`${formatError(score.error)} cases`:"—"}</strong>
      <p>{score?.baseline?`Best simple forecast: ${formatError(score.baseline.error)} cases. Lower is better.`:"No comparable scores for this batch."}</p>
    </div>
    <div className="console-card">
      <div className="console-eyebrow">Measured range coverage</div>
      <strong>{pct(coverage)}{result&&<small> vs {pct(result.target)} target</small>}</strong>
      <p>{coverage==null?"No matching holdout range result.":"Share of later synthetic counts in range."}
        {result&&<button className="console-link" onClick={openModel} aria-label="Inspect validation"><Info size={14}/> Details</button>}</p>
    </div>
  </section>;
}
