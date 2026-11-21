import assert from "node:assert/strict";
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
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log("Browser: map, coverage, search, evidence, local report import and replay passed without external requests.");
} finally {
  await browser.close();
}
