from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from typing import Callable

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("USE_SQLITE", "1")
os.environ.setdefault("SQLALCHEMY_ECHO", "false")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ADMIN_SECRET", "test-admin-secret")

_DB_DIR = Path(tempfile.mkdtemp(prefix="survey-backend-tests-"))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(_DB_DIR / 'test.db').as_posix()}")

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import app as backend_app
import runtime
import routers.external as external_router
import routers.polls as polls_router
import routers.users as users_router
from dependencies import token_service
from models import Base, User as UserModel
from runtime import ensure_runtime_schema, hash_password
from schemas import ExternalWeatherSnapshot
from services.weather_service import ExternalWeatherError
from tests.support.fakes import FakeMinioClient, StubWeatherAdapter
from database import SessionLocal, engine


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        ensure_runtime_schema(db, include_vote_constraints=False)

    fake_minio = FakeMinioClient()
    fake_minio.make_bucket("test-bucket")

    monkeypatch.setattr(runtime, "MINIO_CLIENT", fake_minio)
    monkeypatch.setattr(runtime, "MINIO_BUCKET", "test-bucket")
    monkeypatch.setattr(runtime, "MINIO_PUBLIC_URL", "https://files.example")
    monkeypatch.setattr(polls_router, "MINIO_CLIENT", fake_minio)
    monkeypatch.setattr(polls_router, "MINIO_BUCKET", "test-bucket")
    monkeypatch.setattr(users_router, "MINIO_CLIENT", fake_minio)
    monkeypatch.setattr(users_router, "MINIO_BUCKET", "test-bucket")
    monkeypatch.setattr(users_router, "MINIO_PUBLIC_URL", "https://files.example")

    weather_payload = ExternalWeatherSnapshot(
        city="Moscow",
        condition="Clouds",
        conditionDescription="Облачно",
        temperatureC=12.5,
        feelsLikeC=10.0,
        humidityPercent=64,
        windSpeedMps=3.7,
        observedAt="2026-03-24T10:00:00+00:00",
        source="openweathermap",
        cached=False,
    ).model_dump()
    monkeypatch.setattr(external_router, "weather_adapter", StubWeatherAdapter(payload=weather_payload))


@pytest.fixture
def client() -> TestClient:
    with TestClient(backend_app.app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    with SessionLocal() as db:
        yield db


@pytest.fixture
def create_user(db_session) -> Callable[..., UserModel]:
    def factory(
        *,
        username: str,
        email: str,
        name: str,
        role: str = "user",
        password: str = "Password123!",
    ) -> UserModel:
        user = UserModel(
            username=username,
            email=email,
            name=name,
            role=role,
            password_hash=hash_password(password),
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return factory


@pytest.fixture
def admin_user(create_user) -> UserModel:
    return create_user(
        username="admin",
        email="admin@example.com",
        name="Администратор",
        role="admin",
        password="Admin123!",
    )


@pytest.fixture
def regular_user(create_user) -> UserModel:
    return create_user(
        username="student",
        email="student@example.com",
        name="Студент",
        role="user",
        password="Student123!",
    )


@pytest.fixture
def auth_headers_for() -> Callable[[UserModel], dict[str, str]]:
    def factory(user: UserModel) -> dict[str, str]:
        access_token, _ = token_service.issue_access_token(user_id=user.id, role=user.role)
        return {"Authorization": f"Bearer {access_token}"}

    return factory


@pytest.fixture
def weather_error_stub(monkeypatch: pytest.MonkeyPatch) -> Callable[[str, int], None]:
    def factory(detail: str = "Weather unavailable", status_code: int = 503) -> None:
        monkeypatch.setattr(
            external_router,
            "weather_adapter",
            StubWeatherAdapter(error=ExternalWeatherError(detail, status_code)),
        )

    return factory
