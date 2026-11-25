# Corridor

Corridor is a Kerala-wide forecasting and recovery-planning project for Hackfinity 2026. It studies historical drug seizures and documented inter-district movement from January 2020 onward, estimates where recorded events may appear in the next 7 and 28 days, and reports the evidence and uncertainty behind those estimates.

## Hackfinity

St. John's School, Anchal hosts TOOFAN on 28 November 2026. The organiser lists four challenges and will share final briefs and participation rules. Corridor fits **Prevention** through predictive analytics, with a **Recovery & Rehabilitation** component. The registered category is unconfirmed. Corridor is a student project independent of Kerala Police and Kerala Excise. [Hackfinity 2026](https://hackfinity.online/)

| Audience | Product |
| --- | --- |
| Authorized enforcement analysts | District-level seizure forecasts with intervals, coverage and aggregate historical movement evidence. An analyst can flag a district for evidence review. |
| Health and prevention planners | District service utilization, staffed capacity and access gaps. Add monthly treatment-demand forecasts when comparable records support validation. |
| Public | Verified treatment and counselling directory with service types and last checked dates. Show approved district health indicators when available. |

The movement research question is whether historical documented flows can forecast later documented district connections. Seizures and court cases observe a selected part of underlying activity. More reports can improve coverage without identifying unobserved traffic. Individual scoring, automatic resource allocation, dispatch and interception-success claims are outside the project. Missing coverage stays unknown.

The proposed knowledge cutoff is **30 June 2026, end of day IST**. Collect through the latest available 2026 period. Reserve July–December outcomes for evaluation and monitoring of the frozen June snapshot. Mark immature and unavailable periods. Every historical forecast tracks both event date and data availability.

## Build order

1. Define targets, time logic and decision gates in the [model plan](docs/MODEL_PLAN.md).
2. Obtain official district counts and effort measures, then pilot supplementary extraction using the [source research](docs/DATA_SOURCES.md).
3. Fit, evaluate and serve a district forecast with uncertainty and abstention. Keep the existing synthetic showcase runnable.
4. Verify the public directory and build the separate health capacity and demand intake.
5. Evaluate documented movement on supported district pairs. Add forecasts only if the coverage and baseline gates pass.

For the hackathon, demonstrate the synthetic forecast and reveal, show the baseline and abstention evidence, and explain what data enables the real forecast and recovery workspace. See [implementation status](docs/FINAL_REPORT.md), [run instructions](README.md) and [data requests](docs/DATA_REQUESTS.md).
