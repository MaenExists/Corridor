import type { Forecast } from "../../shared/schema";
import type { Evaluation, Forecasts, Selection, Stat } from "./data";
import { METHODS } from "./data";

export const subjectLabel = (s:Selection) => "area" in s ? s.area : s.connection.join(" → ");

export function findForecast(bundle:Forecasts|null, selection:Selection, horizon:7|28) {
  return bundle?.forecasts.find(f=>f.synthetic===true && f.horizon_days===horizon &&
    ("area" in selection ? f.area===selection.area : f.connection?.[0]===selection.connection[0] && f.connection?.[1]===selection.connection[1]));
}

export function issuedMethod(f:Forecast|undefined) {
  const m=f?.model_version.split(":").at(-1);
  return m && Object.hasOwn(METHODS,m) ? m : null;
}

const baselines=Object.keys(METHODS).filter(m=>m!=="poisson_gbm");
function comparable(scores:Record<string,Stat>,method:string) {
  const issued=scores[method];
  if(issued?.mae==null || !Number.isFinite(issued.mae) || issued.n<1)return null;
  const baseline=baselines.map(name=>({name,score:scores[name]}))
    .filter(r=>r.score?.n===issued.n && r.score.mae!=null && Number.isFinite(r.score.mae))
    .sort((a,b)=>a.score.mae!-b.score.mae!)[0];
  return {method,error:issued.mae,n:issued.n,
    baseline:baseline ? {method:baseline.name,error:baseline.score.mae!} : null};
}

export function evaluatedForecast(f:Forecast|undefined,report:Evaluation|null) {
  if(!f || !report?.synthetic)return null;
  const method=issuedMethod(f);
  if(!method || f.model_version!==`synthetic-${report.run_id}:${method}`)return null;
  const task=report.tasks.find(t=>t.scope===(f.area?"area":"corridor") && t.horizon_days===f.horizon_days);
  if(!task || method!==task.selected_method)return null;
  const location=task.locations.find(r=>r.location===(f.area??f.connection?.join(" → ")));
  return {task,overall:comparable(task.metrics,method),
    local:location?comparable(location.metrics,method):null,location,method,target:report.nominal_interval};
}
export type Comparison = NonNullable<ReturnType<typeof comparable>>;
