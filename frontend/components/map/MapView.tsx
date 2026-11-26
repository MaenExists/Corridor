"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { Cell, Gateway, HotspotKind, Level, WatchPlace } from "@/lib/types";

export type Basemap = "satellite" | "street";
export type Layers = { places: boolean; kinds: boolean; gateways: boolean };
export type Focus = { lat: number; lon: number; zoom?: number } | null;

const LEVEL_FILL: Record<Level, string> = { high: "#e0301e", elevated: "#f07a5c", watch: "#f6c7bf" };
const KIND_LETTER: Record<string, string> = {
  "entry gateway": "G", "air or sea entry": "A", "transit corridor": "T", "retail market": "R",
  "venue-linked": "V", emerging: "E",
};
const KERALA: Leaflet.LatLngBoundsExpression = [[8.15, 74.85], [12.85, 77.45]];
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
  const base = useRef<Leaflet.Layer[]>([]);
  const groups = useRef<Record<string, Leaflet.LayerGroup>>({});
  const select = useRef(props.onSelect);
  select.current = props.onSelect;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then(mod => {
      if (cancelled || !host.current || map.current) return;
      const leaflet = mod.default ?? mod;
      L.current = leaflet;
      const m = leaflet.map(host.current, { zoomControl: false, minZoom: 6, maxZoom: 17, zoomSnap: 1, attributionControl: true });
      m.fitBounds(KERALA, { padding: [8, 8] });
      leaflet.control.zoom({ position: "bottomright" }).addTo(m);
      for (const name of ["mask", "districts", "cells", "dots", "kinds", "gateways", "focus"]) groups.current[name] = leaflet.layerGroup().addTo(m);
      fetch("/geo/kerala-state.geojson").then(r => r.json()).then(state => {
        const geom = state.geometry ?? state.features?.[0]?.geometry;
        const polys: number[][][][] = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
        const world = [[-89, -179], [-89, 179], [89, 179], [89, -179]] as [number, number][];
        const holes = polys.map(poly => poly[0].map(([x, y]) => [y, x] as [number, number]));
        leaflet.polygon([world, ...holes], { interactive: false, stroke: false, fillColor: "#f3f1ea", fillOpacity: .62 })
          .addTo(groups.current.mask);
        leaflet.polygon(holes, { interactive: false, color: "#0b0b0b", weight: 1.25, fill: false }).addTo(groups.current.mask);
      });
      m.on("zoomend", () => showScale());
      fetch("/geo/kerala-districts.geojson").then(r => r.json()).then(geo => {
        leaflet.geoJSON(geo, { interactive: false, style: { color: "#ffffff", weight: 1, opacity: .75, fill: false, dashArray: "2 3" } })
          .addTo(groups.current.districts);
      });
      map.current = m;
      requestAnimationFrame(() => m.invalidateSize());
      setTick(m);
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  function setTick(_: Leaflet.Map) { drawAll(); }

  function drawBase() {
    const m = map.current, leaflet = L.current;
    if (!m || !leaflet) return;
    base.current.forEach(l => m.removeLayer(l));
    const pane = m.getPane("tilePane");
    if (props.basemap === "satellite") {
      pane?.classList.add("sat"); pane?.classList.remove("street");
      base.current = [
        leaflet.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }),
        leaflet.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 18, opacity: .85 }),
      ];
    } else {
      pane?.classList.add("street"); pane?.classList.remove("sat");
      base.current = [leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 19, attribution: "© OpenStreetMap contributors" })];
    }
    base.current.forEach(l => l.addTo(m));
    groups.current.districts?.eachLayer(l => (l as Leaflet.GeoJSON).setStyle?.({
      color: props.basemap === "satellite" ? "#ffffff" : "#0b0b0b", opacity: props.basemap === "satellite" ? .75 : .45 }));
  }

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
