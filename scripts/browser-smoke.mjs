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
    const put = page.waitForResponse(r=>r.request().method()==="PUT" && new URL(r.url()).pathname.startsWith("/api/briefs/"));
    await page.getByRole("button", {name:"Save brief"}).click();
    assert.ok((await put).ok());
    await page.locator(".saved-brief").first().getByText("Baseline disagreement · Request independent aggregate data", {exact:true}).waitFor();
    const gotDownload = page.waitForEvent("download");
    await page.getByRole("button", {name:"Export JSON"}).first().click();
    const output = JSON.parse(await readFile(await (await gotDownload).path(), "utf8"));
    assert.equal(output.synthetic, true);
    assert.equal(output.subject, "Thrissur → Ernakulam");
    assert.equal(output.assessment, "Baseline disagreement");
    assert.ok(output.forecast_at_export.model_version.startsWith("synthetic-"));
  }
  await page.getByRole("button", {name:"Data & coverage", exact:true}).click();
  await page.getByRole("heading", {name:"Monthly source volume"}).waitFor();
  await page.getByLabel("Demo role").selectOption("planner");
  assert.equal(await page.getByRole("button", {name:"News inbox", exact:true}).count(), 0);
  await page.getByRole("button", {name:"Map workspace", exact:true}).click();
  await page.getByRole("heading", {name:"Forecast atlas"}).waitFor();
  assert.equal(await page.getByLabel("Known connection").count(), 0);
  await page.getByLabel("Data track").selectOption("real");
  await page.getByRole("heading", {name:"Real-data results"}).waitFor();
  assert.equal(await page.locator(".leaflet-atlas").count(),0);
  assert.ok(await page.getByLabel("Open reviewed real aggregate").isDisabled());
  await page.getByLabel("I have reviewed this aggregate for disclosure.").check();
  const upload = page.getByLabel("Open reviewed real aggregate");
  const fixture = {schema:"corridor-real-aggregate-v1",synthetic:false,minimum_group:3,
    data_cutoff:"2025-11-20",generated_at:"2025-11-22T09:00:00Z",
    districts:[{district:"Wayanad",cases:4,metrics:[],ratios:[]},{district:"Ernakulam",cases:30,metrics:[{
      horizon_days:28,distinct_event_support:10,windows:12,metrics:{poisson_gbm:1.2345}
    }],ratios:[]}]};
  await upload.setInputFiles({name:"aggregate.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({...fixture,cases:[{private:"would be invalid"}]}))});
  await page.getByRole("alert").filter({hasText:"Raw or unrecognised"}).waitFor();
  await upload.setInputFiles({name:"safe-aggregate.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fixture))});
  await page.getByRole("heading", {name:"District aggregate"}).waitFor();
  await page.getByRole("row", {name:/Wayanad Suppressed/}).waitFor();
  await page.getByRole("row", {name:/Ernakulam 30 1.23/}).waitFor();
  assert.ok(await page.getByText("Coverage unknown", {exact:true}).count() >= 2);
  await page.getByLabel("Data track").selectOption("synthetic");
  await page.getByRole("heading", {name:"Forecast atlas"}).waitFor();
  await page.setViewportSize({width:390,height:850});
  assert.ok(await page.evaluate(()=>document.body.scrollWidth <= window.innerWidth+2));
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log("Browser: map, coverage, search, evidence, local report import and replay passed without external requests.");
} finally {
  await browser.close();
}
