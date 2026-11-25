import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { OSM_STREET_TILES } from "../data";

type Cell = { rank: number; lat: number; lon: number; locality: string; taluk: string | null; district: string;
  score: number; etas_expected_reports: number; reports_within_3km_28d: number; reports_within_3km_365d: number };
type Score = { ["hit_rate_0.01"]: number; ["pai_0.01"]: number; ["hit_rate_0.05"]: number;
  top_cell_precision: number; events: number; origins: number };
type Brief = {
  as_of: string; horizon_days: number; model: string; flagged_share_of_area: number; grid_cells: number;
  etas: { theta: number; omega: number; sigma_km: number; background_share: number };
  cells: Cell[]; weekly_located_reports: number[]; latest_report_by_source: Record<string, string>;
  located_reports_used: number; measure: string;
  test: { horizon: Score; long_run_hotspots: Score; population: Score } | null;
  audit: { share_at_repeat_localities: number; overall_top1pct: { ranker: number; repeat_1km: number; long_run: number };
    hit_rate_top1pct: { repeat: { ranker: number; events: number }; new: { ranker: number; events: number } } } | null;
  postcutoff: { window: [string, string]; horizon: Record<string, Score> } | null;
};

const SOURCES: Record<string, string> = { nie: "New Indian Express", toi: "Times of India", onm: "Onmanorama" };
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const MODEL: Record<string, string> = { etas: "self-exciting point process", learned_ranker: "learned cell ranker" };

function colour(rank: number, total: number) {
  const f = rank / total;
  return f <= .1 ? "#7a0f12" : f <= .3 ? "#b8322a" : f <= .6 ? "#e0703a" : "#f1aa62";
}

export function HotspotMap() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<{ map: L.Map; cells: L.LayerGroup; focus: L.LayerGroup } | null>(null);
  const offline = new URLSearchParams(location.search).has("offline");

  useEffect(() => {
    fetch("/generated/hotspots/grid_forecast.json").then(r => {
      if (!r.ok) throw new Error("Run make hotspot-forecast to build the grid forecast.");
      return r.json() as Promise<Brief>;
    }).then(setBrief).catch(e => setError(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    if (!root.current || engine.current) return;
    const map = L.map(root.current, { minZoom: 6, maxZoom: 15, zoomSnap: .25 });
    map.fitBounds([[8.2, 74.85], [12.8, 77.4]]);
    requestAnimationFrame(() => map.invalidateSize());
    if (!offline) L.tileLayer(OSM_STREET_TILES, { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
    fetch("/geography/kerala-districts.geojson").then(r => r.json() as Promise<GeoJSON.GeoJsonObject>).then(outline =>
      L.geoJSON(outline, { style: { color: "#2b3a4a", weight: 1, fill: false, opacity: .7 }, interactive: false }).addTo(map));
    engine.current = { map, cells: L.layerGroup().addTo(map), focus: L.layerGroup().addTo(map) };
  }, [offline]);

  useEffect(() => {
    const e = engine.current;
    if (!e || !brief) return;
    e.cells.clearLayers();
    const half = 0.00417;
    for (const cell of [...brief.cells].reverse()) {
      const rect = L.rectangle([[cell.lat - half, cell.lon - half], [cell.lat + half, cell.lon + half]], {
        color: colour(cell.rank, brief.cells.length), weight: 1, fillOpacity: .78, className: "hot-cell" });
      rect.bindTooltip(`<b>#${cell.rank} · near ${cell.locality}</b><br>${cell.taluk ?? ""}${cell.taluk ? ", " : ""}${cell.district}`
        + `<br><span class="muted">${cell.reports_within_3km_365d} reports within 3 km in the past year, `
        + `${cell.reports_within_3km_28d} in the past 28 days</span>`);
      rect.on("click", () => setSelected(cell));
      rect.addTo(e.cells);
    }
  }, [brief]);

  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.focus.clearLayers();
    if (!selected) return;
    e.map.flyTo([selected.lat, selected.lon], 12, { duration: .6 });
    L.circle([selected.lat, selected.lon], { radius: 3000, color: "#172031", weight: 2, fill: false, dashArray: "4 4" })
      .addTo(e.focus);
  }, [selected]);

  const localities = brief ? Object.values(brief.cells.reduce<Record<string, Cell & { cellCount: number }>>((acc, c) => {
    const key = `${c.locality}|${c.district}`;
    acc[key] = acc[key] ? { ...acc[key], cellCount: acc[key].cellCount + 1 } : { ...c, cellCount: 1 };
    return acc;
  }, {})).sort((a, b) => a.rank - b.rank).slice(0, 40) : [];
  const weekly = brief?.weekly_located_reports ?? [];
  const peak = Math.max(1, ...weekly);
  const test = brief?.test;

  return <main className="recovery">
    <header className="recovery-head">
      <div>
        <p className="eyebrow">Corridor · where next</p>
        <h1>Where the next reported seizure is most likely</h1>
        <p className="lede">The top 1% of Kerala's 1 km cells for the next {brief?.horizon_days ?? 28} days, ranked by a
          {" "}{brief ? MODEL[brief.model] : "grid model"} trained on dated, located seizure reports. Cells are
          {" "}located to a locality from news text, so a square means "around this locality", not a street.</p>
      </div>
      {brief && <dl className="fresh">
        <div><dt>Forecast from</dt><dd>{brief.as_of}</dd></div>
        <div><dt>Reports used</dt><dd>{brief.located_reports_used.toLocaleString()}</dd></div>
        {Object.entries(brief.latest_report_by_source).map(([k, v]) =>
          <div key={k}><dt>Latest {SOURCES[k] ?? k}</dt><dd>{v}</dd></div>)}
      </dl>}
    </header>
    {error && <p className="notice">{error}</p>}
    {test && <section className="score-row" aria-label="Test performance">
      <div><b>{pct(test.horizon["hit_rate_0.01"])}</b><span>of located seizures in the next {brief?.horizon_days} days fell in
        the flagged 1% of area (held-out test, 2024 to mid-2026)</span></div>
      {brief?.audit && <div><b>{pct(brief.audit.overall_top1pct.repeat_1km)}</b><span>for a plain "same locality
        again" map, so most of the skill is repetition</span></div>}
      <div><b>{pct(test.long_run_hotspots["hit_rate_0.01"])}</b><span>for a smoothed long-run hotspot map</span></div>
      {brief?.audit && <div><b>{pct(brief.audit.hit_rate_top1pct.new.ranker)}</b><span>of seizures at localities with no
        earlier report were caught ({pct(1 - brief.audit.share_at_repeat_localities)} of all)</span></div>}
      {brief?.postcutoff && <div><b>{pct(brief.postcutoff.horizon.learned_ranker["hit_rate_0.01"])}</b><span>after the
        cutoff ({brief.postcutoff.window[0]} on), against {pct(brief.postcutoff.horizon.repeat_locality_1km["hit_rate_0.01"])}
        {" "}for the repeat map</span></div>}
    </section>}
    <div className="recovery-body">
      <section className="map-panel">
        <div ref={root} className="map" aria-label="Map of flagged cells"/>
        <div className="legend"><strong>Rank within flagged cells</strong>
          <span><i style={{ background: "#7a0f12" }}/>top 10%</span><span><i style={{ background: "#b8322a" }}/>10–30%</span>
          <span><i style={{ background: "#e0703a" }}/>30–60%</span><span><i style={{ background: "#f1aa62" }}/>60–100%</span>
        </div>
      </section>
      <aside className="side">
        <h2>Flagged localities</h2>
        <p className="muted">Ordered by the highest-ranked cell near each locality. Select one to zoom in.</p>
        <ol className="priority">{localities.map(c => <li key={`${c.locality}${c.district}`}>
          <button aria-pressed={selected?.rank === c.rank} onClick={() => setSelected(c)}>
            <span className="place">{c.locality}</span>
            <span className="where">{c.taluk ? `${c.taluk}, ` : ""}{c.district} · {c.cellCount} cell{c.cellCount > 1 ? "s" : ""}</span>
            <span className="stat">{c.reports_within_3km_365d} reports within 3 km in a year · {c.reports_within_3km_28d} in 28 days</span>
          </button></li>)}</ol>
      </aside>
    </div>
    {brief && <section className="districts">
      <h2>Located reports per week, last two years</h2>
      <div className="weekly" aria-label="Weekly located reports">{weekly.map((v, i) =>
        <i key={i} className={i >= weekly.length - 4 ? "recent" : ""} style={{ height: `${v / peak * 100}%` }}
          title={`${v} reports`}/>)}</div>
      <p className="muted">Fitted near-repeat effect: each report adds {brief.etas.theta.toFixed(2)} expected nearby reports,
        within about {brief.etas.sigma_km.toFixed(1)} km, decaying with a {(1 / brief.etas.omega).toFixed(0)}-day time scale.
        {" "}{pct(1 - brief.etas.background_share)} of reports are attributed to an earlier nearby one.</p>
    </section>}
    <section className="limits">
      <h2>What this is and is not</h2>
      <ul>
        <li>It forecasts <b>reported</b> seizures: a seizure that was made, announced and picked up by a news desk
          (New Indian Express, Times of India, Onmanorama, Asianet News). Reporting follows enforcement effort and editors' attention, so city desks and large hauls weigh more.</li>
        <li>A cell that is not flagged has not been shown to be free of drugs. Coverage gaps are not safety.</li>
        <li>It is strong at "where seizures keep being reported" and weak at new places: about a quarter of seizures
          happen at a locality with no earlier report, and almost none of those fall in flagged cells. Palakkad, Kasaragod,
          Pathanamthitta and Kannur are barely covered by the news sample.</li>
        <li>Locations are locality centroids from headlines and summaries, so precision is about 1–3 km.</li>
        <li>It scores no person or address and is not a patrol order. It is a planning aid to compare with local
          knowledge and official records.</li>
      </ul>
    </section>
  </main>;
}
