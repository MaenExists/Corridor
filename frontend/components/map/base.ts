import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

export type Basemap = "satellite" | "street";
export const KERALA: Leaflet.LatLngBoundsExpression = [[8.15, 74.85], [12.85, 77.45]];

/** Shared map setup: Kerala view, zoom control, the dimmed world outside Kerala and district lines. */
export async function createMap(host: HTMLElement) {
  const mod = await import("leaflet");
  const L = (mod.default ?? mod) as typeof Leaflet;
  const map = L.map(host, { zoomControl: false, minZoom: 6, maxZoom: 17, zoomSnap: 1, attributionControl: true });
  // Whole zoom levels keep satellite tiles crisp; round to the nearest level that frames Kerala.
  map.options.zoomSnap = 0.1;
  const fit = map.getBoundsZoom(KERALA, false, L.point(16, 16));
  map.options.zoomSnap = 1;
  map.setView([10.5, 76.3], Math.max(6, Math.floor(fit + 0.2)));
  const zoomClass = () => map.getContainer().classList.toggle("nt-far", map.getZoom() < 9);
  map.on("zoomend", zoomClass); zoomClass();
  L.control.zoom({ position: "bottomright" }).addTo(map);
  const mask = L.layerGroup().addTo(map);
  const districts = L.layerGroup().addTo(map);
  fetch("/geo/kerala-state.geojson").then(r => r.json()).then(state => {
    const geom = state.geometry ?? state.features?.[0]?.geometry;
    const polys: number[][][][] = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    const world = [[-89, -179], [-89, 179], [89, 179], [89, -179]] as [number, number][];
    const holes = polys.map(poly => poly[0].map(([x, y]) => [y, x] as [number, number]));
    L.polygon([world, ...holes], { interactive: false, stroke: false, fillColor: "#0a0a0a", fillOpacity: .7 }).addTo(mask);
    L.polygon(holes, { interactive: false, color: "#e8e6df", weight: 1.25, fill: false }).addTo(mask);
  });
  fetch("/geo/kerala-districts.geojson").then(r => r.json()).then(geo => {
    L.geoJSON(geo, { interactive: false, style: { color: "#ffffff", weight: 1, opacity: .75, fill: false, dashArray: "2 3" } })
      .addTo(districts);
  });
  requestAnimationFrame(() => map.invalidateSize());
  return { L, map, districts, base: [] as Leaflet.Layer[] };
}

/** Desaturated satellite imagery with place labels, or a grey street map. */
export function setBasemap(ctx: { L: typeof Leaflet; map: Leaflet.Map; districts: Leaflet.LayerGroup; base: Leaflet.Layer[] },
  basemap: Basemap) {
  const { L, map } = ctx;
  ctx.base.forEach(l => map.removeLayer(l));
  const pane = map.getPane("tilePane");
  pane?.classList.toggle("sat", basemap === "satellite");
  pane?.classList.toggle("street", basemap === "street");
  ctx.base = basemap === "satellite" ? [
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }),
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 18, opacity: .85 }),
  ] : [L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" })];
  ctx.base.forEach(l => l.addTo(map));
  ctx.districts.eachLayer(l => (l as Leaflet.GeoJSON).setStyle?.({
    color: "#ffffff", opacity: basemap === "satellite" ? .7 : .45 }));
}

export type MapContext = Awaited<ReturnType<typeof createMap>>;

/**
 * Create the map once per mount. Creation is chained so a fast unmount/remount (React's development
 * double-mount) never builds two maps on the same container.
 */
export function useLeafletMap(host: { current: HTMLDivElement | null }, onReady: (ctx: MapContext) => void,
  onDispose?: () => void) {
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    let alive = true;
    let made: MapContext | null = null;
    chain.current = chain.current.then(async () => {
      if (!alive || !host.current) return;
      made = await createMap(host.current);
      if (!alive) { made.map.remove(); made = null; return; }
      ready.current(made);
    });
    return () => { alive = false; if (made) { made.map.remove(); made = null; } onDispose?.(); };
  }, []);
}
