// Step through the 7-minute cut (index.html?short) and print each scene with its counter, plus any page errors.
import { chromium } from "playwright";
const url = "file://" + new URL("../index.html", import.meta.url).pathname + "?short";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; page.on("pageerror", e => errs.push(e.message));
await page.goto(url); await page.waitForTimeout(800);
const seen = [];
for (let i = 0; i < 40; i++) {
  const now = await page.evaluate(() => document.querySelector(".scene.active")?.id + " " + document.querySelector("#counter").textContent);
  if (seen.at(-1) === now) break;
  seen.push(now);
  const steps = await page.evaluate(() => +(document.querySelector(".scene.active")?.dataset.steps || 0));
  for (let k = 0; k <= steps; k++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150); }
}
console.log(seen.join("\n"));
console.log("errors", JSON.stringify(errs));
await browser.close();
