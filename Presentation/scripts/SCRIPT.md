# NarcoTrace · 7-minute script

**Open the deck:** http://127.0.0.1:3000/ppt (or the public site + `/ppt`). For this 7-minute version open `/ppt/index.html?short` (19 slides).
`→` moves to the next slide or reveals the next item. `F` toggles fullscreen. The LIVE slides have a button that opens the app in a new tab.
Each speaker starts on their own part card.

| Time | Speaker | Part | Slides |
|---|---|---|---|
| 0:00 – 0:45 | **Maen** | Introduction | 1 |
| 0:45 – 2:15 | **Aibin** | Part I · The problem | 2–6 |
| 2:15 – 3:45 | **Kiran** | Part II · Research and data | 7–10 |
| 3:45 – 5:30 | **Maen** | Part III · How it works, results, enforcement demo | 11–15 |
| 5:30 – 7:00 | **Yaris** | Part IV · Public demo, vision and close | 16–19 |

*Italic lines are actions. Everything else is spoken.*

---

## MAEN · Introduction (45 sec)

**[1 · Title]**

Good morning. I'm Maen, and with me are Aibin, Kiran and Yaris. We are **NarcoTrace**.

Kerala today detects drug activity only after it has happened: after the drugs reach a town, a bus stand, a school. Every response starts too late.

NarcoTrace changes that. It forecasts **where drug activity in Kerala is likely to surface in the next four weeks**, down to a single square kilometre. It also shows **where people in drug-affected areas are too far from treatment**. We built it, tested it against real outcomes, and it works today.

Aibin will set out the problem.

---

## AIBIN · The problem (1 min 30 sec)

**[2 · Part I card]** *→*

**[3 · The curve]** *→ twice for the notes, then → to move on.*

Kerala Excise recorded about **3,000 drug cases in 2016. In 2025, 12,566.** That is more than four times as many in nine years.

**[4 · Kerala leads India]**

This is now the largest drug-case burden of any state in India. In 2023 Kerala registered **30,697 cases**: double Maharashtra, nearly three times Punjab, and **one in four** of all such cases in the country.

The most serious figure is on the right. Among young people arrested or in treatment, **70% started using between the ages of 10 and 15.**

**[5 · Always one step behind]**

The response has three structural gaps.
- **Enforcement is reactive.** Officers learn where activity is only after a seizure.
- **Official data goes dark.** Monthly reports stopped being published for almost two years.
- **Treatment is out of reach.** One in five residents lives more than 10 km from a de-addiction centre. In Idukki it is nearly half.

**[6 · Prevention is better than cure]**

Prevention is better than cure, and it is also cheaper: the UN estimates that **every dollar spent on prevention saves at least ten**. But prevention needs two things: knowing **where the problem is heading**, and knowing **where help is missing**. Kerala has neither today. That is the gap NarcoTrace fills.

Kiran will explain how we built the data.

---

## KIRAN · Research and data (1 min 30 sec)

**[7 · Part II card]** *→*

**[8 · We went to the source]**

A forecasting model is only as good as its training data. The ideal source is official case files, so **we contacted Police and Excise officers and requested them.**

The request was declined. Approval takes time, and these files are legally protected because they involve ongoing prosecutions and personal details. So we built the dataset ourselves, from public records only.

**[9 · Where we looked for data]**

- **Case files:** declined.
- **Excise website:** it publishes only the current month and removes earlier reports.
- **Internet Archive:** we recovered **105 months** of the removed reports, 2016 to 2024, for all 14 districts, and verified each one against its printed state total.
- **Kerala Assembly:** when publication stopped in 2024, an answer tabled in the Assembly supplied 2025 and 2026.
- **News:** official figures stop at the district level. To get the exact location of seizures, we turned to ten years of news.

**[10 · Reading ten years of news]** *→ for each step.*

We analysed **628,964 Kerala news stories** and extracted **1,979 drug seizures** with an exact town or village.

English coverage is concentrated in Kochi and Thiruvananthapuram, so we built a **Malayalam news reader**. *(→)* It identifies where a seizure took place from the story's dateline. *(→)* It ignores the accused's home town, which is a different place. *(→)* That added **628 seizures** that English sources missed, mostly from rural districts.

The result is a verified dataset that did not exist before, built entirely from public sources. And the system is ready to take official data the moment it is shared.

Maen will show what the model does with it.

---

## MAEN · How it works and the enforcement demo (1 min 45 sec)

**[11 · Part III card]** *→*

**[12 · Forecast 2 · By square kilometre]** *→ twice.*

We divide Kerala into **46,057 squares of one square kilometre**. Each week, the model scores every square on four signals: its seizure history, activity in neighbouring squares, local news coverage, and its surroundings, such as railway stations and highways. It then selects the **1% of Kerala most likely to see a seizure in the next four weeks.**

Our key finding was that the model must learn **where seizures get reported**, not only where drugs move. That single change raised accuracy from 63% to 85%.

**[13 · The locked-forecast test]** *It plays by itself.*

To test it fairly, we **locked the forecast on 30 June** and compared it with what actually happened over the next five months. No adjustments were made after the lock.

**[14 · The scorecard]**

- **Accuracy: 84.8%.** Of 263 seizures reported afterwards, 223 fell inside the 1% of Kerala we had flagged.
- **Precision: 48.5%.** Nearly half of our top 20 squares had a seizure within four weeks.
- **Error rate: 15.2%.**
- **19 of the top 20** places had a seizure nearby.

The limit: places with no history are harder, at 21%. We report that openly, because a tool used by officers has to be trustworthy.

**[15 · LIVE · Enforcement]** *Click "Open enforcement" on the slide.*

This is the view for Excise and Police analysts.
- *Priority tab:* the areas to focus on over the next four weeks.
- *Click the first place:* the reasons behind it: past seizures, nearby activity, and expected reports.
- *Emerging tab:* areas rising faster than their own history.

It identifies **places, never people**, and every decision stays with an officer.

Yaris will show the public side.

---

## YARIS · Public demo, vision and close (1 min 30 sec)

**[16 · Part IV card]** *→*

**[17 · LIVE · Public]** *Click "Open public" on the slide.*

Drug abuse is a health problem as much as a policing problem. This side is for the public and for health planners.
- *◎ Near me:* the nearest de-addiction centre from any location.
- *Far from help:* drug-affected areas that are far from treatment. These are where a new centre or outreach camp would have the greatest impact.
- *Malayalam:* the full interface is available in Malayalam.
- *Report:* the public can report a concern, saying what and roughly where, never who. An area appears only after five independent people report it on different days, which prevents misuse.

*Switch back to the deck.*

**[18 · The vision]**

Today NarcoTrace runs on public data. With official station-level data, it becomes precise to the police station. With treatment data, it measures where people are being harmed, not only where seizures happen.

Our vision is **one shared map for Kerala**, used by Excise, Police, Health, schools and panchayats to plan prevention together, **before** the harm happens. The aim is not more arrests. It is fewer people ever reaching the point of arrest or treatment.

**[19 · Finale]**

NarcoTrace: **see it earlier, reach them sooner.** Thank you. We welcome your questions.

---

## Q&A: who answers

- **Maen:** the model, accuracy, technology
- **Kiran:** data sources, and why no official files
- **Aibin:** the problem and its statistics
- **Yaris:** safety, misuse, future plans, and passing other questions to the right person

**Never claim** police backing, that it is already deployed, or that it identifies drug users.
**If you're running over time**, keep only the first step of each demo.
