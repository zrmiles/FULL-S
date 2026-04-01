from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


def test_admin_can_list_users_and_change_role(client, admin_user, regular_user, auth_headers_for):
    list_response = client.get("/users", headers=auth_headers_for(admin_user))
    assert list_response.status_code == 200
    assert {item["username"] for item in list_response.json()} == {"admin", "student"}

    update_response = client.patch(
        f"/admin/users/{regular_user.id}/role",
        json={"role": "admin"},
        headers=auth_headers_for(admin_user),
    )
    assert update_response.status_code == 200
    assert update_response.json()["role"] == "admin"


def test_regular_user_cannot_list_all_users(client, regular_user, auth_headers_for):
    response = client.get("/users", headers=auth_headers_for(regular_user))

    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden"


def test_last_admin_cannot_be_demoted(client, admin_user, auth_headers_for):
    response = client.patch(
        f"/admin/users/{admin_user.id}/role",
        json={"role": "user"},
        headers=auth_headers_for(admin_user),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot demote the last admin"


def test_profile_read_update_and_avatar_upload(client, regular_user, auth_headers_for):
    me_response = client.get("/me", headers=auth_headers_for(regular_user))
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "student@example.com"

    update_response = client.put(
        "/me",
        json={
            "name": "Студент Обновлённый",
            "email": "updated-student@example.com",
            "password": "Updated123!",
        },
        headers=auth_headers_for(regular_user),
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Студент Обновлённый"

    avatar_response = client.post(
        "/me/avatar",
        headers=auth_headers_for(regular_user),
        files={"file": ("avatar.png", b"avatar-bytes", "image/png")},
    )
    assert avatar_response.status_code == 200
    assert avatar_response.json()["avatarUrl"].startswith("https://files.example/")
