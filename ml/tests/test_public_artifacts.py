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


def test_replay_uses_saved_synthetic_run_and_has_no_estimate_for_abstention():
    path = WEB / "replay.json"
    if not path.exists():
        return
    replay=json.loads(path.read_text())
    report=json.loads((WEB / "eval_report.json").read_text())
    assert replay["synthetic"] is report["synthetic"] is True
    assert replay["run_id"] == report["run_id"]
    assert len(replay["tasks"]) == 4
    for task in replay["tasks"]:
        assert [w["origin"] for w in task["windows"]] == report["splits"]["final"]
        for window in task["windows"]:
            assert all(r["observed"] >= 0 and (not r["abstain_reason"] or all(v is None for v in r["predicted"].values()))
                       for r in window["rows"])
