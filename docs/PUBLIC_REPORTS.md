# Public reports (tips)

The Public view has a **Report** tab where anyone can say they noticed something worrying. This page sets out what can go wrong with crowd reports and how the design handles each problem. The rules live in `frontend/lib/tipRules.ts` and are tested in `frontend/lib/tipRules.test.ts` (`make frontend-test`).

## What a tip is, and is not

A tip records **what** was noticed and **roughly where**, never **who**. It is not a police complaint, not evidence and not an input to any forecast. It is a reason for a reviewer to look, never a reason to act. People who know who is involved, or who face an emergency, are sent to the official lines: 112, Kerala Police Yodhav WhatsApp 99959 66666, Excise toll-free 155358, MANAS 1933, and the 14446 de-addiction helpline (numbers checked 26 Nov 2026). "Someone I know needs help" routes to care and records nothing.

## Problems and how each is handled

| Problem | Handling |
|---|---|
| Naming or targeting a person (grudges, disputes, harassment) | No person, phone or vehicle fields. Notes (optional, 280 characters) have phone numbers, vehicle registrations, emails, links, handles, house numbers and honorific + name removed on the server. Notes are never displayed; only a reviewer reads them. |
| Pointing at one house | The browser snaps the tap to the 1 km access-grid square before sending. The exact spot and the device location never leave the phone. Enforcement sees only 3 × 3 km blocks, named after the nearest known locality. |
| Prejudice against groups (migrant workers, faith, caste, community, "colony") | Categories describe behaviour only. A note that describes people by origin, faith, caste or community holds the whole tip out of the count. The term list (English and Malayalam) is deliberately partial and is a backstop, not a guarantee. |
| One person reporting again and again | An anonymous random browser key, stored only as an HMAC under a local secret salt. One vote per person per block (the latest). Caps of 3 per day and 12 per 30 days per device, plus an in-memory connection limit. IP addresses are never written down. |
| Campaigns (many accounts pile onto one place) | A block needs **5+ different people**, of whom **3+ saw it themselves**, on **2+ different days**. If most reporters arrive within six hours, the block is held for a person to check. Anyone who reports across more than 3 blocks in 90 days is left out. |
| Rumour | "Someone told me" counts towards the 5 but not the 3 first-hand. |
| Uneven reporting (towns, phone ownership, awareness drives) | A block stands out only if its reporters exceed the **usual rate of its own surroundings** (blocks within about 25 km, per resident, from the WorldPop grid), with a Poisson test at p < 0.01. Busy places are compared with their neighbours, not with quiet villages. |
| Silence read as safety | Every view says that few or no tips does not mean an area is clear. |
| Stigma and vigilantism | No public map, list or count of tips anywhere. Only enforcement sees areas that pass every rule, as dashed unverified outlines, apart from the forecast. |
| Bots | A hidden honeypot field (silently accepted and dropped), a minimum fill time and strict server validation. Location must be a populated Kerala square. |
| Feedback into the model | Tips never enter training or scoring. **Known limit:** a check prompted by a tip can lead to a reported seizure, which then reaches the news sample. When scoring months after November 2026, stratify by whether a tip block covered the place. |

## Storage

Tips are private real data, kept in `ml/data/real/public_tips/` (gitignored). The folder holds `tips.jsonl` and `salt`, with owner-only permissions. Each record has the day and IST hour, the 1 km cell, the answers, the redacted note, the hashed reporter key and a counted or held status. It holds no IP address, coordinates, name or contact. `NARCOTRACE_TIPS_DIR` overrides the folder; point it at a scratch directory for testing. Small-cell rules match the project default: nothing is shown below five distinct people.

## What it cannot prevent

A determined group can rotate devices and spread its reports across days. The thresholds, the burst and spread rules and the local-rate test raise the cost, and a human review of the notes behind any area is the last line. The identity screen misses paraphrase and other languages. Treat everything here as a reason to look, checked against other information.
