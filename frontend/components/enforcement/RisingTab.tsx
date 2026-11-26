import type { LookAlike, PatternsV2, Profile, Rising } from "@/lib/types";
import { pct } from "./copy";

const MODEL_NAME: Record<string, string> = {
  new_place_logistic: "new-place model", new_place_trees: "new-place model (trees)", look_alike: "look-alike score",
};

/** Pattern engine v2, active side: areas rising right now and places that look like hotspots but have no reports. */
export function RisingTab({ v2, selectedId, onRising, onLook }: {
  v2: PatternsV2 | null; selectedId: string | null; onRising: (r: Rising) => void; onLook: (l: LookAlike) => void;
}) {
  if (!v2) return <p className="m-5 p-3 border border-ink text-[13px]">Pattern engine v2 not built. Run make hotspot-v2-forecast.</p>;
  const dev = v2.evaluation.find(e => e.stage === "development");
  const later = v2.evaluation.filter(e => e.stage !== "development");
  return (
    <div>
      <section className="border-b border-ink">
        <div className="px-5 pt-5 pb-3">
          <p className="label text-mute mb-2">Rising now · space-time scan</p>
          <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">
            {v2.rising.length ? `${v2.rising.length} ${v2.rising.length === 1 ? "area is" : "areas are"} reporting more than their own history explains.`
              : "No area is rising beyond its usual level right now."}
          </h2>
          <p className="mt-2 text-[12.5px] text-ink-2 leading-relaxed">
            Each is a circle where recent reports outnumber what the last three years predict, checked against 199 reshuffles of the dates.
            A rise can also mean a campaign or new news coverage.
          </p>
        </div>
        <ul>
          {v2.rising.map(r => (
            <li key={r.id}>
              <button onClick={() => onRising(r)}
                className={`w-full grid grid-cols-[1fr_auto] items-center text-left px-5 py-2.5 border-t border-ink/15 ${selectedId === r.id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium truncate">{r.name}</span>
                  <span className="block text-[11.5px] opacity-60">{r.district} · within {r.radiusKm} km · last {r.windowDays} days</span>
                </span>
                <span className="text-right pl-3">
                  <span className="block text-[13px] tabular">{r.observed} <span className="opacity-60">vs {r.expected.toFixed(1)}</span></span>
                  <span className="block text-[11px] opacity-60 tabular">p = {r.p.toFixed(3)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {dev?.scanLift != null && (
          <p className="px-5 py-3 border-t border-ink/15 text-[11.5px] text-mute leading-relaxed">
            In 2022–23, flagged areas went on to get {dev.scanLift.toFixed(1)}× their usual share of reports in the next four weeks
            {dev.busiestLift != null ? ` (the busiest recent areas: ${dev.busiestLift.toFixed(1)}×)` : ""}.
            {later.map(e => e.scanLift != null ? ` ${e.label}: ${e.scanLift.toFixed(1)}×.` : "").join("")}
          </p>
        )}
      </section>

      <section>
        <div className="px-5 pt-5 pb-3">
          <p className="label text-mute mb-2">New-place watch · {MODEL_NAME[v2.model] ?? v2.model}</p>
          <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">Places with no report yet that look like where seizures happen.</h2>
          <p className="mt-2 text-[12.5px] text-ink-2 leading-relaxed">
            Every square here is more than 2 km from any earlier report. Ranked by a model trained only on first reports at new places.
            {v2.adopted ? "" : " It did not pass its pre-registered test on the design years (it beat a population list but not the older terrain model), so treat it as a lead, not a forecast. Weekly lists are now frozen and scored from December."}
          </p>
          <Evidence v2={v2} />
        </div>
        <ul>
          {v2.lookAlike.map((l, i) => (
            <li key={l.id}>
              <button onClick={() => onLook(l)}
                className={`w-full grid grid-cols-[36px_1fr_auto] items-center text-left border-t border-ink/15 ${selectedId === l.id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                <span className="font-mono text-[11.5px] text-center opacity-60">{String(i + 1).padStart(2, "0")}</span>
                <span className="py-2.5 pr-2 min-w-0">
                  <span className="block text-[13.5px] font-medium truncate">{l.name}</span>
                  <span className="block text-[11.5px] opacity-60 truncate">{l.district}{l.profile ? ` · ${l.profile}` : ""}</span>
                </span>
                <span className="pr-5 text-right">
                  <span className="block text-[12.5px] tabular">{l.kmToReport} km</span>
                  <span className="block text-[10.5px] opacity-60">to nearest report</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Evidence({ v2 }: { v2: PatternsV2 }) {
  if (!v2.evaluation.length) return null;
  return (
    <table className="mt-3 w-full text-[11.5px] tabular border border-ink/30">
      <thead>
        <tr className="text-mute text-left">
          <th className="font-normal px-2 py-1">New places caught</th>
          <th className="font-normal px-2 py-1 text-right">This list</th>
          <th className="font-normal px-2 py-1 text-right">Population</th>
          <th className="font-normal px-2 py-1 text-right">v1 terrain</th>
        </tr>
      </thead>
      <tbody>
        {v2.evaluation.map(e => (
          <tr key={e.stage} className="border-t border-ink/15">
            <td className="px-2 py-1">{e.label}<span className="text-mute"> · {e.newPlaces}</span></td>
            <td className="px-2 py-1 text-right">{pct(e.fresh[v2.model] ?? 0)}</td>
            <td className="px-2 py-1 text-right">{pct(e.fresh.population ?? 0)}</td>
            <td className="px-2 py-1 text-right">{pct(e.fresh.risk_terrain_v1 ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Learned hotspot profiles, for the "Why there" tab. */
export function Profiles({ profiles, onPlace }: { profiles: Profile[]; onPlace: (lat: number, lon: number, name: string) => void }) {
  if (!profiles.length) return null;
  return (
    <section className="border-b border-ink">
      <div className="px-5 pt-5 pb-3">
        <p className="label text-mute mb-2">Learned hotspot profiles</p>
        <h2 className="text-[19px] leading-snug tracking-[-0.01em] font-medium">{profiles.length} kinds of place keep producing seizure reports.</h2>
        <p className="mt-2 text-[12.5px] text-ink-2 leading-relaxed">
          Found by the model from what surrounds every square with reports in the last three years, against ordinary inhabited
          squares. Police and Excise offices are left out, so presence of officers does not define a profile.
        </p>
      </div>
      {profiles.map((p, i) => (
        <div key={p.id} className="px-5 py-3 border-t border-ink/15">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[14px] font-medium first-letter:uppercase"><span className="font-mono text-[11px] text-mute mr-2">{String.fromCharCode(65 + i)}</span>{p.name}</p>
            <span className="font-mono text-[12px] tabular shrink-0">{pct(p.share)}</span>
          </div>
          <span className="block h-1 mt-1.5 bg-paper-2"><span className="block h-full bg-signal" style={{ width: `${p.share * 100}%` }} /></span>
          <ul className="mt-2 space-y-0.5 text-[12px] text-ink-2">
            {p.traits.map(t => (
              <li key={t.text} className="first-letter:uppercase">
                {t.text}
                {t.here_km != null && <span className="text-mute"> · typically {t.here_km} km here, {t.typical_km} km elsewhere</span>}
                {t.here != null && <span className="text-mute"> · {t.here} here, {t.typical} elsewhere</span>}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.examples.map(e => (
              <button key={e.name} onClick={() => onPlace(e.lat, e.lon, e.name)} className="text-[12px] px-2 py-0.5 border border-ink hover:bg-paper-2">
                {e.name}<span className="text-mute"> {e.reports}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
