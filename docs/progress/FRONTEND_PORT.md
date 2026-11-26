# Companion frontend

> Historical checkpoint from the earlier demo build. The active rebuild scope is in [project.md](../../project.md) and [the model plan](../MODEL_PLAN.md).
Run `make demo` and open http://127.0.0.1:5173. The black sidebar, atlas, connection inspector, timeline, place profiles and forecast lab now follow the companion workspace.
The lab replays NarcoTrace's frozen synthetic predictions versus later counts for both horizons. It also shows issued forecasts and links to their map evidence.
The evidence library, guided demo and offline Ask the Atlas use NarcoTrace's data; the news inbox, leads and briefs still use local review workflows.
Nothing from the companion's case exports or model results was imported. Online tiles, geocoding, sign-in, connectors and unvalidated next-hop predictions were not ported.
Private real results are still an aggregate-only file picker. See `docs/DEMO_SCRIPT.md` for the updated navigation.
Verified: 16 automated tests, production build, and browser checks for the atlas, profiles, replay, evidence library, reviews, exports and aggregate suppression. The browser made no external requests.
