# Corridor — five-minute public demo

Run `make setup && make demo` ahead of time. On presentation day, use `make serve` to reopen the prepared snapshot without training. Open **http://127.0.0.1:5173/?offline=1** for a reliable offline run, and keep the local review key available in the server terminal. Stay on **Synthetic (demo)**. The real track is not part of the public showcase.

Say these three sentences first:

1. “This is a team proposal, and we're demonstrating it with synthetic data.”
2. “The system estimates documented cases, not all drug movement or whether an interception would succeed.”
3. “Any operational use would first require an agency-led evaluation on authorized data and later independent outcomes.”

| Time | Show and say |
|---|---|
| 0:30 | **Forecasts** opens on Ernakulam, 28 days. Point to the expected count, estimated range, and dated forecast window. Select Wayanad and switch on **Reporting coverage**: “The model did not issue a forecast here. Unknown does not mean zero or safe.” |
| 1:20 | Select Ernakulam again and choose **View model evidence**. Show the two comparisons together: statewide **5.00 vs 5.32** average missed cases; Ernakulam **11.68 vs 6.00**. The model can beat a simple forecast overall and still lose locally. Across eligible districts the 28-day range covered **68%**, short of the **80%** target. |
| 2:25 | Choose **Held-out replay** and play one or two dates. These are saved predictions from before the test period, not live forecasts. Switch to **7 days** and **Model evidence** to show that the workflow kept a simple seasonal method chosen before the test. |
| 3:10 | Choose **Draft a brief**. Verify that the district and window carried through. Select a structured assessment, save, and export HTML. This is a local synthetic aggregate; nothing is sent to an agency. |
| 4:00 | If time remains, open **Evidence → News inbox** to show duplicate handling or **Methodology** to explain the feedback loop: more attention can create more reports without more underlying activity. Close with what independent validation would be required. |

**Preflight:** Load the offline map, open the Ernakulam comparison, verify Wayanad is withheld, play one replay step, and save/export a practice brief. Keep the [printable synthetic report](http://127.0.0.1:5173/generated/eval_report.html) open as a fallback. The numbers above refer to the supplied synthetic snapshot; use the values on screen if the demo batch or report has been refreshed.

**Optional extended demo:** In **Map → Layers**, distinguish invented documented connections from fictional infrastructure examples. In **Review desk**, create a practice report and check its receipt. In the **News inbox**, verify a fictional fixture, run `make refresh` in a second terminal and click **Reload forecasts** to show the updated evidence. This does not demonstrate that cues improve forecasts. If a fixture is already reviewed, show its timestamp instead.
