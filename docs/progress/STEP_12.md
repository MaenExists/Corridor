# 12 — Handoff and verification
Start with `README.md`; run `make setup && make demo`, then open http://127.0.0.1:5173.
Run `make test` for schema, cutoff, deduplication, metrics, chronology, abstention, privacy, track isolation and release checks.
`make browser-test` exercises the running app with real browser controls; give it the local review key to include inbox, leads and exports.
Verified on a separate checkout with no real data: setup, 15 tests, training, report generation, the local API and demo browser all completed. No external browser requests were made.
The private report is frozen for unchanged inputs; `make real` without the dataset skips. Only an owner-reviewed aggregate belongs in the real results view.
Rehearse `docs/DEMO_SCRIPT.md`. The summary is `docs/FINAL_REPORT.md`; future data and disclosure rules are in `ml/docs/data-collection-guide.md`.
