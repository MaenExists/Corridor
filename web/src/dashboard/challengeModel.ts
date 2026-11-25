import { DISTRICTS, localJSON } from "../data";

type Node = [value:number] | [feature:number, threshold:number, left:number, right:number, missingLeft:boolean];
type Forest = { bias:number; trees:Node[][] };
type DistrictInput = { x:(number|null)[]|null; reason:string|null; recent:number; baseline:number|null };
type Frame = { cutoff:string; start:string; end:string; districts:Record<string,DistrictInput> };
type Task = { horizon:7|28; model:Forest; training_windows:number; frames:Frame[] };
export type ChallengePack = { schema:"corridor-challenge-v1"; synthetic:true; run_id:string; frozen_at:string; tasks:Task[] };
export type Request = { district:string; cutoff:string; horizon:7|28 };
export type Estimate = Omit<DistrictInput,"x"> & { estimate:number|null };
export type Trial = { request:Request; runId:string; frozenAt:string; start:string; end:string; trainingWindows:number;
  estimates:Record<string,Estimate> };
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const finite=(v:unknown):v is number=>typeof v==="number" && Number.isFinite(v);
const asDate=(s:unknown):s is string=>typeof s==="string" && datePattern.test(s);
const bad=()=>new Error("The synthetic challenge files do not match. Run make challenge to rebuild them.");

export async function loadChallenge() {
  const pack=await localJSON<ChallengePack>("/generated/challenge.json");
  if(pack?.synthetic!==true || pack.schema!=="corridor-challenge-v1" || !/^[a-f0-9]{16}$/.test(pack.run_id) ||
    !asDate(pack.frozen_at)||!Array.isArray(pack.tasks)||pack.tasks.length!==2)throw bad();
  for(const h of [7,28]){
    const t=pack.tasks.find(t=>t.horizon===h);
    if(!t||!finite(t.model?.bias)||!Array.isArray(t.model.trees)||!t.model.trees.length||
      !Array.isArray(t.frames)||!t.frames.length||!finite(t.training_windows))throw bad();
    for(const f of t.frames){
      if(!asDate(f.cutoff)||!asDate(f.start)||!asDate(f.end)||f.cutoff<pack.frozen_at||f.start<=f.cutoff||f.end<f.start)throw bad();
    }
  }
  return pack;
}

export function interpret(text:string,current:Request): Request {
  const q=text.trim().toLowerCase();
  if(/\b(arrest|patrol|raid|intercept|suspect|target|trafficking|safe|safest|risk|catch|dangerous|route|routes)\b/.test(q))
    throw new Error("This tool estimates synthetic documented case counts only. It cannot suggest targets, routes or actions.");
  const districts=DISTRICTS.filter(d=>new RegExp(`\\b${d.toLowerCase()}\\b`).test(q));
  const horizon=[...q.matchAll(/\b(\d+)\s*[- ]?\s*days?\b/g)].map(m=>Number(m[1]));
  const dates=[...q.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(m=>m[0]);
  if(districts.length>1)throw new Error("Pick one district per question.");
  if(horizon.length>1 || horizon.some(h=>h!==7 && h!==28))throw new Error("Choose either 7 days or 28 days.");
  if(dates.length>1)throw new Error("Pick one archive date.");
  if(!districts.length&&!horizon.length&&!dates.length)throw new Error("Try a Kerala district, ‘7 days’ or ‘28 days’. Use the date selector for archive dates.");
  const extra=q.replace(/\b\d{4}-\d{2}-\d{2}\b/g,"").replace(/\b\d+\s*[- ]?\s*days?\b/g,"")
    .replace(new RegExp(`\\b(${DISTRICTS.join("|").toLowerCase()})\\b`,"g"),"");
  if(/\b\d+\b/.test(extra))throw new Error("For a date, use the archive selector or YYYY-MM-DD.");
  return {district:districts[0]??current.district,horizon:(horizon[0]??current.horizon) as 7|28,cutoff:dates[0]??current.cutoff};
}

export function predict(model:Forest,x:(number|null)[]) {
  let score=model.bias;
  for(const tree of model.trees){
    let index=0, leaf=false;
    for(let depth=0;depth<tree.length;depth++){
      const node=tree[index];
      if(!node)throw bad();
      if(node.length===1){score+=node[0];leaf=true;break;}
      const [feature,threshold,left,right,missingLeft]=node;
      const value=x[feature];
      if((value!==null&&!finite(value))||!finite(threshold))throw bad();
      index=(value===null?missingLeft:value<=threshold)?left:right;
    }
    if(!leaf)throw bad();
  }
  const estimate=Math.exp(score);
  if(!finite(estimate))throw bad();
  return estimate;
}

export function runChallenge(pack:ChallengePack,request:Request): Trial {
  const task=pack.tasks.find(t=>t.horizon===request.horizon);
  const frame=task?.frames.find(f=>f.cutoff===request.cutoff);
  if(!task||!frame)throw new Error("That date isn’t in the test archive. Choose one from the date selector.");
  const estimates=Object.fromEntries(DISTRICTS.map(d=>{
    const input=frame.districts[d];
    if(!input||!finite(input.recent)||(!input.reason&&!Array.isArray(input.x)))throw bad();
    return [d,{estimate:input.reason||!input.x?null:predict(task.model,input.x),reason:input.reason,recent:input.recent,baseline:input.baseline}];
  }));
  return {request,runId:pack.run_id,frozenAt:pack.frozen_at,start:frame.start,end:frame.end,trainingWindows:task.training_windows,estimates};
}

type Replay = { synthetic:true; run_id:string; tasks:{ scope:string; horizon_days:number;
  windows:{origin:string;rows:{location:string;observed:number;abstain_reason:string|null}[]}[] }[] };
export async function revealOutcome(trial:Trial,district:string) {
  const replay=await localJSON<Replay>("/generated/replay.json");
  if(replay.synthetic!==true||replay.run_id!==trial.runId)throw bad();
  const row=replay.tasks.find(t=>t.scope==="area"&&t.horizon_days===trial.request.horizon)
    ?.windows.find(w=>w.origin===trial.request.cutoff)?.rows.find(r=>r.location===district);
  if(!row||!Number.isInteger(row.observed)||row.observed<0||row.abstain_reason!==trial.estimates[district]?.reason)throw bad();
  return row.observed;
}
