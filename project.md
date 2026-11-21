# Corridor (working title)

### A forecasting system for drug-movement patterns in Kerala: hackathon project document

**Hackathon:** 28 November 2026
 **Theme:** *"Create breakthrough ideas and futuristic technologies that could transform the fight against substance abuse."*
 **Status:** Team proposal. **Not** an official agency system, **not** an Operation Toofan deployment, **no** agency partnership. Never use branding or wording that implies otherwise.

> **How to use this document.** This is the single source of truth for the project: the idea, the plan, the scope, the rules and the build order. The owner is a non-technical founder directing a coding agent. The agent builds from this file and does not edit it unless the owner asks. The agent keeps its own notes, decisions and run instructions in `AGENTS.md`.

------

## 1. What this project is (the essence)

**Corridor is a forecasting tool for drug seizures in Kerala. Think of it as a weather forecast, but for where drug-related cases are likely to show up next.**

### The situation today

Police and Excise record every drug seizure: where, when, what, how much. That history mostly sits in files. Analysts decide where to focus next largely from experience and instinct.

### What Corridor does

It studies years of past cases, learns the patterns (certain districts get busier at certain times of year; certain connections between places recur), and then says something like:

> "Ernakulam, next 28 days: about 6 documented cases, likely between 3 and 10."

It shows this on a map, with the evidence behind it, so an analyst can judge whether it is worth acting on. If they think so, the tool helps them write a short brief for the responsible agency to review as a possible interception opportunity. Humans make every decision.

### What makes it different from a dashboard

1. **It looks forward, not just back.** A dashboard summarises the past. Corridor forecasts the near future (the next 7 and 28 days).
2. **It grades itself.** After a forecast period passes, we check what really happened and compare the model with a simple guess such as "next month will look like last month." If the model does worse than the simple guess somewhere, it says so. Honest scoring is the point.
3. **It admits what it does not know.** If an area has thin or patchy data, the map shows **"unknown", not "safe"**, and the model **refuses to forecast** rather than bluff.

### What it is *not*

- **Not an official police or agency system.** It is a team proposal inspired by Kerala's Operation Toofan, with no agency partnership.
- **Not a predictor of all drug movement.** The first model forecasts *documented seizure-case counts*. It does not measure all trafficking, does not predict whether an interception would succeed, and does not discover unknown corridors. It is a first step toward movement and interception forecasting, and we say so everywhere.
- **Not a tool that targets people.** It works at the level of places and connections only. No individuals, no suspicion scores.
- **Not automatic.** It never allocates resources, authorizes action, or reports anyone to authorities by itself.

### About the data

We do not have real records. The agent first builds a **realistic synthetic (fake) data generator** and builds everything on that. Everything made from it is labelled **SYNTHETIC** in files, API responses and on screen. That means the demo proves **the system works**, not that it predicts real crime. If real authorized data arrives later, it goes through the same pipeline and is reported **separately**.

### The parts you will see

- A **forecasting model**, which is the core.
- A **report card** that proves how well it does, including where it loses.
- A **dark map of Kerala** with history, connections, forecasts and coverage gaps.
- An **evidence panel** showing why a forecast says what it says.
- A **news inbox** where recent reports are checked by a human before they can influence anything.
- **Briefs** for agency review.

### The one-line story

> **past data → verified recent news → learned patterns → forecast on the map → measured accuracy → a brief for agency review**

Everything in this document exists to make that story work and make it honest.

------

## 2. The problem

- **Reactive by default.** Seizure data is mostly used to report what already happened.
- **Scattered signals.** Case records, recent news, field intelligence and transport context live in different places and arrive at different times.
- **No accountability for predictions.** Where forecasts exist informally, nobody measures how often they were right or whether they beat "same as last month".
- **Hidden bias.** Records reflect where police looked as much as where drugs moved. Without care, a forecast can send more attention to already-watched places and make the data even more lopsided.

------

## 3. The solution

A forecasting system plus a small analyst workspace, organised around one story:

> **historical data → reviewed recent cues → learned patterns → future geographic forecast → measured accuracy and uncertainty → agency review of a possible interception opportunity**

### The five parts

| Part                          | What it is                                                   | Role                                               |
| ----------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| **Forecasting model**         | Learns patterns from past cases; estimates documented cases for each district / known connection over 7 and 28 days | **The core**                                       |
| **Report card**               | Scores forecasts against later outcomes and against simple baselines | Proves it works (or where it doesn't)              |
| **Map workspace**             | Dark Kerala map showing history, connections, forecasts and coverage | Makes forecasts usable                             |
| **Evidence and review tools** | Evidence panel, news inbox, verification, leads              | Keeps forecasts inspectable and inputs trustworthy |
| **Briefs**                    | Editable summaries for agency review; aggregate exports      | Turns a forecast into a human decision             |

### What a forecast looks like

> "Ernakulam, next 28 days: about 6 documented cases (likely range 3 to 10). Based on seasonal pattern and two verified recent cues. Data cutoff 14 Nov. Model v3 beat the last-8-weeks baseline by 18% on held-out synthetic data. **Estimates documented cases, not all movement.**"

When data is too thin: "Wayanad: **abstained**, insufficient reported history."

------

## 4. Who it's for

- **Primary:** authorized anti-narcotics analysts and enforcement personnel, initially district level in Kerala Police or Excise. They use forecasts *alongside* their own intelligence.
- **Secondary:** prevention coordinators and authorized health/rehabilitation planners, using suitable aggregate findings.

The platform **supports human decisions**. It never allocates resources, authorizes enforcement action, or reports anyone to authorities automatically.

------

## 5. What makes this hackathon-worthy

- **Breakthrough angle:** from "what happened" to "what's likely next, with measured honesty about how good that is".
- **Rigour judges rarely see:** chronological testing, leak-proof design, baseline comparison, abstention, coverage-aware maps.
- **Responsible by design:** aggregate only, no individuals, bias and feedback-loop auditing, human review, persistent "not official" notice.
- **A complete story in a demo:** one clear flow from data to forecast to brief.
- **Realistic next step:** a clear, data-source-agnostic path from synthetic demo to agency-led evaluation.

------

## 6. Honest status: what is and isn't real

| Real in this project                                         | Not real / not claimed           |
| ------------------------------------------------------------ | -------------------------------- |
| Working pipeline: synthetic data → features → models → evaluation → forecasts | Real-world accuracy              |
| Leak-proof testing and baseline comparison                   | Operational readiness            |
| Map, evidence, review and brief workspace                    | Live agency data or integration  |
| Honest abstention and coverage display                       | Proof that forecasts reduce harm |

All data is **synthetic**. Results show the implementation works, not that it predicts real crime. The demo says this up front. If real authorized data arrives, it is run through the same pipeline and reported **separately**.

------

## 7. Scope

### 7.1 Must-have (the product is incomplete without these)

1. Synthetic data generator, normalisation and deduplication.
2. Leak-proof feature pipeline (hard prediction-cutoff guard).
3. Baselines + Poisson gradient-boosting models, **area** and **corridor**, at **7 and 28 days**.
4. Chronological evaluation, report card (JSON + HTML), including where the model loses.
5. Batch forecast job with the full forecast record and **abstention**.
6. Dark Kerala map with history, connections, forecasts and a coverage layer.
7. Evidence panel and model-report viewer.
8. Persistent disclaimer, SYNTHETIC tags, freshness labels, limitation notices.

### 7.2 Should-have

1. API (Cloudflare Worker + local D1) for review queue, cues, leads and briefs.
2. RSS/Atom collector with news review inbox, duplicate detection and verified-cue flow (fixture feed for demo; no live feed enabled by default).
3. Editable briefs with aggregate export.
4. Private community-lead workflow (never feeds training).
5. Demo-only analyst/planner role switch.

### 7.3 Stretch (cut first, in this order)

Graph/network models → extra filters → LLM-assisted extraction → prevention/recovery planner view.

> **Never cut:** the evaluation, the baseline comparison, the leak test, the limitations messaging.

### 7.4 Explicitly out of scope

Live agency integration; live inference service; individual-level prediction of any kind; automatic retraining; public allegation feeds; any real source records in the demo.

------

## 8. How it works (plain English, then technical)

### Step by step

1. **Generate realistic fake cases** for Kerala's 14 districts, with seasons, known connections, delays, uneven coverage and missing fields.
2. **Clean them:** one row per case, duplicates merged, unknowns kept as unknown.
3. **Build features**, such as recent counts, seasonality, area and coverage, using *only what was knowable at the forecast date*.
4. **Train and test** the model on earlier periods; test on later ones it has never seen; compare with simple baselines.
5. **Produce forecasts** for the next 7 and 28 days, with ranges and "abstain" where data is thin.
6. **Show them on a map** with evidence and limitations; let analysts review, verify news cues, and write briefs.
7. **Measure** forecast errors against later outcomes so the next version improves.

### Technical stack

- **Website:** React + TypeScript + Leaflet (Vite fine).
- **API:** Cloudflare Worker + D1 (use local D1 via `wrangler dev`; deployment optional).
- **ML:** local Python (pandas, scikit-learn) as separate batch scripts.
- **Inference:** a **batch forecast job** writing a timestamped `forecasts.json`; the API/UI serve it with a freshness label. No live inference service.
- **Static-first shortcut:** ML writes static JSON (`cases_synthetic.json`, `forecasts.json`, `eval_report.json`) that the web app can read directly from day one. The Worker/D1 holds only stateful items: review queue, cues, leads, briefs.

### Repository layout

```
/
├── web/        React + TS + Leaflet
├── worker/     Cloudflare Worker + D1 schema
├── ml/
│   ├── data/       generator, loaders, normalize/dedupe (real/ is gitignored)
│   ├── features/   feature builders + cutoff guard
│   ├── train/      baselines + Poisson GBM, versioned models
│   ├── evaluate/   rolling-origin evaluation, metrics, reports
│   ├── forecast/   batch forecast job, abstention
│   ├── collector/  RSS/Atom collector + duplicate detection
│   ├── docs/       data-collection guide, notes
│   └── tests/
├── shared/     canonical schema + forecast record contract
├── AGENTS.md   agent notes, assumptions, how to run
├── PROJECT.md  this file
└── README.md
```

------

## 9. The data

### 9.1 Canonical case schema (one row per **case**, not per article)

| Group      | Fields                                                       |
| ---------- | ------------------------------------------------------------ |
| Identity   | `case_id`, `source_ref`, `agency`, `evidence_status`, `independent_corroboration` |
| Time       | `event_date`, `first_available_date`, `verified_date`, `withdrawn`, `correction_history` |
| Place      | seizure location, `origin`, `destination`, `transit_points`, each with `geo_precision` and uncertainty |
| Substance  | `substance_category`, `quantity`, explicit `unit`            |
| Movement   | `transport_mode`, `linked_case_ids`                          |
| Coverage   | reporting completeness by area/connection/period; aggregate enforcement or observation effort |
| Provenance | `source_permissions`, `coverage_definition`, `revisions`, `extraction_date`, `synthetic` |

Define once as shared types (TypeScript + Python) and keep them in sync.

### 9.2 Data rules

- **Unknown is not zero.** Missing locations, endpoints, quantities and coverage stay unknown.
- Several reports of one case = **one event**.
- Never expand annual totals or public statistics into invented case records; never treat them as proof of routes.
- Keep seizure-only observations separate from documented-route records.
- Claims apply only to the authorized reporting universe.
- **`first_available_date` (when the record could have been known) controls what the model may see.** This is the heart of leak protection.

### 9.3 Synthetic data generator (required)

Two layers, so the system can be tested honestly:

1. **Hidden truth:** activity per area per day = base rate × seasonality × slow trend × occasional connection "surges".
2. **What gets reported:** observed cases ≈ Poisson(activity × enforcement effort × coverage), then reporting delay (`first_available_date`), later verification, a few withdrawals/corrections, and mess: missing fields, mixed units, syndicated duplicates.

Requirements:

- 14 Kerala districts plus a few **outside-Kerala nodes** as origins/transit.
- About **8 to 12 directed connections**. **Invented for testing; not claims about real routes.** Say so in docs and UI.
- ~4 years of history (≥2 seasonal cycles + training, calibration and final held-out windows).
- Uneven coverage; some districts deliberately thin (to exercise abstention).
- Fixed seed; configurable.
- Every row `synthetic = true`; every derived file, API response and UI view labelled SYNTHETIC.
- **Data-source agnostic:** the pipeline reads the canonical schema only, so real data can be loaded later through a loader with no model changes.

### 9.4 Real data (optional, later)

If the owner obtains authorized data:

- Keep in a **gitignored** folder (e.g. `ml/data/real/`). Never commit, never show publicly, never send to the web app or hosted service.
- **Data audit first** (rows, date range, field fill rates, duplicates, unit issues, thin districts). Owner sees it before any modelling.
- Write a loader mapping columns to the schema, **list every assumption**, keep unknowns unknown. If `first_available_date` is missing, assume a typical delay and record it.
- Strip/refuse personal names and IDs.
- Run the same pipeline → **separate report labelled REAL**. Never mix with synthetic results.
- Rules of thumb for workable data (not guarantees): ≥2 years (3+ better); ~1,000+ cases at district level; several per district per month; ~30 to 50 per connection for corridor testing. Thin areas should abstain. Aggregate-only totals can give context, not 7-day forecasts.

### 9.5 Reference sources (context only; none assumed available)

Kerala Police NDPS/special-law statistics (aggregate context) · UNODC individual drug seizure data and guidelines (schema/limitations) · public Kerala geography from OpenStreetMap / geoBoundaries / DataMeet, **with attribution**.

------

## 10. The forecasting model

### 10.1 What is forecast first

Over **7-day and 28-day** horizons:

1. **Area model:** future documented seizure-case counts per district.
2. **Corridor model:** future documented counts for an **already-known** origin→destination connection ("known" determined only from information available at the cutoff).

### 10.2 Methods

- **Baselines (required):** last-N-days average over covered history; seasonal naive; same-period-last-year.
- **Candidate:** `HistGradientBoostingRegressor(loss="poisson")` (suited to non-negative counts).
- **Features** (all through the cutoff guard): lagged counts and rolling means (7/14/28/56/90 days), seasonality (day-of-year sin/cos, month), area/connection identity, substance and quantity summaries, coverage and effort, **verified-cue** strength (only from `verified_at` onward), and neighbouring-district counts if validated as helpful.
- Outputs: versioned model files, evaluation files, JSON + HTML reports.
- More complex models only if held-out results justify them.

### 10.3 The forecast record (contract)

Every forecast contains: `prediction_date`, `information_cutoff`, `window_start/end`, `horizon_days`; area **or** directed connection (+ transport context where supported); the exact `target`; `estimate` (count/ranking/probability as appropriate; a ranking score is **not** a probability; probabilities need validation and calibration); `interval` or explicit "uncertainty not yet established"; `supporting_patterns`, `recent_verified_cues`, `source_availability`, `coverage_gaps`; `model_version`; `synthetic`; `abstained` + `abstain_reason`.

### 10.4 Rules

- Geographic scale and horizon must match the evidence. District-level records support district-level claims only.
- A model-proposed connection is a **hypothesis** until independently supported. A road or transport link existing does not show drugs moved along it.
- New-corridor prediction needs its own evaluation. Never borrow performance claims from known corridors.
- **Evidence quality** (how well-documented an observation is) is kept separate from **model uncertainty** (how unsure the forecast is). Never show an unvalidated confidence score as a measured probability.

------

## 11. How we prove it works (evaluation)

"Accurate" always means: a defined target, resolution, horizon and outcome dataset. **No fixed accuracy percentage is ever promised.**

- **Only past information.** `visible_cases(cases, cutoff)` filters on `first_available_date <= cutoff`; every feature builder goes through it.
- **Chronological splits.** Rolling-origin (expanding window), weekly prediction dates, no shuffling. Separate training → method selection → uncertainty calibration → **final held-out period (suggest last ~12 to 16 weeks), evaluated once**.
- **Counts:** MAE and Poisson deviance vs later documented counts, overall and per area.
- **Rankings:** of the top-k areas/connections selected, how many later documented events fell inside; how many selections were supported; what was missed. **State k and the geographic extent**; compare against baseline rankings.
- Also: lead time, **interval coverage** (does a stated 80/90% range contain the outcome ~80/90% of the time?), improvement over baselines, false positives, missed events, coverage differences.
- **Report where the model loses to a baseline.**
- Evaluate new locations/connections separately wherever generalisation is claimed.
- Synthetic and real results reported separately.
- **Abstention:** configurable thresholds (minimum covered weeks, minimum coverage, minimum recent volume; defaults in a config file); report how many abstained and why.
- **Uncertainty:** start with Poisson predictive intervals from the predicted mean; measure empirical coverage on the calibration window.
- Future movement/interception targets: score against independently documented outcomes **and observation effort**; a failed search, an unobserved location and a confirmed absence are different outcomes.
- **Standing caveat:** seizure records reflect both underlying activity **and** enforcement/reporting. A good seizure-count test does not establish accurate prediction of all movement or interception. Prospective agency-led evaluation is needed before any operational claim.

------

## 12. Recent signals ("real-time" cues)

"Real-time" means an explicit ingestion and forecast-refresh process with visible latency and freshness, **not** a live agency feed.

- **RSS/Atom collector** gathers item **metadata** into a review queue. **No feed enabled by default.** It never retrains the model.
- Separate fields: event date, publication date, first-seen time, verification time, source identity.
- Duplicate and syndication detection (e.g. normalised-title hash + token similarity). A headline or repeated allegation is **not** independent confirmation.
- States: `new → possible_duplicate → verified | rejected`; verifying records `verified_at` and reviewer role.
- **Unverified items never change training labels or forecasts.** Only verified items become cue features, and only **from the moment they were verified**.
- Demo uses a **fixture feed** of clearly fake items.
- LLM-assisted extraction is a later stretch; its output must carry source references and be human-verified. **Not in the first pass.**
- Aggregate context (transport activity, consumption surveys, enforcement effort, environment) may be added if available at prediction time and proven useful. Consumption data is an aggregate context measure, **never** an individual suspicion score.

------

## 13. The product, screen by screen

### Map and search

- Detailed, navigable Kerala map, scroll/touch zoom, place search (local gazetteer fine; public sources with attribution if time allows; explicit unknowns).
- Layers: historical seizures · documented movements · model forecasts · **coverage** (thin/no coverage shown distinctly, so blank reads "unknown", not "safe").
- Filters: time, geography, substance, evidence status, source; historical timeline.
- Forecast overlays for areas, connections and windows. A detailed basemap must **not** imply a district-level forecast identifies a verified street journey. Connections are arcs between district centroids / outside nodes, labelled "connection", never "route".
- **Predominantly black interface**; colour only for meaningful signals (transport, evidence, forecast). Dark basemap with proper OSM and tile-provider attribution.

### Evidence trail and review

- Per observation: clickable sources, dates, geographic precision, documentation status, qualitative evidence assessment, review history.
- Per forecast: model version, information cutoff, validation vs baselines, supporting patterns, limitations.
- Demo-only **analyst/planner role switch**, labelled "Demo only. Not a production authorization system."

### News and community

- **News inbox** with duplicate checks and provenance.
- **Private community-lead workflow:** optional contact details, human review, public intake without an account (subject to privacy design). **Raw leads never enter training**, including via automatic status changes; an independently established case must come through the structured reviewed evidence pipeline. No public allegation feed, no automatic reports to authorities, no anonymity promise beyond what is implemented (state exactly what is and isn't protected). Optional future idea: cooperation with existing reporting channels such as Yodhav; no integration assumed.

### Briefs

- Editable, role-appropriate briefs and aggregate exports (JSON/HTML). Primary use: communicate a reviewed movement/interception hypothesis, target period, evidence and uncertainty to responsible agency personnel.
- Prevention, helpline, outreach and rehabilitation planning is secondary and needs separate local evidence of need and capacity. A forecast near a school or service doesn't establish activity there or identify people needing care.

### Model report view

A browser file-picker loads a local aggregate evaluation report (baseline comparison, errors, misses, abstentions) **without uploading source records or the model**.

### Always visible

- Banner: **"Proposed by the team. Not an official agency system. Decision support only."**
- **SYNTHETIC DATA** tag on anything synthetic-derived.
- Near forecasts: "Estimates documented cases, not all drug movement. Not proof of wrongdoing. Not a sole basis for searches, arrests or enforcement."
- Freshness label: "generated at … · data cutoff …".
- Candidate connections labelled "hypothesis".

------

## 14. Safeguards and ethics

- **Aggregate level only.** No personal names, IDs, gender, individual consumer records, live GPS. No individual suspicion scores or demographic proxies.
- **Missing ≠ safe.** Audit differences in enforcement effort, source availability, coverage and errors across areas, **including feedback loops** (acting on forecasts changes what gets recorded). Include an audit section in the product.
- Preserve provenance, model/input versions and review history.
- Real source records never appear in any public demo. Aggregate outputs need disclosure review; a minimum-group threshold alone doesn't guarantee anonymity.
- Forecasts are decision support, not proof of wrongdoing or a sole basis for action.
- Distinguish **observations, unverified claims and model hypotheses** throughout.
- Could it harm communities? **Yes**, biased observation and reporting can misdirect predictions. Mitigations: limited detail and disclosure, coverage and error audits, allegation vs evidence separation, authorized human review. These reduce risk; they do not guarantee fairness.

------

## 15. Plan to 28 November

Today is Sat 21 Nov. Roughly 6.5 days.

| When                   | Goal                                                         | You should see                        |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------- |
| **Sat night (Nov 21)** | Scaffold, `AGENTS.md`, shared schema                         | Folder structure, rules file          |
| **Sun (22)**           | Synthetic generator + clean/dedupe                           | A labelled fake dataset and a summary |
| **Mon (23)**           | Cutoff guard, baselines, Poisson GBM, validation             | First model scores                    |
| **Tue (24)**           | Report card, forecast job, abstention. **Freeze the ML.**    | HTML report + `forecasts.json`        |
| **Wed (25)**           | Worker/D1 + Leaflet map with layers and coverage             | Working map                           |
| **Thu (26)**           | Evidence panel, model-report viewer, notices                 | Click a forecast → see why            |
| **Fri (27)**           | RSS inbox, leads, briefs, tests, README. **Freeze all features.** | Full flow, tests green                |
| **Sat (28)**           | Rehearse and present. No new features.                       | Demo                                  |

**Make-or-break checkpoint: Tuesday.** If the model and report card aren't solid by then, drop stretch items immediately.

------

## 16. Build steps (for the agent). Each leaves the project runnable

Work **one step at a time**. After each, report to the owner in plain English (see section 17).

1. **Scaffold.** Layout, `AGENTS.md`, `README.md` stub, shared canonical schema + forecast contract as TS and Python types. *Done when:* folders exist, types compile, non-negotiables recorded.
2. **Synthetic generator + normalize/dedupe.** *Done when:* one command makes a labelled dataset; a summary shows rows, date range, missing-field rates, duplicates; dedupe test passes.
3. **Feature pipeline + cutoff guard.** *Done when:* a test injecting a case with `first_available_date` after the cutoff proves features are unchanged.
4. **Baselines + Poisson GBM (area and corridor), chronological validation, reports.** *Done when:* one command trains, evaluates and writes JSON + HTML reports with baseline comparison, per-area errors, misses, interval coverage, where the model loses; held-out period evaluated once. **Do not continue until the owner has seen and understood this report.**
5. **Batch forecast job + record contract + abstention.** *Done when:* forecasts have every required field, thin areas abstain with reasons, a freshness timestamp exists.
6. **Worker API + D1.** Endpoints (e.g. `GET /api/forecasts/latest`, `GET /api/cases`, `GET/POST /api/review-queue`, `PATCH /api/review-queue/:id`, `GET /api/cues/verified`, `POST /api/leads`, `GET/PATCH /api/leads`, `GET/POST/PUT /api/briefs`) and tables (`review_items`, `cues`, `leads`, `briefs`, `review_history`). *Done when:* local Worker runs and `synthetic: true` appears in responses.
7. **Leaflet map.** Layers, coverage, filters, timeline, search, place profiles, dark UI, attribution. *Done when:* the owner can toggle layers and see forecasts and "coverage unknown".
8. **Evidence panel + model-report viewer.** *Done when:* clicking a forecast shows version, cutoff, validation, patterns and limitations; loading `eval_report.json` works client-side with nothing uploaded.
9. **RSS collector + inbox + duplicate detection + cue flow.** *Done when:* items enter the queue, duplicates are flagged, verifying creates a cue effective only from `verified_at`.
10. **Leads, briefs, exports (planner view last).** *Done when:* a lead can be submitted and reviewed; a brief can be edited and exported.
11. **Notices, freshness, role switch, audit section.** *Done when:* banner on every screen; every synthetic-derived view tagged.
12. **Docs and tests.** README, **data-collection guide** for real authorized data, **demo script**, remaining tests. *Done when:* a newcomer can run everything from the README.

### Required tests

1. **Cutoff guard:** future-by-`first_available_date` case doesn't change features.
2. **Deduplication:** syndicated copies collapse to one case.
3. **Unknown handling:** missing fields stay unknown, never zero.
4. **Metrics:** MAE, Poisson deviance, top-k capture, interval coverage checked on tiny hand-computed examples.
5. **Chronology:** no training row's label window overlaps or follows the evaluation period.
6. **Abstention:** thin-history areas abstain with a reason.
7. **Unverified cues** never affect features or labels.
8. **Community leads** cannot reach the training pipeline.
9. **Synthetic flag** present in every derived file and API response.

------

## 17. Working method: the owner and the agent

The owner is a **non-technical founder**: they set direction, make decisions and check results, but don't read code. So the agent must:

1. **One step at a time**, leaving the project runnable and tests passing.
2. After every step, send a **plain-English report (about 10 lines):** what exists and the exact command/URL to see it; what it proves and does *not* prove; **every assumption made**; anything that looks wrong, surprising or too good.
3. **Explain jargon** in one sentence the first time it's used.
4. **Never hide bad results.** Honest losses beat flattering numbers.
5. **Never invent** facts, data, partners, names or accuracy figures; leave placeholders and tell the owner.
6. **Ask first** before anything destructive, anything touching real data, anything leaving the machine, or anything not covered here.
7. Small, meaningful commits.

**The owner's checklist after each step:** Is it labelled synthetic? Is there a baseline comparison? Does it admit where it loses? Does it abstain somewhere? Can I click a forecast and see why? Is the banner everywhere? Was any real or personal data touched?

------

## 18. Risks and how we handle them

| Risk                                        | Handling                                                     |
| ------------------------------------------- | ------------------------------------------------------------ |
| **Not enough time**                         | Freeze ML Tuesday; cut in the stated order; never cut evaluation or notices |
| **Model doesn't beat baselines**            | Show it honestly; it is still a valid, credible result; explain why |
| **Hidden leakage makes results look great** | Cutoff guard + dedicated test; owner asks to see it          |
| **Over-claiming**                           | Standing caveats on every results view; no fixed accuracy promises |
| **Bias / feedback loops**                   | Coverage layer, effort variables, audit section, human review |
| **Real data issues**                        | Permission check, audit first, gitignored, separate REAL report |
| **Boundary / map data trouble**             | Fall back to district centroid circles                       |
| **Looks "official"**                        | Persistent banner; no agency branding; name is a working title |
| **Scope creep**                             | This file is the scope; extras go to stretch list            |

------

## 19. The pitch

### The story to tell (about 5 minutes)

1. **Frame it honestly:** "A team proposal, built on synthetic data, forecasting documented cases, not an official system."
2. **The problem:** history sits unused; no one measures prediction quality; blank data gets mistaken for safety.
3. **The map:** history, connections, and areas of unknown coverage.
4. **A recent cue** is verified through the review inbox.
5. **A forecast** appears with range, evidence and limitations.
6. **The report card:** beats simple baselines *here*, loses *there*, abstains *here*.
7. **A brief** is prepared for agency review.
8. **Next step:** agency-led prospective evaluation with real, authorized data before any operational use.

### Questions we must be able to answer

- **What are you building?** A Kerala-focused forecasting model that learns historical drug logistics, movement and seizure patterns and uses verified recent cues to forecast possible future movements and interception opportunities for agency review.
- **What makes it useful?** Timely, geographically explicit forecasts with measurable performance, inspectable evidence, uncertainty, and comparison with what simple recent-history methods would predict.
- **What is implemented?** A trainable, evaluated synthetic-data pipeline for future documented area/corridor case counts, plus the geographic, evidence, review and reporting workspace. Real-time agency integration and validated interception prediction are **not** established.
- **How do you demonstrate accuracy?** Define the target and coverage, test on later unseen outcomes, compare baselines, report errors and misses, and distinguish recorded-case performance from actual movement or interception performance.
- **Could it harm communities?** Yes: biased observation and reporting can misdirect predictions. We limit detail and disclosure, audit coverage and errors, separate allegations from evidence, and require authorized human review. These reduce risk but don't guarantee fairness.
- **Is it official?** No. It's a team proposal.
- **What if the data is real?** Same schema, same pipeline, separate report; real use needs agency authorization and participation.

------

## 20. Definition of done

- [ ] One command regenerates synthetic data, trains, evaluates and writes forecasts + reports.
- [ ] Report shows baseline comparison, per-area errors, misses, interval coverage, abstentions, and where the model loses.
- [ ] Cutoff-guard test passes and has been explained to the owner.
- [ ] Map, evidence panel, report viewer, review inbox, leads and briefs work locally.
- [ ] Banner, SYNTHETIC tags, freshness labels and coverage-unknown rendering appear everywhere required.
- [ ] README, data-collection guide and demo script written; all tests pass.
- [ ] No real data, personal data or secrets in the repo.
- [ ] Owner received a final plain-English summary with every assumption and known limitation.

------

## 21. Open items (not the agent's to decide; do not invent)

- **Project name:** use "Corridor (working title)".
- **Data partner** and any real data source.
- **Operational accuracy** claims.
- **Production deployment** arrangements.

The forecasting ambition is agreed. This document defines the hackathon scope.
