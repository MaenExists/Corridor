# Data requests for case forecasts and recovery planning

## The one request that switches the live forecast on

Ask the Kerala Excise Commissionerate for the **monthly "Statewide Details of Enforcement Activities" statements from October 2024 to the latest month**. Ask them to continue publishing them, or to send them each month. The department published these statements for every month from 2015 to September 2024, and Corridor's validated model is trained on exactly this format. With the gap filled, the model issues a forecast for next month immediately. Without it, the model needs six more monthly homepage snapshots, the earliest being March 2027. An RTI request for existing records is enough because the statements already exist. [Excise RTI](https://keralaexcise.gov.in/rti) · [Kerala RTI portal](https://rtiportal.kerala.gov.in/)

From 2019 to 2024, public uploads would have allowed a timely forecast at only 2 of 70 month-ends because statements were often posted months late. A direct monthly feed for an authorized analyst is what makes the forecast usable.

## API and download shortlist

| Priority | Access to obtain | What it adds |
| --- | --- | --- |
| 1 | **Indian Kanoon API token.** Register for API Services and generate a token in the dashboard. The provider lists ₹500 in development credits on signup. Confirm the project can retain downloaded decisions locally and extract records for research. Follow the API attribution terms. [Signup](https://api.indiankanoon.org/) · [API docs](https://api.indiankanoon.org/documentation/) · [Pricing](https://api.indiankanoon.org/pricing/) · [Terms](https://api.indiankanoon.org/terms/) | The public index already shows Kerala High Court NDPS orders in 2026, when our open archive found zero keyword hits. Pilot the first and second halves of 2026 separately, then audit 2025 overlap. Request original availability dates where available. Match records against the open archive before retrieving additional documents. |
| 2 | **eCourtsIndia developer token.** Optional free-credit trial after testing the High Court gap. Generate a developer token in the account dashboard. Ask for Kerala district/special NDPS court coverage by year and confirm retention and extraction terms. [Get an API key](https://blogs.ecourtsindia.com/2026/11/16/get-ecourtsindia-api-key/) · [Developer guide](https://blogs.ecourtsindia.com/2026/05/18/how-to-use-ecourtsindia-api/) · [Pricing](https://ecourtsindia.com/api/pricing) | Verify whether the case search and order endpoints cover a distinct set of lower-court records. The paid public-site Kerala FIR catalog reports uneven, all-offence coverage. I found no documented NDPS-only bulk FIR endpoint in the partner API. Ask for a separate sample and coverage export before paying. [Kerala FIR catalog](https://ecourtsindia.com/CrimeReports/Kerala) · [FIR download guide](https://blogs.ecourtsindia.com/2026/11/16/fir-search-ecourtsindia-crime-reports/) |
| 3 | **Media Cloud API key.** Register via the search site and use the developer client. An existing BigQuery project can also query public GDELT metadata using date partitions and a scan cap. [Media Cloud client and signup](https://github.com/mediacloud/api-client) · [GDELT data access](https://gdeltproject.org/data.html) · [BigQuery sandbox](https://docs.cloud.google.com/bigquery/docs/sandbox) | Bilingual discovery pilot against named Malayalam and English publishers. Test 2020, 2023 and 2026 source coverage before a large pull. Confirm rights for any full-text retrieval and retention. |
| Parallel | **NCRB annual district SLL downloads.** The official 2020–2022 workbooks are downloaded and reconciled. If your team can download the Dataful file, use the SLL-by-crime-head CSV or Parquet to check 2023–2024. An anonymous click exposed the download control but did not return a file. A general data.gov.in API key is unnecessary for this. [NCRB additional tables](https://www.ncrb.mha.gov.in/crime-in-india-additional-table?category=District+Wise+Reports&year=2022) · [Dataful district SLL by crime head](https://distcrimes.dataful.in/datasets/12/) | Annual geographic cross-check for the NDPS category. Keep police reporting units, such as city and rural units, separate until mapped to revenue districts. Dataful also lists NCB statewide monthly cases and substance quantities through part of 2023. [NCB monthly counts](https://dataful.in/datasets/18994/) · [NCB monthly quantities](https://dataful.in/datasets/19545/) |

Store tokens only in the local secret environment. Suggested names are **INDIAN_KANOON_API_TOKEN**, **ECOURTSINDIA_API_TOKEN**, and **MEDIACLOUD_API_KEY**. Tell us which token is configured without sharing the value in chat or Git.

The first credential to obtain is Indian Kanoon. That pilot increases the documented-case sample. A continuous district-week outcome feed still depends on officially released data or an authorized aggregate export. I found no public API with that coverage and no public API for comparable district-month treatment utilization. The public recovery directory is keyless. [Kerala Police table](https://keralapolice.gov.in/crime-statistics/sll-cases) · [Kerala Excise statistics](https://keralaexcise.gov.in/) · [Recovery directory](https://mayangillakeralam.kerala.gov.in/de-addiction-centres)

## What we need from the project owner

1. **A school or mentor introduction to the Kerala Police SCRB and Kerala Excise Commissionerate.** An official custodian who can send a representative export and its definitions is the first priority. If a direct introduction is unavailable, submit the draft below through each department's information channel. The state RTI portal is available for requesting existing records or reports. [Kerala RTI portal](https://rtiportal.kerala.gov.in/) · [Police RTI](https://keralapolice.gov.in/page/online-facility-to-file-applications-under-rti-act) · [Excise RTI](https://keralaexcise.gov.in/rti)
2. **An introduction to Vimukthi and Kerala DHS/NHM or a partner hospital.** Ask the data custodian for a sample of monthly service indicators and who can verify the public directory. [Official centre directory](https://mayangillakeralam.kerala.gov.in/de-addiction-centres) · [DHS hospital directory](https://dhs.kerala.gov.in/en/dhsw/)
3. **The registered challenge and organiser brief, if the team has them.** The public site leaves final details to the organiser. [Hackfinity](https://hackfinity.online/)
4. **Optional access after a pilot shows a gap.** Publisher permission or a licensed archive feed for bilingual coverage. A project-owned Indian Kanoon token and capped budget only if the open court sample misses useful coverage and the provider approves use. A cost-capped BigQuery project only if we need broader news discovery. The public official tables, Kerala court S3 listing and official centre directory need no access key. Keep approved credentials in local secret storage and approved datasets in a protected, gitignored location.

The drafts below are ready to send after the team fills in its own contact details. They have not been submitted.

## Draft for Police SCRB and Excise

**Subject — Request for existing district-level NDPS statistics for a Kerala student research project**

Hello,

Our team is developing Corridor, a Hackfinity student project studying whether historical patterns can forecast future numbers of recorded drug seizures and NDPS cases by Kerala district. We are requesting existing machine-readable statistics with no personal records. We would like to start with a representative three-month extract and its data dictionary.

For the pilot and the full archive, please share any available daily or weekly counts from **1 January 2020 through the latest complete period of 2026**, for the 14 Kerala revenue districts, separated by reporting agency and case category. Existing monthly tables are useful where weekly counts are unavailable. The main fields are:

- Period start and end, reporting district and administrative unit mapping, and whether the month or week is complete, missing, or suppressed.
- Unique documented seizure-event count and NDPS registration count as separate measures. Please include possession/use versus trafficking/supply classification, where maintained, and clarify event date versus registration date.
- Original date each aggregate was available, subsequent revision dates, and definitions and counting rules including jointly handled cases.
- Separate counts for NDPS-capable raids, inspections and checkpost checks, and the number of detections attributable to each action type in the same district, period and programme. Include batches with zero detections, dates and definitions of changes to the reporting protocol, and any published distinction between normal and campaign effort. Aggregate counts are sufficient.
- If already maintained and approved for research, historical aggregate counts of recorded and verified district-to-district movements, by month and with an evidence definition. An outside-Kerala endpoint can be supplied at state level.

CSV or XLSX is preferable. Please tell us which fields are available, who owns the export, and what terms apply to retention, research use and publishing aggregate results. Existing tables or report extracts would help if a single data export is unavailable. We can work from small-cell suppressed totals and have no need for names, addresses, FIR narratives, operational details or patient information.

Thank you,

[Team contact and school or mentor]

## Draft for Vimukthi and DHS/NHM

**Subject — Request for aggregate treatment and capacity statistics and public directory verification**

Hello,

Our Hackfinity student team is developing a Kerala service directory and a district-level planning view for addiction treatment and recovery. Could you share the current official directory of public treatment and counselling services, and identify the person or office who can verify locations, service types, eligibility, public contact details and opening hours?

We would also appreciate existing aggregate monthly service records from January 2020 through the latest available 2026 month. We can start with a representative three-month sample. Useful measures include first outpatient visits, admissions, counselling encounters, referrals and completed referrals, waiting times, staffed slots, open days and reporting completeness. Please include definitions and dates of changes in programme coverage. If approved counts by residence district exist, please identify them separately from counts by treatment location. If recorded, please separate self- and family-referred admissions and self-initiated helpline contacts from Police, court, campaign and other referrals. Include staffed beds and changes in service hours or reporting completeness by district and month. Suppressed and missing cells are useful when flagged.

Facility- or district-level aggregates with suppression flags are sufficient. Please share any reuse or publication terms. We do not need individual or identifiable health records.

Thank you,

[Team contact and school or mentor]
