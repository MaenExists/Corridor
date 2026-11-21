from ml.data.synthetic import normalize


def test_syndication_and_missing_units():
    a = {"synthetic": True, "case_id": "demo", "first_available_date": "2024-01-01",
         "source_ref": [{"ref": "fake", "available_date": "2024-01-01"}],
         "quantity": 1.2, "unit": "kg", "district": None}
    b = {**a, "first_available_date": "2024-01-02", "source_ref": [{"ref": "copy", "available_date": "2024-01-02"}]}
    row, = normalize([b, a])
    assert len(row["source_ref"]) == 2 and row["quantity"] == 1200 and row["district"] is None
    assert row["first_available_date"] == "2024-01-01"
    unknown, = normalize([{**a, "quantity": None, "unit": None}])
    assert unknown["quantity"] is unknown["unit"] is None
