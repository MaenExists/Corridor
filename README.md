# Corridor (working title)

Corridor forecasts **documented case counts** in Kerala districts and on already-known fictional connections. It is a team proposal, not an official agency system. The public demo uses **synthetic data only**. It does not measure all movement, prove wrongdoing, or recommend searches.

## Run the demo

On Linux, use Node.js 22.12 or newer, `npm`, `uv`, GNU Make, Git and `curl`. In the project folder:

```sh
make setup && make demo
```

The first run downloads development packages during setup, then generates the fictional history, trains, and tests it locally. Allow several minutes for the first training run. Open **http://127.0.0.1:5173** and leave the terminal running. Press Ctrl+C to stop. No Cloudflare account, API key, online maps or live feeds are needed.

- **Map workspace:** Pick a district and 7 or 28 days. Wayanad shows how abstention works. Toggle History, Coverage, Documented connections, or the separately labeled fictional infrastructure hypotheses.
- **Model report:** See simple forecasts the candidate was tested against, geographic losses, and the held-out replay. Open `web/public/generated/eval_report.html` for a printable report or load its sibling JSON via the file picker.
- **News inbox:** Paste the local review key printed by `make demo` into the browser. Review a fixture; in a second terminal run `make refresh`, then click **Reload forecasts**. This adds eligible cues to evidence without retraining.
- **Leads and Briefs:** Submit a practice topic only, review it with the local key, then create, edit and download a synthetic brief. Switching to Planner hides case-connection and private review controls; this is a demo, not an authorization system.
- **Data & coverage:** See the source-volume chart, unknown-versus-zero legend, and reporting-bias audit.

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
