# NarcoTrace · 7-minute script

**Open the deck in short mode:** `Presentation/index.html?short`. It has 14 scenes. `→` moves to the next scene or reveals the next item on a slide.
**Before you start:** open http://127.0.0.1:3000/enforcement and http://127.0.0.1:3000/public in two browser tabs, ready for the demo.

| Time | Speaker | Part | Slides |
|---|---|---|---|
| 0:00 – 0:45 | **Maen** | Introduction | 1 |
| 0:45 – 2:15 | **Aibin** | The problem | 2–5 |
| 2:15 – 3:45 | **Kiran** | Research and data | 6–8 |
| 3:45 – 5:30 | **Maen** | How it works, scorecard, enforcement demo | 9–12 |
| 5:30 – 7:00 | **Yaris** | Public demo, vision and close | 12–14 |

*Italic lines are actions. Everything else is spoken.*

---

## MAEN · Introduction (45 sec)

**[1 · Title]**

Good morning. I'm Maen, and this is Aibin, Kiran and Yaris. We are **NarcoTrace**.

One thing bothered us. In Kerala, every drug case is found *after* the drugs have already arrived: in a town, at a bus stand, outside a school. We are always one step behind.

So we asked a simple question: **what if we could see it coming?**

NarcoTrace is an AI system that predicts where drug trouble in Kerala is heading next, and shows where people are too far from help. Aibin will start with the problem.

---

## AIBIN · The problem (1 min 30 sec)

**[2 · The curve]** *Press → twice to show the notes, then → to move on.*

Look at this line. In 2016, Kerala Excise recorded about 3,000 drug cases. In 2025, more than 12,500. That's over **four times as many in nine years**.

**[3 · Kerala leads India]**

And this isn't a small problem. In 2023, Kerala had **more drug cases than any other state in India**: twice Maharashtra and almost three times Punjab. One in every four drug cases in the country was in Kerala.

The number that hurts most is on the right. Of the young people caught with drugs or in treatment, **seven out of ten started between the ages of ten and fifteen.** They're children.

**[4 · Always one step behind]**

So why does it keep growing? Because the system only **reacts**.
- Police find out *where* only after a seizure.
- Official data stopped being published for almost two years.
- And one in five people in Kerala lives more than 10 km from a de-addiction centre.

**[5 · Prevention is better than cure]** *Slow down here.*

We all grew up hearing that prevention is better than cure. The United Nations estimates that **every one dollar spent on prevention saves ten later**.

But you can't prevent what you can't see. Prevention needs two things: **where the trouble is heading, and where help is missing.** That is exactly what we built. Kiran will show you how we found the data, and it wasn't easy.

---

## KIRAN · Research and data (1 min 30 sec)

**[6 · Data archaeology]**

To predict anything, you need data, and Kerala had no ready dataset. The Excise department posts its monthly reports online, then takes them down. So we **dug them out of the Internet Archive**: 105 months, from 2016 to 2024, for all 14 districts. We checked every month against its own official total.

**[7 · News as a sensor]** *Press → for each step.*

That tells you *which district*. To find *which town*, we turned the news into a sensor. We scanned **over six lakh news stories** and found **1,979 drug seizures** with an exact place.

English papers mostly cover Kochi and Thiruvananthapuram, so we built a **Malayalam reader**. *(→)* It knows that "Perumbavoor:" at the start of a story means the seizure happened there. *(→)* It also knows that "Aluva swadeshi" only means where the person is from. *(→)* That found **628 seizures that English news alone missed.**

**[8 · We went to the source]**

Now the honest part. The best data would be real case files, so we went to the source. **We contacted Police and Excise officers and asked for them.** They couldn't share them in time, and the law protects those files because they involve ongoing cases and personal details.

So we built everything from **public records**, and that became our strength. Every number you see can be checked by anyone. And the day official data is shared, NarcoTrace is ready for it.

Maen will show you what the AI does with this data.

---

## MAEN · How it works and the enforcement demo (1 min 45 sec)

**[9 · The 1 km grid]** *Press → twice.*

We split Kerala into **46,000 squares, each one kilometre wide**. The AI looks at every square: what happened there before, what's happening nearby, the news, and what's around it, such as railway stations and highways. Then it picks the **1% of Kerala** most likely to see a drug seizure in the next four weeks.

One idea made the biggest difference. The model learns not only where drugs move, but **where seizures actually get reported**. That alone took us from 63% to 85%.

**[10 · The frozen test]** *It plays automatically. Let it run.*

But does it really work? We ran the toughest test we could. We **froze the model on 30 June**, with no more learning, and waited five months.

In those five months, 263 seizures were reported, and **85% of them were inside the 1% of Kerala we had flagged.** Nineteen of our top 20 places had a seizure.

We'll be honest: brand-new places are still hard, and we caught 9 of 43. The system says that openly, because a tool officers can trust has to tell the truth.

**[11 · The scorecard]**

In plain numbers: **84.8% accuracy**, **48.5% precision** on our top 20, and a **15.2% error rate**. Our first model caught 62.7%. The district model's range was right 82% of the time. Our own honest mark is about **7 out of 10**: strong where trouble comes back, weaker where it starts fresh.

**[12 · LIVE]** *Switch to the enforcement tab.*

This is what an Excise or Police analyst would see every week.
- *Priority tab:* the red zones are this month's priority list.
- *Click the first place:* it tells you **why**: past reports, activity nearby, and how many reports to expect.
- *Emerging tab:* areas heating up faster than their own history.

And it **never names a person**. It shows places, and a human always decides.

Yaris will show you the side built for the public.

---

## YARIS · Public demo, vision and close (1 min 30 sec)

**[12 · LIVE]** *Switch to the public tab.*

Drugs aren't only a police problem. They're a **health** problem.
- *Tap ◎ Near me:* anyone can find the nearest de-addiction centre in one tap.
- *Far from help tab:* these shaded areas are drug-affected places that are far from help. That's exactly where a new centre or outreach camp would do the most good.
- *Switch to Malayalam:* everything works in **Malayalam**.
- *Report tab:* people can report a concern safely, saying only what and roughly where, never who. One person can't target a neighbourhood: an area shows up only when five different people report it on different days.

*Switch back to the deck.*

**[13 · The vision]**

So where does this go? Today, NarcoTrace predicts from public data. With official data, it can work down to each police station. With treatment data, it can show where people are actually being hurt.

Our dream is **one shared map for Kerala**, where Excise, Police, Health, schools and panchayats plan prevention together, *before* the harm happens.

Our goal isn't to catch more people. It's that **fewer people ever need to be caught, or treated.**

**[14 · Finale]**

NarcoTrace: **see it earlier, reach them sooner.** Thank you. We're happy to take your questions.

---

## Q&A: who answers

- **Maen:** how the model works and how accurate it is
- **Kiran:** where the data came from and why there are no official files
- **Aibin:** the statistics behind the problem
- **Yaris:** safety, misuse and future plans, and passing other questions to the right person

**Never claim** police backing, that it's already deployed, or that it identifies drug users.
**If you're running over time**, cut the bullet lists in the demos to the first item only.
