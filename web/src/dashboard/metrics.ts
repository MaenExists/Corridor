import { DISTRICTS } from "../data";
import type { Cases, Forecasts } from "../data";
import type { Forecast } from "../../../shared/schema";
import { dayShift, observedCases, pairId } from "../companion/model";
import type { MapRecord } from "../companion/model";

export const REGIONS = [
  { name: "North", color: "#46d6c5", districts: ["Kasaragod","Kannur","Wayanad","Kozhikode","Malappuram"] },
  { name: "Central", color: "#509ed4", districts: ["Palakkad","Thrissur","Ernakulam","Idukki","Kottayam"] },
  { name: "South", color: "#51c996", districts: ["Alappuzha","Pathanamthitta","Kollam","Thiruvananthapuram"] },
] as const;
export type Range = 28 | 90 | 180;
export type Horizon = 7 | 28;
type Delta = { current:number; previous:number; percent:number|null };
export const compactCount = (n:number) => new Intl.NumberFormat("en-IN").format(n);
export const inWindow = (r:MapRecord, from:string, through:string) => r.eventDate >= from && r.eventDate <= through;
const delta = (current:number,previous:number):Delta => ({ current, previous, percent:previous ? (current-previous)/previous : null });
export const materialChange = (d:Delta) => d.previous > 0 && d.current-d.previous>=3 && (d.percent??0)>=.25;
export const datasetForecast = (bundle:Forecasts|null, district:string, horizon:Horizon):Forecast|undefined =>
  bundle?.forecasts.find(r=>r.synthetic===true && r.area===district && r.horizon_days===horizon);

export function monthlySeries(rows:MapRecord[],cutoff:string,n:number) {
  const end=new Date(`${cutoff}T00:00:00Z`);
  return Array.from({length:n},(_,index)=>{
    const month=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+index+1-n,1));
    const prefix=month.toISOString().slice(0,7);
    const matching=rows.filter(r=>r.eventDate.startsWith(prefix));
    const partial=prefix===cutoff.slice(0,7) && end.getUTCDate()<new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();
    return { key:prefix, label:month.toLocaleDateString("en-IN",{month:"short",timeZone:"UTC"}), partial,
      regions:REGIONS.map(g=> matching.filter(r=>(g.districts as readonly string[]).includes(r.district)).length) };
  });
}

export function overview(data:Cases, rows:MapRecord[], forecasts:Forecasts|null, range:Range, horizon:Horizon) {
  const cutoff=data.as_of;
  const from=dayShift(cutoff,1-range);
  const current=rows.filter(r=>inWindow(r,from,cutoff));
  const recent=rows.filter(r=>inWindow(r,dayShift(cutoff,-27),cutoff));
  const prior=rows.filter(r=>inWindow(r,dayShift(cutoff,-55),dayShift(cutoff,-28)));
  const districts=Object.fromEntries(DISTRICTS.map(p=>[p,delta(recent.filter(r=>r.district===p).length,prior.filter(r=>r.district===p).length)]));
  const connections=new Set(current.flatMap(r=>r.connectionId?[r.connectionId]:[]));
  const scored=forecasts?.forecasts.filter(f=>f.synthetic===true && f.area && f.horizon_days===horizon)??[];
  const issued=scored.filter(f=>!f.abstained && f.estimate!==null).length;
  return { rows:current, cutoff, districts, connections:data.connections.filter(p=>connections.has(pairId(p))), issued, total:scored.length,
    monthly:monthlySeries(rows,cutoff,6)
  };
}
export type Overview = ReturnType<typeof overview>;

export function history(data:Cases) {
  return observedCases(data,data.as_of);
}
