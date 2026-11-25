# Corridor model and rebuild plan

## First model

Train one **regularized Poisson regression** per horizon, pooled across all 14 Kerala revenue districts. It estimates nonnegative counts and shares information across districts. Train separate series by source and definition until a verified combined count exists. Prefer unique documented seizure events. If the consistent feed is NDPS registrations, forecast and label registrations. Preserve seizure-confirmed, possession and trafficking distinctions where official definitions support them.

1. Issue Monday-start forecasts for 7 and 28 days using information available by Sunday end of day IST. The one-time June cutoff snapshot can forecast from the next full supported period. Daily events can roll up into weekly inputs. A complete weekly export supports targets aligned to its whole weeks. Monthly-only records support a separate next-month forecast. Annual tables support reconciliation and historical context.
2. Compare with a recent 56-day rate, a historical seasonal average and the same period 52 weeks earlier, aligned to the forecast horizon. Score methods on common eligible windows.
3. Fit count models using district effects, cyclical calendar terms, recent counts over 1, 4, 8 and 13 weeks, year-ago counts and source freshness. Distinguish missing history and complete zero counts. Test prior-period enforcement effort and known campaign changes in an ablation. With consistently measured exposure and an issuance-time value, compare an exposure-adjusted model and disclose its assumptions. Detected counts still depend on where agencies look.
4. Challenge with histogram gradient boosting using Poisson loss. Check overdispersion and drift before testing negative binomial regression or additional features. A challenger needs at least 5% lower development MAE than the strongest eligible simple baseline. Report regressions by district. Freeze the chosen method and configurations before final scores.
5. Calibrate 80% intervals on a separate chronological window. Assess achieved coverage and width by district and count band. Abstain when completeness, comparability, calibration support or freshness fails. Where enforcement effort is missing, mark it and test stability across documented campaigns before considering real high-count flags.

## Chronological evaluation

| Stage | Proposed dates |
| --- | --- |
| Initial fit and method selection | Use eligible 2020–2023 history for initial fit and 2024 rolling forecast origins for development. |
| Interval calibration | Use January–June 2025 origins purged at the stage boundary. Freeze interval rules after calibration. |
| Pre-cutoff test | Freeze the fit at the first eligible July 2025 origin. Score through the last origin whose outcome matures by 30 June 2026. Lock exact bounds after inspecting coverage and before scoring. |
| June snapshot | After documenting the frozen test, refit the preselected model configuration on mature data as of 30 June 2026. Evaluate July–December outcomes separately as they mature. Report the literal forecast made at cutoff separately from a later replay using updated as-of features and frozen parameters. |

Measure reporting delay on development data. The demo's 21-day maturity period is an initial assumption. A training window must end and mature by the fit cutoff, with complete labels available then, and it must finish before the next stage. Every feature requires a source version known by the forecast date. Decision date is a lower bound on court availability. Crawl time is retrieval evidence. Never backdate an unknown release. Reconstructed archives without original release timing support a labelled retrospective diagnostic only.

Report MAE, Poisson deviance, per-district bias, 80% interval coverage and width, proportion issued, missed high-count periods and optional rank performance against recent-count ranking. Repeat 28-day evaluation on a non-overlapping schedule and use time blocks for comparisons. Disclose campaign sensitivity, reporting effort, coverage and failures. Test that a late event, court upload, campaign record or series correction leaves earlier features and predictions unchanged. Freeze input hashes, code version, fit cutoff, method and split configuration. Monitor error, interval calibration and drift on new outcomes before reviewing an updated model.

## Coverage and selection bias

Court orders and news are candidate discovery sources. Review a sample balanced across district, quarter, language, publisher and documented quantity band. The sampling quota is for review, while incidence labels use reconciled events and compatible official coverage. Check recurring publication gaps and enforcement campaigns using separately dated source-volume and official-effort records. Publish a district and time breakdown of source yield and model errors. Place/time cells without comparable outcome coverage are unknown. Unobserved cases cannot be recovered from news or court counts alone. The local coverage audit is stored in `docs/progress/SOURCE_COVERAGE.md`.

## Documented movement

Use explicit evidence grades for adjudicated findings, agency-confirmed accounts, allegations and unclear evidence. A connection requires two stated endpoints, a direction and case-level deduplication. Keep registration, seizure and movement districts distinct. Use Kerala revenue districts or external state totals. Train a separately pooled count model for later documented district connections only where coverage and held-out positives support evaluation. Compare with historical edge frequency and recent rates. The initial support gate is 30 distinct dated cases per connection, together with adequate covered periods and validation. Missing endpoints stay unknown. Maps show historical aggregate links, with no street-level routes or operational suggestions. Transport geography supplies orientation only.

## Health and rehabilitation

Verify a public service directory and official contact details. Ingest facility-month or district-month aggregates of first visits, admissions, referrals, counselling contacts, wait times, staffed slots, days open and reporting completeness. Preserve programme definitions and distinguish facility from service-user residence district when approved aggregate residence data exist. Compare a seasonal monthly baseline and a pooled Poisson model for approved treatment counts. Assess changes in access, referrals and outreach, which affect utilization. Publish only approved aggregates with small-cell suppression. Public help and official reporting links stay independent of model training, individual information and unverified allegations.

## Data and architecture

| Feed | Minimum shape |
| --- | --- |
| Case or seizure labels | District × week × agency and definition, completeness, first release and revisions. Daily counts or redacted event records support more precise timing. |
| Enforcement observation | District × week or month, aggregate inspections/search effort, campaign changes, time first known. |
| Documented movement | Explicit source/destination district or external state, event/availability dates and evidence grade. |
| Court and news | Dated sources, verified event district, evidence and underlying event linkage. Test incremental value against agency-only features. |
| Health | Facility or district × month, period, programme, metric definition and coverage. |

Reuse Python batch and React. Keep immutable source manifests and authorized inputs in protected, local storage. Use content hashes and checkpoints for resumable imports. Move to date/source-partitioned Parquet and local DuckDB once archive volume warrants it. Use local text extraction, OCR only for pages without usable text, and a bilingual review queue. The forecasting model consumes structured, verified counts and lagged features. The public build serves synthetic examples and separately approved aggregates only.

| Phase | Acceptance |
| --- | --- |
| Hackathon | Working synthetic replay, outcome reveal and report card. Recovery preview uses verified directory entries or explicit fixtures. Show abstention when coverage is unknown. |
| First real intake | Representative agency export and dictionary pass the offline contract. Reconcile compatible totals, original releases and revisions. |
| District model | Build the as-of panel and real model runner. Evaluate against baselines and review safe outputs. Partial series support scoped diagnostics. |
| Broader archive | Pilot courts and bilingual news. Scale only after measuring extraction accuracy, spectrum of coverage, deduplication and incremental value. |
| Prospective pilot | Score frozen forecasts against independent later outcomes with participating custodians. |

The demo model is a separate implemented experiment. The offline aggregate intake is the first rebuild increment. Agency weekly features, real June training, source collectors and the health workspace are follow-on implementation milestones.
