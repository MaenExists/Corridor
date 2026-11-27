/* NarcoTrace — cinematic deck engine. No dependencies; runs from file://. */
(() => {
"use strict";
const NT = window.NT || null;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const stage = $("#stage");
const W = 1920, H = 1080;
const R = Math.min(2, window.devicePixelRatio || 1);
const ease = t => 1 - Math.pow(1 - t, 3);
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (v, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

/* ---------------- stage scaling ---------------- */
let scale = 1;
function fit() {
  scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  stage.style.transformOrigin = "center center";
}
addEventListener("resize", fit); fit();
const toStage = e => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; };

/* ---------------- film grain ---------------- */
(() => {
  const frames = [];
  for (let f = 0; f < 6; f++) {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d"), d = x.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); frames.push(`url(${c.toDataURL()})`);
  }
  const g = $("#grain"); let k = 0;
  setInterval(() => { g.style.backgroundImage = frames[k++ % frames.length]; }, 70);
})();

/* ---------------- timecode ---------------- */
const t0 = performance.now();
const tc = $("#tc");
(function tick() {
  const s = (performance.now() - t0) / 1000;
  const p = n => String(Math.floor(n)).padStart(2, "0");
  tc.textContent = `${p(s / 3600)}:${p(s / 60 % 60)}:${p(s % 60)}:${p((s * 24) % 24)}`;
  requestAnimationFrame(tick);
})();

/* ---------------- counters ---------------- */
function countUp(el, dur = 1800) {
  const target = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), suf = el.dataset.suf || "", pre = el.dataset.pre || "";
  const start = performance.now();
  const step = now => {
    const t = clamp((now - start) / dur, 0, 1), v = target * (1 - Math.pow(2, -10 * t));
    el.textContent = pre + fmt(t >= 1 ? target : v, dec) + suf;
    if (t < 1) el._raf = requestAnimationFrame(step);
  };
  cancelAnimationFrame(el._raf); el.textContent = pre + fmt(0, dec) + suf;
  setTimeout(() => { el._raf = requestAnimationFrame(step); }, 350);
}
const runCounters = (root, inStep) => $$("[data-count]", root).forEach(el => {
  const gated = el.closest("[data-at]");
  if (inStep ? gated === inStep || inStep.contains(el) : !gated) countUp(el);
});

/* ---------------- Kerala geometry ---------------- */
const K = { latMin: 8.17, latMax: 12.8, lonMin: 74.85, lonMax: 77.42, c: Math.cos(10.5 * Math.PI / 180) };
function fitBox(x0, y0, w, h) {
  const dw = (K.lonMax - K.lonMin) * K.c, dh = K.latMax - K.latMin;
  const s = Math.min(w / dw, h / dh), ox = x0 + (w - dw * s) / 2, oy = y0 + (h - dh * s) / 2;
  return { s, x: lon => ox + (lon - K.lonMin) * K.c * s, y: lat => oy + (K.latMax - lat) * s };
}
const CELLS = (() => {
  if (!NT) return null;
  const g = NT.grid, a = g.cells, n = a.length / 5;
  const lat = new Float32Array(n), lon = new Float32Array(n), pop = new Float32Array(n), km = new Float32Array(n), grade = new Uint8Array(n);
  for (let k = 0; k < n; k++) { lat[k] = g.lat0 + a[5 * k] * g.step; lon[k] = g.lon0 + a[5 * k + 1] * g.step; pop[k] = a[5 * k + 2]; km[k] = a[5 * k + 3]; grade[k] = a[5 * k + 4]; }
  return { n, lat, lon, pop, km, grade, step: g.step };
})();
function makeCanvas(el) { el.width = W * R; el.height = H * R; const x = el.getContext("2d"); x.setTransform(R, 0, 0, R, 0, 0); return x; }
function offscreen() { const c = document.createElement("canvas"); c.width = W * R; c.height = H * R; const x = c.getContext("2d"); x.setTransform(R, 0, 0, R, 0, 0); return [c, x]; }
/* render cells into an offscreen canvas; colorFn(k) -> css colour or null */
function renderCells(box, colorFn) {
  const [c, x] = offscreen();
  if (!CELLS) return c;
  const buckets = new Map(), sz = Math.max(1.1, CELLS.step * box.s * 1.04);
  for (let k = 0; k < CELLS.n; k++) { const col = colorFn(k); if (!col) continue; let b = buckets.get(col); if (!b) buckets.set(col, b = []); b.push(k); }
  for (const [col, ks] of buckets) { x.fillStyle = col; for (const k of ks) x.fillRect(box.x(CELLS.lon[k]) - sz / 2, box.y(CELLS.lat[k]) - sz / 2, sz, sz); }
  return c;
}
const popAlpha = k => clamp(Math.log10(1 + CELLS.pop[k]) / 4.3, 0.05, 1);
const q = (v, n) => Math.round(v * n) / n;

/* ---------------- particles (cold open + finale) ---------------- */
function Particles(canvas, box, opts = {}) {
  const ctx = makeCanvas(canvas);
  const every = opts.every || 2, P = [];
  if (CELLS) for (let k = 0; k < CELLS.n; k += every) {
    const a = Math.random() * Math.PI * 2, r = 300 + Math.random() * 1300;
    P.push({ tx: box.x(CELLS.lon[k]), ty: box.y(CELLS.lat[k]), sx: 960 + Math.cos(a) * r, sy: 540 + Math.sin(a) * r * .6,
      d: Math.random() * 1.6 + (CELLS.lat[k] - 8) * .12, b: Math.min(3, Math.floor(popAlpha(k) * 4)), ox: 0, oy: 0 });
  }
  const flagged = NT ? NT.flagged.map(f => ({ x: box.x(f[1]), y: box.y(f[0]), r: f[2], ph: Math.random() * 6.28 })) : [];
  const cols = opts.cols || ["rgba(236,233,225,.16)", "rgba(236,233,225,.32)", "rgba(255,214,170,.55)", "rgba(255,200,140,.9)"];
  let mouse = { x: -999, y: -999 }, start = 0, running = false, mode = opts.mode || "form";
  canvas.parentElement.addEventListener("mousemove", e => { mouse = toStage(e); });
  canvas.parentElement.addEventListener("mouseleave", () => { mouse = { x: -999, y: -999 }; });
  function frame(now) {
    if (!running) return;
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const layers = [[], [], [], []];
    for (const p of P) {
      const u = easeIO(clamp((t - p.d) / 2.6, 0, 1));
      let x = p.sx + (p.tx - p.sx) * u, y = p.sy + (p.ty - p.sy) * u;
      if (u >= 1) { // gentle shimmer + mouse repel
        const dx = p.tx - mouse.x, dy = p.ty - mouse.y, d2 = dx * dx + dy * dy;
        let fx = 0, fy = 0;
        if (d2 < 16000) { const d = Math.sqrt(d2) + .01, f = (1 - d / 126) * 46; fx = dx / d * f; fy = dy / d * f; }
        p.ox += (fx - p.ox) * .12; p.oy += (fy - p.oy) * .12;
        x += p.ox; y += p.oy;
      }
      layers[p.b].push(x, y);
    }
    for (let b = 0; b < 4; b++) { ctx.fillStyle = cols[b]; const L = layers[b]; for (let i = 0; i < L.length; i += 2) ctx.fillRect(L[i], L[i + 1], 1.7, 1.7); }
    // forecast squares heartbeat
    const fl = clamp((t - (opts.flagAt || 4.6)) / 1.5, 0, 1);
    if (fl > 0) {
      for (const f of flagged) {
        if (f.r > (opts.flagN || 461)) continue;
        const a = fl * (.35 + .35 * Math.sin(t * 2.2 + f.ph)) * (f.r <= 40 ? 1.4 : .8);
        ctx.fillStyle = `rgba(${opts.flagRGB || "255,59,38"},${clamp(a, 0, 1)})`;
        ctx.fillRect(f.x - 2, f.y - 2, 4, 4);
        if (f.r <= 12) { ctx.strokeStyle = `rgba(${opts.flagRGB || "255,59,38"},${clamp(a * .5, 0, 1)})`; ctx.beginPath(); ctx.arc(f.x, f.y, 8 + 22 * ((t * .5 + f.ph) % 1), 0, 6.28); ctx.stroke(); }
      }
    }
    ctx.globalCompositeOperation = "source-over";
    requestAnimationFrame(frame);
  }
  return { start() { if (running) return; running = true; start = performance.now(); requestAnimationFrame(frame); }, stop() { running = false; } };
}

/* ---------------- scene manager ---------------- */
const scenes = $$(".scene");
const ACT_TINT = [["#ff3b26", "#ffb627"], ["#ff3b26", "#ff7a26"], ["#ff3b26", "#00c2ff"], ["#ffb627", "#ff3b26"], ["#00c2ff", "#ffb627"], ["#00ff41", "#00c2ff"], ["#00c2ff", "#00ff41"], ["#ffb627", "#00c2ff"]];
const hooks = {};
let cur = -1, step = 0, loops = [];
const loop = fn => { let on = true; const f = now => { if (!on) return; fn(now); requestAnimationFrame(f); }; requestAnimationFrame(f); loops.push(() => on = false); };
const later = (fn, ms) => { const id = setTimeout(fn, ms); loops.push(() => clearTimeout(id)); };

// progress segments by act
(() => {
  const prog = $("#progress"), counts = {};
  scenes.forEach(s => counts[s.dataset.act] = (counts[s.dataset.act] || 0) + 1);
  Object.keys(counts).forEach(a => { const sp = document.createElement("span"); sp.style.setProperty("--n", counts[a]); sp.dataset.act = a; sp.innerHTML = "<i></i>"; prog.appendChild(sp); });
  const g = $("#ovGrid");
  scenes.forEach((s, i) => { const b = document.createElement("button"); b.innerHTML = `<span>${String(i + 1).padStart(2, "0")} · ACT ${["0", "I", "II", "III", "IV", "V", "VI", "FIN"][s.dataset.act]}</span><b>${s.dataset.title}</b>`; b.onclick = () => { document.body.classList.remove("ov"); go(i); }; g.appendChild(b); });
})();
function updateHud() {
  const s = scenes[cur], act = +s.dataset.act;
  $("#counter").textContent = `${String(cur + 1).padStart(2, "0")} / ${scenes.length}`;
  $("#sceneTitle").textContent = s.dataset.title;
  $("#actLabel").textContent = ["Opening", "Act I · Problem", "Act II · Stakes", "Act III · Research", "Act IV · Technology", "Act V · Prototype", "Act VI · Impact", "Finale"][act];
  $("#crit").innerHTML = s.dataset.crit || "";
  const [a, b] = ACT_TINT[act];
  stage.style.setProperty("--tint", a); stage.style.setProperty("--tint2", b);
  $$("#progress span").forEach(sp => {
    const sa = +sp.dataset.act, inAct = scenes.filter(x => +x.dataset.act === sa), idx = inAct.indexOf(s);
    sp.querySelector("i").style.setProperty("--p", sa < act ? 1 : sa > act ? 0 : (idx + 1) / inAct.length);
  });
  $$("#ovGrid button").forEach((b, i) => b.classList.toggle("cur", i === cur));
}
function go(i, atEnd = false) {
  i = clamp(i, 0, scenes.length - 1);
  if (i === cur) return;
  loops.forEach(f => f()); loops = [];
  if (cur >= 0) { const old = scenes[cur]; old.classList.remove("active"); old.classList.add("past"); hooks[old.id]?.leave?.(old); setTimeout(() => old.classList.remove("past"), 1200); }
  cur = i; const s = scenes[i];
  $$(".a[data-at]", s).forEach(e => e.classList.remove("on"));
  s.classList.add("active");
  document.body.classList.toggle("scope", s.hasAttribute("data-scope"));
  if (s.hasAttribute("data-scope")) { const f = $("#flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
  step = 0;
  runCounters(s);
  hooks[s.id]?.enter?.(s);
  if (atEnd) { const n = +(s.dataset.steps || 0); while (step < n) advanceStep(s); }
  history.replaceState(null, "", "#" + (i + 1));
  updateHud();
}
function advanceStep(s) {
  step++;
  $$(`.a[data-at]`, s).forEach(e => { if (+e.dataset.at <= step && !e.classList.contains("on")) { e.classList.add("on"); runCounters(s, e); } });
  hooks[s.id]?.step?.(s, step);
}
function next() { const s = scenes[cur], n = +(s.dataset.steps || 0); if (step < n) advanceStep(s); else go(cur + 1); }
function prev() { go(cur - 1, true); }
addEventListener("keydown", e => {
  if (e.target.matches("input")) { if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return; e.target.blur(); }
  const k = e.key;
  if (["ArrowRight", "PageDown", " ", "Enter", "ArrowDown"].includes(k)) { e.preventDefault(); next(); }
  else if (["ArrowLeft", "PageUp", "Backspace", "ArrowUp"].includes(k)) { e.preventDefault(); prev(); }
  else if (k === "Home") go(0); else if (k === "End") go(scenes.length - 1);
  else if (k === "f" || k === "F") { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  else if (k === "h" || k === "H") document.body.classList.toggle("nohud");
  else if (k === "o" || k === "O" || k === "Escape") document.body.classList.toggle("ov", k === "Escape" ? false : undefined);
});
let tx0 = null;
addEventListener("touchstart", e => { tx0 = e.touches[0].clientX; }, { passive: true });
addEventListener("touchend", e => { if (tx0 == null) return; const dx = e.changedTouches[0].clientX - tx0; if (Math.abs(dx) > 60) dx < 0 ? next() : prev(); tx0 = null; });

/* =================================================================== scenes */

/* ---- cold open ---- */
(() => {
  const h1 = $("#openTitle"); h1.innerHTML = [...h1.textContent].map((c, i) => `<span style="--i:${i}">${c}</span>`).join("");
  let P = null;
  hooks["s-open"] = {
    enter(s) {
      s.classList.remove("go", "go2");
      if (!P) P = Particles($("#c-open"), fitBox(1080, 70, 760, 950), { flagAt: 5.2 });
      P.start();
      const pre = $("#openType"), txt = "Kerala · 2026 · 34.7 million people"; pre.textContent = "";
      let i = 0; const typer = setInterval(() => { pre.textContent = txt.slice(0, ++i) + (i < txt.length ? "▍" : ""); if (i >= txt.length) clearInterval(typer); }, 45);
      loops.push(() => clearInterval(typer));
      later(() => s.classList.add("go"), 50);
      later(() => s.classList.add("go2"), 3800);
    },
    leave() { P && P.stop(); }
  };
})();

/* ---- curve ---- */
(() => {
  const svg = $("#curve"); let built = false;
  function build() {
    if (!NT || built) return; built = true;
    const S = NT.series, w = 1620, h = 520, L = 70, B = 50, T = 20;
    const idx = m => (+m.slice(0, 4) - 2016) * 12 + (+m.slice(5, 7) - 1);
    const maxI = idx("2026-12"), maxV = 1400;
    const X = i => L + (i / maxI) * (w - L - 40), Y = v => T + (1 - v / maxV) * (h - T - B);
    const defs = svgEl("defs", {}, svg);
    const gr = svgEl("linearGradient", { id: "cg", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svgEl("stop", { offset: 0, "stop-color": "#ff3b26", "stop-opacity": .35 }, gr); svgEl("stop", { offset: 1, "stop-color": "#ff3b26", "stop-opacity": 0 }, gr);
    for (let v = 0; v <= 1400; v += 200) { svgEl("line", { x1: L, x2: w - 40, y1: Y(v), y2: Y(v), stroke: "rgba(236,233,225,.07)" }, svg); svgEl("text", { x: L - 14, y: Y(v) + 5, "text-anchor": "end" }, svg).textContent = v; }
    for (let y = 2016; y <= 2026; y++) svgEl("text", { x: X((y - 2016) * 12 + 5.5), y: h - 14, "text-anchor": "middle" }, svg).textContent = y;
    const segA = S.filter(r => r.src === "excise_district_statements"), segB = S.filter(r => r.src !== "excise_district_statements");
    const pts = seg => seg.map(r => [X(idx(r.m)), Y(r.v)]);
    const pa = pts(segA), pb = pts(segB);
    const d = p => "M" + p.map(q => q[0].toFixed(1) + "," + q[1].toFixed(1)).join("L");
    const area = svgEl("path", { d: d(pa) + `L${pa.at(-1)[0]},${Y(0)}L${pa[0][0]},${Y(0)}Z`, fill: "url(#cg)", opacity: 0 }, svg);
    area.style.transition = "opacity 2s 2.6s"; area.classList.add("fadeA");
    const areaB = svgEl("path", { d: d(pb) + `L${pb.at(-1)[0]},${Y(0)}L${pb[0][0]},${Y(0)}Z`, fill: "rgba(0,194,255,.12)", opacity: 0 }, svg);
    areaB.style.transition = "opacity 2s 3.4s";
    // gap band
    const gx0 = X(idx("2024-09")), gx1 = X(idx("2025-01"));
    const band = svgEl("rect", { x: gx0, y: T, width: gx1 - gx0, height: h - T - B, fill: "rgba(255,59,38,.12)" }, svg); band.style.transition = "opacity 1s";
    band.id = "gapBand";
    svgEl("line", { x1: pa.at(-1)[0], y1: pa.at(-1)[1], x2: pb[0][0], y2: pb[0][1], stroke: "rgba(236,233,225,.35)", "stroke-dasharray": "4 6" }, svg);
    const la = svgEl("path", { d: d(pa), fill: "none", stroke: "#ff3b26", "stroke-width": 3, class: "draw", "stroke-linejoin": "round" }, svg);
    const lb = svgEl("path", { d: d(pb), fill: "none", stroke: "#00c2ff", "stroke-width": 3, class: "draw", "stroke-linejoin": "round" }, svg);
    [la, lb].forEach(p => p.style.setProperty("--len", p.getTotalLength()));
    lb.style.setProperty("--dd", "3.1s");
    const end = pb.at(-1), last = S.at(-1);
    const g = svgEl("g", {}, svg); g.style.transition = "opacity 1s 4.6s";
    svgEl("circle", { cx: end[0], cy: end[1], r: 7, fill: "#00c2ff" }, g);
    const ring = svgEl("circle", { cx: end[0], cy: end[1], r: 7, fill: "none", stroke: "#00c2ff" }, g);
    svgEl("animate", { attributeName: "r", from: 7, to: 30, dur: "1.8s", repeatCount: "indefinite" }, ring);
    svgEl("animate", { attributeName: "opacity", from: 1, to: 0, dur: "1.8s", repeatCount: "indefinite" }, ring);
    const tl = svgEl("text", { x: end[0] - 16, y: end[1] - 22, "text-anchor": "end", style: "fill:#ece9e1;font-size:18px" }, g); tl.textContent = `${last.v} cases · Oct 2026`;
    [area, areaB, g, band].forEach(e => { e.removeAttribute("opacity"); e.style.opacity = 0; });
    svg._fade = [area, areaB, g];
  }
  hooks["s-curve"] = {
    enter() { build(); if (!svg._fade) return; svg._fade.forEach(e => { e.style.opacity = 0; }); requestAnimationFrame(() => requestAnimationFrame(() => svg._fade.forEach(e => { e.style.opacity = 1; }))); $("#gapBand").style.opacity = 0;
      // restart draw animation
      $$(".draw", svg).forEach(p => { p.style.animation = "none"; void p.getBBox(); p.style.animation = ""; }); },
    step(s, n) { if (n === 2) $("#gapBand").style.opacity = 1; }
  };
})();

/* ---- district spread ---- */
(() => {
  const svg = $("#dmap"); let built = false, paths = {}, year = 2016, playing = true, maxRate = 1;
  const norm = n => n.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6);
  let D = {};
  const ramp = t => { // dark -> red -> amber-white
    t = clamp(t, 0, 1);
    const stops = [[24, 14, 12], [120, 22, 14], [255, 59, 38], [255, 182, 39], [255, 236, 200]];
    const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
    const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
    return `rgb(${c})`;
  };
  function build() {
    if (!NT || built) return; built = true;
    for (const [name, d] of Object.entries(NT.districts)) D[norm(name)] = { name, pop: d.population_2020, y: d.yearly_ndps_cases };
    for (const d of Object.values(D)) for (const y in d.y) { const months = y === "2024" ? 9 : 12; maxRate = Math.max(maxRate, d.y[y] / d.pop * 1e5 * 12 / months); }
    const box = fitBox(10, 10, 540, 880);
    for (const f of NT.geo.features) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      const dstr = polys.map(p => p.map(r => "M" + r.map(c => box.x(c[0]).toFixed(1) + "," + box.y(c[1]).toFixed(1)).join("L") + "Z").join("")).join("");
      const key = norm(f.properties.name || f.properties.district || "");
      const p = svgEl("path", { d: dstr }, svg); paths[key] = p; p.dataset.k = key;
      p.addEventListener("mousemove", e => { const d = D[key]; if (!d) return; const t = $("#dtip"), m = toStage(e), host = svg.parentElement.getBoundingClientRect();
        t.style.opacity = 1; t.innerHTML = `<b>${d.name}</b><br><span class="mono" style="color:var(--ink2)">${year}: ${fmt(d.y[year] || 0)} cases · ${fmt(rate(d, year), 0)}/100k</span>`;
        t.style.left = (m.x - (host.left - stage.getBoundingClientRect().left) / scale + 20) + "px"; t.style.top = (m.y - (host.top - stage.getBoundingClientRect().top) / scale - 30) + "px"; });
      p.addEventListener("mouseleave", () => $("#dtip").style.opacity = 0);
    }
    const rc = $("#spreadRamp").getContext("2d"); for (let x = 0; x < 240; x++) { rc.fillStyle = ramp(x / 239); rc.fillRect(x, 0, 1, 10); }
    $("#spreadMax").textContent = fmt(maxRate);
    $("#spreadRange").addEventListener("input", e => { setPlaying(false); setYear(+e.target.value); });
    $("#spreadPlay").addEventListener("click", () => setPlaying(!playing));
  }
  const rate = (d, y) => (d.y[y] || 0) / d.pop * 1e5 * 12 / (y == 2024 ? 9 : 12);
  function setPlaying(v) { playing = v; $("#spreadPlay").textContent = v ? "❚❚ Pause" : "▶ Play"; }
  function setYear(y) {
    year = y; $("#spreadYear").textContent = y === 2024 ? "2024*" : y; $("#spreadRange").value = y;
    let tot = 0; const list = [];
    for (const [k, d] of Object.entries(D)) { const r = rate(d, y); tot += d.y[y] || 0; list.push([d.name, r]); if (paths[k]) paths[k].style.fill = ramp(Math.sqrt(r / maxRate)); }
    list.sort((a, b) => b[1] - a[1]);
    $("#spreadLine").innerHTML = `<b>${fmt(tot)}</b> Excise NDPS cases recorded across Kerala${y === 2024 ? " (Jan–Sep)" : ""}.`;
    $("#spreadRank").innerHTML = `<div class="kicker" style="font-size:13px">Highest rate · ${y}</div>` + list.slice(0, 8).map(([n, r], i) =>
      `<div style="margin-top:16px"><div style="display:flex;justify-content:space-between;font-size:19px"><span>${i + 1}. ${n}</span><span class="mono" style="color:var(--ink2)">${fmt(r)}</span></div><div style="height:4px;background:rgba(255,255,255,.07);margin-top:6px"><div style="height:100%;width:${r / maxRate * 100}%;background:${ramp(Math.sqrt(r / maxRate))};transition:width .8s"></div></div></div>`).join("");
  }
  hooks["s-spread"] = {
    enter() { build(); if (!NT) return; setPlaying(true); setYear(2016); let last = performance.now();
      loop(now => { if (playing && now - last > 1500) { last = now; setYear(year >= 2024 ? 2016 : year + 1); } }); }
  };
})();

/* ---- gap map ---- */
(() => {
  let ctx, layers = [], mode = 0, box, trans = null, built = false, centresBox;
  const TXT = [
    ["Where Kerala lives.", "Every dot is a square kilometre, lit by how many people live there."],
    ["How far is <em>help?</em>", "Straight-line distance to the nearest de-addiction centre. Red is more than 10 km. White rings are the 322 centres."],
    ["Affected, <em>and far.</em>", "Areas with the most recorded drug cases (police and Excise), shown in bright red where help is more than 10 km away."],
  ];
  function build() {
    if (built || !CELLS) return; built = true;
    ctx = makeCanvas($("#c-gap")); box = fitBox(1040, 70, 780, 950);
    layers[0] = renderCells(box, k => `rgba(255,214,170,${q(popAlpha(k) * .95, 10)})`);
    layers[1] = renderCells(box, k => { const d = CELLS.km[k], a = q(.25 + popAlpha(k) * .6, 5);
      return d < 5 ? `rgba(90,88,80,${a})` : d < 10 ? `rgba(150,110,90,${a})` : d < 20 ? `rgba(255,90,50,${a})` : `rgba(255,40,30,${Math.min(1, a + .2)})`; });
    layers[2] = renderCells(box, k => { const g = CELLS.grade[k], far = CELLS.km[k] > 10;
      if (!g) return `rgba(80,78,72,${q(popAlpha(k) * .35, 5)})`;
      return far ? ["", "rgba(255,120,80,.75)", "rgba(255,70,40,.9)", "rgba(255,40,25,1)"][g] : ["", "rgba(140,60,45,.5)", "rgba(170,60,40,.6)", "rgba(200,60,40,.7)"][g]; });
  }
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    if (trans) {
      const t = clamp((now - trans.t) / 1400, 0, 1), e = easeIO(t), yCut = 40 + e * 1000;
      ctx.drawImage(layers[trans.from], 0, 0, W, H);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, yCut); ctx.clip(); ctx.drawImage(layers[trans.to], 0, 0, W, H); ctx.restore();
      if (t < 1) { const g = ctx.createLinearGradient(0, yCut - 40, 0, yCut + 2); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,240,220,.5)"); ctx.fillStyle = g; ctx.fillRect(1000, yCut - 40, 860, 42); }
      else trans = null;
    } else ctx.drawImage(layers[mode], 0, 0, W, H);
    if (mode >= 1 && NT) {
      const a = clamp((now - (modeT || 0)) / 1200, 0, 1);
      ctx.strokeStyle = `rgba(255,255,255,${.85 * a})`; ctx.lineWidth = 1.2;
      for (const c of NT.centres) { const x = box.x(c[1]), y = box.y(c[0]); ctx.beginPath(); ctx.arc(x, y, c[2] ? 5 : 3, 0, 6.28); ctx.stroke(); }
    }
  }
  let modeT = 0;
  function setMode(m) {
    if (m === mode && !trans) return;
    trans = { from: mode, to: m, t: performance.now() }; mode = m; modeT = performance.now() + 900;
    $("#gapTitle").innerHTML = TXT[m][0]; $("#gapLede").textContent = TXT[m][1];
    $$("[data-gap]").forEach(b => b.classList.toggle("on", +b.dataset.gap === m));
  }
  $$("[data-gap]").forEach(b => b.addEventListener("click", () => { const m = +b.dataset.gap; if (m !== mode) setMode(m); }));
  hooks["s-gap"] = {
    enter() { build(); if (!CELLS) return; mode = 0; trans = null; modeT = performance.now();
      $("#gapTitle").innerHTML = TXT[0][0]; $("#gapLede").textContent = TXT[0][1]; $$("[data-gap]").forEach(b => b.classList.toggle("on", +b.dataset.gap === 0)); loop(draw); },
    step(s, n) { setMode(n); }
  };
})();

/* ---- archive tiles ---- */
(() => {
  const host = $("#tiles"); let built = false;
  const MON = "JFMAMJJASOND";
  function build() {
    if (built) return; built = true; let html = "";
    for (let y = 2016; y <= 2026; y++) {
      html += `<div class="y">${y}</div>`;
      for (let m = 0; m < 12; m++) {
        const k = y * 12 + m, cls = k <= 2024 * 12 + 8 ? "x" : (k >= 2025 * 12 && k <= 2026 * 12 + 9) ? "x2" : "g";
        html += `<div class="tile" data-c="${cls}" data-k="${k}">${MON[m]}</div>`;
      }
    }
    host.innerHTML = html;
  }
  hooks["s-archive"] = {
    enter() {
      build(); const tiles = $$(".tile", host); tiles.forEach(t => t.className = "tile"); $("#stamp").classList.remove("go");
      let i = 0;
      const id = setInterval(() => {
        for (let r = 0; r < 3 && i < tiles.length; r++, i++) { const t = tiles[i], c = t.dataset.c; t.className = "tile " + (c === "x" ? "v" : c === "x2" ? "v2" : "g"); }
        if (i >= tiles.length) { clearInterval(id); $("#stamp").classList.add("go"); }
      }, 34);
      loops.push(() => clearInterval(id));
    }
  };
})();

/* ---- news / geocoder ---- */
hooks["s-news"] = { step(s, n) { $$(".mltext [data-k]", s).forEach(e => e.classList.toggle("on", +e.dataset.k <= n)); },
  enter(s) { $$(".mltext [data-k]", s).forEach(e => e.classList.remove("on")); } };

/* ---- constellation ---- */
(() => {
  const svg = $("#constel"); let built = false;
  const SRC = [
    ["Kerala Excise statements", "105 MONTHS · 2016–24", "#ffb627"], ["Legislative Assembly answer", "MONTHLY 2025–26", "#ffb627"], ["Excise live site", "MONTHLY SNAPSHOTS", "#ffb627"], ["NCRB district tables", "POLICE NDPS CASES", "#ffb627"],
    ["Times of India", "NEWS SITEMAPS", "#00c2ff"], ["New Indian Express", "NEWS SITEMAPS", "#00c2ff"], ["Onmanorama", "NEWS SITEMAPS", "#00c2ff"], ["Asianet News", "MALAYALAM SUMMARIES", "#00c2ff"], ["News18 Malayalam", "MALAYALAM", "#00c2ff"], ["Madhyamam", "185,919 STORIES", "#00c2ff"],
    ["KSMHA register", "308 CENTRES · BEDS", "#ff3b26"], ["Vimukthi directory", "14 CENTRES", "#ff3b26"], ["WorldPop 2020", "46,057 KM² · 34.7M", "#00ff41"], ["OpenStreetMap + GeoNames", "STATIONS · ROADS · 31 CROSSINGS", "#00ff41"],
  ];
  function build() {
    if (built) return; built = true;
    const cx = 960, cy = 360, n = SRC.length;
    const core = svgEl("g", { class: "node" }, svg);
    svgEl("circle", { cx, cy, r: 92, fill: "rgba(255,182,39,.08)", stroke: "#ffb627", "stroke-width": 1.5 }, core);
    svgEl("circle", { cx, cy, r: 120, fill: "none", stroke: "rgba(255,182,39,.25)", "stroke-dasharray": "3 7" }, core);
    const t = svgEl("text", { x: cx, y: cy + 8, "text-anchor": "middle", style: "font-size:26px;font-weight:600;fill:#fff" }, core); t.textContent = "NarcoTrace";
    SRC.forEach(([name, sub, col], i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2, x = cx + Math.cos(a) * 720, y = cy + Math.sin(a) * 300;
      const wire = svgEl("path", { d: `M${x},${y} Q${(x + cx) / 2},${(y + cy) / 2 - 40} ${cx},${cy}`, class: "wire" }, svg);
      wire.style.stroke = col + "55";
      const dot = svgEl("circle", { r: 3.5, fill: col, class: "p", style: `color:${col}` }, svg);
      svgEl("animateMotion", { dur: (2.2 + (i % 5) * .45) + "s", repeatCount: "indefinite", path: wire.getAttribute("d"), begin: (i * .15) + "s" }, dot);
      const g = svgEl("g", { class: "node" }, svg); g.style.transitionDelay = (0.3 + i * .07) + "s";
      const left = Math.cos(a) < -0.1, right = Math.cos(a) > 0.1, anchor = left ? "end" : right ? "start" : "middle", dx = left ? -16 : right ? 16 : 0;
      svgEl("circle", { cx: x, cy: y, r: 7, fill: col }, g);
      svgEl("circle", { cx: x, cy: y, r: 13, fill: "none", stroke: col, opacity: .4 }, g);
      const tt = svgEl("text", { x: x + dx, y: y - 4 + (Math.abs(Math.cos(a)) < .1 ? (Math.sin(a) < 0 ? -18 : 34) : 0), "text-anchor": anchor }, g); tt.textContent = name;
      const ts = svgEl("text", { x: x + dx, y: y + 18 + (Math.abs(Math.cos(a)) < .1 ? (Math.sin(a) < 0 ? -18 : 34) : 0), "text-anchor": anchor, class: "s" }, g); ts.textContent = sub;
    });
    svg.appendChild(core);
  }
  hooks["s-sources"] = { enter() { build(); } };
})();

/* ---- findings bars ---- */
const fillBars = s => $$(".hbar i[data-w]", s).forEach((i, k) => { i.style.width = 0; setTimeout(() => i.style.width = i.dataset.w + "%", 600 + k * 180); });
hooks["s-findings"] = { enter: fillBars };
hooks["s-india"] = { enter: fillBars };

/* ---- pipeline ---- */
(() => {
  const svg = $("#pipe"); let built = false;
  const COLS = [
    ["SOURCES", "#ffb627", [["Official counts", "EXCISE · NCRB · ASSEMBLY"], ["Six newsrooms", "ENGLISH + MALAYALAM"], ["Geography", "OSM · GEONAMES · WORLDPOP"], ["Care registers", "KSMHA · VIMUKTHI"]]],
    ["VERIFY & LOCATE", "#00c2ff", [["Printed-total check", "SHA-256 FINGERPRINTS"], ["Bilingual geocoder", "DATELINES · CASE ENDINGS"], ["1 km grid", "46,057 SQUARES"]]],
    ["MODELS", "#00ff41", [["District month", "SHARE × STATE × SEASON"], ["Where-next simulation", "TOP-4 · HOT ALERTS"], ["Grid ranker v3.1", "LIGHTGBM · ETAS · NEWS"], ["Pattern engine v2", "PROFILES · SPACE-TIME SCAN"], ["Recovery access", "2-STEP CATCHMENT"]]],
    ["GUARDRAILS", "#ff3b26", [["Pre-registered gates", "SCORED ONCE"], ["Weekly frozen ledger", "AUTO-REVERT"], ["Abstain & suppress", "STALE DATA · CELLS < 5"]]],
    ["PRODUCT", "#ece9e1", [["Enforcement view", "NEXT 28 DAYS"], ["Public view", "ENGLISH · മലയാളം"], ["Safe tips", "QUARANTINED FROM MODEL"]]],
  ];
  const LINKS = [ // [fromCol, fromRow, toCol, toRow]
    [0, 0, 1, 0], [0, 1, 1, 1], [0, 2, 1, 1], [0, 2, 1, 2], [0, 3, 1, 2],
    [1, 0, 2, 0], [1, 0, 2, 1], [1, 1, 2, 2], [1, 1, 2, 3], [1, 2, 2, 2], [1, 2, 2, 3], [1, 2, 2, 4],
    [2, 0, 3, 0], [2, 1, 3, 0], [2, 2, 3, 1], [2, 3, 3, 1], [2, 4, 3, 2], [2, 0, 3, 2],
    [3, 0, 4, 0], [3, 1, 4, 0], [3, 1, 4, 1], [3, 2, 4, 1], [3, 2, 4, 2]];
  function build() {
    if (built) return; built = true;
    const NW = 270, NH = 78, xs = [100, 470, 840, 1210, 1580], pos = [];
    COLS.forEach(([h, col, items], c) => {
      const t = svgEl("text", { x: xs[c], y: 10, class: "colh" }, svg); t.textContent = h; t.style.fill = col;
      const gap = 18, tot = items.length * NH + (items.length - 1) * gap, y0 = 40 + (620 - tot) / 2;
      pos[c] = items.map((_, r) => ({ x: xs[c], y: y0 + r * (NH + gap) }));
    });
    LINKS.forEach(([c1, r1, c2, r2], i) => {
      const a = pos[c1][r1], b = pos[c2][r2], x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      svgEl("path", { d, class: "wire" }, svg);
      const col = COLS[c2][1];
      const dot = svgEl("circle", { r: 3, fill: col, class: "p", style: `color:${col}` }, svg);
      svgEl("animateMotion", { dur: (1.6 + (i % 4) * .35) + "s", repeatCount: "indefinite", path: d, begin: (c1 * .6 + (i % 3) * .3) + "s" }, dot);
    });
    COLS.forEach(([h, col, items], c) => items.forEach(([n, s], r) => {
      const p = pos[c][r], g = svgEl("g", { class: "node" }, svg); g.style.transitionDelay = (0.3 + c * .35 + r * .08) + "s";
      svgEl("rect", { x: p.x, y: p.y, width: NW, height: NH, rx: 2 }, g);
      svgEl("rect", { x: p.x, y: p.y, width: 3, height: NH, fill: col }, g);
      const t = svgEl("text", { x: p.x + 20, y: p.y + 34 }, g); t.textContent = n;
      const ts = svgEl("text", { x: p.x + 20, y: p.y + 58, class: "s" }, g); ts.textContent = s;
    }));
  }
  hooks["s-pipeline"] = { enter() { build(); } };
})();

/* ---- grid model canvas ---- */
(() => {
  let ctx, base, box, built = false, fl = [];
  function build() {
    if (built || !CELLS) return; built = true;
    ctx = makeCanvas($("#c-grid")); box = fitBox(1040, 70, 780, 950);
    base = renderCells(box, k => `rgba(236,233,225,${q(.05 + popAlpha(k) * .22, 20)})`);
    fl = NT.flagged.map(f => ({ x: box.x(f[1]), y: box.y(f[0]), r: f[2], e: f[3] }));
    const imp = [["News coverage", 8.5, "#00ff41"], ["Square's own history", 8.0, "#00ff41"], ["Surroundings", 1.5, "#00c2ff"], ["Population", 1.0, "#00c2ff"], ["Neighbours + ETAS", 0.7, "#00c2ff"]];
    $("#importance").innerHTML = imp.map(([n, v, c]) => `<div class="hbar" style="grid-template-columns:240px 1fr 80px;margin:8px 0;font-size:18px"><span class="lab">${n}</span><span class="t" style="height:20px"><i style="--c:${c}" data-w="${v / 8.5 * 100}"></i></span><span class="v" style="font-size:19px">+${v}</span></div>`).join("");
  }
  let t0 = 0;
  function draw(now) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H); ctx.drawImage(base, 0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (const f of fl) {
      const on = clamp((t - 1 - f.r * .006) / .4, 0, 1); if (!on) continue;
      const a = on * clamp(.35 + f.e * 1.1, .35, 1);
      ctx.fillStyle = `rgba(0,255,65,${a})`; ctx.fillRect(f.x - 2.2, f.y - 2.2, 4.4, 4.4);
      if (f.r <= 20) { ctx.fillStyle = `rgba(0,255,65,${a * .18})`; ctx.beginPath(); ctx.arc(f.x, f.y, 12 + 4 * Math.sin(t * 2 + f.r), 0, 6.28); ctx.fill(); }
    }
    ctx.globalCompositeOperation = "source-over";
  }
  hooks["s-grid"] = {
    enter() { build(); if (!CELLS) return; t0 = performance.now(); $$("#importance i").forEach(i => i.style.width = 0); loop(draw); },
    step(s, n) { if (n === 1) $$("#importance i").forEach((i, k) => setTimeout(() => i.style.width = i.dataset.w + "%", 200 + k * 150)); }
  };
})();

/* ---- rigor timeline ---- */
(() => {
  const svg = $("#timeline"); let built = false;
  function build() {
    if (built) return; built = true;
    const L = 20, Wd = 1580, y = 150, X = yr => L + (yr - 2016) / (2027.5 - 2016) * Wd;
    svgEl("line", { x1: L, x2: L + Wd, y1: y, y2: y, stroke: "rgba(236,233,225,.25)" }, svg);
    for (let yr = 2016; yr <= 2027; yr++) { svgEl("line", { x1: X(yr), x2: X(yr), y1: y - 6, y2: y + 6, stroke: "rgba(236,233,225,.35)" }, svg); svgEl("text", { x: X(yr), y: y + 34, "text-anchor": "middle" }, svg).textContent = yr; }
    const SEG = [[2016, 2022, "#6f6d66", "LEARN", "history only"], [2022, 2024, "#ffb627", "DEVELOP", "choose settings"], [2024, 2026.5, "#00c2ff", "TEST", "scored once"], [2026.5, 2026.9, "#00ff41", "LIVE CHECK", "Jul–Nov 2026"], [2026.92, 2027.45, "#00ff41", "LEDGER", "weekly, from 1 Dec"]];
    SEG.forEach(([a, b, c, n, s], i) => {
      const r = svgEl("rect", { x: X(a), y: y - 16, height: 32, fill: c, opacity: i === 4 ? .35 : .85 }, svg); r.style.width = "0px";
      r.style.transition = `width 1.2s cubic-bezier(.2,.75,.1,1) ${0.6 + i * .45}s`; r.dataset.w = X(b) - X(a) - 4;
      const up = i % 2 === 0, ty = up ? y - 46 : y + 76;
      const t = svgEl("text", { x: X(a) + 6, y: ty, style: `fill:${c};font-size:15px;letter-spacing:.2em;opacity:0;transition:opacity .8s ${1 + i * .45}s` }, svg); t.textContent = n;
      const t2 = svgEl("text", { x: X(a) + 6, y: ty + 22, style: `font-size:13px;opacity:0;transition:opacity .8s ${1.1 + i * .45}s` }, svg); t2.textContent = s;
    });
    const cx = X(2026.5);
    const g = svgEl("g", { style: "opacity:0;transition:opacity .8s 2.6s" }, svg);
    svgEl("line", { x1: cx, x2: cx, y1: 20, y2: 250, stroke: "#00c2ff", "stroke-width": 2, "stroke-dasharray": "4 5" }, g);
    const tt = svgEl("text", { x: cx - 12, y: 30, "text-anchor": "end", style: "fill:#00c2ff;font-size:15px;letter-spacing:.14em" }, g); tt.textContent = "❄ KNOWLEDGE CUTOFF · 30 JUN 2026";
  }
  hooks["s-rigor"] = {
    enter() { build(); const els = $$("rect[data-w], text[style], g[style]", svg);
      els.forEach(e => { if (e.dataset.w) e.style.width = "0px"; else e.style.opacity = 0; });
      requestAnimationFrame(() => requestAnimationFrame(() => els.forEach(e => { if (e.dataset.w) e.style.width = e.dataset.w + "px"; else e.style.opacity = 1; }))); }
  };
  // width transition on SVG attribute is not animatable everywhere; use style width fallback
})();

/* ---- the frozen-forecast test ---- */
(() => {
  let ctx, base, box, built = false, fl = [], playing = false, pT = 0, months = [], rings = [];
  const DAYS = 148; // 1 Jul -> 25 Nov
  function build() {
    if (built || !NT) return; built = true;
    ctx = makeCanvas($("#c-cut")); box = fitBox(1100, 70, 740, 950);
    base = renderCells(box, k => `rgba(236,233,225,${q(.04 + popAlpha(k) * .2, 20)})`);
    fl = NT.flagged.map(f => ({ x: box.x(f[1]), y: box.y(f[0]), r: f[2], e: f[3] }));
    months = NT.cutoff.v3.by_month;
    const v1 = NT.cutoff.v1.by_month;
    months.forEach((m, i) => { m.v1 = v1[i]?.grid_ranker; m.rep = v1[i]?.repeat_locality_1km; m.pop = v1[i]?.population; });
    $("#cutMonths").innerHTML = months.map(m => `<div class="mo"><div class="m">${new Date(m.month + "-01").toLocaleString("en", { month: "short" }).toUpperCase()}</div><div class="c"><span class="cc">0</span><span class="mutec" style="font-size:20px">/${m.located_reports}</span></div><div class="fill"></div></div>`).join("");
    $("#cutPlay").addEventListener("click", play);
  }
  function reset() { playing = false; $("#cutPct").textContent = "0%"; $("#cutClock").textContent = "30 JUN 2026"; $("#cutBars").style.opacity = 0;
    $$("#cutMonths .mo").forEach(m => { m.classList.remove("on"); $(".cc", m).textContent = 0; $(".fill", m).style.width = 0; }); $("#cutPlay").textContent = "▶ Run Jul → Nov 2026"; }
  function play() { reset(); playing = true; pT = performance.now(); $("#cutPlay").textContent = "● Running"; }
  function finish() {
    const tot = months.reduce((a, m) => a + m.located_reports, 0), v3 = months.reduce((a, m) => a + m.v3, 0);
    const v1 = months.reduce((a, m) => a + (m.v1 || 0), 0), rep = months.reduce((a, m) => a + (m.rep || 0), 0), pop = months.reduce((a, m) => a + (m.pop || 0), 0);
    const rows = [["NarcoTrace v3.1", v3, "#00ff41"], ["Our first model (v1)", v1, "#00c2ff"], ["Same place again", rep, "#6f6d66"], ["Where people live", pop, "#3d3c38"]];
    $("#cutBars").innerHTML = rows.map(([n, v, c]) => `<div class="hbar" style="grid-template-columns:260px 1fr 90px;margin:8px 0;font-size:18px"><span class="lab">${n}</span><span class="t" style="height:22px"><i style="--c:${c}" data-w="${v / tot * 100}"></i></span><span class="v" style="font-size:20px">${Math.round(v / tot * 1000) / 10}%</span></div>`).join("");
    $("#cutBars").style.opacity = 1;
    setTimeout(() => $$("#cutBars i").forEach((i, k) => setTimeout(() => i.style.width = i.dataset.w + "%", k * 160)), 100);
    $("#cutPlay").textContent = "↻ Replay";
    $("#cutLine").innerHTML = `<b>${v3} of ${tot}</b> later reported seizures fell inside the 1% of Kerala we flagged on 30 June`;
  }
  function draw(now) {
    ctx.clearRect(0, 0, W, H); ctx.drawImage(base, 0, 0, W, H);
    const t = now / 1000;
    ctx.globalCompositeOperation = "lighter";
    for (const f of fl) { const a = clamp(.4 + f.e, .4, 1); ctx.fillStyle = `rgba(0,255,65,${a})`; ctx.fillRect(f.x - 2.2, f.y - 2.2, 4.4, 4.4); }
    if (playing) {
      const day = clamp((now - pT) / 11000 * DAYS, 0, DAYS);
      const d = new Date(2026, 6, 1 + Math.floor(day));
      $("#cutClock").textContent = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
      let caught = 0, seen = 0;
      months.forEach((m, i) => {
        const startD = [0, 31, 62, 92, 123][i], len = [31, 31, 30, 31, 25][i], u = clamp((day - startD) / len, 0, 1), el = $$("#cutMonths .mo")[i];
        const c = Math.round(m.v3 * u), r = Math.round(m.located_reports * u); caught += c; seen += r;
        $(".cc", el).textContent = c; $(".fill", el).style.width = (u * m.v3 / m.located_reports * 100) + "%"; el.classList.toggle("on", u > 0);
      });
      $("#cutPct").textContent = seen ? (caught / seen * 100).toFixed(1) + "%" : "0%";
      if (Math.random() < .5) { const f = fl[Math.floor(Math.pow(Math.random(), 2.2) * fl.length)]; rings.push({ x: f.x, y: f.y, t: now }); }
      if (day >= DAYS) { playing = false; finish(); }
    }
    rings = rings.filter(r => now - r.t < 1400);
    for (const r of rings) { const u = (now - r.t) / 1400; ctx.strokeStyle = `rgba(0,255,65,${(1 - u) * .8})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(r.x, r.y, 4 + u * 34, 0, 6.28); ctx.stroke(); }
    ctx.globalCompositeOperation = "source-over";
  }
  hooks["s-cutoff"] = { enter() { build(); if (!NT) return; reset(); rings = []; loop(draw); later(play, 2200); } };
})();

/* ---- screenshot viewers ---- */
function Viewer(screenSel, thumbsSel, items) {
  const scr = $(screenSel), th = $(thumbsSel); let i = 0, auto = true;
  scr.innerHTML = items.map(it => `<img src="assets/shots/${it[0]}.png" alt="">`).join("") + `<div class="missing" style="display:none">Screenshots not found.<br>Run: node Presentation/tools/shoot.mjs</div>`;
  const imgs = $$("img", scr);
  imgs.forEach(im => im.addEventListener("error", () => { $(".missing", scr).style.display = "grid"; }));
  th.innerHTML = items.map(it => `<button><h5>${it[1]}</h5><p>${it[2]}</p></button>`).join("");
  const btns = $$("button", th);
  const show = k => { i = k; imgs.forEach((im, j) => im.classList.toggle("on", j === k)); btns.forEach((b, j) => b.classList.toggle("on", j === k));
    // restart ken-burns
    const im = imgs[k]; im.style.transition = "none"; im.style.transform = "scale(1)"; void im.offsetWidth; im.style.transition = ""; im.style.transform = ""; };
  btns.forEach((b, k) => b.addEventListener("click", () => { auto = false; show(k); }));
  return { enter() { auto = true; show(0); let last = performance.now(); loop(now => { if (auto && now - last > 6500) { last = now; show((i + 1) % items.length); } }); } };
}
hooks["s-enforce"] = Viewer("#enfScreen", "#enfThumbs", [
  ["enf-watch", "Priority · next 28 days", "Ranked 1 km zones with expected reports, plus the frozen-test scorecard on every screen."],
  ["enf-detail", "Why there", "Every place explains itself: recent reports, news coverage and nearby activity. A likelihood, never intelligence on a person."],
  ["enf-rising", "Emerging", "A space-time scan for rising areas. The new-place watch list is shown as a lead, because it didn't pass its own test."],
  ["enf-why", "Patterns", "Railway stations, highways, border crossings: what surrounds hotspots, as readable relative risks."],
  ["enf-districts", "Districts · official", "The latest official Excise month by district, next to the forecast and its withheld state."],
  ["enf-tips", "Tips · unverified", "Only areas that pass every safeguard, as dashed outlines kept apart from the forecast."],
]);
hooks["s-public"] = Viewer("#pubScreen", "#pubThumbs", [
  ["pub-far", "Far from help", "Drug-affected areas shaded by distance to the nearest centre. Ranked places where new help reaches most people."],
  ["pub-detail", "A place, up close", "Tap any spot for the nearest centres, computed in the browser. 'Near me' never leaves the phone."],
  ["pub-find", "Find help", "322 verified centres: government, registered and Vimukthi, with beds."],
  ["pub-districts", "Compare districts", "Distance, beds and recorded cases side by side, with small numbers suppressed."],
  ["pub-report", "Report safely", "What and roughly where, never who. Emergencies go straight to 112 and the helplines."],
  ["pub-malayalam", "മലയാളം", "The whole public side switches to Malayalam in one tap."],
]);

/* ---- innovation: nothing special ---- */

/* ---- usage cycle ---- */
(() => {
  const svg = $("#cycle"); let built = false, nodes = [];
  const N = [["MONDAY · LOCK", "New 4-week list frozen", "#00ff41"], ["REVIEW", "Analyst reads why", "#00ff41"], ["DECIDE", "Officers plan; a human acts", "#00ff41"],
    ["CARE", "Planners close the gap", "#ff3b26"], ["PUBLIC", "Find help · report safely", "#00c2ff"], ["+4 WEEKS · SCORE", "Scored; reverts if worse", "#ffb627"]];
  function build() {
    if (built) return; built = true;
    const cx = 430, cy = 400, r = 255;
    svgEl("circle", { cx, cy, r, fill: "none", stroke: "rgba(236,233,225,.12)", "stroke-width": 2 }, svg);
    const arc = svgEl("circle", { cx, cy, r, fill: "none", stroke: "#00ff41", "stroke-width": 3, "stroke-dasharray": `${r * .9} ${r * 7}`, "stroke-linecap": "round", style: "filter:drop-shadow(0 0 8px #00ff41)" }, svg);
    svgEl("animateTransform", { attributeName: "transform", type: "rotate", from: `0 ${cx} ${cy}`, to: `360 ${cx} ${cy}`, dur: "12s", repeatCount: "indefinite" }, arc);
    const c1 = svgEl("text", { x: cx, y: cy - 6, "text-anchor": "middle", style: "font-size:40px;font-weight:600" }, svg); c1.textContent = "Every week";
    const c2 = svgEl("text", { x: cx, y: cy + 26, "text-anchor": "middle", class: "s" }, svg); c2.textContent = "LOCKED · USED · SCORED";
    N.forEach(([h, s, col], i) => {
      const a = -Math.PI / 2 + i / N.length * Math.PI * 2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const g = svgEl("g", {}, svg);
      svgEl("circle", { cx: x, cy: y, r: 12, fill: "#050505", stroke: col, "stroke-width": 3 }, g);
      const right = Math.cos(a) > .2, left = Math.cos(a) < -.2, anc = right ? "start" : left ? "end" : "middle", dx = right ? 26 : left ? -26 : 0, dy = Math.abs(Math.cos(a)) < .2 ? (Math.sin(a) < 0 ? -50 : 50) : 0;
      const t1 = svgEl("text", { x: x + dx, y: y + dy - 4, "text-anchor": anc, class: "s" }, g); t1.textContent = h; t1.style.fill = col;
      const t2 = svgEl("text", { x: x + dx, y: y + dy + 22, "text-anchor": anc }, g); t2.textContent = s;
      nodes.push(g);
    });
  }
  hooks["s-week"] = { enter() { build(); let k = 0; nodes.forEach(n => n.style.opacity = .35);
    loop((() => { let last = 0; return now => { if (now - last > 2000) { last = now; nodes.forEach((n, j) => { n.style.transition = "opacity .6s"; n.style.opacity = j === k % nodes.length ? 1 : .35; }); k++; } }; })()); } };
})();

/* ---- honest bars ---- */
(() => {
  hooks["s-honest"] = { enter(s) {
    if (!NT) return;
    const ms = NT.cutoff.v1.by_month, tot = ms.reduce((a, m) => a + m.located_reports, 0);
    const v3 = NT.cutoff.v3.caught, v1 = ms.reduce((a, m) => a + m.grid_ranker, 0), rep = ms.reduce((a, m) => a + m.repeat_locality_1km, 0), pop = ms.reduce((a, m) => a + m.population, 0);
    const row = (n, v, c, sfx = "%") => `<div class="hbar"><span class="lab">${n}</span><span class="t"><i style="--c:${c}" data-w="${v}"></i></span><span class="v">${v.toFixed(1)}${sfx}</span></div>`;
    $("#winBars").innerHTML = `<p class="small" style="margin-bottom:6px">1 km grid · frozen 30 Jun, caught Jul–Nov (1% of Kerala)</p>` +
      row("NarcoTrace v3.1", v3 / tot * 100, "#00ff41") + row("Our first model", v1 / tot * 100, "#00c2ff") + row("Same place again", rep / tot * 100, "#6f6d66") + row("Where people live", pop / tot * 100, "#3d3c38") +
      `<p class="small" style="margin:34px 0 6px">District month · mean error, lower is better (Jan 2023 – Sep 2024)</p>` +
      `<div class="hbar"><span class="lab">NarcoTrace</span><span class="t"><i style="--c:#00ff41" data-w="${8.70 / 10 * 100}"></i></span><span class="v">8.70</span></div>` +
      `<div class="hbar"><span class="lab">12-month average</span><span class="t"><i style="--c:#6f6d66" data-w="${9.31 / 10 * 100}"></i></span><span class="v">9.31</span></div>`;
    fillBars(s);
  } };
})();

/* ---- finale ---- */
(() => {
  let P = null;
  hooks["s-finale"] = { enter() { if (!P) P = Particles($("#c-fin"), fitBox(1120, 70, 720, 950), { every: 2, flagAt: 2.8, flagRGB: "0,255,65", flagN: 120,
    cols: ["rgba(0,194,255,.14)", "rgba(0,194,255,.28)", "rgba(170,230,255,.5)", "rgba(230,250,255,.85)"] }); P.start(); }, leave() { P && P.stop(); } };
})();

/* ---------------- boot ---------------- */
if (!NT) console.warn("assets/data.js missing — run: python3 Presentation/tools/build_data.py");
const start = parseInt(location.hash.slice(1), 10);
go(Number.isFinite(start) ? start - 1 : 0);
})();
