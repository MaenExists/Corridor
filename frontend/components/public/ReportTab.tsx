"use client";

import { useEffect, useRef, useState } from "react";
import { PlaceSearch } from "@/components/map/PlaceSearch";
import { LIMITS, TIP_SEEN, TIP_WHAT, TIP_WHEN, type TipSeen, type TipWhat, type TipWhen } from "@/lib/tipRules";

type Mode = "start" | "form" | "help" | "danger" | "done";

// Official channels, checked 26 Nov 2026 against Kerala Police, Kerala Excise and NCB notices.
const LINES = [
  { number: "112", call: "112", who: "Emergency", note: "Someone is in danger now" },
  { number: "99959 66666", call: "+919995966666", who: "Kerala Police · Yodhav", note: "WhatsApp, text or photos, kept confidential", whatsapp: true },
  { number: "155358", call: "155358", who: "Kerala Excise", note: "Toll-free, informant names kept confidential" },
  { number: "1933", call: "1933", who: "MANAS · NCB", note: "National narcotics helpline, can be anonymous" },
  { number: "14446", call: "14446", who: "De-addiction helpline", note: "Free counselling and treatment advice" },
];

function deviceKey() {
  try {
    let key = localStorage.getItem("nt-device");
    if (!key || !/^[0-9a-f]{32}$/.test(key)) {
      key = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("nt-device", key);
    }
    return key;
  } catch { return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join(""); }
}

export function ReportTab({ pick, pickName, onPick, onClearPick, onFindHelp, onFormOpen }: {
  pick: [number, number] | null;
  pickName: string | null;
  onPick: (lat: number, lon: number, name?: string) => void;
  onClearPick: () => void;
  onFindHelp: () => void;
  onFormOpen: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>("start");
  const [what, setWhat] = useState<TipWhat | null>(null);
  const [when, setWhen] = useState<TipWhen | null>(null);
  const [seen, setSeen] = useState<TipSeen | null>(null);
  const [school, setSchool] = useState(false);
  const [note, setNote] = useState("");
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState<string | null>(null);
  const opened = useRef(Date.now());

  useEffect(() => { onFormOpen(mode === "form"); }, [mode, onFormOpen]);
  useEffect(() => () => onFormOpen(false), [onFormOpen]);

  // Tapping the map from the opening screen starts a report.
  useEffect(() => { if (pick && mode === "start") { setMode("form"); opened.current = Date.now(); } }, [pick, mode]);

  const start = () => { setMode("form"); opened.current = Date.now(); };
  const reset = () => { setWhat(null); setWhen(null); setSeen(null); setSchool(false); setNote(""); setError(null); onClearPick(); };
  const ready = !!(pick && what && when && seen);

  const locate = () => {
    if (!navigator.geolocation) { setLocating("This browser cannot share a location. Tap the map instead."); return; }
    setLocating("Finding you…");
    navigator.geolocation.getCurrentPosition(p => { setLocating(null); onPick(p.coords.latitude, p.coords.longitude); },
      () => setLocating("Location was not shared. Tap the map instead."), { enableHighAccuracy: false, timeout: 10000 });
  };

  async function send() {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/tips", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cell: pick!.join(":"), what, when, seen, school, note: note.trim() || null,
          device: deviceKey(), elapsed: Date.now() - opened.current, website: trap }),
      });
      if (!res.ok) { setError((await res.json().catch(() => null))?.message ?? "Could not send. Try again."); return; }
      reset(); setMode("done");
    } catch { setError("Could not reach the server. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <div>
      {mode === "start" && (
        <>
          <div className="px-5 py-5 border-b border-ink">
            <p className="label text-mute mb-2">Report</p>
            <h2 className="text-[22px] leading-[1.15] tracking-[-0.015em] font-medium">Noticed something worrying near you?</h2>
            <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">Tell us what you noticed and roughly where. Never who.</p>
          </div>
          <Choice n="01" title="I noticed something in my area" sub="Selling, use in public, hidden packets, odd comings and goings" onClick={start} />
          <Choice n="02" title="Someone I know needs help" sub="Find care and counselling. Nothing is recorded" onClick={() => setMode("help")} />
          <Choice n="03" title="Someone is in danger right now" sub="Call emergency services" onClick={() => setMode("danger")} signal />
          <section className="px-5 py-5 border-b border-ink">
            <p className="label text-mute mb-3">How a report is used</p>
            <ol className="space-y-3 text-[13px] leading-snug">
              <Rule n={1}>No name, phone number or login. Your exact spot never leaves your phone; it is rounded to a 1 km square first.</Rule>
              <Rule n={2}>One report changes nothing on its own. An area reaches Excise and Police reviewers only when {LIMITS.minReporters} or
                more different people notice something there, on different days, more than nearby areas usually report.</Rule>
              <Rule n={3}>Reports never change the forecast, and no public map shows them.</Rule>
              <Rule n={4}>Do not confront anyone, follow anyone or collect evidence yourself.</Rule>
            </ol>
          </section>
          <Lines />
        </>
      )}

      {mode === "form" && (
        <form onSubmit={e => { e.preventDefault(); send(); }} noValidate>
          <Back onClick={() => { reset(); setMode("start"); }} label="New report" />

          <Step n="01" title="Where">
            {pick ? (
              <div className="flex items-center justify-between gap-3 border border-ink px-3 py-2.5">
                <span className="flex items-center gap-2.5 text-[13px] min-w-0">
                  <i className="block size-3 shrink-0 border-2 border-signal bg-signal/20" />
                  <span className="truncate">{pickName ? `Around ${pickName}` : "A 1 km square is marked"}</span>
                </span>
                <button type="button" onClick={onClearPick} className="label text-mute hover:text-ink">Change</button>
              </div>
            ) : (
              <div className="space-y-2">
                <PlaceSearch inline placeholder="Search a place, junction or landmark" onSelect={p => onPick(p.lat, p.lon, p.name)} />
                <div className="grid grid-cols-[1fr_auto] border border-ink">
                  <p className="px-3 py-2 text-[12.5px] text-ink-2">or tap the map</p>
                  <button type="button" onClick={locate} className="label px-3 border-l border-ink hover:bg-ink hover:text-paper">◎ Where I am</button>
                </div>
              </div>
            )}
            <p className="mt-2 text-[11.5px] text-mute">{locating ?? "Only the square is sent, never your exact spot or your location."}</p>
          </Step>

          <Step n="02" title="What did you notice">
            <div role="radiogroup" aria-label="What did you notice" className="border border-ink">
              {(Object.keys(TIP_WHAT) as TipWhat[]).map((k, i) => (
                <button type="button" key={k} role="radio" aria-checked={what === k} onClick={() => setWhat(k)}
                  className={`w-full grid grid-cols-[18px_1fr] gap-2.5 items-start text-left px-3 py-2 ${i ? "border-t border-ink/20" : ""}
                    ${what === k ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                  <span className={`mt-[3px] size-3 rounded-full border-[1.5px] ${what === k ? "border-paper bg-paper" : "border-current"}`} />
                  <span>
                    <span className="block text-[13.5px] leading-tight">{TIP_WHAT[k].label}</span>
                    <span className={`block text-[11.5px] leading-snug ${what === k ? "text-paper/65" : "text-mute"}`}>{TIP_WHAT[k].hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <button type="button" role="checkbox" aria-checked={school} onClick={() => setSchool(v => !v)}
              className="mt-2 flex items-center gap-2.5 text-[13px]">
              <span className={`grid place-items-center size-4 border border-ink ${school ? "bg-ink" : ""}`}>
                {school && <svg viewBox="0 0 10 10" className="size-2.5"><path d="M1.5 5.2 4 7.6 8.6 2.6" fill="none" stroke="#0a0a0a" strokeWidth="1.6" /></svg>}
              </span>
              Close to a school or college
            </button>
          </Step>

          <Step n="03" title="When">
            <Segmented options={TIP_WHEN} value={when} onChange={setWhen} label="When" />
          </Step>

          <Step n="04" title="How do you know">
            <Segmented options={TIP_SEEN} value={seen} onChange={setSeen} label="How do you know" />
          </Step>

          <Step n="05" title="Anything else" optional>
            <textarea value={note} onChange={e => setNote(e.target.value.slice(0, LIMITS.noteChars))} rows={3}
              placeholder="What happened, not who. For example: packets passed at the bus shelter most evenings."
              className="w-full bg-transparent border border-ink px-3 py-2 text-[13.5px] leading-snug outline-none resize-none placeholder:text-mute" />
            <div className="mt-1 flex justify-between gap-3 text-[11.5px] text-mute">
              <span>Names, phone and vehicle numbers and house numbers are removed. Only a reviewer reads notes.</span>
              <span className="tabular shrink-0">{note.length}/{LIMITS.noteChars}</span>
            </div>
          </Step>

          {/* Left empty by people; bots fill it. */}
          <input type="text" name="website" value={trap} onChange={e => setTrap(e.target.value)} tabIndex={-1} autoComplete="off"
            aria-hidden className="absolute -left-[9999px] size-px opacity-0" />

          <div className="px-5 py-4 border-b border-ink">
            {error && <p className="mb-3 text-[12.5px] text-signal" role="alert">{error}</p>}
            <button type="submit" disabled={!ready || busy}
              className="w-full flex items-center justify-between px-4 py-3 bg-ink text-paper disabled:opacity-35 disabled:cursor-not-allowed">
              <span className="label">{busy ? "Sending" : "Send report"}</span>
              <svg viewBox="0 0 16 10" className="w-4"><path d="M0 5h14M10 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
            </button>
            <p className="mt-2.5 text-[11.5px] text-mute leading-snug">
              This is not a police complaint, and nobody is questioned because of one report. If you know who is involved,
              tell the official lines below directly.
            </p>
          </div>
          <Lines compact />
        </form>
      )}

      {mode === "done" && (
        <>
          <div className="px-5 py-6 border-b border-ink">
            <p className="label text-mute mb-2">Received</p>
            <h2 className="text-[22px] leading-[1.15] tracking-[-0.015em] font-medium">Thank you. Your report is in.</h2>
            <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">
              It stays private. It counts towards an area only once other people nearby notice something too, on other days.
              Nothing happens because of one report alone.
            </p>
            <div className="mt-4 grid grid-cols-2 border border-ink">
              <button onClick={() => setMode("form")} className="label py-2.5 hover:bg-paper-2">Report something else</button>
              <button onClick={() => setMode("start")} className="label py-2.5 border-l border-ink hover:bg-paper-2">Done</button>
            </div>
          </div>
          <Lines />
        </>
      )}

      {mode === "help" && (
        <>
          <Back onClick={() => setMode("start")} label="Getting help" />
          <div className="px-5 py-5 border-b border-ink">
            <h2 className="text-[22px] leading-[1.15] tracking-[-0.015em] font-medium">Help is free and confidential.</h2>
            <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">
              Asking for help for someone is not a report, and nothing on this screen is recorded. Treatment is confidential,
              and a person who volunteers for treatment for their own drug use can be spared prosecution (NDPS Act, section 64A).
            </p>
            <a href="tel:14446" className="mt-4 flex items-center justify-between border border-ink px-4 py-3 hover:bg-ink hover:text-paper">
              <span><span className="block text-[24px] leading-none font-medium tabular">14446</span>
                <span className="block mt-1 text-[11.5px] opacity-70">De-addiction helpline · free counselling</span></span>
              <span className="label">Call</span>
            </a>
            <button onClick={onFindHelp} className="mt-2 w-full flex items-center justify-between border border-ink px-4 py-3 hover:bg-paper-2">
              <span className="text-[13.5px]">Find the nearest centre</span><span className="label">◎</span>
            </button>
          </div>
        </>
      )}

      {mode === "danger" && (
        <>
          <Back onClick={() => setMode("start")} label="Emergency" />
          <div className="px-5 py-5 border-b border-ink">
            <h2 className="text-[22px] leading-[1.15] tracking-[-0.015em] font-medium">Call 112 now.</h2>
            <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">
              For an overdose, violence or anyone at risk, emergency services are faster than any report. Stay at a safe distance.
            </p>
            <a href="tel:112" className="mt-4 flex items-center justify-between bg-signal text-white px-4 py-3">
              <span className="text-[30px] leading-none font-medium tabular">112</span><span className="label">Call</span>
            </a>
          </div>
          <Lines />
        </>
      )}
    </div>
  );
}

function Choice({ n, title, sub, onClick, signal }: { n: string; title: string; sub: string; onClick: () => void; signal?: boolean }) {
  return (
    <button onClick={onClick} className="w-full grid grid-cols-[40px_1fr_auto] items-center text-left border-b border-ink hover:bg-paper-2 group">
      <span className={`font-mono text-[12px] text-center ${signal ? "text-signal" : "opacity-60"}`}>{n}</span>
      <span className="py-3.5 pr-2">
        <span className="block text-[14.5px] font-medium">{title}</span>
        <span className="block text-[12px] text-mute leading-snug">{sub}</span>
      </span>
      <svg viewBox="0 0 16 10" className="w-4 mr-5 transition-transform group-hover:translate-x-0.5"><path d="M0 5h14M10 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
    </button>
  );
}
function Rule({ n, children }: { n: number; children: React.ReactNode }) {
  return <li className="grid grid-cols-[22px_1fr]"><span className="font-mono text-[11px] text-mute pt-px">{n}</span><span className="text-ink-2">{children}</span></li>;
}
function Back({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="flex items-center border-b border-ink">
      <button type="button" onClick={onClick} aria-label="Back" className="size-10 grid place-items-center border-r border-ink hover:bg-ink hover:text-paper">
        <svg viewBox="0 0 16 10" className="w-3.5"><path d="M16 5H2M6 1 2 5l4 4" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      <span className="label px-4 text-mute">{label}</span>
    </div>
  );
}
function Step({ n, title, optional, children }: { n: string; title: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <fieldset className="px-5 py-4 border-b border-ink/20">
      <legend className="contents">
        <span className="flex items-baseline gap-3 mb-2.5">
          <span className="font-mono text-[11px] text-mute">{n}</span>
          <span className="text-[14px] font-medium">{title}</span>
          {optional && <span className="label text-mute">optional</span>}
        </span>
      </legend>
      {children}
    </fieldset>
  );
}
function Segmented<K extends string>({ options, value, onChange, label }: {
  options: Record<K, string>; value: K | null; onChange: (k: K) => void; label: string;
}) {
  const keys = Object.keys(options) as K[];
  return (
    <div role="radiogroup" aria-label={label} className="grid border border-ink" style={{ gridTemplateColumns: `repeat(${keys.length}, 1fr)` }}>
      {keys.map((k, i) => (
        <button type="button" key={k} role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={`px-2 py-2 text-[12.5px] leading-tight ${i ? "border-l border-ink" : ""} ${value === k ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
          {options[k]}
        </button>
      ))}
    </div>
  );
}
function Lines({ compact }: { compact?: boolean }) {
  const lines = compact ? LINES.slice(0, 3) : LINES;
  return (
    <section className="pb-2">
      <div className="px-5 pt-5 pb-2">
        <p className="label text-mute">Official lines</p>
        {!compact && <p className="mt-1.5 text-[12.5px] text-ink-2 leading-snug">If you know who is involved, or it is urgent, tell these services directly. They keep informants confidential.</p>}
      </div>
      <ul>
        {lines.map(l => (
          <li key={l.number}>
            <a href={l.whatsapp ? `https://wa.me/${l.call.replace("+", "")}` : `tel:${l.call}`} target={l.whatsapp ? "_blank" : undefined}
              rel="noreferrer" className="grid grid-cols-[112px_1fr] items-center px-5 py-2.5 border-t border-ink/15 hover:bg-paper-2">
              <span className={`font-mono tabular text-[14px] ${l.call === "112" ? "text-signal" : ""}`}>{l.number}</span>
              <span className="min-w-0">
                <span className="block text-[13px] leading-tight">{l.who}</span>
                <span className="block text-[11.5px] text-mute leading-snug">{l.note}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="px-5 pt-2 text-[11px] text-mute">Numbers checked 26 Nov 2026.</p>
    </section>
  );
}
