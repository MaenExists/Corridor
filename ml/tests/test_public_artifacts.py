import json
from pathlib import Path
from shared.schema import Forecast
from ml.data.synthetic import WEB


def test_generated_public_json_and_forecast_contract():
    if not WEB.is_dir():
        return
    files = list(WEB.glob("*.json"))
    for path in files:
        data = json.loads(path.read_text())
        assert data["synthetic"] is True, "Public output must be synthetic"
        for case in data.get("cases", ()):
            assert case["synthetic"] is True
        for forecast in data.get("forecasts", ()):
            assert forecast["synthetic"] is True
            assert set(forecast) == Forecast.__required_keys__
    if (WEB / "eval_report.html").exists():
        assert "SYNTHETIC DATA" in (WEB / "eval_report.html").read_text()
    assert not any("real" in p.name.lower() for p in Path(WEB).glob("*"))
