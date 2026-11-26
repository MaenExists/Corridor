# 04 — Forecast report card

> Historical checkpoint from the earlier demo build. The active rebuild scope is in [project.md](../../project.md) and [the model plan](../MODEL_PLAN.md).
Run `make synthetic && make evaluate`; open `web/public/generated/eval_report.html`. For private results run `make real` and open `reports/real/eval_report.html`.
Earlier rolling tests select the method and size the ranges; later outcomes do not change those choices. The final forecast origins are evaluated without refitting on their labels.
The synthetic candidate had the best overall average count error on four tasks, but lost in some districts. The simpler development choice stayed in place for 7-day forecasts.
Synthetic intervals covered about 68–72% of held-out outcomes versus the 80% target. This is worse than intended, not operational validation.
Targets count documented cases known within 21 days of window end. Adjacent monthly windows overlap, so ranking totals can count an event more than once.
REAL areas without official coverage are scored only as a diagnostic, not issued as predictions. NarcoTrace evidence is not padded. Real output is separate and locally suppressed.
