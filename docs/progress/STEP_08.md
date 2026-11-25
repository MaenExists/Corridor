# 08 — Evidence and report replay

> Historical checkpoint from the earlier demo build. The active rebuild scope is in [project.md](../../project.md) and [the model plan](../MODEL_PLAN.md).
In the atlas, select a district or known connection and open its evidence. Click a historical observation to see its dates, precision, and clickable fictional provenance.
Use Model report to load `web/public/generated/eval_report.json` through the file picker. Nothing uploads. Replay walks through frozen weekly tests, not new predictions.
The report shows mean count error, lower-error baselines by place, missed documented cases, false positives, range coverage, and abstentions.
Evidence facts are not model explanations or causal claims. The source list shows only entries available at the selected date.
Browser test passed for search, abstention, offline report import and replay.
