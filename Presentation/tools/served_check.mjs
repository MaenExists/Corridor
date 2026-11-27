// Open the deck as the app serves it (default http://127.0.0.1:3000/ppt), step through every scene,
// and report page errors, failed requests and whether the product screenshots loaded.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:3000/ppt";
const out = process.argv[3];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on("pageerror", e => errs.push(e.message));
page.on("console", m => m.type() === "error" && errs.push(m.text()));
page.on("requestfailed", r => errs.push("failed " + r.url()));
page.on("response", r => r.status() >= 400 && errs.push(r.status() + " " + r.url()));
await page.goto(base); await page.waitForTimeout(1000);
console.log("url", page.url());
const n = await page.evaluate(() => document.querySelectorAll(".scene").length);
for (let i = 0; i < n + 5; i++) {
  const id = await page.evaluate(() => document.querySelector(".scene.active")?.id);
  if (id === "s-enforce" || id === "s-public") {
    await page.waitForTimeout(2500);
    const imgs = await page.evaluate(id => [...document.querySelectorAll(`#${id} img`)].map(i => i.naturalWidth > 0), id);
    console.log(id, "screenshots loaded", imgs.filter(Boolean).length, "/", imgs.length);
    if (out) await page.screenshot({ path: `${out}/${id}.png` });
  }
  if (id === "s-finale") break;
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(120);
}
console.log("final url", page.url());
console.log("errors", JSON.stringify(errs));
await browser.close();
