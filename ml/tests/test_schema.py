from shared.schema import Case, Forecast
from ml.data.real_input import ALLOWED_FIELDS


def test_shared_case_import_contract():
    assert Case.__required_keys__ == ALLOWED_FIELDS
    assert {"information_cutoff", "abstain_reason", "synthetic"} <= Forecast.__required_keys__
