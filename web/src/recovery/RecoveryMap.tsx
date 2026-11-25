import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { OSM_STREET_TILES } from "../data";

type Centre = {
  name: string; kind: "registered_deaddiction_centre" | "vimukthi_government_centre"; district: string | null;
  lat: number; lon: number; deaddiction_beds: number | null; bed_figure?: string; register_category?: string | null;
  registration?: string | null; location_basis: string;
};
type Priority = { place: string; taluk: string | null; district: string | null; lat: number; lon: number;
  people_far_from_help: number; mean_distance_km: number; burden_people_km: number };
type District = { population_2020: number; share_over_10km_from_centre: number; share_over_20km_from_centre: number;
  centres: number; deaddiction_beds_listed: number; listed_beds_per_100k: number;
  yearly_ndps_cases?: Record<string, number>; latest_month?: { month: string; ndps_cases: number; retrieved_on: string } };
type AccessMap = {
  meta: { built_on: string; reach_km: number; far_km: number; cell_degrees: number; centres_located: number;
    centres_unlocated: number; location_precision: string; limits: string[];
    freshness: Record<string, unknown> };
  centres: Centre[]; priority_places: Priority[]; districts: Record<string, District>;
  cells: [number, number, number, number, number][];
};
type Layer = "distance" | "beds" | "people";

const LAYERS: Record<Layer, { label: string; legend: [string, string][] }> = {
  distance: { label: "Distance to nearest centre", legend: [["#f3efe4", "under 5 km"], ["#f2cf8f", "5–10 km"],
    ["#e79a54", "10–15 km"], ["#c8572f", "15–20 km"], ["#8d2a1f", "20–30 km"], ["#4a1414", "over 30 km"]] },
  beds: { label: "Registered beds within 25 km, per 100,000 people", legend: [["#3d1f4d", "under 5"],
    ["#6e3f7d", "5–20"], ["#9d7bb0", "20–50"], ["#cdbfdc", "50–100"], ["#eef0f5", "100 or more"]] },
  people: { label: "People living over 10 km from help", legend: [["#fde3c8", "under 200"],
    ["#f8a86a", "200–1,000"], ["#e0582f", "1,000–3,000"], ["#9a1f1f", "3,000 or more"]] },
};

function colour(layer: Layer, population: number, km: number, beds: number): string | null {
  if (layer === "distance") {
    const steps = [5, 10, 15, 20, 30];
    return LAYERS.distance.legend[steps.findIndex(s => km < s) === -1 ? 5 : steps.findIndex(s => km < s)][0];
  }
  if (layer === "beds") {
    const steps = [5, 20, 50, 100];
    const index = steps.findIndex(s => beds < s);
    return LAYERS.beds.legend[index === -1 ? 4 : index][0];
  }
  if (km <= 10) return null;
  const steps = [200, 1000, 3000];
  const index = steps.findIndex(s => population < s);
  return LAYERS.people.legend[index === -1 ? 3 : index][0];
}

function gridImage(data: AccessMap, layer: Layer) {
  const step = data.meta.cell_degrees;
  const lats = data.cells.map(c => c[0]); const lons = data.cells.map(c => c[1]);
  const north = Math.max(...lats) + step / 2, south = Math.min(...lats) - step / 2;
  const west = Math.min(...lons) - step / 2, east = Math.max(...lons) + step / 2;
  // Leaflet stretches overlays in Web Mercator, so rows are placed by Mercator y, not by latitude.
  const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const scale = 4, top = mercator(north), span = top - mercator(south);
  const width = Math.round((east - west) / step) * scale, height = Math.round((north - south) / step) * scale;
  const y = (lat: number) => (top - mercator(lat)) / span * height;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d")!;
  for (const [lat, lon, population, km, beds] of data.cells) {
    const fill = colour(layer, population, km, beds);
    if (!fill) continue;
    context.fillStyle = fill;
    const y0 = Math.floor(y(lat + step / 2)), y1 = Math.ceil(y(lat - step / 2));
    context.fillRect(Math.round((lon - west) / step - .5) * scale, y0, scale, Math.max(1, y1 - y0));
  }
  return { url: canvas.toDataURL(), bounds: [[south, west], [north, east]] as L.LatLngBoundsLiteral };
}

const number = (value: number) => value.toLocaleString("en-IN");
const percent = (value: number) => `${Math.round(value * 100)}%`;

export function RecoveryMap() {
  const [data, setData] = useState<AccessMap | null>(null);
  const [error, setError] = useState("");
  const [layer, setLayer] = useState<Layer>("distance");
  const [showRegistered, setShowRegistered] = useState(true);
  const [selected, setSelected] = useState<Priority | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<{ map: L.Map; grid: L.ImageOverlay | null; centres: L.LayerGroup; focus: L.LayerGroup } | null>(null);
  const offline = new URLSearchParams(location.search).get("offline") === "1";

  useEffect(() => {
    fetch("/generated/recovery/access_map.json").then(r => {
      if (!r.ok) throw new Error("Run make recovery-map to build the local access map.");
      return r.json() as Promise<AccessMap>;
    }).then(setData).catch(e => setError(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    if (!root.current || engine.current) return;
    const map = L.map(root.current, { zoomControl: true, attributionControl: true, minZoom: 6, maxZoom: 15, zoomSnap: .25 });
    const kerala: L.LatLngBoundsLiteral = [[8.2, 74.85], [12.8, 77.4]];
    map.fitBounds(kerala);
    requestAnimationFrame(() => { map.invalidateSize(); map.fitBounds(kerala, { padding: [8, 8] }); });
    if (!offline) L.tileLayer(OSM_STREET_TILES, { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
    fetch("/geography/kerala-districts.geojson").then(r => r.json() as Promise<GeoJSON.GeoJsonObject>).then(outline =>
      L.geoJSON(outline, { style: { color: "#2b3a4a", weight: 1, fill: false, opacity: .7 }, interactive: false }).addTo(map));
    engine.current = { map, grid: null, centres: L.layerGroup().addTo(map), focus: L.layerGroup().addTo(map) };
    return () => { map.remove(); engine.current = null; };
  }, [offline]);

  useEffect(() => {
    const e = engine.current;
    if (!e || !data) return;
    e.grid?.remove();
    const image = gridImage(data, layer);
    e.grid = L.imageOverlay(image.url, image.bounds, { opacity: offline ? .95 : .72, className: "recovery-grid" }).addTo(e.map);
    e.grid.bringToBack();
  }, [data, layer, offline]);

  useEffect(() => {
    const e = engine.current;
    if (!e || !data) return;
    e.centres.clearLayers();
    for (const centre of data.centres) {
      const government = centre.kind === "vimukthi_government_centre";
      if (!government && !showRegistered) continue;
      const beds = centre.deaddiction_beds == null ? "beds not listed"
        : `${centre.deaddiction_beds} ${centre.bed_figure === "deaddiction_split" ? "de-addiction beds" : "registered beds (establishment total)"}`;
      L.circleMarker([centre.lat, centre.lon], {
        radius: government ? 7 : 3.5, color: government ? "#0b5d57" : "#1f2a44", weight: government ? 2 : 1,
        fillColor: government ? "#2bb3a3" : "#ffffff", fillOpacity: government ? .95 : .85,
      }).bindTooltip(`<strong>${centre.name}</strong><br>${government ? "Government Vimukthi centre" : `Registered centre, category ${centre.register_category ?? "?"}`}<br>${beds}<br><span class="muted">Location: ${centre.location_basis}</span>`)
        .addTo(e.centres);
    }
  }, [data, showRegistered]);

  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.focus.clearLayers();
    if (!selected) return;
    L.circle([selected.lat, selected.lon], { radius: 6000, color: "#9a1f1f", weight: 2, fill: false }).addTo(e.focus);
    e.map.flyTo([selected.lat, selected.lon], 11, { duration: .8 });
  }, [selected]);

  const districts = useMemo(() => data ? Object.entries(data.districts).filter(([name]) => name && name !== "null")
    .sort((a, b) => b[1].share_over_10km_from_centre - a[1].share_over_10km_from_centre) : [], [data]);
  const freshness = data?.meta.freshness as Record<string, { checked_on?: string }> | undefined;

  return <div className="recovery">
    <header className="recovery-head">
      <div>
        <p className="eyebrow">Corridor · Public recovery planning</p>
        <h1>Where Kerala residents are far from de-addiction help</h1>
        <p className="lede">Each 1 km square shows how far its residents are from the nearest de-addiction centre and how many registered beds are within reach. Ranked places show where new outreach or capacity would reach the most people. The map never shows where people who use drugs live.</p>
      </div>
      {data && <dl className="fresh">
        <div><dt>Centre register</dt><dd>{freshness?.registered_centres?.checked_on ?? "local copy"}</dd></div>
        <div><dt>Vimukthi directory</dt><dd>{freshness?.vimukthi_centres?.checked_on ?? String(data.meta.freshness.vimukthi_listed_on ?? "local copy")}</dd></div>
        <div><dt>Enforcement month</dt><dd>{districts.find(([, d]) => d.latest_month)?.[1].latest_month?.month ?? "none"}</dd></div>
        <div><dt>Population</dt><dd>WorldPop 2020</dd></div>
      </dl>}
    </header>
    {error && <p className="notice">{error}</p>}
    <div className="recovery-body">
      <section className="map-panel">
        <div className="controls" role="group" aria-label="Map layer">
          {(Object.keys(LAYERS) as Layer[]).map(id =>
            <button key={id} aria-pressed={layer === id} onClick={() => setLayer(id)}>{LAYERS[id].label}</button>)}
          <label><input type="checkbox" checked={showRegistered} onChange={e => setShowRegistered(e.target.checked)}/> Registered centres</label>
        </div>
        <div ref={root} className="map" aria-label="Kerala recovery access map"/>
        <div className="legend">
          <strong>{LAYERS[layer].label}</strong>
          {LAYERS[layer].legend.map(([fill, label]) => <span key={label}><i style={{ background: fill }}/>{label}</span>)}
          <span><i className="dot gov"/>Government Vimukthi centre</span><span><i className="dot reg"/>Registered centre</span>
        </div>
      </section>
      <aside className="side">
        <h2>Priority places</h2>
        <p className="muted">Localities ranked by people × kilometres beyond {data?.meta.far_km ?? 10} km from the nearest centre (straight line).</p>
        <ol className="priority">
          {data?.priority_places.slice(0, 20).map(p =>
            <li key={`${p.place}-${p.lat}`}><button aria-pressed={selected === p} onClick={() => setSelected(p)}>
              <span className="place">{p.place}</span>
              <span className="where">{[p.taluk, p.district].filter(Boolean).join(", ")}</span>
              <span className="stat">{number(p.people_far_from_help)} people · {p.mean_distance_km} km average</span>
            </button></li>)}
        </ol>
      </aside>
    </div>
    <section className="districts">
      <h2>Districts</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>District</th><th>Population</th><th>Over 10 km from a centre</th><th>Over 20 km</th><th>Centres</th>
          <th>Registered beds per 100k</th><th>Recorded Excise NDPS cases, latest month</th><th>Yearly recorded cases, 2016–2024</th></tr></thead>
        <tbody>{districts.map(([name, d]) => {
          const years = Object.entries(d.yearly_ndps_cases ?? {}).sort();
          const peak = Math.max(1, ...years.map(([, v]) => v));
          return <tr key={name}><th>{name}</th><td>{number(d.population_2020)}</td><td>{percent(d.share_over_10km_from_centre)}</td>
            <td>{percent(d.share_over_20km_from_centre)}</td><td>{d.centres}</td><td>{d.listed_beds_per_100k}</td>
            <td>{d.latest_month ? `${d.latest_month.ndps_cases} (${d.latest_month.month})` : "—"}</td>
            <td><span className="spark" aria-label={years.map(([y, v]) => `${y}: ${v}`).join(", ")}>
              {years.map(([y, v]) => <i key={y} title={`${y}: ${v}`} style={{ height: `${Math.max(2, v / peak * 26)}px` }}/>)}</span></td></tr>;
        })}</tbody>
      </table></div>
      <p className="muted">Recorded cases show where Excise registered NDPS cases. They reflect enforcement activity and are not a count of people who need help.</p>
    </section>
    {data && <footer className="limits"><h2>Limits</h2><ul>{data.meta.limits.map(l => <li key={l}>{l}</li>)}
      <li>{data.meta.location_precision}. {data.meta.centres_unlocated} listed centres could not be located.</li>
      <li>Some register bed figures are establishment totals, not beds reserved for de-addiction.</li></ul></footer>}
  </div>;
}
