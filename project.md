# Corridor

Corridor is an AI forecasting and recovery-planning system for Kerala, built for Hackfinity 2026. It learns from official records of drug cases to serve two audiences:

1. **Enforcement.** Each month, it forecasts how many NDPS cases each of Kerala's 14 districts is likely to record next month, with an 80% range and a district ranking. Analysts can see where recorded activity is expected to concentrate and how confident the forecast is.
2. **Public and recovery services.** It maps district hotspots of need so that rehabilitation centres, counselling and health services can focus capacity on the areas that need it most. Each hotspot shows which evidence supports it and where data is missing.

## Hackfinity

St. John's School, Anchal hosts TOOFAN on 28 November 2026. Corridor fits **Prevention** through predictive analytics, with a **Recovery & Rehabilitation** component. The registered category is unconfirmed. Corridor is a student project independent of Kerala Police and Kerala Excise. [Hackfinity 2026](https://hackfinity.online/)

## What the model does today

The forecasting model is trained on 105 months (January 2016 to September 2024) of official Kerala Excise district statements. We recovered these statements from the Internet Archive and verified every month against its printed statewide total. Expected count = the district's smoothed share of statewide cases × the latest statewide total, adjusted by a seasonal effect learned from earlier special-drive periods. Its design and pass/fail gates were registered before it was scored on January 2023 to September 2024, data it had not seen.

| Next-month test, Jan 2023 – Sep 2024 | Corridor | Best simple method |
| --- | --- | --- |
| Mean absolute error per district-month | 8.70 cases | 9.31 (12-month average) |
| Bias | −0.1% | −4.6% |
| 80% range coverage | 82% | — |
| District ranking correlation | 0.81 | 0.77 |

The validated horizon is one month. Forecasts two or three months ahead lose to the 12-month average and are withheld. Issuance needs the latest month and, after any break in the series, six consecutive months. Public uploads lapsed between October 2024 and September 2026, so the live forecast restarts as monthly homepage snapshots accumulate, or sooner with an official export. See [the model plan](docs/MODEL_PLAN.md).

## Product principles

| Audience | Product |
| --- | --- |
| Authorized enforcement analysts | District-month forecasts of recorded NDPS cases with ranges, ranking, evaluation history and withheld states |
| Health and prevention planners | District need view: verified services, staffed capacity, treatment demand when aggregate care data is available, and the enforcement forecast as separate context |
| Public | Verified treatment and counselling directory and approved district-level indicators |

- A forecast is the number of cases agencies are expected to **record**. It also reflects where and how intensively officers enforce, so it is not a measure of how many people use drugs.
- Hotspots of affected people need care evidence, such as treatment admissions, counselling contacts and survey estimates. Enforcement counts remain a separate context layer. Missing coverage is shown as unknown, never as safe.
- District-level aggregates only. There is no individual scoring, street-level targeting, automatic dispatch or interception claim.
- Every forecast states its data date and can be withheld with a reason.

The knowledge cutoff for the historical snapshot is **30 June 2026, end of day IST**. On that date the latest public month was September 2024, so the snapshot correctly withholds. Later outcomes such as October 2026 form a separate check.

## Build order

1. ✅ Recover and verify the monthly district series. Build and pre-register the district model, then pass the held-out test.
2. Keep the series current with `make excise-snapshot` every month. Request the October 2024 – September 2026 statements and future monthly exports from Excise. See [data requests](docs/DATA_REQUESTS.md).
3. Serve the real replay (forecast vs recorded outcome, 2023–2024) and live status in the interface, next to the synthetic showcase.
4. Build the recovery view: the verified directory, then district care demand and capacity once Vimukthi and DHS aggregates arrive.
5. Evaluate documented movement between districts only where coverage and baseline gates pass.

See [implementation status](docs/FINAL_REPORT.md), [run instructions](README.md) and [data sources](docs/DATA_SOURCES.md).
