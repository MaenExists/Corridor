# Hackathon showcase

> Historical checkpoint from the earlier demo build. The active rebuild scope is in [project.md](../../project.md) and [the model plan](../MODEL_PLAN.md).

Run `make serve` on the prepared machine and open http://127.0.0.1:5173/?offline=1. If the snapshot has not been prepared, start with `make setup && make demo`. See [the five-minute script](../DEMO_SCRIPT.md).

The first browser walkthrough found that reporting cards overshadowed the forecast, the inspector sent people to a replay without explaining the selected district, and preparing a brief required navigating through the evidence tools. The new path is **Forecasts → View model evidence → Draft a brief**. The district or invented connection and the forecast window carry into the draft.

The map separates forecast availability, reporting coverage, and history. Status, legends, accessible controls, and a visible reason distinguish a withheld forecast from zero. On a narrow screen, the inspector comes before the map. The online default and local satellite fallback remain available.

The evidence view reads the saved forecast and matching evaluation, not a chatbot or a new prediction. It compares the method chosen before the test with the best comparable simple forecast, both overall and locally. For the supplied 28-day district snapshot, the statewide comparison favors the issued method (5.00 vs 5.32 average missed cases); the local comparison in Ernakulam does not (11.68 vs 6.00). Measured range coverage for the task was 68% against an 80% target. No match means no validation claim.

The estimated count and range share a count ruler; the overall and local errors share a separate zero-based scale. Measured range coverage has its own panel with a target mark. No estimate band appears when a forecast is withheld, and missing local measurements are not drawn as zero.

The brief remains structured, local, and aggregate-only. The exported HTML is suitable for showing or printing. Cue review and practice reports still cannot create case labels. No real records were used, and training, inference, and evaluation code were unchanged.

Verified: 17 automated tests and the production build passed. Chromium exercised the built app against the local API, including the map, district and connection validation, brief exports, review and receipt workflows, missing artifacts, unmatched validation, and private aggregate suppression. Offline rehearsal made no external requests. Desktop and phone layouts were reviewed in the browser; `make serve` restarted without changing the saved snapshot.
