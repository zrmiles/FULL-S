from __future__ import annotations

from typing import Any, Dict

import httpx
import pytest

from services.weather_service import ExternalWeatherError, OpenWeatherAdapter, WeatherSettings

pytestmark = pytest.mark.unit


class FakeResponse:
    def __init__(self, status_code: int, payload: Dict[str, Any]) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> Dict[str, Any]:
        return self._payload


class RecordingClient:
    def __init__(self, responses: list[Any]) -> None:
        self.responses = responses
        self.calls = 0

    def get(self, endpoint: str, params: Dict[str, Any]):
        _ = endpoint, params
        response = self.responses[self.calls]
        self.calls += 1
        if isinstance(response, Exception):
            raise response
        return response


def build_adapter() -> OpenWeatherAdapter:
    settings = WeatherSettings(
        api_base_url="https://weather.example/api",
        api_key="weather-key",
        default_city="Moscow",
        timeout_seconds=1.0,
        max_retries=1,
        retry_backoff_seconds=0.0,
        cache_ttl_seconds=300,
        max_outbound_requests_per_minute=2,
    )
    return OpenWeatherAdapter(settings)


def weather_payload() -> Dict[str, Any]:
    return {
        "name": "Moscow",
        "dt": 1_711_273_600,
        "weather": [{"main": "Clouds", "description": "облачно"}],
        "main": {"temp": 12.4, "feels_like": 10.1, "humidity": 56},
        "wind": {"speed": 3.2},
    }


def test_fetch_current_weather_uses_cache(monkeypatch: pytest.MonkeyPatch):
    adapter = build_adapter()
    client = RecordingClient([FakeResponse(200, weather_payload())])
    monkeypatch.setattr(adapter, "_client", client)

    first = adapter.fetch_current_weather()
    second = adapter.fetch_current_weather()

    assert first["city"] == "Moscow"
    assert first["cached"] is False
    assert second["cached"] is True
    assert client.calls == 1


def test_rate_limit_returns_stale_cache(monkeypatch: pytest.MonkeyPatch):
    adapter = build_adapter()
    client = RecordingClient([FakeResponse(200, weather_payload())])
    monkeypatch.setattr(adapter, "_client", client)

    adapter.fetch_current_weather("Moscow")
    monkeypatch.setattr(adapter._rate_limiter, "allow", lambda: False)

    payload = adapter.fetch_current_weather("Moscow")

    assert payload["cached"] is True
    assert client.calls == 1


def test_not_found_is_reported(monkeypatch: pytest.MonkeyPatch):
    adapter = build_adapter()
    monkeypatch.setattr(adapter, "_client", RecordingClient([FakeResponse(404, {})]))

    with pytest.raises(ExternalWeatherError, match="City not found"):
        adapter.fetch_current_weather("Unknown")


def test_timeout_maps_to_gateway_timeout(monkeypatch: pytest.MonkeyPatch):
    adapter = build_adapter()
    monkeypatch.setattr(adapter, "_client", RecordingClient([httpx.TimeoutException("timeout"), httpx.TimeoutException("timeout")]))

    with pytest.raises(ExternalWeatherError) as exc_info:
        adapter.fetch_current_weather("Moscow")

    assert exc_info.value.status_code == 504
