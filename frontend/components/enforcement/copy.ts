import type { Level } from "@/lib/types";

/** Priority levels on the map stay red (hot to dim), against the green interface; electric blue marks emerging signals. */
export const LEVEL: Record<Level, { label: string; fill: string; text: string }> = {
  high: { label: "Top priority", fill: "#ff3b26", text: "Top priority" },
  elevated: { label: "Priority", fill: "#c0341f", text: "Priority" },
  watch: { label: "Watch", fill: "#6e2519", text: "On watch" },
};
export const ACCENT = "#00FF41";
export const ELECTRIC = "#00C2FF";

export const KIND: Record<string, { letter: string; title: string; plain: string }> = {
  "entry gateway": { letter: "G", title: "Entry gateway",
    plain: "Big hauls near a state-border crossing. A likely way in." },
  "air or sea entry": { letter: "A", title: "Air or sea entry",
    plain: "Big hauls near an airport or port. A likely point of arrival." },
  "transit corridor": { letter: "T", title: "Transit corridor",
    plain: "Seizures strung along a highway or railway. Supply moving through." },
  "retail market": { letter: "R", title: "Street market",
    plain: "A dense town where small quantities keep turning up. Street-level selling." },
  "venue-linked": { letter: "V", title: "Venue-linked",
    plain: "Clustered around resorts, tourist sites or colleges. Where demand gathers." },
  emerging: { letter: "E", title: "Emerging",
    plain: "Most reports are from the last six months. New or growing activity." },
};

export const pct = (v: number) => `${Math.round(v * 100)}%`;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
export const date = (iso: string) => iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "—";
export const month = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
