"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { Centre } from "@/lib/types";
import { setBasemap, useLeafletMap, type Basemap, type MapContext } from "./base";

export type AccessLayer = "distance" | "beds" | "none";
export type Point = { lat: number; lon: number; zoom?: number } | null;

export const DISTANCE_STEPS: [number, string, string][] = [
  [5, "#161615", "under 5 km"], [10, "#5a1c14", "5–10 km"], [15, "#a8291a", "10–15 km"],
  [20, "#ff3b26", "15–20 km"], [Infinity, "#ff8a6e", "over 20 km"],
];
export const BED_STEPS: [number, string, string][] = [
  [5, "#ff8a6e", "under 5"], [20, "#ff3b26", "5–20"], [50, "#a8291a", "20–50"], [100, "#5a1c14", "50–100"],
  [Infinity, "transparent", "100 or more"],
];
const colour = (steps: [number, string, string][], v: number) => steps.find(s => v < s[0])![1];

type Grid = { step: number; lat: number[]; lon: number[]; km: number[]; beds: number[] };

/** Paint the 1 km grid once into a canvas laid out in Web Mercator rows, so Leaflet can stretch it exactly. */
function gridImage(grid: Grid, layer: Exclude<AccessLayer, "none">) {
  const half = grid.step / 2;
  let north = -90, south = 90, west = 180, east = -180;
  for (let i = 0; i < grid.lat.length; i++) {
    north = Math.max(north, grid.lat[i] + half); south = Math.min(south, grid.lat[i] - half);
    west = Math.min(west, grid.lon[i] - half); east = Math.max(east, grid.lon[i] + half);
  }
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const scale = 4, top = merc(north), span = top - merc(south);
  const width = Math.round((east - west) / grid.step) * scale, height = Math.round((north - south) / grid.step) * scale;
  const y = (lat: number) => (top - merc(lat)) / span * height;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < grid.lat.length; i++) {
    const fill = layer === "distance" ? colour(DISTANCE_STEPS, grid.km[i]) : colour(BED_STEPS, grid.beds[i]);
    if (fill === "transparent") continue;
    ctx.fillStyle = fill;
    const x0 = Math.floor((grid.lon[i] - half - west) / grid.step * scale);
    const y0 = Math.floor(y(grid.lat[i] + half)), y1 = Math.ceil(y(grid.lat[i] - half));
    ctx.fillRect(x0, y0, scale, y1 - y0);
  }
  return { url: canvas.toDataURL(), bounds: [[south, west], [north, east]] as Leaflet.LatLngBoundsExpression };
}

type Props = {
  centres: Centre[];
  basemap: Basemap;
  layer: AccessLayer;
  showCentres: boolean;
  focus: Point;
  probe: Point;
  selectedCentre: string | null;
  onProbe: (lat: number, lon: number) => void;
  onCentre: (id: string) => void;
  onGridReady?: (ok: boolean) => void;
};

export default function RecoveryMapView(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<MapContext | null>(null);
  const groups = useRef<Record<string, Leaflet.LayerGroup>>({});
  const grid = useRef<Grid | null>(null);
  const overlay = useRef<Leaflet.ImageOverlay | null>(null);
  const handlers = useRef(props);
  handlers.current = props;

  useLeafletMap(host, c => {
    ctx.current = c;
    for (const name of ["centres", "probe", "focus"]) groups.current[name] = c.L.layerGroup().addTo(c.map);
    c.map.on("click", e => handlers.current.onProbe(e.latlng.lat, e.latlng.lng));
    setBasemap(c, handlers.current.basemap);
    drawCentres(); drawProbe();
    fetch("/api/recovery/cells").then(r => r.ok ? r.json() as Promise<Grid> : null).then(g => {
      grid.current = g; handlers.current.onGridReady?.(!!g); drawGrid();
    }).catch(() => handlers.current.onGridReady?.(false));
  }, () => { ctx.current = null; });

  function drawGrid() {
    const c = ctx.current;
    if (!c) return;
    overlay.current?.remove(); overlay.current = null;
    if (!grid.current || props.layer === "none") return;
    const image = gridImage(grid.current, props.layer);
    overlay.current = c.L.imageOverlay(image.url, image.bounds, { opacity: .78, className: "nt-grid" }).addTo(c.map);
  }

  function drawCentres() {
    const c = ctx.current, g = groups.current.centres;
    if (!c || !g) return;
    g.clearLayers();
    if (!props.showCentres) return;
    for (const centre of [...props.centres].sort((a, b) => Number(a.government) - Number(b.government))) {
      const selected = props.selectedCentre === centre.id;
      c.L.marker([centre.lat, centre.lon], {
        icon: c.L.divIcon({ className: "", iconSize: [14, 14], iconAnchor: [7, 7],
          html: `<div class="nt-centre${centre.government ? " gov" : ""}${selected ? " sel" : ""}"></div>` }),
        keyboard: false,
      }).bindTooltip(`${centre.name}${centre.government ? " · Government" : ""}`, { className: "nt-tip", direction: "top" })
        .on("click", e => { c.L.DomEvent.stopPropagation(e); handlers.current.onCentre(centre.id); }).addTo(g);
    }
  }

  function drawProbe() {
    const c = ctx.current, g = groups.current.probe;
    if (!c || !g) return;
    g.clearLayers();
    if (!props.probe) return;
    c.L.marker([props.probe.lat, props.probe.lon], {
      icon: c.L.divIcon({ className: "", html: '<div class="nt-probe"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      interactive: false,
    }).addTo(g);
  }

  function drawFocus() {
    const c = ctx.current;
    if (!c || !props.focus) return;
    c.map.flyTo([props.focus.lat, props.focus.lon], props.focus.zoom ?? 11, { duration: .7 });
  }

  useEffect(() => { if (ctx.current) setBasemap(ctx.current, props.basemap); }, [props.basemap]);
  useEffect(drawGrid, [props.layer]);
  useEffect(drawCentres, [props.centres, props.showCentres, props.selectedCentre]);
  useEffect(drawProbe, [props.probe]);
  useEffect(drawFocus, [props.focus]);

  return <div ref={host} className="absolute inset-0 cursor-crosshair" aria-label="Map of access to de-addiction help" role="region" />;
}
