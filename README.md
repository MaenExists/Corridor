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

## Public collection snapshot

The downloaded official tables, court archive and public recovery directory are stored locally in the gitignored ml/data/real/public_sources directory. The local collection and coverage reports are kept in the Git-ignored files `docs/progress/PUBLIC_COLLECTION.md` and `docs/progress/SOURCE_COVERAGE.md`. The public snapshot provides context, court candidates and directory data. The official district series remains too sparse for a weekly real forecast.

## Project documents

- [Project scope](project.md)
- [ML plan, evaluation and build sequence](docs/MODEL_PLAN.md)
- [Verified data sources and acquisition paths](docs/DATA_SOURCES.md)
- [Data access and draft requests](docs/DATA_REQUESTS.md)
- [Status and remaining gates](docs/FINAL_REPORT.md)
- [Hackathon demo script](docs/DEMO_SCRIPT.md)
