# NarcoTrace · Speaker script (4 speakers)

Hackfinity 2026 · TOOFAN · St. John's School, Anchal · 28 November 2026

**Target length:** about 13 minutes plus Q&A. A 7-minute cut is at the end.
**Deck:** open `Presentation/index.html` in Chrome, press `F` for fullscreen and `→` to advance. Scene numbers below match the counter at the bottom right of the deck.
**Live demo:** start the app first (`cd frontend && npm run start`), then open http://127.0.0.1:3000.

## Who speaks when

| Speaker | Role | Scenes | Time |
|---|---|---|---|
| **S1 · [Leader · name]** | Team lead. Problem and vision | 1–9, then 33–35 | ~4 min |
| **S2 · [name]** | Research and data | 10–17 | ~3 min |
| **S3 · [name]** | Models and accuracy | 18–24 | ~3 min |
| **S4 · [name]** | Product, demo and safeguards | 25–32 | ~3 min |

## How to read the tags

- Lines with no tag are **fact**. Each one is backed by a number on screen or in our docs. Say them plainly and defend them in Q&A.
- **◆ PITCH** lines are vision, framing or an illustrative scenario. Say them with full confidence. They show where this goes; they are never presented as a measured result.
- **Never bluff these four things.** A judge who checks will sink the whole pitch:
  1. We have **no** partnership, approval or data from Police or Excise. We asked and were refused (see scene 17).
  2. NarcoTrace is **not deployed**. It is a working prototype.
  3. It forecasts **reported seizures**, not drug users or individuals.
  4. Every accuracy number has its comparison next to it.

---

## S1 · LEADER: opening and the problem (scenes 1–9)

**[1 · Cold open]** *(Let the title animate. Pause for a beat. Move the cursor over the map.)*

> Good morning. Every month in Kerala, thousands of drug cases are recorded. Every single one is recorded *after* the drugs have already reached a town, a bus stand or a school gate.
> We asked a simple question: what if we could see it coming?
> This is **NarcoTrace**.

**[2 · Agenda]**

> I'm [Leader], and I lead the team. With me are [S2], who led our research and data; [S3], who built and tested the models; and [S4], who built the product you'll see live.
> We've built our story around how you'll judge us: research, a working prototype, and how we present it. Six short acts.

**[3 · Act I]**

> Act one: the problem.

**[4 · The curve]** *(press → twice for the two notes)*

> This is Kerala Excise's own record. In 2016 they recorded about 3,000 NDPS cases. In 2025 it was 12,566: more than four times as many, in nine years.
> In October 2024 the public uploads stopped. We recovered the missing years from a Legislative Assembly answer and the live Excise website.

**[5 · Kerala leads India]**

> And it's not just a Kerala story. It's a national one. In 2023 Kerala registered 30,697 NDPS cases, the most of any state in India: twice Maharashtra and almost three times Punjab. That's about one in every four NDPS cases in the country.
> The age is the part that should worry everyone. In an Excise study of 600 young people under 19 who were arrested or in treatment, 70% started using between the ages of **10 and 15**.
> One honest caveat: 93.7% of NDPS arrests nationally are for possession. A high count partly means Kerala enforces hard. We keep that in mind all the way through.

**[6 · It is everywhere]** *(the map plays by itself; hover one district)*

> Per person, no district is spared: coast, highlands or city.

**[7 · Always one step behind]**

> We found three failures. First, enforcement learns *where* only after a seizure. Second, official data goes dark: the uploads stopped for nearly two years. Third, help is far away: one in five Keralites lives more than 10 km from a de-addiction centre. In Idukki it's almost half.

**[8 · Act II]**

> Act two: why this matters.

**[9 · Prevention is better than cure]** *(slow down here. This is the heart of the pitch.)*

> We all grew up hearing that prevention is better than cure. But look at how we respond to drugs. A seizure means the drugs already arrived. A treatment admission comes years after first use. Awareness drives go everywhere equally, because nobody knows where they're needed most.
> The UN Office on Drugs and Crime estimates that every rupee spent on prevention saves around ten later. But prevention only works if you know **where** and **when**.
> ◆ PITCH: That's what NarcoTrace is: a forecast for drug harm. Think of a cyclone warning. It doesn't stop the storm, but it gives people time to act. We want to give Kerala that time.
> [S2] will show you how we built it.

---

## S2 · RESEARCH AND DATA (scenes 10–17)

**[10 · The distance to help]** *(click People → Distance to help → Affected & far)*

> Each dot is one square kilometre of Kerala: 46,057 of them, covering 34.7 million people.
> *(click)* Here's how far each one is from a de-addiction centre. We located all 322 centres.
> *(click)* Now just the drug-affected areas. **1.65 million people** live in drug-affected areas more than 10 km from help. That's where a new centre or outreach van would do the most good.

**[11 · A blind spot is not a safe spot]**

> Before going further, three principles. We forecast what agencies *record*, and that follows enforcement as well as drugs. Missing data is shown as unknown, never as safe. And it covers places only, never people.

**[12 · Act III]**

> Act three: the research. This is where our biggest challenge was.

**[13 · Data archaeology]**

> Kerala had no clean dataset. Excise posts its monthly statements as PDFs and then takes them down. We dug every archived copy out of the Internet Archive: 105 months, 2016 to 2024, all 14 districts, no gaps. Every month was checked against its own printed statewide total.

**[14 · Reading 628,964 stories]** *(→ three times)*

> For the finer question of *which locality*, we used the news as a sensor. We scanned 628,964 Kerala stories from six newsrooms, placed 85,708 on the map, and pinned **1,979 drug seizures** to a locality.
> *(→)* English papers over-cover Kochi and Thiruvananthapuram, so we built a **Malayalam geocoder**. It reads the dateline, the place where the seizure happened…
> *(→)* …and ignores "സ്വദേശി", someone's hometown, which is a different place.
> *(→)* It agrees with the English geocoder to within 3 km 82% of the time, and it found 628 seizures that English alone missed. Malappuram went from about 30 located seizures to 218.

**[15 · Every source we used]**

> Fourteen sources in all, combined onto one map.

**[16 · What the research revealed]**

> Three discoveries. 74% of seizures come back to a locality that had one before. Places matter: within half a kilometre of a railway station, reported seizures are 5.2 times more likely. And the news has blind spots, which we measured and corrected for.

**[17 · We went to the source]** *(say this plainly. Honesty here earns trust for everything after.)*

> Now the honest part. The best training data would be official case files: dated, located, verified. So we went to the source. We approached **Police and Excise officers** in the sector and asked for case data.
> They couldn't give it to us. Partly it was timing, and partly it was legal: NDPS case records involve live prosecutions and personal details, and sharing them needs formal clearance.
> So we built everything from the public record instead: archived statements, an Assembly answer and over six hundred thousand news stories.
> ◆ PITCH: And that turned into a strength. Every number you've seen can be checked by anyone in this room. And the system is built to take official records the day they're shared. Imagine what it does with the real files.
> [S3] will show you how accurate it already is.

---

## S3 · MODELS AND ACCURACY (scenes 18–24)

**[18 · Act IV]**

> Act four: how it works. One rule we never break: we write down each model's design *before* it sees the test data, and we score it once.

**[19 · The pipeline]**

> Raw records come in, get verified and placed on the map, then go to two forecasting models, a recovery-access layer, and a ledger that checks every forecast against reality.

**[20 · Model 1 · District month]**

> Model one forecasts next month's cases for all 14 districts, with a range. We trained it on 2016 to 2022 and tested it once on 21 months it had never seen.
> Its average error was 8.7 cases per district-month, against 9.3 for the best simple method. Bias was almost zero. The 80% range held 82% of the time. Its two "hot district" alerts a month were right 38% of the time, about double the 18% base rate.
> Honestly, the gain is modest, and forecasts two or three months out lost to simple averages. So we don't issue them.

**[21 · Model 2 · The 1 km grid]** *(→ twice)*

> Model two is sharper: which square kilometre, in the next four weeks?
> Our key insight: if you forecast *reported* seizures, you have to model how reports get located. Only 5,754 of Kerala's 46,057 squares can ever receive a located report. Our first model wasted more than half its picks outside them.
> *(→)* The ranker is a LightGBM model. It learns from each square's history, nearby activity, news coverage, surroundings and season, and it's refitted every quarter.
> *(→)* It flags 461 squares. That's 1% of Kerala.

**[22 · Scientific discipline]**

> To test it fairly, we froze time. Pre-registered, scored once, never trained on the future, and it withholds a forecast when its data is stale.

**[23 · Act V]**

> Act five: the prototype.

**[24 · The frozen forecast test]** *(click "Run Jul → Nov 2026" and let it play)*

> We locked the model on 30 June 2026, then let five months happen.
> *(as it plays)* After July, 263 seizures were reported at known localities. **85% of them fell inside the 1% of Kerala we had flagged.** Our first model got 63%. Of our top 20 places, 19 had a seizure reported within 2 km.
> And where it's weak: of 43 places that had never been reported before, it caught 9. Predicting brand-new places is still hard, and we say so.
> [S4] will show you the product.

---

## S4 · PRODUCT, DEMO AND SAFEGUARDS (scenes 25–32)

**[25 · Enforcement view]** *(click through the thumbnails)*

> This is what an analyst sees: where to look in the next four weeks, ranked. Click a place to see why it was picked, how many reports to expect, and its track record. It also shows areas rising faster than their own history.

**[26 · Public view]**

> And this is the public side: the nearest help from any spot, helplines, and the drug-affected areas that are far from care. All of it is in **Malayalam** as well as English.

**[27 · What's genuinely new]**

> Five things nobody had built for Kerala. A forecast that understands how seizures get reported, which took us from 63% to 85%. A Malayalam geocoder. A ledger that scores itself every week and reverts automatically if the new model falls behind. A public tip form designed to resist bias. And enforcement and care in one system.

**[28 · LIVE]** *(switch to the browser. Keep it under 90 seconds.)*

> Let's see it live.
> 1. **Enforcement → priority list:** "This week's top places." Click one: "here's why."
> 2. **Public → Near me:** "Nearest centre and its distance."
> 3. Switch to **മലയാളം**.
> 4. **Report tab:** "A tip is only what and roughly where, never who."
>
> *(Switch back to the deck.)*

**[29 · Act VI]**

> Act six: in the field.

**[30 · A week with NarcoTrace]**

> ◆ PITCH: Picture a Monday in a district Excise office. The four-week list updates. The analyst opens it, sees three places rising near a railway station, reads why, and decides where awareness drives and patrols go that week. Nothing is dispatched automatically; a person decides.
> ◆ PITCH: That same morning, a health planner sees that a drug-affected panchayat in Idukki is 25 km from help, and that's where the next outreach camp goes. And a parent in Malappuram finds the nearest counselling centre in Malayalam, in two taps.
> Four weeks later the ledger checks every call against what actually happened. The loop corrects itself.

**[31 · Why you can trust it]**

> We put every number next to the simplest alternative, including where we're weak. A simple rule, "reported before, then most news", comes close overall. Our real edge is on first-time places: 38% against 25%. And it measures reports, not drugs.

**[32 · Safeguards by design]**

> Safeguards are in the code, not just the slides. There are no names or houses: tips have no fields for people, phones or vehicles. Five independent people must report an area on two different days before it shows. There is no public tip map. And tips never train the model.
> For emergencies we point to the official lines: 112, Yodhav, Excise and the de-addiction helpline 14446.
> Back to [Leader].

---

## S1 · LEADER: vision and close (scenes 33–35)

**[33 · What's next]**

> Here's what comes next. From December, a weekly ledger tests us on the real future, and the first score lands on 27 December. We have two asks: station-level counts from Excise and Police, and care admissions by taluk from Vimukthi and the Directorate of Health Services.

**[34 · The vision]** *(slow, confident)*

> ◆ PITCH: Today NarcoTrace gives foresight from public data. With official data, it becomes precise to the station. With treatment and wastewater data, it measures where people are actually being hurt, anonymously. And ultimately, Excise, Police, Health, Education and every panchayat plan prevention from **one shared map**, before the harm.
> ◆ PITCH: Our goal isn't to catch more people. It's for fewer people ever to need catching, or treatment.

**[35 · Finale]**

> NarcoTrace: **see it earlier, reach them sooner.**
> We're [Leader], [S2], [S3] and [S4]. Thank you, and we'd love your questions.

---

## Q&A prep: who answers what

| Likely question | Who | Answer, in short |
|---|---|---|
| "Isn't this just predicting where police already go?" | S3 | Partly, and we say so on screen. That's why every result sits next to the "same place again" baseline. Our measured edge is on first-time places, 38% vs 25%. Official station data would reduce this bias. |
| "Why didn't you use official data?" | S2 | We asked Police and Excise officers. Timing and legal limits on NDPS case files stopped it. So we used only public records, which anyone can audit. The pipeline takes official data the day it's shared. |
| "How accurate is it, really?" | S3 | Frozen on 30 June: 85% of 263 later reported seizures fell in the 1% of Kerala we flagged, against 63% for our first model. 19 of the top 20 places were hit. New places: 9 of 43. District model: error 8.7 vs 9.3. |
| "Is news data reliable?" | S2 | It's a selected sample: city desks are over-covered. We measured that (62% of English reports came from two districts) and added Malayalam sources, which raised Malappuram from about 30 located seizures to 218. |
| "Could this be misused to target communities?" | S4 | It shows places, never people. There are no person fields, there's no public tip map, notes about faith, caste or origin are held back, and small counts are suppressed. A human always decides. |
| "What happens when it's wrong?" | S3 | The weekly ledger scores every list after four weeks, and the new model reverts automatically if it trails the old one over Dec–May. |
| "Is it deployed or being used?" | S1 | No. It's a working prototype. We're looking for a pilot with Excise or a district administration. |
| "What does it cost to run?" | S4 | It runs on one laptop: open-source tools, public data, no paid APIs. |
| "What did each of you do?" | All | Each person gives one sentence about their own part. **Prepare this.** |

**If you don't know:** say "That's a fair question. We haven't tested that yet, and here's how we would." Never make up a number.

---

## The 7-minute cut

If time is short, skip scenes **6, 11, 15, 19, 22, 26, 30** and shorten the demo to the priority list and Malayalam only. Keep 9 (prevention), 17 (data problem), 24 (frozen test) and 34 (vision): they carry the story.

## Sources for the outside numbers (scenes 5 and 9)

- NCRB 2023: Kerala 30,697 NDPS cases, Maharashtra 15,610, Punjab 11,589, India 1,20,010. [ThePrint](https://theprint.in/india/kerala-records-most-cases-under-ndps-anti-narcotics-law-j-k-highest-among-uts-govt/2893971), [Devdiscourse](https://www.devdiscourse.com/article/law-order/3858352-kerala-leads-ndps-act-case-surge-in-2023)
- 2024: Kerala 27,701 against Punjab 9,025 (Rajya Sabha). [Tribune](https://www.tribuneindia.com/news/punjab/trend-declining-but-punjab-witnesses-2nd-highest-number-of-ndps-act-cases-in-2024)
- 93.7% of NDPS arrests are for possession. [The News Minute](https://www.thenewsminute.com/kerala/kerala-has-a-drug-problem-but-it-isnt-indias-new-drug-capital)
- Excise adolescent survey (600 under-19s, arrested or in Vimukthi treatment; not a general sample): 70% started between ages 10 and 15. [Onmanorama](https://onmanorama.com/news/kerala/2023/01/29/excise-dept-survey-sheds-light-on-teen-drug-abuse.html), [The News Minute](https://www.thenewsminute.com/kerala/ganja-most-consumed-drug-among-adolescents-kerala-shows-excise-survey-172663)
- UNODC: at least 10 saved in future costs for every 1 spent on prevention. [UNODC prevention standards](https://unodc.org/unodc/en/prevention/prevention-standards.html)
- Everything else comes from our own pipeline. See `project.md` and `docs/MODEL_PLAN.md`.
