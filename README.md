# Corridor (working title)

Corridor forecasts **documented case counts** in Kerala districts and on already-known fictional connections. It is a team proposal, not an official agency system. The public demo uses **synthetic data only**. It does not measure all movement, prove wrongdoing, or recommend searches.

## Run the demo

On Linux, use Node.js 22.12 or newer, `npm`, `uv`, GNU Make, Git and `curl`. In the project folder:

```sh
make setup && make demo
```

The first run downloads development packages during setup, then generates the fictional history, trains, and tests it locally. Allow several minutes for the first training run. Open **http://127.0.0.1:5173** and leave the terminal running. Press Ctrl+C to stop. No Cloudflare account, API key, online maps or live feeds are needed.

- **Corridor atlas:** Pick a district or invented connection and 7 or 28 days. Wayanad shows how abstention works. Open **Layers** for coverage, documented connections, and the separately labeled infrastructure hypotheses. Place profiles and the timeline work offline.
- **Forecast lab:** Replay predicted versus observed counts week by week, inspect issued forecasts, and compare with simpler forecasts. **Report details** shows where the model loses and supports loading a synthetic report locally. You can also open `web/public/generated/eval_report.html`.
- **Evidence library and Ask the Atlas:** Inspect fictional sources, or use the offline guide to look up a district or method. No external AI or geocoding is used.
- **News inbox:** Paste the local review key printed by `make demo` into the browser. Review a fixture; in a second terminal run `make refresh`, then click **Reload forecasts**. This adds eligible cues to evidence without retraining.
- **Community leads and Planning briefs:** Submit a practice topic only, review it with the local key, then create, edit and download a synthetic brief. **Switch role** hides case-connection and private review controls for the Planner; this is a demo, not an authorization system.
- **Sources & methods:** See the source-volume chart, unknown-versus-zero legend, and reporting-bias audit.

## Checks and private analysis

| Command | What it does |
|---|---|
| `make test` | Type checks and automated tests, including an offline scan for private record contents when source files are present. |
| `npm run build` | Builds the browser app after demo files exist. The local API still needs the demo server. |
| `npm exec playwright install chromium` then `make browser-test` | Installs the optional browser test runtime, then checks the running demo. Set `CORRIDOR_REVIEW_KEY` to the local review key for the stateful checks; these create practice entries only. |
| `make real` | **Private only.** Skips when `training_dataset/` is absent. Writes an audit to `docs/progress/DATA_AUDIT_REAL.md`, sanitized files to `ml/data/real/`, and aggregate HTML/JSON to `reports/real/`. Nothing is served or uploaded. |
| `make release-real` | Rebuilds the disclosure-limited real picker file from the existing private report without re-scoring the holdout. |

The real track covers **publicly reported seizures (news + High Court judgments)**, a selective sample, not all cases. Official coverage and campaign dates require owner-supplied, documented values. After owner disclosure review, use **Data track → Real (aggregates)** and open `reports/real/ui_aggregate.json`. Never pick the raw dataset or publish an unreviewed aggregate.

Read the [demo script](docs/DEMO_SCRIPT.md), [owner report](docs/FINAL_REPORT.md), [data-collection guide](ml/docs/data-collection-guide.md), or the unchanged [`project.md`](project.md).
