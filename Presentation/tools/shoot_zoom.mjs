import { chromium } from "playwright";
const out = new URL("../assets/shots/", import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:3000/enforcement", { waitUntil: "networkidle" }).catch(()=>{});
await page.waitForTimeout(5000);
// open the first priority place (zooms the map to it)
await page.getByText("Perumbavoor").first().click().catch(e=>console.log(e.message));
await page.waitForTimeout(5000);
await page.screenshot({ path: out + "enf-detail.png" }); console.log("enf-detail");
await page.goto("http://127.0.0.1:3000/public", { waitUntil: "networkidle" }).catch(()=>{});
await page.waitForTimeout(5000);
await page.getByText("Vadakara").first().click().catch(e=>console.log(e.message));
await page.waitForTimeout(5000);
await page.screenshot({ path: out + "pub-detail.png" }); console.log("pub-detail");
await browser.close();
