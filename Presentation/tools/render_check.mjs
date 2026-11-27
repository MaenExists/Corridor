// Render every scene of the deck to PNG (final step state) and report console errors.
import { chromium } from "playwright";
const out = process.argv[2]; const only = process.argv[3] ? process.argv[3].split(",").map(Number) : null;
const url = "file://" + new URL("../index.html", import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => m.type() === "error" && errs.push(m.text()));
await page.goto(url); await page.waitForTimeout(800);
const n = await page.evaluate(() => document.querySelectorAll(".scene").length);
for (let i = 1; i <= n; i++) {
  if (only && !only.includes(i)) continue;
  await page.evaluate(i => { location.hash = "#" + i; location.reload(); }, i);
  await page.waitForTimeout(600);
  const steps = await page.evaluate(() => +(document.querySelector(".scene.active")?.dataset.steps || 0));
  await page.waitForTimeout(3500);
  for (let k = 0; k < steps; k++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1200); }
  const id = await page.evaluate(() => document.querySelector(".scene.active")?.id);
  await page.waitForTimeout(id === "s-open" || id === "s-cutoff" ? 6000 : 1500);
  await page.screenshot({ path: `${out}/s${String(i).padStart(2, "0")}.png` });
}
console.log("scenes", n, "errors", JSON.stringify(errs));
await browser.close();
