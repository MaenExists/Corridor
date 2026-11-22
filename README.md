# Corridor (working title)

Corridor forecasts **documented case counts** in Kerala districts and on already-known fictional connections. It is a team proposal, not an official agency system. The public demo uses **synthetic data only**. It does not measure all movement, prove wrongdoing, or recommend searches.

## Run the demo

On Linux, use Node.js 22.12 or newer, `npm`, `uv`, GNU Make, Git and `curl`. In the project folder:

```sh
make setup && make demo
```

The first run downloads development packages during setup, then generates the fictional history, trains, and tests it locally. Allow several minutes for the first training run. Open **http://127.0.0.1:5173** and leave the terminal running. Press Ctrl+C to stop. No Cloudflare account, API key, or live feeds are needed.

- **Overview and Map:** Explore Kerala on OpenStreetMap, with roads and place names as you zoom. If tiles are unavailable, the map falls back to a bundled NASA satellite archive. Switch to that archive or online NASA detail in **Layers**. Online basemaps request geographic tiles from the provider; local forecasts, case data and search text are never sent. Pick a district to see its forecast, counts and coverage; Wayanad shows abstention. **Map → Detailed atlas** retains place profiles and the historical timeline.
- **Patterns:** Replay predicted versus observed counts week by week, inspect issued forecasts, and compare simple baselines. **Report details** shows where the model loses and accepts a synthetic report file locally. The printable report is `web/public/generated/eval_report.html`.
- **Review desk:** Open the separate reporting-and-review layout. Practice reports are structured and stored locally; a receipt reveals only review status. Analyst activity notes require the local review key and use predefined text. No official agency chat, uploads or live operational feed exists.
- **Evidence:** Open the library, news inbox, practice leads and planning briefs. In the inbox, paste the local key, verify a fixture, run `make refresh` in a second terminal, then click **Reload forecasts**. Briefs export aggregates only.
- **Scenarios and Methodology:** Run local reporting what-ifs without retraining or implying causal effects. Review reporting bias, source volume and unknown coverage, or use **Ask the Atlas** for offline help.

Use **Workspace settings** to switch the forecast horizon, track or demo role. If the default ports are in use, an isolated run can use `CORRIDOR_WEB_PORT=5231 CORRIDOR_API_PORT=8911 make demo`; use the same API port for `make refresh`.

## Checks and private analysis

| Command | What it does |
|---|---|
| `make test` | Type checks and automated tests, including an offline scan for private record contents when source files are present. |
| `npm run build` | Builds the browser app after demo files exist. The local API still needs the demo server. |
| `npm exec playwright install chromium` then `make browser-test` | Installs the optional browser test runtime, then checks the running demo. Set `CORRIDOR_REVIEW_KEY` to the local review key for the stateful checks; these create practice entries only. |
| `make real` | **Private only.** Skips when `training_dataset/` is absent. Writes an audit to `docs/progress/DATA_AUDIT_REAL.md`, sanitized files to `ml/data/real/`, and aggregate HTML/JSON to `reports/real/`. Nothing is served or uploaded. |
| `make release-real` | Rebuilds the disclosure-limited real picker file from the existing private report without re-scoring the holdout. |

The real track covers **publicly reported seizures (news + High Court judgments)**, a selective sample, not all cases. Official coverage and campaign dates require owner-supplied, documented values. After owner disclosure review, use **Workspace settings → Data track → Real (aggregates)** and open `reports/real/ui_aggregate.json`. Never pick the raw dataset or publish an unreviewed aggregate.

Read the [demo script](docs/DEMO_SCRIPT.md), [owner report](docs/FINAL_REPORT.md), [data-collection guide](ml/docs/data-collection-guide.md), or the unchanged [`project.md`](project.md).
