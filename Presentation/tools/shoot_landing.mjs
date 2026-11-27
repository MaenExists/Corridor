// Screenshots of the landing page for layout checks. Usage: node Presentation/tools/shoot_landing.mjs <outdir>
import { chromium } from "playwright";
const out = process.argv[2];
const browser = await chromium.launch();
for (const [w, h, tag] of [[1600, 900, "d"], [390, 844, "m"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", e => console.log("PAGEERROR", e.message));
  page.on("console", m => m.type() === "error" && console.log("CONSOLE", m.text()));
  await page.goto((process.env.BASE ?? "http://127.0.0.1:3000") + "/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/lp-${tag}-intro.png` });
  await page.mouse.move(w * 0.78, h * 0.5);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/lp-${tag}-hero.png` });
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  let i = 0;
  for (let y = h; y < total; y += h) {
    await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${out}/lp-${tag}-${++i}.png` });
  }
  await page.close();
}
await browser.close();
