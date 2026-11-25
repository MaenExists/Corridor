# Corridor

Kerala-focused forecasting and recovery planning for Hackfinity 2026. Corridor's rebuild starts with forecasts of recorded seizures or NDPS registrations, historical research into documented district links, and a separate public care directory and service planning view.

## Run the local demonstration

```sh
make setup && make demo
```

Open **http://127.0.0.1:5173/?offline=1**. The Challenge runs a frozen synthetic model and reveals synthetic outcomes after forecast issuance. **make serve** reopens a prepared snapshot. The Forecasts view contains baseline comparisons, coverage and abstention. Use **make test** and **make browser-test** to verify the system. The browser test expects the local demo to be running.

## Validate an authorized aggregate export

Store approved files outside public paths, such as in the gitignored ml/data/real directory. The validator reads a normalized CSV locally and reports a status message without emitting row contents.

```sh
.venv/bin/python -m ml.data.aggregate_intake --as-of 2026-06-30 ml/data/real/agency_weekly.csv
```

See [the intake guide](ml/docs/data-collection-guide.md) for the schema. The validator and as-of selection precede weekly model integration. The existing **make real** command is a separate legacy source-CSV diagnostic.

## District-month forecast from official Excise statements

```sh
make excise-history     # recover and verify the 2016–2024 monthly statements (first run downloads from the Internet Archive)
make district-dev       # development replay used to choose settings
make district-test      # the frozen test, January 2023 – September 2024
make district-forecast  # issue or withhold as of 30 June 2026; set AS_OF=YYYY-MM-DD for another date
make excise-snapshot    # monthly: record the district panel shown on the live Excise homepage
```

Raw statements, the verified panel and reports stay in the gitignored `ml/data/real/public_sources/` directory. The design, gates and results are in [the model plan](docs/MODEL_PLAN.md#district-month-model-recovered-excise-statements).

## Evaluate a private next-month forecast

`make monthly-forecast` checks the saved Excise snapshot against the 30 June 2026 cutoff. With a reconciled, authorized history of monthly Excise NDPS registrations, run the same pipeline at a month-end cutoff.

```sh
.venv/bin/python -m ml.forecast.monthly_counts --as-of 2026-06-30 --input ml/data/real/excise_monthly_history.csv
```

Use genuine release dates and include complete district coverage. The pipeline replays what was known at each historical forecast date, tests a regularized Poisson model against three baselines, and withholds the result when history or independent evaluation is insufficient. Reports stay in the gitignored `prepared/monthly_forecast/` directory.

## Public collection snapshot

The downloaded official tables, court archive and public recovery directory are stored locally in the gitignored ml/data/real/public_sources directory. The local collection and coverage reports are kept in the Git-ignored files `docs/progress/PUBLIC_COLLECTION.md` and `docs/progress/SOURCE_COVERAGE.md`. The public snapshot provides context, court candidates and directory data. The official district series remains too sparse for a weekly real forecast.

## Prepare private research tables

With the saved source snapshot, the optional dependencies in `requirements-collection.txt`, and Poppler, run `make prepare-training`. It prepares official tables, screens the cached court texts for relevance, and writes a protected annual training bundle under `ml/data/real/public_sources/prepared/training_bundle/`. The bundle separates 2020–2023 training rows, 2024 holdout outcomes and a January–August 2025 check. It supports retrospective testing of recorded Excise counts. Court documents stay in the evidence review tables. `make prepare-research` checks the separate effort-adjusted model's readiness. The paid court search retry is a separate explicit command.

Run `make train-annual` against the prepared bundle to fit the annual Poisson model to convergence. The command selects settings using rolling validation within the training years, freezes the fit, and compares it with two simple baselines on 2024. The checkpoint and evaluation are kept in the local, gitignored `prepared/annual_fit/` directory.

Run `make train-boosting` to train a boosted-tree challenger on the same archive. It selects depth, learning rate, leaf size and number of boosting rounds using earlier-year replays. It saves separate full-year and January–August models and evaluates their historical forecasts against simple baselines. Outputs stay in the gitignored `prepared/count_boosting/` directory.

After both fits, run `make eval-counts` to train a lagged Poisson challenger and compare it with the original Poisson, boosting, a fixed blend, and the previous-year baseline on the same outcomes. The gitignored `prepared/count_comparison/` directory contains the frozen challenger and a report with average error, bias, count deviance, exploratory interval coverage, and the selected retrospective references.

## Project documents

- [Project scope](project.md)
- [ML plan, evaluation and build sequence](docs/MODEL_PLAN.md)
- [Verified data sources and acquisition paths](docs/DATA_SOURCES.md)
- [Data access and draft requests](docs/DATA_REQUESTS.md)
- [Status and remaining gates](docs/FINAL_REPORT.md)
- [Hackathon demo script](docs/DEMO_SCRIPT.md)
