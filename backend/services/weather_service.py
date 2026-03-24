from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx


class ExternalWeatherError(Exception):
    def __init__(self, detail: str, status_code: int = 503) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class WeatherSettings:
    api_base_url: str
    api_key: Optional[str]
    default_city: str
    timeout_seconds: float
    max_retries: int
    retry_backoff_seconds: float
    cache_ttl_seconds: int
    max_outbound_requests_per_minute: int


class SlidingWindowRateLimiter:
    def __init__(self, *, max_calls: int, window_seconds: int) -> None:
        self.max_calls = max(1, max_calls)
        self.window_seconds = max(1, window_seconds)
        self._calls: list[float] = []
        self._lock = threading.Lock()

    def allow(self) -> bool:
        now = time.monotonic()
        oldest_allowed = now - self.window_seconds
        with self._lock:
            self._calls = [ts for ts in self._calls if ts >= oldest_allowed]
            if len(self._calls) >= self.max_calls:
                return False
            self._calls.append(now)
            return True


class OpenWeatherAdapter:
    def __init__(self, settings: WeatherSettings) -> None:
        self.settings = settings
        self._client = httpx.Client(
            timeout=httpx.Timeout(
                connect=settings.timeout_seconds,
                read=settings.timeout_seconds,
                write=settings.timeout_seconds,
                pool=settings.timeout_seconds,
            )
        )
        self._cache_lock = threading.Lock()
        self._cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        self._rate_limiter = SlidingWindowRateLimiter(
            max_calls=settings.max_outbound_requests_per_minute,
            window_seconds=60,
        )

    def fetch_current_weather(self, city: Optional[str] = None) -> Dict[str, Any]:
        selected_city = (city or self.settings.default_city).strip()
        if not selected_city:
            raise ExternalWeatherError("Weather city is not configured", status_code=500)

        if not self.settings.api_key:
            raise ExternalWeatherError("Weather API key is not configured", status_code=503)

        cached = self._read_cache(selected_city)
        if cached is not None:
            return {**cached, "cached": True}

        if not self._rate_limiter.allow():
            stale = self._read_cache(selected_city, allow_stale=True)
            if stale is not None:
                return {**stale, "cached": True}
            raise ExternalWeatherError("Weather service rate limit reached", status_code=429)

        payload = self._request_with_retries(selected_city)
        normalized = self._normalize(payload, requested_city=selected_city)
        self._write_cache(selected_city, normalized)
        return {**normalized, "cached": False}

    def _request_with_retries(self, city: str) -> Dict[str, Any]:
        endpoint = f"{self.settings.api_base_url.rstrip('/')}/weather"
        params = {
            "q": city,
            "appid": self.settings.api_key,
            "units": "metric",
            "lang": "ru",
        }

        last_error: Optional[Exception] = None
        for attempt in range(self.settings.max_retries + 1):
            try:
                response = self._client.get(endpoint, params=params)
            except httpx.TimeoutException as exc:
                last_error = exc
                if attempt < self.settings.max_retries:
                    self._sleep_before_retry(attempt)
                    continue
                raise ExternalWeatherError("External weather API timeout", status_code=504) from exc
            except httpx.RequestError as exc:
                last_error = exc
                if attempt < self.settings.max_retries:
                    self._sleep_before_retry(attempt)
                    continue
                raise ExternalWeatherError("External weather API is unavailable", status_code=503) from exc

            if response.status_code in {429, 500, 502, 503, 504} and attempt < self.settings.max_retries:
                self._sleep_before_retry(attempt)
                continue
            if response.status_code == 404:
                raise ExternalWeatherError("City not found in weather API", status_code=404)
            if response.status_code in {401, 403}:
                raise ExternalWeatherError("Weather API credentials are invalid", status_code=503)
            if response.status_code >= 400:
                raise ExternalWeatherError("External weather API returned an error", status_code=502)

            try:
                return response.json()
            except ValueError as exc:
                raise ExternalWeatherError("Weather API returned malformed JSON", status_code=502) from exc

        raise ExternalWeatherError("External weather API failed after retries", status_code=503) from last_error

    def _sleep_before_retry(self, attempt: int) -> None:
        delay = self.settings.retry_backoff_seconds * (2**attempt)
        time.sleep(delay)

    def _read_cache(self, city: str, *, allow_stale: bool = False) -> Optional[Dict[str, Any]]:
        now = time.monotonic()
        key = city.lower()
        with self._cache_lock:
            cached = self._cache.get(key)
            if not cached:
                return None
            expires_at, payload = cached
            if not allow_stale and now > expires_at:
                return None
            return payload

    def _write_cache(self, city: str, payload: Dict[str, Any]) -> None:
        key = city.lower()
        expires_at = time.monotonic() + self.settings.cache_ttl_seconds
        with self._cache_lock:
            self._cache[key] = (expires_at, payload)

    @staticmethod
    def _normalize(payload: Dict[str, Any], *, requested_city: str) -> Dict[str, Any]:
        weather_items = payload.get("weather") or []
        weather_top = weather_items[0] if weather_items else {}
        main = payload.get("main") or {}
        wind = payload.get("wind") or {}

        dt_ts = payload.get("dt")
        observed_at = datetime.now(timezone.utc)
        if isinstance(dt_ts, (int, float)):
            observed_at = datetime.fromtimestamp(float(dt_ts), tz=timezone.utc)

        condition = str(weather_top.get("main") or "Unknown").strip() or "Unknown"
        description = str(weather_top.get("description") or condition).strip() or condition

        city_name = str(payload.get("name") or requested_city).strip() or requested_city
        temp = _to_float(main.get("temp"))
        feels_like = _to_float(main.get("feels_like"))
        humidity = int(_to_float(main.get("humidity")))
        wind_speed = _to_float(wind.get("speed"))

        return {
            "city": city_name,
            "condition": condition,
            "conditionDescription": description,
            "temperatureC": temp,
            "feelsLikeC": feels_like,
            "humidityPercent": humidity,
            "windSpeedMps": wind_speed,
            "observedAt": observed_at.isoformat(),
            "source": "openweathermap",
        }


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def load_weather_settings() -> WeatherSettings:
    return WeatherSettings(
        api_base_url=os.getenv("WEATHER_API_BASE_URL", "https://api.openweathermap.org/data/2.5"),
        api_key=os.getenv("WEATHER_API_KEY"),
        default_city=os.getenv("WEATHER_CITY", "Moscow"),
        timeout_seconds=max(1.0, float(os.getenv("WEATHER_TIMEOUT_SECONDS", "4"))),
        max_retries=max(0, int(os.getenv("WEATHER_MAX_RETRIES", "2"))),
        retry_backoff_seconds=max(0.05, float(os.getenv("WEATHER_RETRY_BACKOFF_SECONDS", "0.3"))),
        cache_ttl_seconds=max(30, int(os.getenv("WEATHER_CACHE_TTL_SECONDS", "180"))),
        max_outbound_requests_per_minute=max(1, int(os.getenv("WEATHER_RATE_LIMIT_PER_MIN", "30"))),
    )
