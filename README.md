# Corridor (working title)

Corridor forecasts **documented case counts** in Kerala districts and on already-known fictional connections. It is a team proposal, not an official agency system. The public demo uses **synthetic data only**. It does not measure all movement, prove wrongdoing, or recommend searches.

## Run the demo

On Linux, use Node.js 22.12 or newer, `npm`, `uv`, GNU Make, Git and `curl`. In the project folder:

```sh
make setup && make demo
```

Setup downloads development packages; `make demo` generates the fictional history, trains and evaluates it locally, and starts the app. Allow several minutes for the first training run. Open **http://127.0.0.1:5173** and leave the terminal running. Press Ctrl+C to stop. Use `make serve` to restart from the prepared snapshot without generating or training again. No Cloudflare account, API key, or live feeds are needed.

For a rehearsal without internet access, install dependencies beforehand and open **http://127.0.0.1:5173/?offline=1**. This starts with the bundled satellite archive, disables online basemaps, and keeps the detailed atlas on local geography. The local demo server still needs to be running. Open the address without `?offline=1` to use online maps again.

- **Forecasts → Model → Brief:** Select Ernakulam and **28 days**. The inspector shows an expected count and estimated range. **View model evidence** compares average error against a simple baseline across Kerala and in Ernakulam. **Draft a brief** brings the same district and window to a structured local summary. Try Wayanad next: no forecast was issued, and the UI explains why.
- **Map:** Switch between forecast availability, reported history and reporting coverage. **Layers** offers optional fictional connection overlays and basemaps. OpenStreetMap is the online default with a bundled NASA satellite fallback. Providers receive only map tile requests, never case data or search text. **Detailed atlas** has the historical timeline and place profiles.
- **Model:** The **Held-out replay** compares saved predictions with later counts. **All forecasts** includes issued estimates and abstentions. **Report details** includes local losses and accepts a synthetic report file without uploading it. The printable report is `web/public/generated/eval_report.html`.
- **Review desk:** Open the separate reporting-and-review layout. Practice reports are structured and stored locally; a receipt reveals only review status. Analyst activity notes require the local review key and use predefined text. No official agency chat, uploads or live operational feed exists.
- **Evidence:** Open the library, news inbox, practice leads and planning briefs. In the inbox, paste the local key, verify a fixture, run `make refresh` in a second terminal, then click **Reload forecasts**. This refreshes the saved batch, not the trained model. Briefs export aggregates only.
- **Scenarios and Methodology:** Run local reporting what-ifs without retraining or implying causal effects. Review reporting bias, source volume and unknown coverage, or use **Ask the Atlas** for offline help.

Use **Workspace settings** to switch the forecast horizon, track or demo role. If the default ports are in use, an isolated run can use `CORRIDOR_WEB_PORT=5231 CORRIDOR_API_PORT=8911 make demo`; use the same API port for `make refresh`.

## Checks and private analysis

| Command | What it does |
|---|---|
| `make test` | Type checks and automated tests, including an offline scan for private record contents when source files are present. |
| `make build` | Builds the browser app after demo files exist. The local API still needs the demo server. |
| `npm exec playwright install chromium` then `make browser-test` | Installs the optional browser test runtime, then checks the running demo. Set `CORRIDOR_REVIEW_KEY` to the local review key for the stateful checks; these create practice entries only. |
| `make real` | **Private only.** Skips when `training_dataset/` is absent. Writes an audit to `docs/progress/DATA_AUDIT_REAL.md`, sanitized files to `ml/data/real/`, and aggregate HTML/JSON to `reports/real/`. Nothing is served or uploaded. |
| `make release-real` | Rebuilds the disclosure-limited real picker file from the existing private report without re-scoring the holdout. |

The real track covers **publicly reported seizures (news + High Court judgments)**, a selective sample, not all cases. Official coverage and campaign dates require owner-supplied, documented values. After owner disclosure review, use **Workspace settings → Data track → Real (aggregates)** and open `reports/real/ui_aggregate.json`. Never pick the raw dataset or publish an unreviewed aggregate.

Read the [demo script](docs/DEMO_SCRIPT.md), [owner report](docs/FINAL_REPORT.md), [data-collection guide](ml/docs/data-collection-guide.md), or the unchanged [`project.md`](project.md).
