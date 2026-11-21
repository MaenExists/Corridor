# 05 — Forecast batch
Run `make forecast` after `make evaluate`. Open `web/public/generated/forecasts.json`.
Each dated record states the target, window, model, evidence, range or unknown uncertainty, and any reason for abstaining.
Some districts abstain because coverage is thin. The batch cannot serve real models or records.
Ranges are drawn from the earlier calibration; the final report shows they were too narrow. No forecast is a probability of wrongdoing.
After the inbox is added, `make refresh` will include visible reviewed fixtures without retraining. Their predictive value is unproven.
