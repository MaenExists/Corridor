"use client";
import { useEffect, useState, useRef } from "react";
import {
  Plus,
  Minus,
  LocateFixed,
  Layers,
  Compass,
  Maximize,
  Minimize,
  Crosshair,
} from "lucide-react";
import type * as Leaflet from "leaflet";
import type { GeoJsonObject } from "geojson";
import { CENTER, NODES } from "../../data";
import type { Selection } from "../../data";
import type { Forecast } from "../../../../shared/schema";
import { districtName, districtPoints, isIssued, pairId, pairLabel } from "../model";
import type { Connection, MapRecord } from "../model";

import PlaceProfile from "./place-profile";
import MapFeatureSearch from "./map-feature-search";
import { type PublicPlace as Location, type PlaceDataset } from "../lib/places";
import {
  substanceSignals,
  evidenceSignals,
  FORECAST_COLOR,
  reviewPattern,
} from "../lib/map-signals";
import type { Feature, Polygon, MultiPolygon } from "geojson";

type Engine = {
  L: typeof Leaflet;
  map: Leaflet.Map;
  boundaries: Leaflet.LayerGroup;
  evidence: Leaflet.LayerGroup;
  locations: Leaflet.LayerGroup;
  focus: Leaflet.LayerGroup;
};
const KERALA: Leaflet.LatLngBoundsLiteral = [
  [8.15, 74.75],
  [12.85, 77.6],
];
const fallbackLocations: Location[] = districtPoints;
const INFRASTRUCTURE: Connection[] = [["Wayanad","Palakkad"],["Idukki","Kollam"],["Kannur","Malappuram"]];
function label(text: string) {
  const el = document.createElement("span");
  el.textContent = text;
  return el;
}
function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function CorridorMap({
  records,
  selected,
  onSelect,
  forecast,
  connections,
  showForecast,
  coverage,
  coverageThreshold,
  showPoints,
  setShowPoints,
  focusedDistrict = "all",
  searchText,
  onSearchTextChange,
  searchRequest,
}: {
  records: MapRecord[];
  selected: Selection;
  onSelect: (selection: Selection) => void;
  forecast: Forecast[];
  connections: Connection[];
  showForecast: boolean;
  coverage: Record<string, number>;
  coverageThreshold: number;
  showPoints: boolean;
  setShowPoints: (x: boolean) => void;
  focusedDistrict?: string;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  searchRequest: number;
}) {
  const container = useRef<HTMLDivElement>(null),
    engine = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false),
    [mapError, setMapError] = useState("");
  const [showCoverage, setShowCoverage] = useState(true),
    [infrastructure, setInfrastructure] = useState(false),
    [showConnections,setShowConnections] = useState(true),
    [districts, setDistricts] = useState(true),
    [localPoints, setLocalPoints] = useState(true),
    [expanded, setExpanded] = useState(false),
    [focusKerala, setFocusKerala] = useState(true),
    [colorBy, setColorBy] = useState<"substance" | "evidence">("evidence");
  const [transport, setTransport] = useState<Location[]>([]);
  const [locations, setLocations] = useState<Location[]>(fallbackLocations),
    [chosen, setChosen] = useState<Location | null>(null);
  const [view, setView] = useState({ zoom: 7, lat: 10.5, lon: 76.3, tick: 0 });
  const previousSelected = useRef(selected),
    previousDistrict = useRef(focusedDistrict);
  useEffect(() => {
    let cancelled = false,
      observer: ResizeObserver | undefined;
    async function initialize() {
      try {
        const L = await import("leaflet");
        if (cancelled || !container.current) return;
        const map = L.map(container.current, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: true,
          touchZoom: true,
          doubleClickZoom: true,
          keyboard: true,
          zoomSnap: 0.25,
          zoomDelta: 1,
          wheelPxPerZoomLevel: 120,
          wheelDebounceTime: 30,
          minZoom: 5,
          maxZoom: 19,
          maxBounds: [
            [5, 67],
            [39, 99],
          ],
          maxBoundsViscosity: 0.6,
          // Leaflet can finish a zoom transition after React removes this screen.
          zoomAnimation: false,
          fadeAnimation: !reducedMotion(),
        });
        map.fitBounds(KERALA, { padding: [32, 60], animate: false });
        map.createPane("kerala-focus");
        map.getPane("kerala-focus")!.style.zIndex = "320";
        map.createPane("kerala-outline");
        map.getPane("kerala-outline")!.style.zIndex = "365";
        const focus = L.layerGroup().addTo(map);
        map.createPane("districts");
        map.getPane("districts")!.style.zIndex = "350";
        map.createPane("evidence");
        map.getPane("evidence")!.style.zIndex = "450";
        const boundaries = L.layerGroup().addTo(map),
          evidence = L.layerGroup().addTo(map),
          locationLayer = L.layerGroup().addTo(map);
        L.control
          .scale({ imperial: false, position: "bottomright", maxWidth: 90 })
          .addTo(map);
        const refresh = () => {
          const c = map.getCenter();
          if (!cancelled)
            setView((v) => ({
              zoom: map.getZoom(),
              lat: c.lat,
              lon: c.lng,
              tick: v.tick + 1,
            }));
        };
        map.on("moveend zoomend resize", refresh);
        refresh();
        engine.current = {
          L,
          map,
          boundaries,
          evidence,
          locations: locationLayer,
          focus,
        };
        observer = new ResizeObserver(() => {
          if (!cancelled && container.current?.isConnected) map.invalidateSize({ pan: false });
        });
        observer.observe(container.current);
        setReady(true);
        const geographic = await Promise.allSettled(
          [
            "/geography/land.geojson",
            "/geography/kerala-districts.geojson",
            "/geography/kerala-state.geojson",
          ].map((url) =>
            fetch(url).then((r) => {
              if (!r.ok) throw Error();
              return r.json() as Promise<GeoJsonObject>;
            }),
          ),
        );
        if (cancelled) return;
        for (let i = 0; i < 2; i++) {
          const result = geographic[i];
          if (result.status === "fulfilled")
            L.geoJSON(result.value, {
              pane: "districts",
              interactive: false,
              style: {
                color: i ? "#707070" : "#303030",
                weight: i ? 1 : 0.6,
                fillColor: "#000000",
                fillOpacity: i ? 0.04 : 0.08,
              },
            }).addTo(boundaries);
        }
        const state = geographic[2];
        if (state.status === "fulfilled") {
          const feature = state.value as Feature<Polygon | MultiPolygon>;
          const polygons =
            feature.geometry.type === "Polygon"
              ? [feature.geometry.coordinates]
              : feature.geometry.coordinates;
          const holes = polygons
            .flat()
            .map((ring) =>
              ring.map(([lon, lat]) => [lat, lon] as Leaflet.LatLngTuple),
            );
          const world: Leaflet.LatLngTuple[] = [
            [-85, -180],
            [-85, 180],
            [85, 180],
            [85, -180],
          ];
          L.polygon([world, ...holes], {
            pane: "kerala-focus",
            stroke: false,
            fillColor: "#000000",
            fillOpacity: 0.73,
            fillRule: "evenodd",
            interactive: false,
            className: "kerala-focus-mask",
          }).addTo(focus);
          L.geoJSON(feature, {
            pane: "kerala-outline",
            interactive: false,
            style: {
              color: "#e5f0ec",
              weight: 2,
              opacity: 0.94,
              fillColor: "#ffffff",
              fillOpacity: 0.025,
              className: "kerala-state-outline",
            },
          }).addTo(focus);
        }
        if (geographic[1].status === "rejected")
          setMapError(
            "District boundaries are unavailable. Approximate district references remain visible.",
          );
      } catch {
        if (!cancelled)
          setMapError(
            "The map could not initialize. Reload the workspace to try again.",
          );
      }
    }
    initialize();
    fetch("/geography/kerala-places.json")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json() as Promise<PlaceDataset>;
      })
      .then((data) => {
        if (!cancelled) {
          setLocations([
            ...fallbackLocations.filter(p=>p.state !== "Kerala"),
            ...data.districts.map(p=>({ ...p, referenceId:districtName(p.name) })),
            ...data.places,
            ...data.transport,
          ]);
          setTransport(data.transport);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      observer?.disconnect();
      engine.current?.map.stop().remove();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    if (districts) e.boundaries.addTo(e.map);
    else e.boundaries.remove();
  }, [districts, ready]);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    if (focusKerala) e.focus.addTo(e.map);
    else e.focus.remove();
  }, [focusKerala, ready]);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const { L, map, evidence } = e;
    evidence.clearLayers();
    const coordinates = (c: Connection): Leaflet.LatLngTuple[] => {
      const [a,b]=c.map(id=>NODES[id]);
      return [a,[(a[0]+b[0])/2,(a[1]+b[1])/2+.1],b];
    };
    const active = "connection" in selected ? pairId(selected.connection) : null;
    const keyHandler = (layer: Leaflet.Path, description: string, activate:()=>void) => {
      const element=layer.getElement();
      if (!element) return;
      element.setAttribute("role","button");
      element.setAttribute("tabindex","0");
      element.setAttribute("aria-label",description);
      element.addEventListener("keydown",event=>{
        if(["Enter"," "].includes((event as KeyboardEvent).key)){event.preventDefault();activate();}
      });
    };
    if (showConnections && infrastructure && connections.length)
      for(const pair of INFRASTRUCTURE) L.polyline(coordinates(pair),{
        pane:"evidence",color:"#b79e77",weight:2,dashArray:"1 6",className:"infrastructure-hypothesis"
      }).bindTooltip(label("Fictional infrastructure hypothesis · not movement evidence")).addTo(evidence);
    if (showConnections && showForecast)
      for (const f of forecast) {
        if (!f.connection || !isIssued(f) || !NODES[f.connection[0]] || !NODES[f.connection[1]] ||
          !connections.some(pair=>pairId(pair)===pairId(f.connection!))) continue;
        const pair=f.connection;
        const hint=`Synthetic forecast: ${pairLabel(pair)} · ${f.estimate!.toFixed(1)} documented cases / ${f.horizon_days}d`;
        const line=L.polyline(coordinates(pair),{pane:"evidence",color:FORECAST_COLOR,weight:7,opacity:.43,dashArray:"4 10",
          className:"forecast-corridor"}).bindTooltip(label(hint),{sticky:true,className:"evidence-tooltip"}).addTo(evidence);
        line.on("click",()=>onSelect({connection:pair}));
        keyHandler(line,hint,()=>onSelect({connection:pair}));
      }
    if(showConnections) for (const c of connections) {
      const id=pairId(c);
      const rows = records.filter((r) => r.connectionId === id);
      if (!rows.length) continue;
      const status = rows.some((r) => r.status === "documented") ? "documented" : "unreviewed";
      const select=()=>onSelect({connection:c});
      const description=`${pairLabel(c)} · ${rows.length} fictional documented records`;
      const hitTarget = L.polyline(coordinates(c), {
        pane: "evidence",
        color: "transparent",
        weight: 18,
        opacity: 0,
        className: "map-route-hit",
      }).addTo(evidence);
      hitTarget.on("click", select);
      hitTarget.bindTooltip(
        label(
          description,
        ),
        { sticky: true, className: "evidence-tooltip" },
      );
      const line = L.polyline(coordinates(c), {
        pane: "evidence",
        color: colorBy === "substance" && rows[0].substance !== "Unknown"
          ? substanceSignals[rows[0].substance] : evidenceSignals[status],
        weight: id === active ? 3.5 : 2,
        opacity: id === active ? 1 : 0.7,
        dashArray: reviewPattern[status],
        className: "map-route",
      }).addTo(evidence);
      line.bindTooltip(
        label(
          description,
        ),
        { sticky: true, className: "evidence-tooltip" },
      );
      line.on("click", select);
      keyHandler(line,description,select);
      line.getElement()?.setAttribute("data-corridor-id",id);
    }
    for (const p of districtPoints) {
      const linked = "connection" in selected ? selected.connection.includes(p.id) : selected.area===p.id;
      const f=forecast.find(r=>r.area===p.id);
      const unknown=p.state==="Kerala" && (coverage[p.id]==null || coverage[p.id]<coverageThreshold);
      const count = showPoints ? records.filter(r=>r.district===p.id).length : 0;
      if (count) L.circleMarker([p.lat,p.lon],{pane:"evidence",radius:Math.min(14,4+Math.sqrt(count)),color:"#8caeb5",
        fillColor:"#638d9b",fillOpacity:.27,weight:1,interactive:false}).addTo(evidence);
      if (showCoverage && unknown) L.circleMarker([p.lat,p.lon],{pane:"evidence",radius:9,color:"#ffd000",weight:1.5,
        dashArray:"2 4",fillOpacity:0,interactive:false,className:"coverage-gap-ring"}).addTo(evidence);
      const marker = L.circleMarker([p.lat, p.lon], {
        pane: "evidence",
        radius: linked ? 5 : showForecast && f && isIssued(f) ? 4 : 2.5,
        color: linked ? "#eeeeee" : showForecast && f && isIssued(f) ? FORECAST_COLOR : "#888888",
        weight: 1,
        fillColor: "#000",
        fillOpacity: 1,
      }).addTo(evidence);
      const descriptor=(showCoverage && unknown ? " · Coverage unknown" : "") +
        (showForecast && f && isIssued(f) ? ` · ${f.estimate!.toFixed(1)} / ${f.horizon_days}d` : "");
      marker.bindTooltip(label(p.name), {
        permanent: map.getZoom() < 10,
        direction: "right",
        offset: [7, 0],
        className: "district-label",
      });
      marker.on("mouseover",()=>marker.setTooltipContent(label(p.name + descriptor)));
      marker.on("mouseout",()=>marker.setTooltipContent(label(p.name)));
      const choose=()=>{
        if(p.state==="Kerala") onSelect({area:p.id});
        setChosen(locations.find(item=>item.referenceId===p.id) ?? p);
      };
      marker.on("click", choose);
      keyHandler(marker,p.name + descriptor,choose);
    }
  }, [
    ready,
    records,
    selected,
    onSelect,
    forecast,
    connections,
    showForecast,
    showPoints,
    showCoverage, showConnections, infrastructure, coverage, coverageThreshold,
    view.zoom,
    colorBy,
    locations,
  ]);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const { L, map } = e;
    e.locations.clearLayers();
    if (localPoints && view.zoom >= 11) {
      const bounds = map.getBounds();
      const visible = locations
        .filter(
          (p) =>
            !["district reference", "district"].includes(p.kind) &&
            bounds.contains([p.lat, p.lon]),
        )
        .slice(0, 800);
      for (const p of visible) {
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: view.zoom >= 14 ? 2.5 : 1.5,
          color: "#b0b0b0",
          weight: 0,
          fillColor: "#b0b0b0",
          fillOpacity: 0.8,
        }).addTo(e.locations);
        marker.bindTooltip(
          label(`${p.name}${p.localName ? " / " + p.localName : ""}`),
          {
            permanent: view.zoom >= 14,
            direction: "right",
            className: "local-place-label",
          },
        );
        marker.on("click", () => setChosen(p));
      }
    }
    if (chosen?.bounds) {
      const [south, north, west, east] = chosen.bounds;
      L.rectangle(
        [
          [south, west],
          [north, east],
        ],
        {
          color: "#e5e5e5",
          weight: 1,
          dashArray: "4 5",
          fill: false,
          interactive: false,
          className: "selected-feature-bounds",
        },
      ).addTo(e.locations);
    }
    if (chosen)
      L.circleMarker([chosen.lat, chosen.lon], {
        radius: 9,
        color: "#fff",
        weight: 1.5,
        fillOpacity: 0,
      })
        .bindTooltip(label(chosen.name), {
          permanent: true,
          direction: "top",
          className: "selected-place-label",
        })
        .addTo(e.locations);
  }, [ready, view, localPoints, locations, chosen]);
  useEffect(() => {
    const e = engine.current;
    if (!e || previousSelected.current === selected) return;
    previousSelected.current = selected;
    if ("connection" in selected)
      e.map.fitBounds(
        selected.connection.map(id=>NODES[id]),
        { padding: [70, 90], maxZoom: 10, animate: !reducedMotion() },
      );
  }, [ready, selected]);
  useEffect(() => {
    const e = engine.current;
    if (!e || previousDistrict.current === focusedDistrict) return;
    previousDistrict.current = focusedDistrict;
    const p = CENTER[focusedDistrict];
    if (p) e.map.setView(p, 9, { animate: !reducedMotion() });
    else
      e.map.fitBounds(KERALA, { padding: [32, 60], animate: !reducedMotion() });
  }, [ready, focusedDistrict]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  function locate(p: Location) {
    setChosen(p);
    onSearchTextChange(p.name);
    const key=districtName(p.referenceId ?? p.district ?? p.name);
    if(key) onSelect({area:key});
    if (p.dataProvider === "openstreetmap" && p.state !== "Kerala")
      setFocusKerala(false);
    if (p.bounds) {
      const [south, north, west, east] = p.bounds;
      engine.current?.map.fitBounds(
        [
          [south, west],
          [north, east],
        ],
        {
          padding: [65, 80],
          maxZoom: p.kind === "road" ? 17 : 18,
          animate: !reducedMotion(),
        },
      );
      return;
    }
    engine.current?.map.setView(
      [p.lat, p.lon],
      ["district reference", "district"].includes(p.kind) ? 10 : 14,
      { animate: !reducedMotion() },
    );
  }
  function reset() {
    engine.current?.map.fitBounds(KERALA, {
      padding: [32, 60],
      animate: !reducedMotion(),
    });
    setChosen(null);
    onSearchTextChange("");
    setFocusKerala(true);
  }
  return (
    <div className={`map-stage detailed-map ${expanded ? "map-expanded" : ""}`}>
      <div
        ref={container}
        className="atlas leaflet-atlas"
        role="region"
        aria-label="Interactive offline map of Kerala"
        tabIndex={0}
      />
      <div className="map-heading">
        <span>
          <Crosshair size={13} /> Kerala geographic workspace
        </span>
        <small>Offline geography · evidence stays at district resolution</small>
      </div>
      <MapFeatureSearch
        places={locations}
        query={searchText}
        onQueryChange={onSearchTextChange}
        onSelect={locate}
        externalRequest={searchRequest}
      />
      {mapError && (
        <div className="map-error" role="status">
          {mapError}
        </div>
      )}
      <div className="map-controls">
        <button
          aria-label="Zoom in"
          title="Zoom in (+)"
          onClick={() => engine.current?.map.zoomIn()}
        >
          <Plus size={18} />
        </button>
        <button
          aria-label="Zoom out"
          title="Zoom out (−)"
          onClick={() => engine.current?.map.zoomOut()}
        >
          <Minus size={18} />
        </button>
        <button
          aria-label="Reset map view"
          title="Fit all of Kerala"
          onClick={reset}
        >
          <LocateFixed size={18} />
        </button>
        <button
          aria-label={expanded ? "Exit expanded map" : "Expand map"}
          title={expanded ? "Exit expanded map (Escape)" : "Expand map"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize size={17} /> : <Maximize size={17} />}
        </button>
      </div>
      <details className="map-layer-menu">
        <summary>
          <Layers size={15} /> Layers
        </summary>
        <label>
          <input
            type="checkbox"
            checked={showCoverage}
            onChange={(e) => setShowCoverage(e.target.checked)}
          />{" "}
          Coverage gaps
        </label>
        {!!connections.length && <>
          <label><input type="checkbox" checked={showConnections} onChange={e=>setShowConnections(e.target.checked)}/> Documented connections</label>
          <label><input type="checkbox" checked={infrastructure} onChange={e=>setInfrastructure(e.target.checked)}/> Infrastructure hypotheses</label>
        </>}
        <label>
          <input
            type="checkbox"
            checked={districts}
            onChange={(e) => setDistricts(e.target.checked)}
          />{" "}
          District boundaries
        </label>
        <label>
          <input
            type="checkbox"
            checked={focusKerala}
            onChange={(e) => setFocusKerala(e.target.checked)}
          />{" "}
          Focus on Kerala
        </label>
        <label>
          <input
            type="checkbox"
            checked={localPoints}
            onChange={(e) => setLocalPoints(e.target.checked)}
          />{" "}
          Places & transport points
        </label>
        <small>
          Place points appear at zoom 11+; labels at 14+. Geographic context
          only.
        </small>
      </details>
      <div className="map-north">
        <Compass size={24} />
        <span>N</span>
      </div>
      <div className="map-legend logistics-legend">
        <label className="color-by-control">
          Color by{" "}
          <select
            aria-label="Color connections by"
            value={colorBy}
            onChange={(e) =>
              setColorBy(e.target.value as "substance" | "evidence")
            }
          >
            <option value="substance">Substance category</option>
            <option value="evidence">Evidence review</option>
          </select>
        </label>
        <div className="map-legend-signals">
          {colorBy === "substance"
            ? Object.entries(substanceSignals).map(([sub, color]) => (
                <span key={sub}>
                  <i
                    className="line"
                    style={{ borderColor: color, backgroundColor: color }}
                  />
                  {sub}
                </span>
              ))
            : Object.entries(evidenceSignals).filter(([status])=>status!=="disputed").map(([status, color]) => (
                  <span key={status}>
                    <i
                      className={`line ${status === "documented" ? "" : "dashed"}`}
                      style={{ borderColor: color }}
                    />
                    {status === "documented" ? "Reviewed fixture" : "Reported fixture"}
                  </span>
                ))}
          {showForecast && (
            <span>
              <i className="line forecast-line" />
              Forecast · documented counts
            </span>
          )}
          <button
            onClick={() => setShowPoints(!showPoints)}
            className={showPoints ? "on" : ""}
          >
             District history {showPoints ? "on" : "off"}
          </button>
        </div>
        <small>
          {showCoverage ? "Amber ring: coverage unknown, not safety. " : ""}{infrastructure && showConnections ? "Dotted lines: fictional infrastructure only. " : ""}Synthetic, district-level.
        </small>
      </div>
      <div className="map-readout">
        <output
          aria-label="Map zoom level"
          data-zoom={view.zoom}
          aria-live="polite"
        >
          Z {view.zoom.toFixed(2)}
        </output>
        <span>
          {view.lat.toFixed(4)}° N / {view.lon.toFixed(4)}° E
        </span>
        <span className="map-gesture-hint">
          Scroll to zoom · drag to pan · double-click to zoom
        </span>
      </div>
      <div className="map-credit">
        ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap contributors
        </a>{" "}
        ·{" "}
        <a
          href="https://github.com/opendatakerala/kl_district"
          target="_blank"
          rel="noreferrer"
        >
          Open Data Kerala
        </a>{" "}
        / ODbL ·{" "}
        <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
          GeoNames / CC BY 4.0
        </a>{" "}
        · <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth</a>
        {" "}· <span>Lines are schematic, not street journeys</span>
      </div>
      {chosen && (
        <PlaceProfile
          key={chosen.id}
          place={chosen}
          transport={transport}
          onLocate={locate}
          onClose={() => setChosen(null)}
        />
      )}
    </div>
  );
}
