# 06 — Local API and database

> Historical checkpoint from the earlier demo build. The active rebuild scope is in [project.md](../../project.md) and [the model plan](../MODEL_PLAN.md).
Run `make api`, then open http://127.0.0.1:8787/api/forecasts/latest. The Worker serves the 48 synthetic forecasts.
D1 is a local database for queue reviews, cues, leads and briefs; no Cloudflare account or network deployment was used.
API replies carry `synthetic: true`. Real aggregation remains a browser file import, not a Worker route.
The local analyst key is a demo safeguard only, not production authorization. No free-text lead or case intake is accepted.
