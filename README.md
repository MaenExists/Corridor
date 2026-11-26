# NarcoTrace

Kerala-focused forecasting and recovery planning for Hackfinity 2026. NarcoTrace's rebuild starts with forecasts of recorded seizures or NDPS registrations, historical research into documented district links, and a separate public care directory and service planning view.

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

## Recovery access map

```sh
make recovery-refresh   # fetch the current centre register, Vimukthi directory and Excise month, then build
make recovery-map       # rebuild from local copies
```

Open **http://127.0.0.1:5173/recovery.html** (add `?offline=1` to skip map tiles). The first build needs the WorldPop 2020 1 km India grid and the GeoNames India postal file in `ml/data/real/public_sources/geo/`, plus the packages in `requirements-collection.txt`. Outputs stay in gitignored paths.

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

## NarcoTrace frontend (Next.js)

`frontend/` is the new interface, built with Next.js 15 and Tailwind CSS 4: a black theme with ruled lines, grain and a satellite-first map. Both views are live: Enforcement (where seizures are likely next) and Public (distance to de-addiction help, with nearest centres from any spot or from "Near me", computed in the browser). The Public view also has a **Report** tab for tips: what and roughly where, never who. Enforcement sees only areas that several people flag independently, as an unverified layer kept apart from the forecast. See [public reports](docs/PUBLIC_REPORTS.md) for the bias and abuse safeguards. The public side reads in English or Malayalam (switch in the header; the choice is kept in a cookie). Its map centres on **drug-affected areas**: recorded police and Excise NDPS cases per district, placed within the district by where people live and where seizures were reported, graded relative to the rest of Kerala, then shaded by distance to the nearest centre. The Enforcement view adds a **New & rising** tab from pattern engine v2 (space-time scan alerts and a new-place watch list, shown as a lead because it did not pass its pre-registered rule) and learned hotspot profiles in "Why there". Every weekly forecast is frozen in a local ledger and scored after four weeks.

```sh
make frontend-setup   # Node 22 via mise, then npm ci
make frontend         # http://127.0.0.1:3000/enforcement
make frontend-build   # typecheck and production build
make frontend-test    # rules for public tips and place search
make place-names      # Kerala place list for map labels and search (local OSM extract, ~4 min)
make recovery-need    # drug-affected areas for the public map (official NDPS counts placed within districts)
make hotspot-v2       # evaluate pattern engine v2 (learned profiles, new-place model, emerging scan), ~7 min
make hotspot-weekly   # live cycle: harvest, all forecasts, freeze this week's lists in the ledger, score matured ones
```

The server reads the local, gitignored model outputs at request time (`web/public/generated/hotspots/*.json`, `web/public/generated/recovery/access_map.json`, the Excise CSVs and the district forecast status). Nothing from them is bundled or committed. Set `NARCOTRACE_ROOT` to point at another checkout. Map labels and the search bar use a Kerala place list (about 25,000 towns, villages, neighbourhoods, junctions and public landmarks, with Malayalam names) built from the local OpenStreetMap extract by `make place-names` into the gitignored `web/public/generated/places/`. Single houses are left out, and searches are answered by this server only. Build the inputs first with `make hotspot-forecast patterns-forecast hotspot-cutoff`.
