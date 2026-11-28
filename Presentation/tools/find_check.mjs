// Check the public "Find help" flow: search a place (name or PIN), then see centres nearest first with km.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const out = process.argv[3];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; page.on("pageerror", e => errs.push(e.message));
await page.goto(base + "/public?tab=find"); await page.waitForTimeout(1500);
for (const q of process.argv.slice(4).length ? process.argv.slice(4) : ["Anchal", "691306", "Kumily"]) {
  const box = page.getByRole("combobox", { name: /town, village or PIN/i });
  await box.fill(""); await box.fill(q); await page.waitForTimeout(900);
  const first = await page.locator('[role="listbox"] [role="option"]').first().innerText().catch(() => "(none)");
  await page.locator('[role="listbox"] [role="option"] button').first().click().catch(() => {});
  await page.waitForTimeout(700);
  const head = await page.locator("aside").getByText(/Nearest centres to/).first().innerText().catch(() => "(no heading)");
  const rows = await page.locator("aside ul li button").evaluateAll(bs => bs.slice(0, 3).map(b => b.innerText.replace(/\s+/g, " ").trim()));
  console.log(`\n${q} -> ${first.replace(/\s+/g, " ")}\n  ${head}\n  ${rows.join("\n  ")}`);
  if (out) await page.screenshot({ path: `${out}/find-${q}.png` });
}
console.log("\nerrors", JSON.stringify(errs));
await browser.close();
