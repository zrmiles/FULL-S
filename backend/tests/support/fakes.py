from __future__ import annotations

import io
from datetime import timedelta
from typing import Any, Dict, Optional


class FakeMinioObjectResponse:
    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    def stream(self, amt: int = 8192):
        for offset in range(0, len(self._payload), amt):
            yield self._payload[offset: offset + amt]

    def close(self) -> None:
        return None

    def release_conn(self) -> None:
        return None


class FakeMinioClient:
    def __init__(self) -> None:
        self.buckets: set[str] = set()
        self.objects: Dict[tuple[str, str], bytes] = {}
        self.content_types: Dict[tuple[str, str], Optional[str]] = {}

    def bucket_exists(self, bucket_name: str) -> bool:
        return bucket_name in self.buckets

    def make_bucket(self, bucket_name: str) -> None:
        self.buckets.add(bucket_name)

    def put_object(
        self,
        bucket_name: str,
        object_name: str,
        data: io.BytesIO,
        length: int,
        content_type: Optional[str] = None,
    ) -> None:
        self.buckets.add(bucket_name)
        self.objects[(bucket_name, object_name)] = data.read(length)
        self.content_types[(bucket_name, object_name)] = content_type

    def remove_object(self, bucket_name: str, object_name: str) -> None:
        self.objects.pop((bucket_name, object_name), None)
        self.content_types.pop((bucket_name, object_name), None)

    def presigned_get_object(self, bucket_name: str, object_name: str, expires: timedelta) -> str:
        _ = expires
        if (bucket_name, object_name) not in self.objects:
            raise KeyError(object_name)
        return f"https://files.example/{bucket_name}/{object_name}"

    def get_object(self, bucket_name: str, object_name: str) -> FakeMinioObjectResponse:
        payload = self.objects.get((bucket_name, object_name))
        if payload is None:
            raise KeyError(object_name)
        return FakeMinioObjectResponse(payload)


class StubWeatherAdapter:
    def __init__(self, payload: Optional[Dict[str, Any]] = None, error: Optional[Exception] = None) -> None:
        self.payload = payload or {}
        self.error = error
        self.calls: list[Optional[str]] = []

    def fetch_current_weather(self, city: Optional[str] = None) -> Dict[str, Any]:
        self.calls.append(city)
        if self.error is not None:
            raise self.error
        return self.payload
