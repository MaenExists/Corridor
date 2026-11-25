"""Screen all local court texts independently of their retrieval keyword hits."""

from collections import Counter
from dataclasses import asdict, dataclass
import json
from math import sqrt
import random
import re

from ml.data.court_archive import TERMS, YEARS
from ml.data.evidence_prep import kanoon_orders, open_orders, protected_key, tag
from ml.data.real_input import private_write
from ml.data.source_api import write_rows
from ml.data.training_prep import PREPARED, ROOT, read_rows

ACRONYM = r"\bn\s*\.?\s*d\s*\.?\s*p\s*\.?\s*s\b"
STATUTE = r"(?:" + ACRONYM + r"\.?\s*act|narcotic\s+drugs?\s+and\s+psychotropic\s+substances\s+act)"
CHARGE = r"\b(?:offences?\s+(?:alleged|punishable|registered)|(?:charged|booked|registered|prosecuted)\s+(?:for|under)|(?:under\s+)?sections?)\b"
OTHER_ACT = r"(?:indian penal code|\bi\s*\.?\s*p\s*\.?\s*c\b|\bbns\b|abkari act|pocso act|negotiable instruments act)"
CASE_PARTY = re.compile(r"\b(?:petitioner|applicant|accused|appellant|respondent|prosecution|police|officer)s?\b", re.I)
FILING_CONTEXT = re.compile(
    r"\b(?:crime\s+(?:nos?\.?|number)|case\s+of\s+the\s+prosecution|the\s+prosecution\s+case|"
    r"accused\s+in|the\s+allegations?\s+(?:is|are)|(?:appellant|accused)\s+was\s+convicted|"
    r"petitioner\s+(?:was|is)\s+(?:charged|arrested|booked)|anticipatory bail|regular bail)\b", re.I,
)
LEGAL_CHARGE = re.compile(CHARGE + r"[^;!?]{0,200}?" + STATUTE, re.I)
OTHER_CHARGE = re.compile(CHARGE + r"[^;!?]{0,145}?" + OTHER_ACT, re.I)
ANY_NDPS = re.compile(STATUTE + "|" + ACRONYM, re.I)
BACKGROUND = re.compile(
    r"\b(?:supreme court|this court (?:in|held)|decision in|in the case of|relied on|"
    r"precedent|above decision|ratio decidendi|was observed|held as follows|for instance|"
    r"criminal antecedents|previous (?:case|offence|conviction)|other crimes)\b",
    re.I,
)
COURT_DESIGNATION = re.compile(
    r"\bcourt(?:\s*\(\s*|\s+(?:for|under|of|to try)\s+"
    r"(?:(?:the\s+)?trial\s+of\s+)?(?:cases?\s+under\s+)?)(?:the\s+)?$",
    re.I,
)
MATERIAL = re.compile(
    r"\b(?:ganja|cannabis|charas|hashish|heroin|cocaine|mdma|methamphetamine|lysergic|"
    r"lsd|buprenorphine|narcotic substances?|psychotropic substances?|contraband)\b", re.I,
)
ACTION = re.compile(
    r"\b(?:seized|recovered|found\s+in\s+possession|found\s+(?:carrying|with)|"
    r"possess(?:ed|ion)|detected|arrested\s+with|chemical\s+(?:analysis|examiner)|"
    r"forensic\s+(?:analysis|report))\b", re.I,
)
ALTERNATE_METADATA = (
    r"(?i)\b(?:ganja|cannabis|charas|hashish|heroin|cocaine|mdma|methamphetamine|"
    r"psychotropic|narcotic|section\s+20\s*\(\s*b)\b"
)


@dataclass(frozen=True)
class Review:
    active_ndps_charge: bool
    active_other_charge: bool
    current_material_account: bool
    only_background_mentions: bool
    status: str


def screen(text):
    # PDF line wrapping and separate HTML text nodes can split a single phrase
    # across blank lines. Bound each test by distance in normalized body text.
    text = re.sub(r"(?<=\w)-[ \t]*\n[ \t]*(?=\w)", "", text)
    text = " ".join(text.split())
    if len(text) < 120:
        return Review(False, False, False, False, "unreadable")
    current = text[:7500]

    # Pass A reads the operative charges and does not use material descriptions.
    def operative_charge(pattern):
        for match in pattern.finditer(current):
            context = current[max(0, match.start() - 350):match.end() + 150]
            clause = current[max(0, match.start() - 100):match.end()]
            if FILING_CONTEXT.search(context) and not BACKGROUND.search(clause):
                return True
        return False

    active_ndps = operative_charge(LEGAL_CHARGE)
    active_other = operative_charge(OTHER_CHARGE)

    # Pass B reads evidence of material and action without checking the act name.
    # The two passes receive the full text but no source titles or prior labels.
    material_account = False
    for material in MATERIAL.finditer(current):
        context = current[max(0, material.start() - 180):material.end() + 120]
        if ACTION.search(context) and CASE_PARTY.search(context) and not BACKGROUND.search(context):
            material_account = True
            break

    mentions = list(ANY_NDPS.finditer(text))
    background_only = bool(mentions) and all(
        COURT_DESIGNATION.search(text[max(0, match.start() - 65):match.start()])
        or BACKGROUND.search(text[max(0, match.start() - 180):match.end() + 70])
        for match in mentions
    )
    if active_ndps and material_account:
        status = "retain_evidence"
    elif active_ndps:
        status = "relevant_charge_only"
    elif active_other and background_only and not material_account:
        status = "exclude_supported_other_case"
    else:
        status = "unresolved"
    return Review(active_ndps, active_other, material_account, background_only, status)


def group_status(statuses):
    kinds = set(statuses)
    if "exclude_supported_other_case" in kinds and len(kinds) > 1:
        return "unresolved"
    if "retain_evidence" in kinds and "exclude_supported_other_case" not in kinds:
        return "retain_evidence"
    if "relevant_charge_only" in kinds:
        return "relevant_charge_only"
    if kinds == {"exclude_supported_other_case"}:
        return "exclude_supported_other_case"
    return "unreadable" if kinds == {"unreadable"} else "unresolved"


def audit_results(rows):
    """Estimate keyword precision only after all randomly sampled documents are adjudicated."""
    counts = Counter()
    for row in rows:
        first, second = (row[name].strip().casefold() for name in
                         ("reviewer_a_relevance", "reviewer_b_relevance"))
        if set((first, second)) - {"", "yes", "no", "uncertain"}:
            raise ValueError("Independent review labels must be yes, no, uncertain or blank.")
        if not first or not second:
            counts["pending"] += 1
        elif first == second and first in {"yes", "no"}:
            counts[first] += 1
        else:
            counts["unresolved"] += 1
    total = len(rows)
    result = dict(sample_size=total, confirmed_relevant=counts["yes"], confirmed_irrelevant=counts["no"],
                  pending=counts["pending"], unresolved=counts["unresolved"], precision=None,
                  precision_wilson_95=None)
    if total and counts["yes"] + counts["no"] == total:
        proportion = counts["yes"] / total
        z = 1.96
        denominator = 1 + z**2 / total
        center = (proportion + z**2 / (2 * total)) / denominator
        margin = z * sqrt(proportion * (1 - proportion) / total + z**2 / (4 * total**2)) / denominator
        result.update(precision=proportion, precision_wilson_95=[max(0, center - margin), min(1, center + margin)])
    return result


def write_miss_screen(db, root, output, key):
    """Stage candidate misses and controls from local metadata, with no recall claim."""
    shortlisted, controls, lookup = [], [], []
    for year in YEARS:
        path = str(root / "court" / f"{year}.parquet")
        rows = db.execute(
            """WITH outside AS (
                   SELECT pdf_link, min(decision_date::date) AS decision_day,
                          bool_or(regexp_matches(concat_ws(' ',title,description), ?)) AS alternate
                   FROM read_parquet(?) WHERE pdf_link IS NOT NULL
                   GROUP BY pdf_link
                   HAVING NOT bool_or(regexp_matches(concat_ws(' ',title,description), ?))
               )
               SELECT pdf_link,decision_day,alternate FROM outside
               QUALIFY row_number() OVER (PARTITION BY alternate ORDER BY hash(pdf_link, 728311)) <= 12
               ORDER BY alternate, pdf_link""",
            [ALTERNATE_METADATA, path, TERMS],
        ).fetchall()
        for pointer, decision, alternate in rows:
            identifier = tag(key, f"outside_keyword/{year}/{pointer}")
            target = shortlisted if alternate else controls
            target.append((identifier, year, decision.strftime("%Y-%m") if decision else "",
                           "alternate_metadata_cue" if alternate else "random_control", "pending_full_order_review"))
            lookup.append((identifier, year, pointer))
    header = ("source_token", "archive_year", "decision_month", "sample_kind", "status")
    write_rows(output / "off_keyword_leads.csv", header, shortlisted)
    write_rows(output / "off_keyword_controls.csv", header, controls)
    write_rows(output / "protected_off_keyword_lookup.csv", ("source_token", "archive_year", "private_pointer"), lookup)
    return len(shortlisted), len(controls)


def prepare_court_quality(root=ROOT, prepared=PREPARED):
    import duckdb

    output = prepared / "court_quality"
    output.mkdir(mode=0o700, exist_ok=True)
    key = protected_key(prepared)
    reviews = {}
    with duckdb.connect() as db:
        for provider, path, _, _, text in (
            item for stream in (open_orders(db, root), kanoon_orders(root)) for item in stream
        ):
            reviews[tag(key, f"{provider}/{path.name}")] = screen(text)
        off_keyword_leads, off_keyword_controls = write_miss_screen(db, root, output, key)

    groups = json.loads((prepared / "court_incident_candidates.json").read_text(encoding="utf-8"))
    grouped_sources = Counter(source for group in groups for source in group["source_ids"])
    if set(reviews) != set(grouped_sources) or any(count != 1 for count in grouped_sources.values()):
        raise ValueError("The court snapshot and evidence group list differ. Regenerate the local evidence tables.")
    group_counts = Counter()
    retained = []
    screened_groups = []
    for group in groups:
        status = group_status([reviews[source].status for source in group["source_ids"]])
        group_counts[status] += 1
        screened_groups.append((group["order_review_id"], status, len(group["source_ids"])))
        if status == "retain_evidence":
            # Retention is about relevance of the order. It cannot verify an
            # incident date, location, quantity or distinct-event identity.
            retained.append(dict(group, relevance_status=status, label_eligible=False))

    private_write(output / "retained_evidence.json", json.dumps(retained, ensure_ascii=False))
    write_rows(output / "order_screen.csv", ("order_review_id", "status", "source_documents"), screened_groups)
    write_rows(output / "document_screen.csv", (
        "source_id", "active_ndps_charge", "active_other_charge", "current_material_account",
        "only_background_mentions", "status",
    ), ((identifier, *asdict(review).values()) for identifier, review in sorted(reviews.items())))
    audit = output / "independent_review_sample.csv"
    lookup = output / "protected_independent_review_lookup.csv"
    if not audit.exists() or not lookup.exists():
        selected = random.Random(20261125).sample(sorted(grouped_sources), min(80, len(grouped_sources)))
        if not audit.exists():
            write_rows(audit, ("blind_token", "reviewer_a_relevance", "reviewer_b_relevance"), (
                (tag(key, "screen_blind/" + source), "", "") for source in selected
            ))
        write_rows(lookup, ("blind_token", "source_id"), (
            (tag(key, "screen_blind/" + source), source) for source in selected
        ))
    audit_rows = read_rows(audit)
    sample_lookup = read_rows(lookup)
    audit_tokens = {row["blind_token"] for row in audit_rows}
    if (len(audit_tokens) != len(audit_rows) or len(audit_rows) != len(sample_lookup)
            or audit_tokens != {row["blind_token"] for row in sample_lookup}
            or any(row["source_id"] not in reviews for row in sample_lookup)):
        raise ValueError("The independent review sample does not match its protected source mapping.")
    summary = {
        "screened_source_documents": len(reviews),
        "source_statuses": dict(Counter(review.status for review in reviews.values())),
        "order_groups": len(groups), "group_statuses": dict(group_counts),
        "off_keyword_metadata_leads": off_keyword_leads, "off_keyword_unselected_controls": off_keyword_controls,
        "independent_audit": audit_results(audit_rows),
        "audit_recall": None, "incident_training_rows": 0,
    }
    private_write(output / "summary.json", json.dumps(summary, indent=2) + "\n")
    print(f"Court quality screened {len(reviews)} documents in {len(groups)} order groups.")
    print("Order-group results: " + ", ".join(f"{key}={value}" for key, value in sorted(group_counts.items())))
    print(f"Off-keyword metadata: {off_keyword_leads} follow-up leads and {off_keyword_controls} random controls.")
    return summary


if __name__ == "__main__":
    prepare_court_quality()
