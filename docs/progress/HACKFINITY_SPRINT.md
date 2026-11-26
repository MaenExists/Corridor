# Hackfinity: three-day decision log

> Historical checkpoint from the earlier demo build. The active rebuild scope is in [project.md](../../project.md) and [the model plan](../MODEL_PLAN.md).

**Pitch:** NarcoTrace helps prevention teams distinguish a forecast supported by documented records from a gap that needs independent data. It's an experiment you operate, not a heat map of danger.

[Hackfinity](https://hackfinity.online/) lists Awareness, Prevention, Recovery & Rehabilitation, and Innovation challenges. Pitch NarcoTrace for **Innovation**, which matches the theme in `project.md`, with prevention teams as the intended users. If already registered for **Prevention**, keep the same build and lead with evidence quality for human review. The contribution is a forecast judges can run, check against a baseline, and see decline to answer. No agency endorsement, measured social impact, harm forecast or claim about judging criteria.

## Day 1: build the stage moment

- Open on Challenge. A constrained text command and ordinary controls drive the same district/window/date experiment; there's no chat service, no prompt storage and no external model call. The dedicated map uses local boundaries and fixed count bins. It does not show places where enforcement should act.
- The frozen Poisson boosting candidate actually runs in the browser. Its portable tree weights and cutoff features come from the synthetic track, with no outcomes or precomputed model answers in the runtime bundle. The exporter verifies parity with the original frozen fit and saved evaluation. The separate archive outcome is fetched only on reveal; this is an interactive blind check, not a sealed judging system.
- The result compares one forecast with a recent average and can export a structured human follow-up. The established evaluation, uncertainty/coverage, latest forecasts and review tools remain available.

## Model development experiment

The next candidate is a regularized Poisson regression pooling district history with seasonal and recency features. It uses the existing chronological label-maturity gate, only the **development selection dates**, and identical eligible rows for all methods.

| Horizon | Windows | Poisson boosting MAE | Best simple baseline MAE | Regularized Poisson MAE |
|---|---:|---:|---:|---:|
| 7 days | 144 | 1.3811 | 1.3725 | 1.2662 |
| 28 days | 144 | 3.2163 | 3.7222 | 3.0523 |

Reproduce: `.venv/bin/python -m ml.train.challenger`. These are exploratory synthetic development scores, not final validation.

I also tested the fixed specification on two separate simulated archives, frozen at the start of each chronological test (`.venv/bin/python -m ml.train.challenger --stress`). Each cell has 168 comparable district-windows:

| Seed / Horizon | Poisson boosting MAE | Best simple baseline MAE | Regularized Poisson MAE |
|---|---:|---:|---:|
| 2027 / 7 days | 1.8826 | 1.8423 | 1.7940 |
| 2027 / 28 days | 5.2538 | 5.2143 | 4.2274 |
| 2411 / 7 days | 1.6241 | 1.6540 | 1.5210 |
| 2411 / 28 days | 3.9411 | 4.2411 | 3.4453 |

The 28-day gains justify follow-up. At seven days, the first simulation improves on the best baseline by only 2.6%, short of the 5% development margin for displacement. The simulation generator is shared, so the stress tests are not evidence of generalization to real data. The challenger is not issued: promoting it would also need separate range calibration, an honest comparison by district, and a new versioned forecast/report pair. The demo stays on the existing frozen, version-matched model.

## Days 2–3: spend the time where it counts

1. **Day 2:** Have two people try the first minute with no explanation. They should be able to run a forecast, reveal a baseline win and explain a withheld district. Fix anything that blocks those tasks. Rehearse on the actual projector and presentation laptop with the network disabled.
2. **Day 3:** Freeze the demo. Rehearse the five-minute script, keep the printable report as fallback, and practice answering what would be independently measured in a pilot. Do not spend the last day adding hardware or swapping in an unvalidated model.
