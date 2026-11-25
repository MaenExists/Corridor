"""Parser checks for Excise monthly statements. All fixture values are fictional."""

from datetime import date

import pytest

from ml.data.excise_enforcement import LABELS, leading_integers, parse_statement, row_label, statement_month, upload_release

BASE = "https://keralaexcise.gov.in/wp-content/uploads/{}/{}"


def test_statement_names_resolve_to_reporting_months():
    assert statement_month(BASE.format("2021/10", "Jun-enf-22-10-21.pdf")) == (2021, 6)
    assert statement_month(BASE.format("2023/05", "Marcch-2023.pdf")) == (2023, 3)
    assert statement_month(BASE.format("2020/08", "2020_4.pdf")) == (2020, 4)
    assert statement_month(BASE.format("2019/06", "EnfoJune2019.pdf")) == (2019, 6)
    assert statement_month(BASE.format("2020/01", "Month_2019.pdf")) is None
    assert upload_release(BASE.format("2021/10", "Jun-enf-22-10-21.pdf")) == date(2021, 10, 31)


def test_statement_cannot_postdate_its_upload():
    with pytest.raises(ValueError):
        statement_month(BASE.format("2024/01", "Mar24.pdf"))


def test_row_labels_and_cells():
    assert row_label("  3   PTA   12 4 5")[0] == "Pathanamthitta"
    assert row_label("Kannoor  1 2 3")[0] == "Kannur"
    assert row_label("TVM : 40 Pkts tobacco") is None
    assert leading_integers("12 - 7 3.5 9", 5) == [12, 0, 7]


def statement(kind, rows, total):
    lines = [f"{kind} DETAILS OF ENFORCEMENT ACTIVITIES - FICTIONAL", "  Abkari NDPS COTPA Abkari NDPS"]
    lines += [f" {index} {district}  {'  '.join(map(str, values))}  4.5  0.25" for index, (district, values) in enumerate(rows, 1)]
    lines.append(f"   TOTAL  {'  '.join(map(str, total))}  9.0")
    return "\n".join(lines)


def test_statewide_layout_reads_ndps_column_and_printed_total():
    rows = [(district, [10 + index, index + 1, 50, 9, index + 2]) for index, district in enumerate(LABELS)]
    total = [sum(values[column] for _, values in rows) for column in range(5)]
    parsed, totals = parse_statement(statement("STATEWIDE", rows, total))
    assert set(parsed) == set(LABELS)
    assert parsed["Kollam"]["ndps_cases"] == 2
    assert totals == {total[1]}


def test_districtwise_layout_has_raids_first():
    rows = [(district, [900, 80, index, 40, 70, index]) for index, district in enumerate(LABELS)]
    total = [sum(values[column] for _, values in rows) for column in range(6)]
    parsed, totals = parse_statement(statement("DISTRICTWISE", rows, total))
    assert parsed["Thiruvananthapuram"]["raids"] == 900
    assert sum(row["ndps_cases"] for row in parsed.values()) in totals


def test_wrapped_first_cell_is_restored():
    text = "STATEWIDE DETAILS\n      111\nPathanamthitta   12  309  0  3  0\n"
    parsed, _ = parse_statement(text)
    assert parsed["Pathanamthitta"]["ndps_cases"] == 12
    assert parsed["Pathanamthitta"]["abkari_cases"] == 111
