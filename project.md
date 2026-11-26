# NarcoTrace

NarcoTrace is an AI forecasting and recovery-planning system for Kerala, built for Hackfinity 2026. It learns from official records of drug cases to serve two audiences:

1. **Where next.** Each month, it forecasts where in Kerala recorded NDPS cases are likely to concentrate next month. For each of the 14 districts it gives expected cases with an 80% range, the probability of being a top-four district, and the probability of running hot, meaning above its own normal share. The two hottest-probability districts become the month's alerts. Analysts see where activity is expected and how confident each call is.
2. **Public and recovery services.** The recovery access map (`/recovery.html`) shows, square kilometre by square kilometre, where Kerala residents are far from de-addiction help and how many registered beds they can reach. It ranks named localities where new outreach or capacity would reach the most people. Rehabilitation centres and health services can see exactly where to focus. It never labels where people who use drugs live: no public source measures that, and doing so would stigmatise neighbourhoods and deter people from seeking treatment.

## Hackfinity

St. John's School, Anchal hosts TOOFAN on 28 November 2026. NarcoTrace fits **Prevention** through predictive analytics, with a **Recovery & Rehabilitation** component. The registered category is unconfirmed. NarcoTrace is a student project independent of Kerala Police and Kerala Excise. [Hackfinity 2026](https://hackfinity.online/)

## What the model does today

The forecasting model is trained on 105 months (January 2016 to September 2024) of official Kerala Excise district statements. We recovered these statements from the Internet Archive and verified every month against its printed statewide total. Expected count = the district's smoothed share of statewide cases × the latest statewide total, adjusted by a seasonal effect learned from earlier special-drive periods. Its design and pass/fail gates were registered before it was scored on January 2023 to September 2024, data it had not seen.

| Next-month test, Jan 2023 – Sep 2024 | NarcoTrace | Best simple method |
| --- | --- | --- |
| Mean absolute error per district-month | 8.70 cases | 9.31 (12-month average) |
| Bias | −0.1% | −4.6% |
| 80% range coverage | 82% | — |
| District ranking correlation | 0.81 | 0.77 |

The where-next layer simulates the count model jointly and passed its own pre-registered test. The two monthly hot-district alerts were right 38% of the time against an 18% base rate (AUC 0.76 vs 0.72 for persistence). Top-four probabilities had Brier skill +0.41. The ranking itself is mostly fixed structure: the predicted top four held 39.3% of cases against 41.7% with perfect foresight. The finer "where" of a range office, drug type or route needs data the public series lacks. See [the model plan](docs/MODEL_PLAN.md#where-next-hotspot-forecast).

The grid layer answers "which square kilometre" in the hotspot-policing style. A learned ranker over 1 km cells is trained on 974 dated, located seizure reports from four publishers' sitemaps (2016 – November 2026). On a held-out test (2024 to mid-2026), its top 1% of cells held 57% of the next 28 days' located reports, against 28% for a long-run hotspot map. After the cutoff it held 71%. The audit is blunt: nearly all of this is "the same locality again". A plain repeat map scores within one point, and seizures at localities never reported before are caught only 3% of the time. Coverage is city-desk heavy (Ernakulam and Thiruvananthapuram hold 62% of reports). See [the grid section](docs/MODEL_PLAN.md#grid-hotspot-forecast-reported-seizures) and `/hotspots.html`.

The pattern layer (`make context-layers patterns-evaluate patterns-forecast`) measures what surrounds hotspots, using OpenStreetMap context and 31 detected border crossings. It labels hotspot clusters (transit corridor, air or sea entry, retail market, venue-linked, emerging) and fits readable relative risks. For example, reported seizures are 5.2× likelier within 0.5 km of a railway station and 2.3× near a national highway. Neither the learned pattern ranker nor the risk terrain predicted *new* places better than population on later windows, so the "same place again" ranker stays primary and the new-place watch list is shown as unvalidated.

The validated horizon is one month, and the gain over simple methods is modest. About a third of district forecasts miss by more than 20%. After the cutoff, the statewide seasonal adjustment did worse than a three-month average. Forecasts two or three months ahead lose to the 12-month average and are withheld. Issuance needs the latest month and, after any break in the series, six consecutive months. Public uploads lapsed between October 2024 and September 2026, so the live forecast restarts as monthly homepage snapshots accumulate, or sooner with an official export. See [the model plan](docs/MODEL_PLAN.md).

## Product principles

| Audience | Product |
| --- | --- |
| Authorized enforcement analysts | Monthly where-next brief: district expected cases, ranges, top-four and hot probabilities, two alerts, evaluation history and withheld states |
| Health and prevention planners | Recovery access map: 322 located centres with register beds, a 1 km access grid, ranked priority localities and district gaps, with recorded Excise cases as separate context. Care demand by taluk is added when Vimukthi or DHS aggregates arrive, with small counts suppressed |
| Public | Verified treatment and counselling directory and approved district-level indicators |

- A forecast is the number of cases agencies are expected to **record**. It also reflects where and how intensively officers enforce, so it is not a measure of how many people use drugs.
- Hotspots of affected people need care evidence, such as treatment admissions, counselling contacts and survey estimates. Enforcement counts remain a separate context layer. Missing coverage is shown as unknown, never as safe.
- District-level aggregates only. There is no individual scoring, street-level targeting, automatic dispatch or interception claim.
- Every forecast states its data date and can be withheld with a reason.

The knowledge cutoff for the historical snapshot is **30 June 2026, end of day IST**. On that date the latest public month was September 2024, so the snapshot correctly withholds. Later outcomes such as October 2026 form a separate check.

## Build order

1. ✅ Recover and verify the monthly district series. Build and pre-register the district model, then pass the held-out test.
2. ✅ Build and pass the where-next hotspot forecast, then the 1 km grid forecast from located news reports (`make news-harvest hotspot-forecast`). Next for the grid: official station- or range-level counts, Malayalam publishers for rural coverage, and scoring revisions only on months after November 2026. Next, finer "where": request aggregate monthly NDPS counts by Excise range or circle office, and a drug-type series in the same format.
3. Keep the series current with `make excise-snapshot` every month. Request the October 2024 – September 2026 statements and future monthly exports from Excise. See [data requests](docs/DATA_REQUESTS.md).
4. ✅ Enforcement interface rebuilt in `frontend/` (Next.js and Tailwind): a satellite map of where to look in the next four weeks, why those places, district counts and the track record. Next: the public recovery view in the same system. Then serve the where-next brief and the real replay (forecast vs recorded outcome, 2023–2024) and live status in the interface, next to the synthetic showcase.
5. ✅ Build the recovery access map (`make recovery-refresh`). Next: travel time instead of straight-line distance, and care demand by taluk from Vimukthi or DHS. Wastewater results by catchment would be an anonymous, near-real-time measure of use.
6. Extend the recovery view: the verified directory, then district care demand and capacity once Vimukthi and DHS aggregates arrive.
7. Evaluate documented movement between districts only where coverage and baseline gates pass.

See [implementation status](docs/FINAL_REPORT.md), [run instructions](README.md) and [data sources](docs/DATA_SOURCES.md).
