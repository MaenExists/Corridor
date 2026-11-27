"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/Header";
import { KeralaField } from "./KeralaField";

/** Official Excise NDPS case counts per year, statewide (Excise monthly statements; 2025 from KLA Q.640).
 *  2024 has only nine published months, so it is drawn as partial rather than filled in. */
const YEARS: { y: number; v: number; partial?: string }[] = [
  { y: 2016, v: 2985 }, { y: 2017, v: 5946 }, { y: 2018, v: 7573 }, { y: 2019, v: 7099 }, { y: 2020, v: 3667 },
  { y: 2021, v: 3919 }, { y: 2022, v: 6119 }, { y: 2023, v: 8096 }, { y: 2024, v: 5743, partial: "9 months published" },
  { y: 2025, v: 12566 },
];

const PRINCIPLES = [
  "Built from public sources only", "No person or address is scored", "A planning aid, not an order",
  "Unflagged is not proven safe", "Scored against what got reported", "Rebuilt every week",
];

/** Adds .in to every .rv inside the root when it scrolls into view. */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".rv");
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function useInView<T extends Element>(threshold = 0.35) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

function Counter({ to, run, ms = 1800 }: { to: number; run: boolean; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, to, ms]);
  return <>{v.toLocaleString("en-IN")}</>;
}

/** Headline words slide up out of a mask, one after another. */
function Words({ text, base = 0, step = 70, className = "" }: { text: string; base?: number; step?: number; className?: string }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i}><span className="lp-mask"><span className={`lp-word ${className}`} style={{ animationDelay: `${base + i * step}ms` }}>{w}</span></span>{" "}</span>
      ))}
    </>
  );
}

/** Tracks the cursor in CSS variables so a card can paint a spotlight and tilt toward it. */
function useSpot<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty("--mx", `${x * 100}%`); el.style.setProperty("--my", `${y * 100}%`);
      el.style.setProperty("--rx", `${(0.5 - y) * 5}deg`); el.style.setProperty("--ry", `${(x - 0.5) * 7}deg`);
    };
    const leave = () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); };
    el.addEventListener("pointermove", move); el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
  }, []);
  return ref;
}

export function Landing() {
  useReveal();
  const [coord, setCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [clock, setClock] = useState("");
  useEffect(() => {
    const f = () => setClock(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }) + " IST");
    f(); const id = setInterval(f, 1000); return () => clearInterval(id);
  }, []);

  return (
    <div className="lp overflow-x-clip">
      {/* ── Nav ─────────────────────────────── */}
      <header className="lp-nav fixed inset-x-0 top-0 z-50 flex items-stretch h-14 border-b border-ink/15 backdrop-blur-md bg-paper/55">
        <Link href="/" className="flex items-center gap-2.5 px-5 border-r border-ink/15">
          <Mark /><span className="font-semibold text-[15px] tracking-[-0.01em]">NarcoTrace</span>
        </Link>
        <div className="hidden md:flex flex-1 items-center px-5 label text-mute gap-3">
          <i className="block size-1.5 rounded-full bg-[#00ff41] lp-blink" /> Kerala · Hackfinity 2026
        </div>
        <div className="flex-1 md:hidden" />
        <nav className="flex">
          <Link href="/enforcement" className="lp-navlink flex items-center px-4 md:px-6 border-l border-ink/15 label">Enforcement</Link>
          <Link href="/public" className="lp-navlink flex items-center px-4 md:px-6 border-l border-ink/15 label">Public</Link>
        </nav>
      </header>

      {/* ── Hero ────────────────────────────── */}
      <section className="relative h-dvh min-h-[640px] overflow-hidden">
        <div className="absolute inset-0 lp-hero-glow" aria-hidden />
        <KeralaField onCoord={setCoord} />
        <div className="absolute inset-0 lp-gridlines pointer-events-none" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-paper via-paper/80 to-transparent md:hidden pointer-events-none" aria-hidden />

        <div className="relative z-10 h-full max-w-[1500px] mx-auto px-6 md:px-12 flex flex-col justify-end md:justify-center pb-24 md:pb-0 pointer-events-none">
          <p className="label text-[#00ff41] mb-6 lp-fade" style={{ animationDelay: "200ms" }}>
            <span className="prompt">Seizure outlook · recovery access</span>
          </p>
          <h1 className="text-[44px] sm:text-[64px] lg:text-[96px] leading-[0.94] tracking-[-0.045em] font-medium max-w-[11ch] lp-h1">
            <Words text="Where drugs turn up next," base={350} />
            <span className="text-mute"><Words text="and where help is far away." base={800} /></span>
          </h1>
          <p className="mt-8 max-w-[44ch] text-[15px] md:text-[17px] text-ink-2 leading-relaxed lp-fade" style={{ animationDelay: "1500ms" }}>
            NarcoTrace reads a decade of official seizure counts and local news across Kerala. It shows enforcement where the
            next seizures are likely, and shows families how far the nearest de-addiction help is.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 pointer-events-auto lp-fade" style={{ animationDelay: "1750ms" }}>
            <Link href="/enforcement" className="lp-btn lp-btn-green">Open the outlook <span>→</span></Link>
            <Link href="/public" className="lp-btn lp-btn-ghost">Find help near you <span>→</span></Link>
          </div>
        </div>

        {/* HUD corners */}
        <div className="absolute left-6 md:left-12 bottom-6 z-10 label text-mute hidden md:flex gap-6 lp-fade" style={{ animationDelay: "2200ms" }}>
          <span className="tabular">{clock}</span>
          <span className="tabular min-w-[22ch]">
            {coord ? <span className="text-[#00ff41]">{coord.lat.toFixed(4)}° N · {coord.lon.toFixed(4)}° E</span> : "Move over Kerala"}
          </span>
        </div>
        <div className="absolute right-6 md:right-12 bottom-6 z-10 label text-mute flex items-center gap-3 lp-fade" style={{ animationDelay: "2400ms" }}>
          Scroll <span className="lp-scrollcue" aria-hidden />
        </div>
        <span className="lp-corner tl" aria-hidden /><span className="lp-corner tr" aria-hidden />
        <span className="lp-corner bl" aria-hidden /><span className="lp-corner br" aria-hidden />
      </section>

      {/* ── Ticker ──────────────────────────── */}
      <div className="relative border-y border-ink/15 py-4 overflow-hidden bg-paper-2/60">
        <div className="lp-marquee flex gap-12 w-max">
          {[...PRINCIPLES, ...PRINCIPLES, ...PRINCIPLES].map((p, i) => (
            <span key={i} className="label text-ink-2 flex items-center gap-12 whitespace-nowrap">{p}<i className="block size-1.5 bg-signal rotate-45" /></span>
          ))}
        </div>
      </div>

      <Problem />
      <Doors />
      <How />
      <Closing />
    </div>
  );
}

function Problem() {
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  const max = 13000;
  return (
    <section className="relative max-w-[1500px] mx-auto px-6 md:px-12 py-28 md:py-40">
      <p className="label text-signal mb-6 rv">01 · The problem</p>
      <div className="grid lg:grid-cols-[1fr_1.25fr] gap-16 items-end" ref={ref}>
        <div>
          <h2 className="text-[38px] md:text-[60px] leading-[0.98] tracking-[-0.04em] font-medium rv" style={{ ["--d" as string]: "80ms" }}>
            Excise drug cases in Kerala rose more than <span className="text-signal lp-glow-red">four times</span> in ten years.
          </h2>
          <div className="mt-12 flex items-end gap-10 rv" style={{ ["--d" as string]: "200ms" }}>
            <div>
              <p className="label text-mute mb-2">2016</p>
              <p className="text-[36px] md:text-[44px] tabular tracking-[-0.03em] text-ink-2"><Counter to={2985} run={seen} /></p>
            </div>
            <div className="text-[28px] text-mute pb-2">→</div>
            <div>
              <p className="label text-mute mb-2">2025</p>
              <p className="text-[56px] md:text-[80px] leading-none tabular tracking-[-0.04em] text-signal lp-glow-red"><Counter to={12566} run={seen} ms={2400} /></p>
            </div>
          </div>
          <p className="mt-10 max-w-[46ch] text-ink-2 leading-relaxed rv" style={{ ["--d" as string]: "300ms" }}>
            Each case is a seizure someone already made. Patrols still go where they went last month, and many places that need
            recovery services have none within reach. NarcoTrace turns those records into an outlook teams can plan around.
          </p>
        </div>

        <div className="relative">
          <div className="flex items-end gap-[1.4%] h-[340px] md:h-[420px] border-b border-ink/30">
            {YEARS.map((d, i) => (
              <div key={d.y} className="group relative flex-1 h-full flex flex-col justify-end">
                <span className={`absolute left-1/2 -translate-x-1/2 label tabular whitespace-nowrap transition-all duration-500 ${seen ? "opacity-100" : "opacity-0"} ${d.y === 2025 ? "text-signal" : "hidden md:block text-ink-2 group-hover:text-ink"}`}
                  style={{ bottom: `calc(${(d.v / max) * 100}% + 10px)`, transitionDelay: `${900 + i * 90}ms` }}>
                  {d.v.toLocaleString("en-IN")}
                </span>
                <div className={`lp-bar ${d.y === 2025 ? "hot" : ""} ${d.partial ? "partial" : ""}`}
                  style={{ height: seen ? `${(d.v / max) * 100}%` : "0%", transitionDelay: `${i * 90}ms` }}
                  title={d.partial ? `${d.y}: ${d.v.toLocaleString("en-IN")} (${d.partial})` : `${d.y}: ${d.v.toLocaleString("en-IN")}`} />
              </div>
            ))}
          </div>
          <div className="flex gap-[1.4%] mt-3">
            {YEARS.map(d => <span key={d.y} className="flex-1 text-center label text-mute tabular">{String(d.y).slice(2)}</span>)}
          </div>
          <p className="mt-6 text-[12px] text-mute leading-relaxed">
            NDPS cases recorded by Kerala Excise per year. Monthly statements; 2025 from the Legislative Assembly answer.
            2024 is hatched: only nine months were published.
          </p>
        </div>
      </div>
    </section>
  );
}

function Doors() {
  const a = useSpot<HTMLAnchorElement>();
  const b = useSpot<HTMLAnchorElement>();
  return (
    <section className="relative max-w-[1500px] mx-auto px-6 md:px-12 pb-28 md:pb-40">
      <p className="label text-mute mb-6 rv">02 · Two sides, one map</p>
      <h2 className="text-[38px] md:text-[60px] leading-[0.98] tracking-[-0.04em] font-medium max-w-[18ch] rv" style={{ ["--d" as string]: "80ms" }}>
        One for the people who patrol. One for the people who need help.
      </h2>

      <div className="mt-16 grid lg:grid-cols-2 gap-6 [perspective:1400px]">
        <Link ref={a} href="/enforcement" className="lp-door lp-door-green rv" style={{ ["--d" as string]: "100ms" }}>
          <div className="lp-door-spot" aria-hidden />
          <div className="relative flex items-center justify-between">
            <span className="label text-[#00ff41] flex items-center gap-2"><i className="block size-2 rounded-full bg-[#00c2ff] pulse" />Live · Enforcement</span>
            <span className="label text-mute hidden sm:inline">/enforcement</span>
          </div>
          <Terminal />
          <div className="relative">
            <h3 className="text-[34px] md:text-[44px] tracking-[-0.035em] leading-none font-medium">The 28-day outlook</h3>
            <p className="mt-4 max-w-[44ch] text-ink-2 leading-relaxed">
              A ranked watch list of 1 km squares and districts, rebuilt each week, with the reasons behind every flag and a
              running score against what actually got reported.
            </p>
            <p className="mt-8 flex items-center justify-between border-t border-[#00ff41]/40 pt-4 text-[#00ff41]">
              <span className="label">Open the outlook</span><span className="lp-arrow text-[22px]">→</span>
            </p>
          </div>
        </Link>

        <Link ref={b} href="/public" className="lp-door lp-door-amber rv" style={{ ["--d" as string]: "220ms" }}>
          <div className="lp-door-spot" aria-hidden />
          <div className="relative flex items-center justify-between">
            <span className="label text-[#ffbf00]">Open to all · Public</span>
            <span className="label text-mute hidden sm:inline">/public · English · മലയാളം</span>
          </div>
          <Rings />
          <div className="relative">
            <h3 className="text-[34px] md:text-[44px] tracking-[-0.035em] leading-none font-medium">How far is help?</h3>
            <p className="mt-4 max-w-[44ch] text-ink-2 leading-relaxed">
              Where people live far from de-addiction care, the nearest centres to any spot, and a safe way to tell the
              authorities what you notice, without giving your name.
            </p>
            <p className="mt-8 flex items-center justify-between border-t border-[#ffbf00]/40 pt-4 text-[#ffbf00]">
              <span className="label">Open the map</span><span className="lp-arrow text-[22px]">→</span>
            </p>
          </div>
        </Link>
      </div>
    </section>
  );
}

/** A looping illustration of the weekly run. Text only: it names steps, never places. */
function Terminal() {
  const lines = [
    "> reading official district counts …… ok",
    "> reading this week's local news ……… ok",
    "> placing stories (English + Malayalam) ok",
    "> ranking 1 km squares ………………………… done",
    "> watch list ready · reasons attached",
  ];
  return (
    <div className="relative my-10 font-mono text-[12.5px] leading-[1.9] text-[#00ff41]/85 min-h-[150px]" aria-hidden>
      {lines.map((l, i) => (
        <div key={i} className="lp-term overflow-hidden whitespace-nowrap" style={{ animationDelay: `${i * 900}ms` }}>{l}</div>
      ))}
    </div>
  );
}

function Rings() {
  return (
    <div className="relative my-10 h-[150px] flex items-center justify-center" aria-hidden>
      {[0, 1, 2, 3].map(i => <span key={i} className="lp-ring" style={{ animationDelay: `${i * 0.9}s` }} />)}
      <span className="relative size-3 rounded-full bg-ink shadow-[0_0_0_6px_rgba(255,191,0,.18)]" />
      <span className="absolute left-[calc(50%+70px)] top-[38%] size-2.5 bg-[#ffbf00] lp-centre" />
      <span className="absolute left-[calc(50%-120px)] top-[64%] size-2.5 bg-[#ffbf00] lp-centre" style={{ animationDelay: ".8s" }} />
      <span className="absolute left-[calc(50%+150px)] top-[72%] size-2.5 bg-[#ffbf00]/50 lp-centre" style={{ animationDelay: "1.6s" }} />
    </div>
  );
}

function How() {
  const steps = [
    { n: "01", t: "Read the record", d: "A decade of official Excise counts, recovered month by month and checked against printed totals." },
    { n: "02", t: "Place the news", d: "Seizure stories from six Kerala publishers, located to the town in English and Malayalam." },
    { n: "03", t: "Forecast, then check", d: "Rank where reports are likely next, and score every list against what is reported later." },
    { n: "04", t: "Put it to use", d: "A weekly watch list for planners, and a map of the distance to help for everyone else." },
  ];
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  return (
    <section className="relative border-t border-ink/15">
      <div className="max-w-[1500px] mx-auto px-6 md:px-12 py-28 md:py-40">
        <p className="label text-mute mb-6 rv">03 · How it works</p>
        <h2 className="text-[38px] md:text-[60px] leading-[0.98] tracking-[-0.04em] font-medium max-w-[16ch] rv" style={{ ["--d" as string]: "80ms" }}>
          From scattered records to a list you can check.
        </h2>
        <div ref={ref} className="relative mt-20 grid md:grid-cols-4 gap-10 md:gap-6">
          <div className="hidden md:block absolute left-0 right-0 top-[7px] h-px bg-ink/15" aria-hidden>
            <div className="h-full bg-gradient-to-r from-[#00ff41] via-[#00c2ff] to-signal transition-[width] duration-[2200ms] ease-out" style={{ width: seen ? "100%" : "0%" }} />
          </div>
          {steps.map((s, i) => (
            <div key={s.n} className="relative rv" style={{ ["--d" as string]: `${200 + i * 160}ms` }}>
              <span className={`relative block size-[15px] border border-ink bg-paper transition-colors duration-300 ${seen ? "lp-node" : ""}`} style={{ transitionDelay: `${i * 500}ms`, animationDelay: `${i * 500}ms` }} />
              <p className="mt-8 label text-mute tabular">{s.n}</p>
              <h3 className="mt-3 text-[24px] tracking-[-0.02em] font-medium">{s.t}</h3>
              <p className="mt-3 text-ink-2 leading-relaxed text-[15px] max-w-[32ch]">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="relative border-t border-ink/15 overflow-hidden">
      <div className="absolute inset-0 lp-closing-glow" aria-hidden />
      <div className="relative max-w-[1500px] mx-auto px-6 md:px-12 py-28 md:py-36">
        <p className="label text-mute mb-6 rv">04 · Ground rules</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 border-t border-l border-ink/20">
          {[
            ["Public sources", "Official counts and published news. No private records, no informants."],
            ["Places, not people", "Squares and districts only. Nobody is named, scored or tracked."],
            ["A human decides", "The outlook informs planning. It never sends anyone anywhere by itself."],
            ["Gaps are not safety", "A square without a flag may simply be one the news never covers."],
          ].map(([t, d], i) => (
            <div key={t} className="lp-rule p-7 border-r border-b border-ink/20 rv" style={{ ["--d" as string]: `${i * 110}ms` }}>
              <p className="label text-mute tabular">0{i + 1}</p>
              <h3 className="mt-6 text-[20px] tracking-[-0.015em] font-medium">{t}</h3>
              <p className="mt-3 text-[14px] text-ink-2 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>

        <div className="mt-28 flex flex-col md:flex-row md:items-end justify-between gap-10">
          <h2 className="text-[48px] md:text-[88px] leading-[0.92] tracking-[-0.05em] font-medium rv">
            See it <span className="lp-shimmer">working.</span>
          </h2>
          <div className="flex flex-wrap gap-3 rv" style={{ ["--d" as string]: "150ms" }}>
            <Link href="/enforcement" className="lp-btn lp-btn-green">Enforcement <span>→</span></Link>
            <Link href="/public" className="lp-btn lp-btn-ghost">Public <span>→</span></Link>
          </div>
        </div>
      </div>
      <footer className="relative border-t border-ink/15 px-6 md:px-12 py-5 flex flex-wrap justify-between gap-3 label text-mute">
        <span className="flex items-center gap-2.5"><Mark /> NarcoTrace · Kerala</span>
        <span>Hackfinity 2026 · Team TOOFAN</span>
        <span>Boundaries © OpenStreetMap contributors</span>
      </footer>
    </section>
  );
}
