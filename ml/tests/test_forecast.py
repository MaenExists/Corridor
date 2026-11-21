from datetime import date
from ml.features.build import Dataset
from ml.forecast.batch import forecast_records
from shared.schema import Forecast


def test_forecast_contract_and_thin_history_abstain():
    ds = Dataset({"synthetic": True, "cases": [], "as_of": "2026-11-21",
                  "coverage": {"Kannur": .2}}, True)
    b = {("area", 28): {"synthetic": True, "trained_as_of": "2026-11-21", "run_id": "fixture", "chosen": "last_56_days", "pad": 0}}
    rows = list(forecast_records(ds, b, date(2026, 11, 21)))
    r = next(r for r in rows if r["area"] == "Kannur")
    assert Forecast.__required_keys__ == set(r)
    assert r["abstained"] and "coverage" in r["abstain_reason"] and r["interval"] is r["estimate"] is None
    assert r["window_start"] == "2026-11-22" and r["synthetic"] is True
