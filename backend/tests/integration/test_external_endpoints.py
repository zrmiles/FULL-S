from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


def test_weather_endpoint_returns_normalized_snapshot(client):
    response = client.get("/external/weather?city=Moscow")

    assert response.status_code == 200
    payload = response.json()
    assert payload["city"] == "Moscow"
    assert payload["source"] == "openweathermap"


def test_weather_endpoint_surfaces_adapter_errors(client, weather_error_stub):
    weather_error_stub("Weather API down", 503)
    response = client.get("/external/weather")

    assert response.status_code == 503
    assert response.json()["detail"] == "Weather API down"
