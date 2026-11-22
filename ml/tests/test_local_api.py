import pytest
from ml.local_api import local_api


def test_api_override_is_loopback_only(monkeypatch):
    monkeypatch.setenv("CORRIDOR_API_PORT", "8911")
    assert local_api("/api/health") == "http://127.0.0.1:8911/api/health"
    for unusable in ("0", "999999", "example.invalid", "8911/foo", "8911@elsewhere.test"):
        monkeypatch.setenv("CORRIDOR_API_PORT", unusable)
        with pytest.raises(ValueError):
            local_api("/api/health")
