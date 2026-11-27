# NarcoTrace · Judge Q&A prep

How to answer: lead with the point, give one number, then acknowledge the limit. Keep it to 20–30 seconds. Never invent a figure.

---

## Accuracy and the model

**"85% sounds too good. What's the catch?"**
It's 85% of later seizures falling inside the 1% of Kerala we flagged, measured on a forecast we locked on 30 June and checked for five months, so the model never saw the answers. The catch: much of it is places with past seizures. On brand-new places we catch 21%. We show both numbers on the scorecard.

**"Isn't it just predicting the same places again?"**
Partly, and we measured it. A simple "same place again" rule catches about 55%; we catch 85%. Our real edge is new places: 38% against 25% for the simple rule. Repeat locations matter too, because that is where prevention and patrols pay off.

**"Why machine learning? Why not just a hotspot map?"**
A hotspot map only looks back. Kerala's drug network moves along rail lines and highways, spreads to neighbouring areas and reacts to enforcement. Across 46,000 squares every week, those signals are too many to combine by hand. The model weighs them together and is tested on the future. Our first, simpler version got 63%; this one gets 85%.

**"What model is it?"**
A gradient-boosted decision-tree model (LightGBM) that ranks 1 km squares. It is retrained every three months, and its forecast is checked weekly against real outcomes. *(Only go deeper if asked.)*

**"How do you know it isn't overfitted?"**
Three ways. We chose the design on 2022–23 data. We tested it once on 2024–26 data it never saw. Then we locked it and scored it on five months of the real future. A leakage test is also built into the code.

**"What does 48.5% precision mean in practice?"**
About half of our top-20 squares see a seizure within four weeks. A random square would almost never see one, so for an officer choosing where to look, that is a strong shortlist.

---

## Data

**"Why didn't you use police data?"**
We asked Police and Excise officers. They couldn't share case files in time, and the law protects files on open cases. So we built a fully public, verifiable dataset, and the system is ready to take official data. That is our main ask.

**"News is biased. How can you trust it?"**
Agreed, and we measured it: 62% of English reports came from two cities. That is why we added Malayalam papers, which raised Malappuram from about 30 located seizures to 218. Official figures anchor the district totals; news only adds the exact location. And we forecast *reported* seizures, which is the right target for data built from news.

**"Are your statistics reliable?"**
The national figures are from NCRB, Crime in India 2024, Table 1A.5. The Excise figures are from an official Kerala Assembly answer. They cross-check: our Jan–Aug 2025 total is 8,622, exactly what Excise told PTI.

**"Do more cases mean more drugs, or more policing?"**
Both, and we never confuse them. Case counts follow enforcement as well as drug use, so we call them recorded cases, not drug users. That is why the public side uses separate care data, and why we ask for treatment admissions.

---

## Ethics and misuse

**"Couldn't this lead to profiling or harassing communities?"**
It shows places, never people. Tips have no fields for names, phones or vehicles. Notes describing someone's religion, caste or origin are held back, there is no public tip map, and a human always decides. It ranks areas for attention, not people for suspicion.

**"Can someone misuse the public report form to target a neighbour?"**
An area appears only after five independent people report it on different days, and only above what is normal for its neighbours. One person reporting many areas is ignored, and sudden floods of tips are held for review. Tips never train the model, so nobody can steer the forecast.

**"What if the forecast is wrong and officers waste time?"**
It is a shortlist for people, not an order. Every list is scored four weeks later, and if a new version does worse than the old one, it switches back automatically.

---

## Impact and feasibility

**"Who would actually use this?"**
- Excise and Police analysts, to plan the week.
- Health and Vimukthi planners, to decide where the next centre or outreach camp goes.
- Families, to find help nearby in Malayalam.

**"How is this prevention and not just enforcement?"**
95% of Kerala's cases are personal use, so the problem is demand. The same forecast tells awareness teams and schools where to focus before the problem settles in. The public side shows 1.65 million people in drug-affected areas who are more than 10 km from help: that is where care goes first.

**"Is it deployed? Has any agency used it?"**
It's a working prototype, live on the web. It isn't used by any agency yet. A pilot with one district's Excise office is our next step.

**"What does it cost to run?"**
It runs on a laptop and a free cloud tier. It uses public data and no paid services, so it is cheap enough for any district to try.

**"How does it fit what the government is already doing?"**
Kerala's Operation Toofan has three wings: enforcement, awareness and rehabilitation. NarcoTrace serves all three: the enforcement map, awareness targeting, and the care-gap map. *(Describe how it fits; don't quote Toofan's numbers.)*

**"What's next?"**
1. Official station-level data from Police and Excise.
2. Treatment admissions by taluk.
3. Road travel time instead of straight-line distance.
4. Our weekly test, which keeps running: the first full score comes on 27 December.

---

## Tricky ones

**"What's novel here? Predictive policing exists."**
Three things:
- It is built for Kerala from data nobody had assembled, including Malayalam news.
- It forecasts where seizures get **reported**, which is why accuracy went from 63% to 85%.
- It joins enforcement with care: the same evidence shows where to act and where help is missing.

**"What was the hardest part?"**
The data. We went to officers, the website deleted its history, and publication stopped for two years. We rebuilt everything from archives, an Assembly answer and 628,964 news stories.

**"If you had official data, how much better would it be?"**
We can't promise a number, but rural coverage is our weakest point and official data fixes exactly that. The pipeline already accepts it.

---

**If you don't know:** "Good question. We haven't measured that yet, and here's how we would." That earns more respect than a guess.
