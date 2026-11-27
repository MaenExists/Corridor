# NarcoTrace · 7-minute script

**Open the deck:** http://127.0.0.1:3000/ppt (or the public site + `/ppt`). Add `?short` for this 7-minute version: `/ppt/index.html?short`, 19 slides.
`→` moves to the next slide or reveals the next item. `F` = fullscreen. The LIVE slides have a button that opens the app in a new tab.
Each speaker starts on their own **part card**: a clean handover.

| Time | Speaker | Part | Slides |
|---|---|---|---|
| 0:00 – 0:45 | **Maen** | Introduction | 1 |
| 0:45 – 2:15 | **Aibin** | Part I · The problem | 2–6 |
| 2:15 – 3:45 | **Kiran** | Part II · Research and data | 7–10 |
| 3:45 – 5:30 | **Maen** | Part III · How it works, scores, enforcement demo | 11–15 |
| 5:30 – 7:00 | **Yaris** | Part IV · Public demo, vision and close | 16–19 |

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

**[2 · Part I card]** *Pause one second, then →.*

**[3 · The curve]** *Press → twice to show the notes, then → to move on.*

Look at this line. In 2016, Kerala Excise recorded about 3,000 drug cases. In 2025, more than 12,500. That's over **four times as many in nine years**.

**[4 · Kerala leads India]**

And this isn't a small problem. In 2023, Kerala had **more drug cases than any other state in India**: twice Maharashtra and almost three times Punjab. One in every four drug cases in the country was in Kerala.

The number that hurts most is on the right. Of the young people caught with drugs or in treatment, **seven out of ten started between the ages of ten and fifteen.** They're children.

**[5 · Always one step behind]**

So why does it keep growing? Because the system only **reacts**.
- Police find out *where* only after a seizure.
- Official data stopped being published for almost two years.
- And one in five people in Kerala lives more than 10 km from a de-addiction centre.

**[6 · Prevention is better than cure]** *Slow down here.*

We all grew up hearing that prevention is better than cure. The United Nations estimates that **every one dollar spent on prevention saves ten later**.

But you can't prevent what you can't see. Prevention needs two things: **where the trouble is heading, and where help is missing.** That is exactly what we built. Kiran will show you how we found the data, and it wasn't easy.

---

## KIRAN · Research and data (1 min 30 sec)

**[7 · Part II card]** *→*

**[8 · We went to the source]**

To teach an AI, you need examples. The best examples would be real case files: where and when each seizure happened. So we went straight to the source. **We contacted Police and Excise officers and asked.**

They couldn't share them. There wasn't enough time to get approval, and the law protects these files because they involve ongoing court cases and people's personal details. Fair enough. So we had to find another way.

**[9 · The data hunt]**

This slide shows every door we knocked on.
- The case files: **closed**.
- The Excise website: **closed**. It only shows the latest month, and the old reports are deleted.
- But the **Internet Archive** had saved copies. We rescued **105 months** of official reports, 2016 to 2024, and checked every one against its printed total.
- When uploads stopped in 2024, a minister's answer in the **Kerala Assembly** gave us 2025 and 2026.
- Official numbers only tell you *which district*. To find *which town*, we read **ten years of newspapers**.

**[10 · Reading ten years of news]** *Press → for each step.*

The computer read **over six lakh news stories** and found **1,979 drug seizures** with an exact town or village.

English papers mostly cover Kochi and Thiruvananthapuram, so we taught the computer to **read Malayalam**. *(→)* It knows "Perumbavoor:" at the start means the seizure happened there. *(→)* And "Aluva swadeshi" only means where the person is from. *(→)* That found **628 more seizures** English news missed.

So everything the AI learned from is public, and anyone can check it. And the day officials share real data, NarcoTrace is ready.

Maen will show you what the AI does with it.

---

## MAEN · How it works and the enforcement demo (1 min 45 sec)

**[11 · Part III card]** *→*

**[12 · Forecast 2 · By square kilometre]** *Press → twice.*

Think of Kerala as a chessboard of **46,000 squares, each one kilometre wide**. For every square, the computer asks simple questions. Was there a seizure here before? Is something happening nearby? Is this area in the news? Is there a railway station or highway close by?

From that, it picks the **1% of squares** most likely to see a seizure in the next four weeks. Our big idea was teaching it **where seizures get reported**, not just where drugs move. That alone took us from 63% to 85%.

**[13 · The locked-forecast test]** *It plays by itself. Let it run.*

But does it really work? We did the fairest test possible. On **30 June we locked the forecast**, so no more changes or learning, and then we waited five months to see what happened.

**[14 · The scorecard]**

Here's the result in plain numbers.
- It **caught 85%** of later seizures, inside just 1% of Kerala.
- When it pointed at its top 20 places, it was **right about half the time** within four weeks.
- It **missed 15%**.
- 19 of its top 20 places had a seizure nearby.

Where it's weak: new places it has never seen. Our honest mark is about **7 out of 10**.

**[15 · LIVE · Enforcement]** *Click "Open enforcement" on the slide.*

This is what an Excise or Police officer would see every week.
- *Priority tab:* the red areas are where to look this month.
- *Click the first place:* it explains **why**: past seizures, activity nearby, and how many to expect.
- *Emerging tab:* areas that are suddenly heating up.

It **never names a person**. It shows places, and a human always decides.

Yaris will show you the side built for everyone else.

---

## YARIS · Public demo, vision and close (1 min 30 sec)

**[16 · Part IV card]** *→*

**[17 · LIVE · Public]** *Click "Open public" on the slide.*

Drugs aren't only a police problem. They're a **health** problem.
- *Tap ◎ Near me:* anyone can find the nearest de-addiction centre in one tap.
- *Far from help tab:* these shaded areas are drug-affected places that are far from help. That's exactly where a new centre or outreach camp would do the most good.
- *Switch to Malayalam:* everything works in **Malayalam**.
- *Report tab:* people can report a concern safely, saying only what and roughly where, never who. One person can't target a neighbourhood: an area shows up only when five different people report it on different days.

*Switch back to the deck.*

**[18 · The vision]**

So where does this go? Today, NarcoTrace predicts from public data. With official data, it can work down to each police station. With treatment data, it can show where people are actually being hurt.

Our dream is **one shared map for Kerala**, where Excise, Police, Health, schools and panchayats plan prevention together, *before* the harm happens.

Our goal isn't to catch more people. It's that **fewer people ever need to be caught, or treated.**

**[19 · Finale]**

NarcoTrace: **see it earlier, reach them sooner.** Thank you. We're happy to take your questions.

---

## Q&A: who answers

- **Maen:** how the model works and how accurate it is
- **Kiran:** where the data came from and why there are no official files
- **Aibin:** the statistics behind the problem
- **Yaris:** safety, misuse and future plans, and passing other questions to the right person

**Never claim** police backing, that it's already deployed, or that it identifies drug users.
**If you're running over time**, cut the bullet lists in the demos to the first item only.
