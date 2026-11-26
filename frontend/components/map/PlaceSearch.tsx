"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fold, type PlaceHit } from "@/lib/placeRules";
import { useLang } from "@/lib/i18n";

/** Something on this screen that can be found by name too, such as a centre or a watch-list place. */
export type LocalItem = { id: string; name: string; sub: string; lat: number; lon: number; tag: string };
export type Picked = { name: string; lat: number; lon: number; local?: LocalItem };

/**
 * Search Kerala places from the local OpenStreetMap list (towns, villages, junctions, stations, colleges...),
 * plus this screen's own items. Queries go only to this server.
 */
export function PlaceSearch({ onSelect, local = [], placeholder = "Search a place", inline, initial = "" }: {
  onSelect: (p: Picked) => void;
  local?: LocalItem[];
  placeholder?: string;
  inline?: boolean;
  initial?: string;
}) {
  const [query, setQuery] = useState(initial);
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "missing">("idle");
  const box = useRef<HTMLDivElement>(null);
  const list = useId();
  const { t, lang, district } = useLang();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); setState("idle"); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setState("loading");
      fetch(`/api/places?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then(r => r.ok ? r.json() : r.status === 404 ? "missing" : [])
        .then(r => { if (r === "missing") { setHits([]); setState("missing"); } else { setHits(r); setState("idle"); } })
        .catch(() => {});
    }, 140);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  useEffect(() => {
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  const fq = fold(query);
  const own = fq.length >= 2 ? local.filter(i => fold(i.name).includes(fq)).slice(0, 4) : [];
  const rows: { key: string; name: string; ml?: string; sub: string; tag?: string; pick: Picked }[] = [
    ...own.map(i => ({ key: `l${i.id}`, name: i.name, sub: i.sub, tag: i.tag, pick: { name: i.name, lat: i.lat, lon: i.lon, local: i } })),
    // In Malayalam the Malayalam name leads and the English spelling follows.
    ...hits.map((h, k) => {
      const ml = lang === "ml" && h.ml;
      return { key: `p${k}`, name: ml ? h.ml : h.name, ml: ml ? h.name : h.ml,
        sub: [t.search.kinds[h.kind] ?? h.kind, h.district && district(h.district)].filter(Boolean).join(" · "),
        pick: { name: ml ? h.ml : h.name, lat: h.lat, lon: h.lon } };
    }),
  ];

  const choose = (k: number) => {
    const r = rows[k];
    if (!r) return;
    setQuery(r.name); setOpen(false); onSelect(r.pick);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
  };

  const showList = open && query.trim().length >= 2;
  return (
    <div ref={box} className="relative">
      <div className={`flex items-center border border-ink bg-paper ${inline ? "" : "shadow-[0_0_0_4px_rgba(0,0,0,.25)]"}`}>
        <svg viewBox="0 0 16 16" className="size-3.5 ml-3 shrink-0 text-mute" aria-hidden>
          <circle cx="6.5" cy="6.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5 15 15" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <input value={query} placeholder={placeholder} onKeyDown={onKey} onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          role="combobox" aria-expanded={showList} aria-controls={list} aria-autocomplete="list" aria-label={placeholder}
          className="flex-1 min-w-0 bg-transparent px-2.5 py-2 text-[13.5px] outline-none placeholder:text-mute" />
        {query && (
          <button type="button" aria-label={t.search.clear} onClick={() => { setQuery(""); setHits([]); }}
            className="size-8 grid place-items-center text-mute hover:text-ink">
            <svg viewBox="0 0 10 10" className="size-2.5"><path d="M1 1l8 8M9 1 1 9" stroke="currentColor" strokeWidth="1.4" /></svg>
          </button>
        )}
      </div>
      {showList && (
        <ul id={list} role="listbox" className={`${inline ? "" : "absolute left-0 right-0 top-full z-[700]"} bg-paper border border-t-0 border-ink max-h-[320px] overflow-y-auto scroll-thin`}>
          {rows.map((r, k) => (
            <li key={r.key} role="option" aria-selected={k === active}>
              <button type="button" onMouseEnter={() => setActive(k)} onClick={() => choose(k)}
                className={`w-full text-left px-3 py-2 border-t border-ink/15 first:border-t-0 ${k === active ? "bg-paper-2" : ""}`}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13.5px] truncate">{r.name}{r.ml && <span className="ml-2 text-[12px] text-mute">{r.ml}</span>}</span>
                  {r.tag && <span className="label text-signal shrink-0">{r.tag}</span>}
                </span>
                <span className="block text-[11.5px] text-mute truncate">{r.sub}</span>
              </button>
            </li>
          ))}
          {!rows.length && (
            <li className="px-3 py-2.5 text-[12px] text-mute">
              {state === "loading" ? t.search.searching : state === "missing" ? t.search.missing : t.search.noMatch}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
