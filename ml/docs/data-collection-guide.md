# Official aggregate intake

Start with the request drafts and source catalogue. Secure a representative custodian sample and the data dictionary before backfilling 2020–2026. Keep original exports in approved local storage, using a gitignored directory such as ml/data/real. Preserve the source, extraction hash, retrieval date, publication evidence, definitions and coverage separately in a private manifest. Normalize administrative units through a verified revenue-district crosswalk. Use the as-of date in IST.

## Normalized CSV

```csv
agency,metric,district,frequency,period_start,period_end,available_on,status,count
excise,seizure_events,Kottayam,week,2026-06-01,2026-06-07,2026-06-10,partial,
excise,seizure_events,Kottayam,week,2026-06-01,2026-06-07,2026-06-15,complete,0
```

The example is fictional. The importer expects UTF-8, the exact header above, and one row per metric, district, period and genuine release date at end-of-day resolution.

- Agency values are **police**, **excise**, **ncb**, **dri**, or **verified_combined**. Use the last only with documented joint definitions and overlap handling.
- Metrics are **seizure_events**, **ndps_registrations**, **trafficking_registrations**, **possession_registrations**, **searches**, or **inspections**. Keep independently supplied definitions in separate intake files if they would conflict.
- Use a Kerala revenue district. **week** is Monday to Sunday. **month** uses calendar months. Period endpoints are inclusive. Use separate downstream models for separate frequencies and definitions.
- Use **complete** with a nonnegative integer, including a confirmed zero. Use **partial**, **unavailable** or **suppressed** with a blank value. An unlisted district-period is unknown.
- Use the original availability date for each revision when evidenced. If availability is unknown, use the earliest date it was actually observed, such as retrieval, and classify earlier retrospective use independently. Keep revisions as separate rows. A correction can withdraw a previously complete value. For multiple same-day revisions retain the version available by end of day, with the detailed history in the local manifest.
- The contract is for historical period totals. Future planned exposures, campaign dates, court records, documented links and health series have separate intake requirements.

Run the command in [the README](../../README.md). It verifies the shape and whether at least one latest-as-of observation is complete. It does not infer series coverage or perform training. Compare coverage against an expected district-period calendar and reconcile with official aggregate reference tables before training. For Monday-start whole-week forecasts, the feature cutoff is Sunday end of day IST.

For a next-month trial, supply reconciled `excise` / `ndps_registrations` / `month` rows to the monthly command in the README. It needs at least 50 complete archive months documented by the cutoff and enough timely releases to replay all validation stages. Keep annual totals, other metrics and separate agencies in their own series. A late or withdrawn report can block forecast issuance.

## Existing local diagnostic

The earlier **make real** path uses source CSVs in the gitignored training_dataset directory. Its sample comprises public reporting and court orders. Comparable complete district-year totals can be supplied via the existing official counts template, using the source and retrieval date. Apply the existing conservative deduplication and documented availability checks. The old paths and private audit remain local. The aggregate intake above runs independently. It does not read those files or export records.

[Source research](../../docs/DATA_SOURCES.md) · [Request drafts](../../docs/DATA_REQUESTS.md) · [Model plan](../../docs/MODEL_PLAN.md)
