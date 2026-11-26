import json
import math
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


def test_challenge_is_synthetic_and_contains_only_frozen_inputs():
    from ml.forecast.challenge import portable_predict

    path = WEB / "challenge.json"
    if not path.exists():
        return
    pack = json.loads(path.read_text())
    replay = json.loads((WEB / "replay.json").read_text())
    assert pack["synthetic"] is replay["synthetic"] is True
    assert pack["schema"] == "narcotrace-challenge-v1" and pack["run_id"] == replay["run_id"]
    assert {task["horizon"] for task in pack["tasks"]} == {7, 28}
    for task in pack["tasks"]:
        expected = next(t for t in replay["tasks"] if t["scope"] == "area" and t["horizon_days"] == task["horizon"])
        assert [f["cutoff"] for f in task["frames"]] == [w["origin"] for w in expected["windows"]]
        assert task["frames"][0]["cutoff"] == pack["frozen_at"]
        for frame, window in zip(task["frames"], expected["windows"]):
            assert set(frame) == {"cutoff", "start", "end", "districts"}
            assert frame["cutoff"] < frame["start"] <= frame["end"]
            assert set(frame["districts"]) == {r["location"] for r in window["rows"]}
            for row in window["rows"]:
                item = frame["districts"][row["location"]]
                assert set(item) == {"reason", "recent", "x", "baseline"}
                assert item["reason"] == row["abstain_reason"]
                if item["reason"]:
                    assert item["x"] is item["baseline"] is None
                else:
                    assert math.isclose(portable_predict(task["model"], item["x"]), row["predicted"]["poisson_gbm"], rel_tol=1e-10)
                    assert item["baseline"] == row["predicted"]["last_56_days"]
