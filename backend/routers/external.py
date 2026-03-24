from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from schemas import ExternalWeatherSnapshot
from services.weather_service import ExternalWeatherError, OpenWeatherAdapter, load_weather_settings

router = APIRouter(tags=["external"])
weather_adapter = OpenWeatherAdapter(load_weather_settings())


@router.get("/external/weather", response_model=ExternalWeatherSnapshot)
def get_weather_snapshot(city: Optional[str] = Query(default=None, min_length=1, max_length=80)):
    try:
        payload = weather_adapter.fetch_current_weather(city=city)
    except ExternalWeatherError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return ExternalWeatherSnapshot(**payload)
