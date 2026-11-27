// Capture product screenshots from the running NarcoTrace frontend (http://127.0.0.1:3000).
// Output: Presentation/assets/shots/*.png (gitignored: shows served forecasts).
import { chromium } from "playwright";
const out = new URL("../assets/shots/", import.meta.url).pathname;
const base = process.env.BASE ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const settle = (ms = 3500) => page.waitForTimeout(ms);
async function shot(name) { await page.screenshot({ path: out + name + ".png" }); console.log("saved", name); }
async function clickTab(re) { const b = page.getByRole("tab", { name: re }).first(); await b.click(); await settle(2000); }

await page.goto(base + "/enforcement", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await settle(6000); await shot("enf-watch");
for (const [re, n] of [[/rising/i, "enf-rising"], [/why/i, "enf-why"], [/district/i, "enf-districts"], [/tip|concern/i, "enf-tips"]]) {
  try { await clickTab(re); await shot(n); } catch (e) { console.log("skip", n, e.message.split("\n")[0]); }
}
await page.goto(base + "/public", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await settle(6000); await shot("pub-far");
const tabs = page.getByRole("tab");
const count = await tabs.count();
const names = ["pub-far", "pub-find", "pub-districts", "pub-report"];
for (let i = 1; i < Math.min(count, 4); i++) { await tabs.nth(i).click(); await settle(2500); await shot(names[i]); }
await tabs.nth(0).click(); await settle(1000);
const lang = page.locator("header button").last();
try { await lang.click(); await settle(2500); await shot("pub-malayalam"); } catch {}
await page.goto(base + "/", { waitUntil: "networkidle" }).catch(() => {}); await settle(3000); await shot("home");
await browser.close();
