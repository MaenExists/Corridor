import type { Level } from "@/lib/types";

export const LEVEL: Record<Level, { label: string; fill: string; text: string }> = {
  high: { label: "High", fill: "#e0301e", text: "Most likely" },
  elevated: { label: "Raised", fill: "#f07a5c", text: "Likely" },
  watch: { label: "Watch", fill: "#f6c7bf", text: "Worth watching" },
};

export const KIND: Record<string, { letter: string; title: string; plain: string }> = {
  "entry gateway": { letter: "G", title: "Entry gateway",
    plain: "Near a state-border crossing, with large hauls. Drugs may be coming in here." },
  "air or sea entry": { letter: "A", title: "Air or sea entry",
    plain: "Near an airport or port, with large hauls. A likely arrival point." },
  "transit corridor": { letter: "T", title: "Transit corridor",
    plain: "Seizures line up along a highway or railway. Drugs are likely moving through." },
  "retail market": { letter: "R", title: "Retail market",
    plain: "A dense town where small quantities keep turning up. Likely street-level selling." },
  "venue-linked": { letter: "V", title: "Venue-linked",
    plain: "Close to resorts, tourist sites or colleges. Demand gathers here." },
  emerging: { letter: "E", title: "Emerging",
    plain: "Most reports here are from the last six months. Activity is new or growing." },
};

export const pct = (v: number) => `${Math.round(v * 100)}%`;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
export const date = (iso: string) => iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "—";
export const month = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
