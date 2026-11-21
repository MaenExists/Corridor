import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  const unexpected = [];
  const errors = [];
  await page.route("**/*", route => {
    const target = new URL(route.request().url());
    if (target.hostname === "127.0.0.1" || target.protocol === "data:") return route.continue();
    unexpected.push(target.hostname);
    return route.abort();
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173");
  await page.locator(".leaflet-overlay-pane svg path").first().waitFor();
  await page.getByLabel("District profile").selectOption("Wayanad");
  await page.getByRole("heading", { name: "Wayanad" }).waitFor();
  await page.getByText("Abstained", { exact: true }).waitFor();
  await page.getByLabel("Find a place").fill("Kozhikode");
  await page.getByRole("button", { name: "Kozhikode District", exact: true }).click();
  await page.getByRole("heading", { name: "Kozhikode" }).waitFor();
  await page.getByRole("button", { name: "Model report", exact: true }).click();
  await page.getByRole("heading", { name: "Forecast report card" }).waitFor();
  await page.getByLabel("Open a local synthetic report").setInputFiles("web/public/generated/eval_report.json");
  await page.getByRole("button", { name: "Use built-in report" }).waitFor();
  await page.getByRole("heading", { name: "Replay the held-out windows" }).waitFor();
  await page.getByRole("button", { name: "Play replay" }).click();
  await page.getByRole("button", { name: "Pause replay" }).click();
  if (process.env.CORRIDOR_REVIEW_KEY) {
    await page.getByRole("button", { name: "News inbox" }).click();
    await page.getByText("Possible duplicate", { exact: true }).waitFor();
    await page.getByLabel("Local analyst review key").fill(process.env.CORRIDOR_REVIEW_KEY);
    const verify = page.locator("article").filter({hasText:"Ernakulam archive adds"}).getByRole("button", { name: "Verify fixture" });
    if (await verify.count()) {
      await verify.click();
      await page.getByRole("status").filter({hasText:"Verified at"}).waitFor();
    }
    const current = await page.request.get("http://127.0.0.1:5173/api/cues/verified");
    assert.ok((await current.json()).items.some(r=>r.district==="Ernakulam"));
    const before = await page.request.get("http://127.0.0.1:5173/api/cues/verified?before=2026-11-20T00:00:00Z");
    assert.deepEqual((await before.json()).items, []);
    const blocked = await page.request.get("http://127.0.0.1:5173/api/leads");
    assert.equal(blocked.status(), 403);
    await page.getByRole("button", {name:"Leads", exact:true}).click();
    await page.getByRole("button", {name:"Submit practice lead"}).click();
    await page.getByRole("status").filter({hasText:"Practice lead stored"}).waitFor();
    await page.getByRole("button", {name:"Open review queue"}).click();
    await page.getByRole("button", {name:"Mark reviewed"}).first().click();
    await page.getByRole("status").filter({hasText:"Lead review saved"}).waitFor();
    await page.getByRole("button", {name:"Briefs", exact:true}).click();
    await page.getByLabel("Brief connection").selectOption("Thrissur|Ernakulam");
    await page.getByRole("button", {name:"Save brief"}).click();
    await page.getByRole("status").filter({hasText:"Brief saved"}).waitFor();
    await page.getByLabel("Assessment").selectOption("Baseline disagreement");
    await page.getByRole("button", {name:"Save brief"}).click();
    await page.getByText("Baseline disagreement · Request independent aggregate data", {exact:true}).first().waitFor();
    const gotDownload = page.waitForEvent("download");
    await page.getByRole("button", {name:"Export JSON"}).first().click();
    const output = JSON.parse(await readFile(await (await gotDownload).path(), "utf8"));
    assert.equal(output.synthetic, true);
    assert.equal(output.subject, "Thrissur → Ernakulam");
    assert.equal(output.assessment, "Baseline disagreement");
    assert.ok(output.forecast_at_export.model_version.startsWith("synthetic-"));
  }
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log("Browser: map, coverage, search, evidence, local report import and replay passed without external requests.");
} finally {
  await browser.close();
}
