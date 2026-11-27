# NarcoTrace · Short solo pitch (about 4 minutes) · Maen

Deck: https://narcotrace.mayanqwen.workers.dev/ppt/?short. Use the slides as a backdrop and move on when the topic changes.

---

## 1 · The problem (45 sec)

Kerala is fighting the largest drug problem of any state in India.

In 2024, Kerala police registered **27,149 drug cases**, more than any other state. That is one in four drug cases in the country, from a state with under 3% of its population, and a rate almost **ten times** the national average. In 2025 Excise recorded **12,566 cases, the highest ever**, and 2026 is on the same pace.

**95% of these cases are for personal use.** This is not only a supply problem. It is reaching people, families and schools.

And every response today starts **after** the damage is done. A seizure means the drugs have already arrived. Treatment comes years after first use. One in five people in Kerala lives more than 10 km from a de-addiction centre.

---

## 2 · The idea (45 sec)

Prevention is better than cure, and it is ten times cheaper. So we built NarcoTrace to act on all three fronts **at the same time**:

1. **Help the people already affected:** find the drug-affected areas that are far from treatment, and bring care to them first.
2. **Protect the places about to be affected:** know where drug activity is moving next, so awareness and prevention reach those communities before the problem settles in.
3. **Get ahead of supply:** forecast where seizures are likely in the coming weeks, so enforcement can stop it before it spreads.

Not reacting to the last seizure, but preparing for the next one.

---

## 3 · Why AI (40 sec)

The drug trade in Kerala is a **complex, moving network**. It follows railway lines and highways, it comes back to the same localities, it spreads to neighbouring areas, and it shifts when enforcement pushes on it.

No officer can track all of that across a whole state, week after week. Machine learning can. Our model looks at **every square kilometre of Kerala, all 46,000 of them, every week**. It learns from years of past seizures, nearby activity, news coverage and surroundings, and picks out the places where the pattern points next.

That is exactly the kind of problem AI is built for: too many signals, changing too fast, for people to follow by hand.

---

## 4 · The research (40 sec)

The hardest part was the data. We asked Police and Excise officers for case files. They couldn't share them: approval takes time, and the law protects files on open cases.

So we built the dataset ourselves, from public records only:
- **105 months** of official Excise reports, recovered from the Internet Archive after they were taken off the website;
- **2025 and 2026** figures from an official answer in the Kerala Assembly;
- **628,964 news stories** analysed, giving **1,979 seizures** with an exact location, including **628** found only in Malayalam news, by a Malayalam reader we built.

A verified dataset that didn't exist before, and every number in it can be checked.

---

## 5 · The product (50 sec)

NarcoTrace has two sides, built on the same evidence.

**For enforcement:** a map of where to focus over the next four weeks, with the reasons behind each place and the areas that are suddenly rising.

**For the public:** the nearest de-addiction centre from anywhere, the drug-affected areas that are far from help, full Malayalam, and a safe way to report a concern: what and roughly where, never who.

The two sides **reinforce each other**. Citizen reports reach officers as a separate, verified signal: an area appears only after five independent people report it on different days. When citizens and the forecast point to the same place, officers have a stronger lead. And every forecast is **checked against what actually happens**, every week. Reports never train the model, so no one can manipulate it.

**Does it work?** We locked the forecast on 30 June and waited five months. **85% of the seizures that followed fell inside the 1% of Kerala we had flagged.**

---

## 6 · The vision (30 sec)

Today NarcoTrace runs on public data. With official data, it becomes precise to the police station. With treatment data, it shows where people are actually being hurt.

Our vision is **one shared map for Kerala**: Excise, Police, Health, schools and panchayats preventing harm together, before it happens.

The goal is not more arrests. It is **fewer people ever reaching the point of arrest or treatment.**

**NarcoTrace: see it earlier, reach them sooner.** Thank you.

---

**Don't claim:** police backing, being deployed, or identifying individuals. If asked about weaknesses: places with no history are harder to predict (21% caught), and a human always makes the decision.
