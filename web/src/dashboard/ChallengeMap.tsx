import { useEffect, useState } from "react";
import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { CENTER, DISTRICTS, localJSON } from "../data";
import { districtName } from "../companion/model";
import type { Trial } from "./challengeModel";

const xy=([lon,lat]:Position)=>[(lon-74.8)*94+46,(12.9-lat)*94+37];
const path=(rings:Position[][])=>rings.map(r=>r.map((p,i)=>`${i?"L":"M"}${xy(p).map(v=>v.toFixed(2)).join(" ")}`).join("")+"Z").join("");
const colors=["#346461","#538f83","#79c3a5","#b8edd0"];
const brackets=["0–4.9","5–9.9","10–14.9","15+"];
const paint=(v:number)=>colors[v<5?0:v<10?1:v<15?2:3];

export function ChallengeMap({district,select,trial}:{district:string;select:(d:string)=>void;trial:Trial|null}) {
  const [districts,setDistricts]=useState<Record<string,string>|null>(null);
  const [unavailable,setUnavailable]=useState(false);
  useEffect(()=>{
    let active=true;
    localJSON<FeatureCollection<Polygon|MultiPolygon>>("/geography/kerala-districts.geojson")
      .then(g=>{
        const shapes=Object.fromEntries(g.features.flatMap(f=>{
          const name=districtName(f.properties?.name??"");
          if(!name||!f.geometry)return [];
          const coords=f.geometry.type==="Polygon"?[f.geometry.coordinates]:f.geometry.coordinates;
          return [[name,coords.map(path).join("")]];
        }));
        if(DISTRICTS.some(d=>!shapes[d]))throw new Error("Local boundary data is incomplete");
        if(active)setDistricts(shapes);
      }).catch(()=>{if(active)setUnavailable(true);});
    return ()=>{active=false;};
  },[]);
  const selected=CENTER[district];
  const [x,y]=xy([selected[1],selected[0]]);
  const left=x>175;
  return <section className="console-card trial-map" aria-label="District forecast map">
    <header><div className="console-eyebrow">Kerala, India</div><h2>{trial?"Predicted documented cases":"Select a district"}</h2>
      <p>{trial?`${trial.request.horizon}-day estimates · synthetic archive`:"Choose on the map or use the district field."}</p></header>
    {districts?<svg viewBox="0 0 332 510" className="trial-atlas" role="group" aria-label="Interactive Kerala district boundaries">
      <defs>
        <pattern id="trial-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#223c40" strokeWidth="1"/></pattern>
        <pattern id="trial-unknown" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="5" height="5" fill="#342d2a"/><path d="M0 0V5" stroke="#c59668" strokeWidth="2"/></pattern>
      </defs>
      <rect width="332" height="510" fill="url(#trial-grid)" pointerEvents="none"/>
      <text x="32" y="352" className="trial-water">ARABIAN SEA</text>
      <path d="M300 62V37l-4 7m4-7 4 7" fill="none" stroke="#8aa8a6" pointerEvents="none"/><text x="297" y="29" className="trial-water">N</text>
      {DISTRICTS.map(d=>{
        const value=trial?.estimates[d]?.estimate;
        return <path key={d} d={districts[d]} className="trial-district" fillRule="evenodd"
          fill={trial?(value==null?"url(#trial-unknown)":paint(Number(value.toFixed(1)))):"#285054"}
          data-current={district===d} tabIndex={0} role="button" aria-pressed={district===d}
          aria-label={`${d}${trial?(value==null?", not issued":`, ${value.toFixed(1)} expected documented cases`):""}`}
          onClick={()=>select(d)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();select(d);}}}/>;
      })}
      <g className="trial-pin" pointerEvents="none">
        <path d={`M${x} ${y} h${left?-23:23}`} stroke="#eff9eb"/><circle cx={x} cy={y} r="4" fill="#f1faf0" stroke="#113231"/>
        <text x={x+(left?-28:28)} y={y+4} textAnchor={left?"end":"start"}>{district}</text>
      </g>
    </svg>:<p className="trial-map-placeholder" role="status">{unavailable?"Local boundaries unavailable. Use the district selector to continue.":"Loading local boundaries…"}</p>}
    {trial?<div className="trial-legend" aria-label="Map legend">
      {brackets.map((b,i)=><span key={b}><i style={{background:colors[i]}}/>{b}</span>)}
      <span><i className="trial-hatch"/>Not issued</span>
    </div>:<div className="trial-map-caption">District boundaries only. No case locations or routes.</div>}
    {trial&&<p className="trial-map-caption">Color shows count, not risk. Hatched districts are unknown, not safe.</p>}
    <p className="trial-map-source">Illustrative boundaries · <a href="https://www.openstreetmap.org/copyright"
      target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></p>
  </section>;
}
