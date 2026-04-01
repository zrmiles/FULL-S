from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


def test_register_login_refresh_logout_flow(client):
    register_response = client.post(
        "/auth/register",
        json={
            "username": "student",
            "email": "student@example.com",
            "name": "Студент",
            "password": "Student123!",
            "role": "user",
        },
    )
    assert register_response.status_code == 201
    assert register_response.json()["username"] == "student"

    login_response = client.post(
        "/auth/login",
        json={"username": "student", "password": "Student123!"},
        headers={"User-Agent": "pytest"},
    )
    assert login_response.status_code == 200
    login_payload = login_response.json()
    assert login_payload["tokens"]["tokenType"] == "bearer"
    assert login_payload["user"]["role"] == "user"

    me_response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {login_payload['tokens']['accessToken']}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "student@example.com"

    refresh_response = client.post(
        "/auth/refresh",
        json={"refreshToken": login_payload["tokens"]["refreshToken"]},
        headers={"User-Agent": "pytest"},
    )
    assert refresh_response.status_code == 200
    refresh_payload = refresh_response.json()
    assert refresh_payload["tokens"]["refreshToken"] != login_payload["tokens"]["refreshToken"]

    logout_response = client.post(
        "/auth/logout",
        json={"refreshToken": refresh_payload["tokens"]["refreshToken"]},
    )
    assert logout_response.status_code == 200
    assert logout_response.json()["status"] == "ok"


def test_login_rejects_invalid_credentials(client, regular_user):
    _ = regular_user
    response = client.post(
        "/auth/login",
        json={"username": "student", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_admin_registration_requires_secret(client):
    response = client.post(
        "/auth/register",
        json={
            "username": "admin2",
            "email": "admin2@example.com",
            "name": "Администратор 2",
            "password": "Admin123!",
            "role": "admin",
        },
    )

    assert response.status_code == 403
    assert "Admin token" in response.json()["detail"]


def test_duplicate_registration_returns_conflict(client):
    payload = {
        "username": "student",
        "email": "student@example.com",
        "name": "Студент",
        "password": "Student123!",
        "role": "user",
    }

    assert client.post("/auth/register", json=payload).status_code == 201
    second = client.post("/auth/register", json=payload)

    assert second.status_code == 409
