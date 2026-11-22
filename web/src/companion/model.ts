import type { Case, Forecast } from "../../../shared/schema";
import { CENTER, NODES } from "../data";
import type { Cases } from "../data";

export type Connection = [string, string];
export type EvidenceStatus = "documented" | "unreviewed";
export type Substance = "Cannabis" | "Stimulants" | "Opioids" | "Other" | "Unknown";
export type MapRecord = {
  row: Case; id: string; district: string; eventDate: string; availableDate: string; substance: Substance;
  status: EvidenceStatus; connection: Connection | null; connectionId: string | null;
};
export const pairId = (pair: Connection) => pair.join("|");
export const pairLabel = (pair: Connection) => pair.join(" → ");
export const dayShift = (day: string, delta: number) => new Date(Date.parse(day) + delta * 86400000).toISOString().slice(0, 10);
export const districtName = (name: string) => {
  if (/^pattanamtitta$/i.test(name)) return "Pathanamthitta";
  return Object.keys(CENTER).find(d=>d.toLowerCase()===name.toLowerCase().replace(/\s+district$/, ""));
};
export const districtPoints = Object.entries(NODES).map(([name,[lat,lon]])=>({
  id: name, referenceId: name, name, lat, lon, state: name in CENTER ? "Kerala" : "Fictional outside node",
  district: name in CENTER ? name : null, kind: name in CENTER ? "district reference" : "fictional reference",
}));
export const caseCategory = (value: string | null): Substance => {
  switch (value) {
    case "cannabis": return "Cannabis";
    case "methamphetamine": case "mdma": case "amphetamine": return "Stimulants";
    case "opioid": return "Opioids";
    case null: return "Unknown";
    default: return "Other";
  }
};
export function observedCases(data: Cases, cutoff: string, start?: string): MapRecord[] {
  const known = new Set(data.connections.map(pairId));
  return data.cases.flatMap((row): MapRecord[] => {
    if (row.synthetic !== true || !row.event_date || !row.first_available_date || row.event_date > cutoff ||
      row.first_available_date > cutoff || (start && row.event_date < start) ||
      row.correction_history.some(e=>e.kind==="withdrawal" && typeof e.effective_at==="string" && e.effective_at <= cutoff)) return [];
    const possible: Connection | null = row.origin.name && row.destination.name &&
      row.movement_available_date && row.movement_available_date <= cutoff ? [row.origin.name,row.destination.name] : null;
    const connection = possible && known.has(pairId(possible)) ? possible : null;
    return [{row,id:row.case_id,district:row.district ?? "Unknown",eventDate:row.event_date,availableDate:row.first_available_date,
      status:row.verified_date && row.verified_date<=cutoff ? "documented":"unreviewed",
      substance:caseCategory(row.substance_category),connection,connectionId:connection ? pairId(connection) : null}];
  }).sort((a,b)=>b.eventDate.localeCompare(a.eventDate) || a.id.localeCompare(b.id));
}
export const isIssued = (r: Forecast) => r.synthetic === true && !r.abstained && r.estimate != null;
