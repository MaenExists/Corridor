# Corridor operating notes

- Scope: unchanged `project.md` (the local file uses lowercase). The kickoff instructions were supplied in chat; no `KICKOFF.md` was present.
- Work offline except dependency installs. Never commit, export, log, or serve private rows, URLs, point locations, identifiers, or private model artifacts. Use `docs/progress/` for checkpoints.
- Keep tracks segregated. The local REAL audit and aggregate reports are gitignored pending owner disclosure review. Never interpret a coverage gap as safety. Never treat infrastructure as documented movement. No individual scoring, automatic action or operational accuracy claims.
- Never drop chronological evaluation, baselines, the leakage test, abstention, limitations or track/freshness notices.

## Assumptions

- Source CSVs, not Parquet/unified copies or totals, define the private news + High Court universe. Outside-state supplement has no Kerala district and isn't appended. The raw audit is `docs/progress/DATA_AUDIT_REAL.md` locally.
- Standard district aliases and a fixed place allowlist are used, not guessed matches or external geocoding. News publication and court judgment control availability; missing dates are not imputed. Equal court dates are used as supplied and flagged; reversed dates are excluded. Conservative exact-place/weight near-date matching may miss duplicates.
- Linked secondary news references have no reliable date; only dated distinct primary articles enter monthly source volume. Court routes are gated on judgment availability and require two explicit usable endpoints.
- No agency integration, official denominators or campaign dates assumed.
