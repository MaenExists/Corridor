import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import { KIND_LABEL, type PlaceHit } from "@/lib/placeRules";

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
  const labels = placeLabels(L, map);
  requestAnimationFrame(() => map.invalidateSize());
  return { L, map, districts, labels, base: [] as Leaflet.Layer[] };
}

const SETTLEMENTS = new Set(["city", "town", "suburb", "village", "neighbourhood", "hamlet", "locality"]);
const escape = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/**
 * Place names from the local OpenStreetMap list, drawn over the satellite. More appear as you zoom in;
 * a label is skipped when it would overlap a more important one.
 */
function placeLabels(L: typeof Leaflet, map: Leaflet.Map) {
  map.createPane("labels");
  const pane = map.getPane("labels")!;
  pane.style.zIndex = "450"; pane.style.pointerEvents = "none";
  const group = L.layerGroup().addTo(map);
  let enabled = true, seq = 0, timer: ReturnType<typeof setTimeout> | undefined, lang: "en" | "ml" = "en";

  async function refresh() {
    const id = ++seq, zoom = map.getZoom();
    if (!enabled || zoom < 9) { group.clearLayers(); return; }
    const b = map.getBounds().pad(.15);
    const list: PlaceHit[] = await fetch(`/api/places?bbox=${[b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map(n => n.toFixed(3)).join(",")}&z=${zoom}`)
      .then(r => r.ok ? r.json() : []).catch(() => []);
    if (id !== seq) return;
    group.clearLayers();
    const size = map.getSize(), placed: number[][] = [];
    for (const p of list) {
      const pt = map.latLngToContainerPoint([p.lat, p.lon]);
      const font = p.rank <= 1 ? 13 : p.rank <= 2 ? 12 : p.rank <= 3 ? 11.5 : 10.5;
      const caps = p.rank <= 1 ? 1.25 : 1;
      const name = lang === "ml" && p.ml ? p.ml : p.name;
      const w = name.length * font * (lang === "ml" && p.ml ? .62 : .56) * caps + 14, h = font + (lang === "ml" ? 13 : 10);
      const box = [pt.x - w / 2, pt.y - h, pt.x + w / 2, pt.y + 3];
      if (box[2] < 0 || box[0] > size.x || box[3] < 0 || box[1] > size.y) continue;
      if (placed.some(o => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue;
      placed.push(box);
      const landmark = !SETTLEMENTS.has(p.kind);
      L.marker([p.lat, p.lon], {
        pane: "labels", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "", iconSize: [0, 0], iconAnchor: [0, 0],
          html: `<div class="nt-label r${p.rank}${landmark ? " lm" : ""}" title="${escape(KIND_LABEL[p.kind] ?? p.kind)}"><span>${escape(name)}</span><i></i></div>` }),
      }).addTo(group);
      if (placed.length >= 160) break;
    }
  }
  map.on("moveend", () => { clearTimeout(timer); timer = setTimeout(refresh, 120); });
  refresh();
  return {
    setEnabled(on: boolean) { if (on !== enabled) { enabled = on; refresh(); } },
    /** Malayalam names where OpenStreetMap has them. */
    setLang(l: "en" | "ml") { if (l !== lang) { lang = l; refresh(); } },
  };
}

/** Desaturated satellite imagery with place labels, or a grey street map. */
export function setBasemap(ctx: { L: typeof Leaflet; map: Leaflet.Map; districts: Leaflet.LayerGroup; base: Leaflet.Layer[];
  labels: { setEnabled: (on: boolean) => void; setLang: (l: "en" | "ml") => void } }, basemap: Basemap) {
  const { L, map } = ctx;
  ctx.base.forEach(l => map.removeLayer(l));
  const pane = map.getPane("tilePane");
  pane?.classList.toggle("sat", basemap === "satellite");
  pane?.classList.toggle("street", basemap === "street");
  ctx.base = basemap === "satellite" ? [
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }),
    // Roads close in; Esri's sparse place names only for the wide view, where our own list takes over.
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      { minZoom: 10, maxZoom: 18, opacity: .55, className: "nt-roads" }),
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 8, opacity: .85 }),
  ] : [L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors",
    // The site sends no referrer; OSM's tile policy blocks browser requests without one, so send only the origin.
    referrerPolicy: "strict-origin" } as Leaflet.TileLayerOptions)];
  ctx.base.forEach(l => l.addTo(map));
  // The street map prints its own names; our labels are for the satellite.
  ctx.labels.setEnabled(basemap === "satellite");
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
