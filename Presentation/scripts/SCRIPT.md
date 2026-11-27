# NarcoTrace · Speaker notes

About 12 minutes. Numbers in brackets are deck scene numbers.

## S1 · Leader: intro and problem (1–9)
- Hook: every drug case in Kerala is found *after* the drugs arrive. What if we saw it coming?
- Introduce the team and what each person did (2).
- Excise cases went from 2,985 in 2016 to 12,566 in 2025, more than four times (4).
- Kerala has the most NDPS cases in India: 30,697 in 2023, about 1 in 4 nationally. 70% of young users started between ages 10 and 15 (5).
- Three failures: action only after a seizure, official data that goes dark, help too far away (7).
- **Prevention is better than cure.** $1 on prevention saves $10, but only if you know where and when. NarcoTrace is a forecast for drug harm (9).

## S2 · Research and data (10–17)
- 1.65M people in drug-affected areas live more than 10 km from help (10).
- We recovered 105 months of Excise records from the Internet Archive (13).
- We scanned 628,964 news stories and pinned 1,979 seizures to a locality, using a Malayalam geocoder we built (14).
- Seizures repeat: 74% come back to the same locality, and they are 5.2× likelier near railway stations (16).
- **The data problem:** we asked Police and Excise officers for case files. Timing and legal limits stopped it, so everything comes from public records, and the system is ready for official data (17).

## S3 · Models and accuracy (18–24)
- District model: error 8.7 against 9.3 for the best simple method, the range held 82% of the time, and hot-district alerts were right 38% against an 18% base rate (20).
- Grid model: picks the 1% of Kerala most likely to see a reported seizure in the next four weeks (21).
- Frozen-test result: froze the model on 30 June, then 85% of 263 later seizures fell inside the flagged 1%, against 63% before. 19 of the top 20 places were hit (24).
- Be upfront: new places are still hard, with 9 of 43 caught (24).

## S4 · Product and demo (25–32)
- Enforcement view: where to look in the next four weeks, and why (25).
- Public view: nearest help, in Malayalam too (26).
- Live demo, under 90 seconds: priority list → a place's reasons → Near me → Malayalam → Report tab (28).
- Use case: the analyst plans the week, the health planner places outreach, a parent finds help (30).
- Safeguards: places, never people, and a human always decides (32).

## S1 · Leader: vision and close (33–35)
- Asks: station-level data from Police and Excise, care data from Vimukthi and DHS (33).
- Vision: one shared map for preventing drug harm across Kerala. The goal isn't catching more people; it's fewer people ever needing it (34).
- Close: "See it earlier. Reach them sooner." Then questions (35).

**Don't claim:** police backing, being deployed, or predicting drug users.
