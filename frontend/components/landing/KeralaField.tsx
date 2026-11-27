"use client";

import { useEffect, useRef } from "react";

/**
 * The hero: Kerala's outline (public OpenStreetMap boundary) filled with a field of dots that fly in, drift away
 * from the cursor and light up under a slow north-to-south scan. Purely decorative: no forecast, seizure or
 * centre data is drawn here, so nothing on this public page reveals a location.
 */
type Ring = [number, number][];
const LON0 = 74.82, LON1 = 77.45, LAT0 = 8.15, LAT1 = 12.82;
const K = Math.cos((10.5 * Math.PI) / 180);

export function KeralaField({ onCoord }: { onCoord?: (c: { lat: number; lon: number } | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const coordRef = useRef(onCoord);
  coordRef.current = onCoord;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rings: Ring[] = [];
    let W = 0, H = 0, dpr = 1;
    let box = { x: 0, y: 0, s: 1 };
    let pts: Float32Array = new Float32Array(0); // tx, ty, sx, sy, ox, oy, vx, vy, delay, seed
    const F = 10;
    let path: Path2D | null = null;
    let raf = 0, visible = true, start = performance.now();
    const mouse = { x: -1e4, y: -1e4 };

    const project = (lon: number, lat: number) => [box.x + (lon - LON0) * K * box.s, box.y + (LAT1 - lat) * box.s];

    function layout() {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr; canvas.height = H * dpr;
      const wide = W > 900;
      const bw = wide ? W * 0.42 : W * 0.9, bh = H * (wide ? 0.84 : 0.8);
      const s = Math.min(bw / ((LON1 - LON0) * K), bh / (LAT1 - LAT0));
      const mw = (LON1 - LON0) * K * s, mh = (LAT1 - LAT0) * s;
      box = { x: wide ? W * 0.93 - mw : (W - mw) / 2, y: (H - mh) / 2 + (wide ? 10 : 30), s };
      if (!rings.length) return;
      path = new Path2D();
      for (const ring of rings) ring.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        if (i) path!.lineTo(x, y); else path!.moveTo(x, y);
      });
      const step = Math.max(4.2, Math.sqrt((mw * mh) / 9000));
      const out: number[] = [];
      for (let y = box.y; y < box.y + mh; y += step)
        for (let x = box.x; x < box.x + mw; x += step) {
          const jx = x + (Math.random() - 0.5) * step * 0.5, jy = y + (Math.random() - 0.5) * step * 0.5;
          if (!ctx.isPointInPath(path, jx, jy)) continue; // identity transform here: canvas was just resized
          const a = Math.random() * Math.PI * 2, d = Math.max(W, H) * (0.5 + Math.random() * 0.6);
          out.push(jx, jy, W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d, 0, 0, 0, 0,
            ((jy - box.y) / mh) * 0.9 + Math.random() * 0.5, Math.random());
        }
      pts = new Float32Array(out);
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const t = (now - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const mh = (LAT1 - LAT0) * box.s;
      const period = 7;
      const sweepY = reduce ? -1e4 : box.y - 60 + (((t - 2.2) % period + period) % period) / period * (mh + 120);

      // Outline, traced in during the intro.
      if (path) {
        const p = reduce ? 1 : Math.min(1, Math.max(0, (t - 0.2) / 2.4));
        ctx.save();
        ctx.setLineDash([4000]); ctx.lineDashOffset = 4000 * (1 - p);
        ctx.strokeStyle = "rgba(232,230,223,.22)"; ctx.lineWidth = 1;
        ctx.stroke(path);
        ctx.restore();
      }

      // Scan band.
      if (!reduce && t > 2.2) {
        const g = ctx.createLinearGradient(0, sweepY - 90, 0, sweepY + 2);
        g.addColorStop(0, "rgba(0,255,65,0)"); g.addColorStop(1, "rgba(0,255,65,.10)");
        ctx.fillStyle = g;
        ctx.fillRect(box.x - 40, sweepY - 90, (LON1 - LON0) * K * box.s + 80, 92);
        ctx.fillStyle = "rgba(0,255,65,.55)";
        ctx.fillRect(box.x - 40, sweepY, (LON1 - LON0) * K * box.s + 80, 1);
      }

      for (let i = 0; i < pts.length; i += F) {
        const tx = pts[i], ty = pts[i + 1];
        const k = reduce ? 1 : Math.min(1, Math.max(0, (t - pts[i + 8]) / 1.6));
        const e = 1 - Math.pow(1 - k, 4);
        // Spring away from the cursor.
        const bx = tx + pts[i + 4], by = ty + pts[i + 5];
        const dx = bx - mouse.x, dy = by - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 14400 && k === 1) { const f = (1 - Math.sqrt(d2) / 120) * 2.2; const inv = 1 / (Math.sqrt(d2) + 0.1); pts[i + 6] += dx * inv * f; pts[i + 7] += dy * inv * f; }
        pts[i + 6] += -pts[i + 4] * 0.06; pts[i + 7] += -pts[i + 5] * 0.06;
        pts[i + 6] *= 0.82; pts[i + 7] *= 0.82;
        pts[i + 4] += pts[i + 6]; pts[i + 5] += pts[i + 7];
        const x = pts[i + 2] + (tx - pts[i + 2]) * e + pts[i + 4];
        const y = pts[i + 3] + (ty - pts[i + 3]) * e + pts[i + 5];
        const near = Math.max(0, 1 - Math.abs(y - sweepY) / 70) * (y < sweepY + 4 ? 1 : 0.15);
        const tw = 0.28 + 0.2 * Math.sin(t * 1.3 + pts[i + 9] * 40);
        const a = (0.15 + tw) * (0.3 + 0.7 * e);
        if (near > 0.05) {
          ctx.fillStyle = `rgba(${Math.round(232 - 232 * near)},${Math.round(230 + 25 * near)},${Math.round(223 - 158 * near)},${Math.min(1, a + near * 0.8)})`;
          ctx.fillRect(x - 1, y - 1, 2.2, 2.2);
        } else {
          ctx.fillStyle = `rgba(232,230,223,${a})`;
          ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
        }
      }

      // Cursor reticle.
      if (mouse.x > -1e3) {
        ctx.strokeStyle = "rgba(0,255,65,.5)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 18 + Math.sin(t * 4) * 2, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mouse.x - 30, mouse.y); ctx.lineTo(mouse.x - 22, mouse.y);
        ctx.moveTo(mouse.x + 22, mouse.y); ctx.lineTo(mouse.x + 30, mouse.y);
        ctx.moveTo(mouse.x, mouse.y - 30); ctx.lineTo(mouse.x, mouse.y - 22);
        ctx.moveTo(mouse.x, mouse.y + 22); ctx.lineTo(mouse.x, mouse.y + 30);
        ctx.stroke();
      }
    }

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      const inside = path && ctx.isPointInPath(path, mouse.x * dpr, mouse.y * dpr);
      coordRef.current?.(inside ? { lon: LON0 + (mouse.x - box.x) / (K * box.s), lat: LAT1 - (mouse.y - box.y) / box.s } : null);
    };
    const onLeave = () => { mouse.x = mouse.y = -1e4; coordRef.current?.(null); };
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
    io.observe(canvas);
    const ro = new ResizeObserver(() => layout());
    ro.observe(canvas);
    const host = canvas.parentElement!;
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);

    fetch("/geo/kerala-state.geojson").then(r => r.json()).then(g => {
      const polys: number[][][][] = g.geometry.type === "MultiPolygon" ? g.geometry.coordinates : [g.geometry.coordinates];
      rings = polys.map(p => p[0] as Ring);
      layout(); start = performance.now();
    }).catch(() => {});
    layout();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      host.removeEventListener("pointermove", onMove); host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 size-full" aria-hidden />;
}
