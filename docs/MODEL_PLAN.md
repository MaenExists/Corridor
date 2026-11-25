# Corridor model and rebuild plan

## First model

Train one **regularized Poisson regression** per horizon, pooled across all 14 Kerala revenue districts. It estimates nonnegative counts and shares information across districts. Train separate series by source and definition until a verified combined count exists. Prefer unique documented seizure events. If the consistent feed is NDPS registrations, forecast and label registrations. Preserve seizure-confirmed, possession and trafficking distinctions where official definitions support them.

1. Issue Monday-start forecasts for 7 and 28 days using information available by Sunday end of day IST. The one-time June cutoff snapshot can forecast from the next full supported period. Daily events can roll up into weekly inputs. A complete weekly export supports targets aligned to its whole weeks. Monthly-only records support a separate next-month forecast. Annual tables support reconciliation and historical context.
2. Compare with a recent 56-day rate, a historical seasonal average and the same period 52 weeks earlier, aligned to the forecast horizon. Score methods on common eligible windows.
3. Fit count models using district effects, cyclical calendar terms, recent counts over 1, 4, 8 and 13 weeks, year-ago counts and source freshness. Distinguish missing history and complete zero counts. Test prior-period enforcement effort and known campaign changes in an ablation. With consistently measured exposure and an issuance-time value, compare an exposure-adjusted model and disclose its assumptions. Detected counts still depend on where agencies look.
4. Challenge with histogram gradient boosting using Poisson loss. Check overdispersion and drift before testing negative binomial regression or additional features. A challenger needs at least 5% lower development MAE than the strongest eligible simple baseline. Report regressions by district. Freeze the chosen method and configurations before final scores.
5. Calibrate 80% intervals on a separate chronological window. Assess achieved coverage and width by district and count band. Abstain when completeness, comparability, calibration support or freshness fails. Where enforcement effort is missing, mark it and test stability across documented campaigns before considering real high-count flags.

## Enforcement effort and feedback

Real district review defaults to withheld until detection counts match a complete effort series by district, dates, agency, operation and inspection protocol. A denominator must count the type of action capable of generating the numerator. Keep raids, general inspections and checkpost checks as separate series. Record the latest availability date of both inputs. An absent or zero denominator produces an unknown yield. A confirmed zero detections with positive comparable effort is an observed zero with an interval.

Use the count model with an offset equal to the log of compatible effort and compare with a pooled historical yield baseline. Penalized district effects share information across locations. Fit a negative binomial dispersion term when the training data support overdispersion. Validate on later independent periods using the same effort definitions, and condition prospective counts on separately known effort. A rate measures the yield of the inspections actually performed and can still reflect selection within districts. This supports review of recorded activity. It provides no dispatch or route recommendations. [Feedback-loop research](https://proceedings.mlr.press/v81/ensign18a)

Compare the effort-adjusted signal with a locally measured, independent care series over a matching period. Self- and family-referred admissions or self-initiated helpline calls are candidates. Keep enforcement-linked referrals separate, record access and reporting changes, and withhold priority if care coverage is missing. When either independently measured signal points in the opposite direction, report uncertainty. Score observations through the outcome log with **yes**, **no** or **unknown** forecast influence. Keep influenced and unknown records separate from independent evaluation and the default training path. [Kerala Assembly treatment referral context](https://www.niyamasabha.org/codes/16kla/session_2/ans/u02246-271026-02-16.pdf)

## Retrospective annual panel

The annual research panel is separate from the weekly forecast design below. The evaluation split is 2020–2023 for training, 2024 for held-out scoring, and a separate January–August 2025 comparison using only like-for-like January–August histories. That yields at most 14 district outcomes per held-out period, some of which may be unavailable. The DES mid-year population denominator supports descriptive cases per lakh. Leave unavailable denominators blank and retain both period-end and first verified availability. Never split annual registers into weekly labels. The population denominator measures resident exposure and cannot replace recorded enforcement effort.

`make prepare-training` validates complete coverage and reconciliation to the official state total within each reporting window and edition. The annual bundle stores features and outcomes separately, keyed by district and year. Use a fixed log-population offset and district effects. Fit any transformations and model parameters to 2020–2023 only. Begin with the last observed annual count and a pooled, population-scaled rate from training years. The bundle is retrospective because the saved sources do not establish which editions were available at the original forecast date. The manifest records the per-file hashes and the number of training rows with verified availability by the proposed cutoff.

`make train-annual` fits an L2-regularized Poisson model with a fixed exposure offset. Rolling 2022 and 2023 fits select the district penalty, history weighting and whether to include a shared year trend. The optimizer uses a convergence tolerance and a 500-iteration cap. The saved fit precedes access to the 2024 outcomes. Score all methods over the same 14 district-years. The learned model must improve MAE by at least 5% over the strongest eligible baseline in development and in the holdout to pass the retrospective benchmark. Forecast issuance remains subject to independent coverage and as-of evidence. Training-year residuals support an exploratory 80% interval diagnostic. The short series shares those years with model selection, so report achieved holdout coverage without a calibration claim.

`make train-boosting` uses histogram gradient boosting with Poisson loss and prior-year count scaling. Features use only earlier counts from the same reporting window. Compare eight tree configurations at 8, 16, 32, 64, 128, 256 and 512 rounds using rolling 2022 and 2023 validation. Choose the shortest run within 1% of the lowest validation MAE. Freeze the settings and refit them separately on full-year history through 2023 and January–August history through 2024. Use 2024 annual data as a previously scored replay and January–August 2025 as a separate check with matching windows. Both model files precede access to the respective scoring outcomes. Forecast issuance remains withheld while prospective coverage is unverified.

`make eval-counts` compares the fitted models with the previous-year count and a fixed halfway adjustment from that count toward the boosted estimate. The January–August Poisson fit uses the frozen annual configuration and matching 2020–2024 windows. Its 2025 population exposure carries forward the documented 2024 estimate. Each window is scored separately on the same district outcomes for all methods. Treat both windows as examined retrospective evidence and verify any improved method on new observations before adoption.

The same command fits a lagged Poisson challenger independently for each window. It uses the previous comparable count as exposure and learns a regularized multiplier from shared and district changes. Rolling validation within each training window selects among 12 combinations of feature sets and penalty strengths. The lagged model must improve on the previous-year reference by at least 5% in development and replay and have the lowest replay MAE to become the retrospective reference. References and model parameters remain local. Prospective issuance still requires independently verified data availability and evaluation.

Court orders support incident evidence alone. Use court decision dates for order identity and documented archive coverage, and leave incident dates unset until the underlying passage has been reviewed. Use an exact court case number plus decision date to group orders and an evidenced crime number, station and year to propose incident linkage. Review fuzzy matches before merging. Keep reported drug classes and original units, with log-transformed quantities available for review. Large quantities warrant a transit or context check. Classify movement only from explicit supporting evidence. Use official case counts as the model outcome. Treat NCRB personal-possession and trafficking-possession as separate enforcement-recorded proxies. They do not substitute for independent treatment demand or verified movement.

## District-month model (recovered Excise statements)

Kerala Excise published a district statement every month from 2015 to September 2024. `make excise-history` recovers those uploads from the Internet Archive and keeps a month only when its 14 district NDPS counts sum to the printed statewide total. The verified panel runs from January 2016 to September 2024 (105 months). Its yearly sums match the State Planning Board district series exactly for 2020 and within eight cases elsewhere. Raids are reported only until early 2021, so the model is not effort-adjusted.

The model splits each forecast into a statewide level and a district share. Expected count = smoothed district share x latest statewide total x exp(calendar-month effect). Shares use exponential smoothing with weight 0.3. The calendar-month effect is the mean log change into that month over earlier years, shrunk by n / (n + 4). Intervals are 80% negative binomial ranges whose dispersion comes from the previous 24 months of errors at the same horizon. Every quantity uses only months complete at the forecast origin.

**Pre-registration, 25 November 2026.** Development targets are January 2019 to December 2022 at horizons of one, two and three months. The settings above were chosen on development only, from share weights 0.2 to 0.5 and shrinkage of 1, 2, 4 or none. The test covers January 2023 to September 2024 and is scored once with the frozen settings. A horizon passes when all of the following hold on test:

| Gate | Threshold |
| --- | --- |
| Skill | MAE at least 5% below the best of last month, three-month mean, 12-month mean and same month last year |
| Bias | Total error within 5% of recorded volume |
| Calibration | 80% interval coverage between 72% and 88% |
| Ranking | Mean monthly rank correlation across districts of at least 0.7 |

Statement upload dates are recorded, so a separate replay can show what the public website allowed at each date. Many statements were uploaded months late, so the public record alone could rarely have supported a one- to three-month horizon. The tested horizons assume the monthly count is available to an authorized analyst shortly after month end. A forecast is withheld when the latest complete month is more than three months before the target month.

**Results (scored once, 25 November 2026).** At one month ahead the test passed every gate. The model's MAE was 8.70 against 9.31 for the 12-month mean, a 6.5% improvement. Bias was −0.1%, 82.3% of outcomes fell inside the 80% intervals, the mean rank correlation was 0.81 and the top-four districts overlapped 76%. Two- and three-month horizons lost to the 12-month mean (−12% and −26%) and are withheld. By district, the model beat a baseline picked separately for each district after scoring in 6 of 14 districts. District interval coverage ranged from 76% to 95%. Ernakulam, Kottayam, Kollam, Thiruvananthapuram and Palakkad had the largest gaps to their best simple method.

**Issuance rules.** These rules were set after scoring and tighten the pre-registered rule. Issue only one month ahead, from the latest complete month, because only that horizon passed. After a gap, wait for six consecutive months: on development, error recovers from 9.03 after one month to 7.32 after six, against 7.23 with full history. Bridging a gap with older shares and the January–August 2025 Economic Review totals scored worse than repeating last month (8.35 against 8.02 on development), so it is not used. District rankings 12–24 months ahead average only 0.54–0.63 rank correlation, so the stale 30 June 2026 snapshot withholds instead of issuing a long-range ranking. Upload dates show that the public website would have allowed a timely forecast at only 2 of 70 month-ends from 2019 to 2024.


**Post-cutoff check (25 November 2026, `make cutoff-check`).** New outcomes came from two sources. Assembly unstarred question 640 (answered 13 October 2026) gives statewide monthly Excise NDPS counts for January 2025 to September 2026. Its January–August 2025 total, 8,622, equals the Economic Review district sum. The live homepage gives the October 2026 district panel.

- *Strict cutoff.* With only information public by 30 June 2026, issuance withheld because the data was 21 months stale. Forced to answer anyway, the frozen model missed statewide July–October 2026 by −9%, −10%, +17% and +14%, against −23% to −13% for repeating September 2024. Its 80% ranges, such as 278–2,051, were too wide to be useful. For October 2026 by district, it scored MAE 15.7 against 13.1 for repeating September 2024. Rank correlation was 0.67, three of the top four districts matched, and 6 of 14 districts were within 20%. At long range, the stale baseline beat the model by district.
- *New statewide months.* In a one-month-ahead replay of the statewide component, MAE was 127 against 137 for last month and 123 for the three-month mean over January 2025 to October 2026. For the four post-cutoff months it was 109 against 90 and 80. 17 of 21 months fell inside the 80% range. The calendar-month effect learned from 2016–2024 did not hold in 2025–26. It predicted 1,440 for September 2025 against 940 recorded, and 1,229 for July 2026 against 1,038. The statewide seasonal adjustment is the model's weakest part.
- *Stress on the frozen test.* 63% of district-months were within 20% of the recorded count, and 67% within 10 cases. The direction of change from last month was right 72% of the time. The model beat last month in both 2023 (8.15 vs 9.21) and 2024 (9.44 vs 10.68). Interval coverage held across count bands (77%, 84% and 82%). The statewide sum missed by 12% per month on average. Beyond one month, accuracy matched or fell below simple averages.

Revision candidate for future scoring only: a damped or removed statewide seasonal effect, or a three-month statewide level. Score it on months from November 2026 onward before any change. Do not rescore it on the months above.

## Where-next hotspot forecast

The question is where recorded cases will concentrate next month. `ml/train/district_where.py` turns the frozen count model into a joint forecast by simulation. Each of 4,000 draws scales statewide volume by a factor sampled from the previous 24 statewide one-month errors, then draws every district from its negative binomial. For each district it reports expected cases, an 80% range, the probability of being a top-four district, the probability of running hot (a share of statewide cases at least 20% above its 12-month share), the probability of a surge (a count at least 25% above its 12-month mean) and an expected rank. Probabilities are scored against base rates known at each origin, and alerts are compared with a persistence rule that flags last month's hottest districts.

Development findings that shaped this design:

- District ranking is mostly fixed structure. The model's top four districts captured 41.6% of next month's cases, against 40.8% for 12-month shares and 44.9% with perfect foresight. A multinomial share model with momentum, neighbouring-district spillover, last-year and seasonal terms did not improve log-loss (2.5651 vs 2.5650), so it is not used.
- Relative hot spots are only modestly predictable. The two alerted districts per month ran hot 48% of the time, against a 25% base rate. Persistence alone reached 46%.
- Most "surge" skill is statewide timing, because statewide waves lift every district.
- Ganja and MDMA quantities verify against printed totals in only 15–16 of 36 recent months. MDMA is itemized only from late 2021. Quantities are dominated by rare large seizures. Drug-type forecasts therefore wait for a cleaner series.
- District is the finest unit public aggregate data supports. Monthly aggregate NDPS counts by Excise range or circle office, obtained through RTI, would allow a finer map. Record-level FIR data is out of scope.

**Pre-registration, 25 November 2026.** The settings above were chosen on 2019–2022 development, including full district dispersion over subtracting the statewide part. The test covers January 2023 to September 2024 and is scored once. These targets were not examined on that window before. Gates: hot-alert AUC at least 0.6, positive Brier skill for hot probabilities and for top-four probabilities, and hot-alert precision at least 1.5 times the base rate. Whether alerts beat persistence is reported but is not a gate.

**Results (scored once, 25 November 2026, `make where-test`).** All gates passed. The two hot-district alerts each month were right 38% of the time, against an 18% base rate (2.15× lift) and 36% for persistence. Hot-alert AUC was 0.76 against 0.72 for persistence, with Brier skill +0.14. Top-four probabilities had Brier skill +0.41 and AUC 0.93. Surge AUC was 0.73. The predicted top four captured 39.3% of cases, against 38.6% for 12-month shares and 41.7% with perfect foresight, so ranking stays mostly structural. Probabilities ran slightly high on the test window: hot averaged 0.21 against an observed 0.18, and surge 0.26 against 0.20. Monitor calibration on new months before quoting probabilities as exact.

**Audit (25 November 2026, `make where-audit`, no settings changed).** The gates passed, but the evidence is thin.

- Alert precision on the test window was 38%, with a 95% month-block bootstrap interval of 24–52%.
- The model's advantage over persistence was −10 to +14 percentage points, and its AUC advantage −0.01 to +0.10. Neither is distinguishable from flagging last month's hottest districts.
- Random alerts scored 17.5%, so the model clearly beats chance.
- Alerts caught 16 of 52 hot district-months, so 69% were missed. Both alerts were wrong in 8 of 21 months.
- Development years were uneven: the model trailed persistence in 2020 and 2021 and led in 2019, 2022 and 2024.
- Calibration: hot probabilities of 0.1–0.2 came true only 6% of the time. Top-four probabilities above 0.7 came true 98% of the time, against 83% predicted. Surge probabilities of 0.3–0.7 ran about a third too high.
- Hot events were mostly not small-count noise: 11.5% occurred under 30 cases. A correct alert meant a median of about 17 cases above the district's normal share.
- Malappuram was hot in 12 of 21 test months. Its share was rising, and the 12-month normal lags a trend, so part of the hot signal is trend-following.

## Grid hotspot forecast (reported seizures)

The district models answer "which district". This layer answers "which square kilometre", using the cell-forecast method used abroad for hotspot policing. `ml/data/news_incidents.py` reads publisher sitemaps from the New Indian Express and the Times of India (from January 2016), from Asianet News's Kerala and local sections (from January 2022, its earliest sitemap), and from Onmanorama's rolling recent sitemaps as a freshness feed. It keeps Kerala drug-seizure stories by headline and fetches each candidate's own short summary (meta description), not the article text. It locates each story at the most specific Kerala locality named in the headline or summary, using GeoNames localities and post offices. Stories within two days at the same place merge into one incident. Only locality-level incidents enter the grid model. Desk-only stories ("Kochi: police arrested…") are kept for counts but not for cells.

`ml/train/hotspot_grid.py` ranks the 1 km WorldPop cells inside Kerala, the recovery-map grid, at weekly origins for the next 7 and 28 days. Every model sees only reports published before the origin.

- **Self-exciting point process (ETAS, Mohler et al. 2011).** A long-run kernel density of past seizures (3 km bandwidth) forms the background. Each seizure adds a triggering term that decays in time and space (near repeat). θ, ω, σ (floor 1 km, the locality precision) and μ are fitted by EM on reports before the evaluation window, then frozen.
- **Learned ranker.** Gradient-boosted trees on seizure densities over 28 days, 91 days, 365 days and all history at 1, 3 and 10 km. Further features: days since the last report within 3 km, the ETAS intensity, log population of the cell and within 5 km, and distance to the nearest railway station. It is trained on earlier origins only, with sampled negatives.
- **Baselines.** Long-run hotspots (all-history density), last 365 days, last 28 days, population and random cells. Ties break by population.

Scores: hit rate and PAI (hit rate divided by area share) for the top 1% and 5% of cells, and the share of the top 20 cells with at least one report. Differences use a quarterly block bootstrap.

What this measures: *reported* seizures. A news report needs a seizure, a press note and an editor's interest. City desks and large hauls are over-represented, and rural and small seizures are under-represented. A cell that rarely appears is not shown to be safe. Locations are locality centroids from text, so the resolution is a locality (about 1–3 km), not a street or a 150 m square. The output supports a planning conversation about where reported seizures cluster. It is not a patrol order, and it scores no person or address.

**Pre-registration, 25 November 2026, written before any grid result was run.** Development origins run through 2022–2023. ETAS is fitted on reports before 2022, and the ranker is trained on origins from 2017 whose windows end before 2022. The primary model is whichever of ETAS and the learned ranker has the higher development hit rate at the top 1% of cells for 28 days. The test runs once on origins from January 2024 to windows ending 30 June 2026. ETAS and the ranker are refitted on data before 2024 with the same settings.

*Amendment, same day, before any score was computed.* The first version set development to 2018–2021 and the test to 2022 to mid-2026. Then Asianet News was found and added, and it starts in 2022. Both windows were moved so that development and test have the same source mix. No settings changed. Gates for the primary model at 28 days:

- PAI at 1% of area of at least 5;
- hit rate at 1% at least that of long-run hotspots and of population;
- top-20-cell precision above long-run hotspots.

Whether the bootstrap interval against long-run hotspots excludes zero is reported, but it is not a gate. Months after 30 June 2026 form a separate post-cutoff check.

**Data, 26 November 2026 (`make news-harvest`).** The harvest read 363,914 Kerala-section stories and kept 4,500 seizure candidates by headline. Their summaries yielded 2,128 incidents after merging repeat stories. 974 of these name a locality: 39 in 2016, between 18 and 46 a year in 2017–2021, 114 in 2022, 82 in 2023, 141 in 2024, 248 in 2025, and 204 in 2026 to 25 November. Ernakulam (380) and Thiruvananthapuram (222) hold 62% of them, and Pathanamthitta (3) and Kottayam (5) almost none. That is city-desk coverage, not the state's seizure geography.

**Development (2022–2023).** For 28 days, the learned ranker's top 1% of cells held 61.8% of located reports, against 49.7% for ETAS, 39.7% for long-run hotspots and 15.2% for population. It is therefore the primary model. ETAS fitted θ 0.30, a 1 km spread (the floor) and an 83-day time scale.

**Test (scored once, 26 November 2026, `make hotspot-test`).** All four gates passed. For 28 days, the ranker's top 1% of cells held 56.7% of located reports (PAI 57), against 45.9% for ETAS, 28.4% for long-run hotspots, 26.0% for the last 365 days and 10.0% for population. Its advantage over long-run hotspots was +24 to +31 points (95% block bootstrap). Top-20-cell precision was 10.0%, against 2.5%. Results at 7 days were similar, at 58.4% against 28.1%.

**Audit (`make hotspot-audit`, no settings changed).** The skill is almost entirely repetition.

- 74% of test reports came from a locality that already had an earlier report. The ranker caught 77% of these and 3.3% of reports from new localities, the same rate as long-run hotspots.
- A plain "same locality again" baseline, the long-run density with a 1 km kernel, caught 56.8% overall against the ranker's 57.9%. The gain over the 3 km long-run map comes from kernel sharpness: locations are locality centroids, so the same cells recur.
- By district, the ranker caught 85% of reports in Ernakulam and 72% in Thiruvananthapuram. It caught 0% in Palakkad (59 reports), Kasaragod and Pathanamthitta, and 7% in Kannur.
- By year it caught 62% in 2024, 53% in 2025 and 66% in 2026. The repeat baseline is now reported in every stage.

**Post-cutoff check (1 July – 25 November 2026, `make hotspot-postcutoff`).** For 28 days the ranker caught 70.8%, against 65.9% for the repeat map (advantage +3.9 to +7.6 points) and 33.2% for long-run hotspots. For 7 days it caught 63.9% against 64.7% for the repeat map. ETAS trailed the repeat map at both horizons.

Reading: this is a good, honest map of *where seizures keep getting reported*, refreshed from live sitemaps. It is not yet a model of where drugs move next. Near repeat is real in these data (θ about 0.4 within 1 km, with a months-long time scale). Predicting new places would need inputs the news sample lacks: official station-level counts, routes and checkpost data, and coverage outside the city desks. Revision candidates are to be scored only on months after November 2026. They are a ranker feature for district-level official trend (from the Excise series), a source-coverage correction, and Malayalam-language publishers for rural coverage.

## Patterns around hotspots (explicit and learned)

The grid audit showed that the ranker repeats past localities and catches about 3% of reports at new ones. `ml/train/hotspot_patterns.py` asks what surrounds hotspots. Context comes from an OpenStreetMap extract (`ml/data/context_layers.py`): railway stations and lines, national highways, main roads, bus stations, airports, ports, colleges, schools, tourist sites, resorts and homestays, liquor outlets, the land border and the points where main roads and railway lines cross it, plus police stations and Excise offices as an enforcement-presence control. Incidents now carry a drug family (synthetic, cannabis, other) and the largest stated quantity.

Explicit patterns are readable and fitted only on reports before each window.

- **Risk terrain**: a penalised Poisson regression of reports per cell on distance bands (0–0.5, 0.5–1, 1–2 and 2–5 km) to each layer and log population. Each coefficient is a relative risk.
- **Hotspot typology**: DBSCAN clusters (4 km, at least three reports, last two years). Rules label each cluster:
  - entry gateway: near the border or a crossing, and at least 30% of reports are hauls of 1 kg or more;
  - air or sea entry: near an airport or port, with the same large-haul share;
  - transit corridor: on highways or railways, stretched out or with large hauls;
  - retail market: a dense town with a median haul of 100 g or less;
  - venue-linked: resorts, tourist sites or colleges;
  - emerging: most reports in the last six months.
- **Corridor spread**: reports attach to points on highways, main roads and railways within 2 km and spread along the network up to 12 km. Cells within 1.5 km of a line inherit that activity.

The learned pattern ranker adds the risk-terrain score, corridor activity (last year, all history and large hauls only), ring counts at 2–5 km and 5–15 km, the distance to each hotspot type, and the raw distances to the grid ranker's features. It is trained exactly as the grid ranker.

New scores:
- hit rate at 1% and 5% for reports at localities with no earlier report ("new places");
- their median percentile rank;
- a "fresh list": the same ranking restricted to cells more than 2 km from every earlier report, scored on new-place reports that fall in such cells.

**Pre-registration, 26 November 2026, before any pattern score was computed.** Primary metric: new-place hit rate in the top 5% of cells for 28 days. The pattern ranker counts as an improvement only if all three hold:
- it beats the grid ranker on this metric in development (2022–2023);
- on 2024 to mid-2026 the 95% block-bootstrap interval for the difference excludes zero. This window was already used to score the grid ranker. The pattern design was not tuned on it, but this is a second use and is labelled as such;
- its overall hit rate at 1% is within two points of the grid ranker's or better.

Post-cutoff months (July–November 2026) are reported as the first fully fresh check. Hotspot types are descriptive labels from rules, not validated categories.

## Next-month model for official registrations

The private runner targets recorded monthly Kerala Excise NDPS registrations. Use one reconciled agency and definition. At the end of each month in IST, reconstruct exactly the release versions known at that date. Input history requires 12 consecutive complete months across all 14 districts. Allow a one-month publication lag. Use a seasonal repeat, the latest available month, and an average of the three latest complete months as baselines. A regularized Poisson model learns a correction to that recent average with persistence and seasonal deviations.

Require at least six earlier complete training examples by month at each model fit. The rolling replay uses six development months, 12 interval calibration months and 12 final test months, with two one-month gaps to allow outcomes to mature. Freeze method selection before calibration and fix interval width before final test. Require at least 50 complete observed months overall, with additional time needed when publication delays reduce historical eligibility. Select the challenger only if it improves on the strongest baseline by at least 5% in both development and test. If development selects a baseline, allow it to proceed when final test error is within 5% of the best baseline there.

The initial test gate also requires absolute error no greater than 25% of reported volume, interval coverage for all districts together in at least 10 of 12 test months, and aggregate interval width no greater than twice observed volume. Calibrate intervals from each month's largest normalized district error to keep the calibration unit at one month. These thresholds are initial project choices. Observed test performance supports a limited historical check, with future changes in reporting, enforcement and activity still affecting error. Issuance stays local and describes recorded counts.

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

**Recovery access map (built 25 November 2026).** `ml/recovery/access_map.py` locates 322 centres: 308 from the State Mental Health Authority de-addiction register, by PIN-code centroid, and the 14 Vimukthi centres, by gazetteer town or OpenStreetMap geocoder. It clips the WorldPop 2020 1 km grid to Kerala (46,057 cells, 34.7 million people). Each cell gets its straight-line distance to the nearest centre and its registered beds within 25 km per 100,000 people, using a two-step catchment that shares each centre's beds among everyone in reach. Localities are ranked by people × km beyond 10 km. 19.9% of residents live more than 10 km from a centre; Idukki has 46% beyond 10 km and 16% beyond 20 km. Only 12 register rows split out de-addiction beds; the rest print establishment totals, so bed access is an upper bound. The map has no layer estimating where people who use drugs live, and adds care demand only as suppressed aggregates.


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
