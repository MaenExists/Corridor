"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { Cell, Gateway, HotspotKind, Level, WatchPlace } from "@/lib/types";
import { setBasemap, useLeafletMap, type Basemap, type MapContext } from "./base";

export type { Basemap };
export type Layers = { places: boolean; kinds: boolean; gateways: boolean };
export type Focus = { lat: number; lon: number; zoom?: number } | null;

const LEVEL_FILL: Record<Level, string> = { high: "#e0301e", elevated: "#f07a5c", watch: "#f6c7bf" };
const KIND_LETTER: Record<string, string> = {
  "entry gateway": "G", "air or sea entry": "A", "transit corridor": "T", "retail market": "R",
  "venue-linked": "V", emerging: "E",
};
const HALF = 0.0045; // half a 1 km square in degrees

type Props = {
  cells: Cell[];
  places: WatchPlace[];
  kinds: HotspotKind[];
  gateways: Gateway[];
  basemap: Basemap;
  layers: Layers;
  focus: Focus;
  selectedId: string | null;
  onSelect: (kind: "place" | "kind" | "gateway", id: string) => void;
};

export default function MapView(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const groups = useRef<Record<string, Leaflet.LayerGroup>>({});
  const select = useRef(props.onSelect);
  select.current = props.onSelect;

  const ctx = useRef<MapContext | null>(null);

  useLeafletMap(host, c => {
    ctx.current = c; L.current = c.L; map.current = c.map;
    for (const name of ["cells", "dots", "kinds", "gateways", "focus"]) groups.current[name] = c.L.layerGroup().addTo(c.map);
    c.map.on("zoomend", () => showScale());
    drawAll();
  }, () => { map.current = null; ctx.current = null; });

  function drawBase() { if (ctx.current) setBasemap(ctx.current, props.basemap); }

  function drawCells() {
    const leaflet = L.current, g = groups.current.cells;
    if (!leaflet || !g) return;
    g.clearLayers();
    if (!props.layers.places) return;
    for (const c of [...props.cells].reverse()) {
      leaflet.rectangle([[c.lat - HALF, c.lon - HALF], [c.lat + HALF, c.lon + HALF]], {
        color: "#0b0b0b", weight: 1, fillColor: LEVEL_FILL[c.level], fillOpacity: .88, interactive: true,
      }).bindTooltip(`Around ${c.place}`, { className: "nt-tip", direction: "top" })
        .on("click", () => {
          const place = props.places.find(p => p.name === c.place);
          if (place) select.current("place", place.id);
        }).addTo(g);
    }
  }

  function drawDots() {
    const leaflet = L.current, g = groups.current.dots;
    if (!leaflet || !g) return;
    g.clearLayers();
    if (!props.layers.places) return;
    for (const p of [...props.places].reverse()) {
      leaflet.circleMarker([p.lat, p.lon], {
        radius: p.level === "high" ? 6.5 : p.level === "elevated" ? 5 : 3.5, color: "#0b0b0b", weight: 1,
        fillColor: LEVEL_FILL[p.level], fillOpacity: 1,
      }).bindTooltip(`${p.name}`, { className: "nt-tip", direction: "top" })
        .on("click", () => select.current("place", p.id)).addTo(g);
    }
    showScale();
  }

  // Dots read at state scale; real 1 km squares take over once they are big enough to see.
  function showScale() {
    const m = map.current;
    if (!m) return;
    const close = m.getZoom() >= 10;
    for (const [name, visible] of [["cells", close], ["dots", !close]] as const) {
      const g = groups.current[name];
      if (!g) continue;
      if (visible && !m.hasLayer(g)) g.addTo(m);
      if (!visible && m.hasLayer(g)) m.removeLayer(g);
    }
  }

  function drawKinds() {
    const leaflet = L.current, g = groups.current.kinds;
    if (!leaflet || !g) return;
    g.clearLayers();
    if (!props.layers.kinds) return;
    for (const k of props.kinds) {
      const letter = KIND_LETTER[k.kinds[0]] ?? "·";
      leaflet.marker([k.lat, k.lon], {
        icon: leaflet.divIcon({ className: "", html: `<div class="nt-type${props.selectedId === k.id ? " sel" : ""}">${letter}</div>`,
          iconSize: [22, 22], iconAnchor: [11, 11] }),
      }).bindTooltip(`${k.name}: ${k.kinds.join(", ")}`, { className: "nt-tip", direction: "top", offset: [0, -10] })
        .on("click", () => select.current("kind", k.id)).addTo(g);
    }
  }

  function drawGateways() {
    const leaflet = L.current, g = groups.current.gateways;
    if (!leaflet || !g) return;
    g.clearLayers();
    if (!props.layers.gateways) return;
    for (const gate of props.gateways) {
      leaflet.marker([gate.lat, gate.lon], {
        icon: leaflet.divIcon({ className: "nt-gate", html: "◆", iconSize: [15, 15], iconAnchor: [7, 7] }),
      }).bindTooltip(`Border crossing near ${gate.name}`, { className: "nt-tip", direction: "top" })
        .on("click", () => select.current("gateway", gate.id)).addTo(g);
    }
  }

  function drawFocus() {
    const leaflet = L.current, m = map.current, g = groups.current.focus;
    if (!leaflet || !m || !g) return;
    g.clearLayers();
    if (!props.focus) return;
    m.flyTo([props.focus.lat, props.focus.lon], props.focus.zoom ?? 12, { duration: .7 });
    leaflet.circle([props.focus.lat, props.focus.lon], { radius: 3000, color: "#0b0b0b", weight: 1.5, dashArray: "5 5", fill: false })
      .addTo(g);
  }

  function drawAll() { drawBase(); drawCells(); drawDots(); drawKinds(); drawGateways(); }

  useEffect(drawBase, [props.basemap]);
  useEffect(drawCells, [props.cells, props.layers.places]);
  useEffect(drawDots, [props.places, props.layers.places]);
  useEffect(drawKinds, [props.kinds, props.layers.kinds, props.selectedId]);
  useEffect(drawGateways, [props.gateways, props.layers.gateways]);
  useEffect(drawFocus, [props.focus]);

  return <div ref={host} className="absolute inset-0" aria-label="Map of Kerala" role="region" />;
}
