from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from models import Poll as PollModel
from models import PollVariant, Vote as VoteModel

pytestmark = pytest.mark.integration


def create_poll_record(db_session, owner_user_id: str, *, title: str = "Публичный опрос", is_anonymous: bool = False, poll_type: str = "multi", max_selections: int = 2):
    poll = PollModel(
        title=title,
        description="Описание",
        deadline_iso=datetime.now(timezone.utc) + timedelta(days=1),
        type=poll_type,
        max_selections=max_selections,
        is_anonymous=is_anonymous,
        owner_user_id=owner_user_id,
    )
    db_session.add(poll)
    db_session.flush()
    variants = [
        PollVariant(poll_id=poll.id, label="Вариант 1"),
        PollVariant(poll_id=poll.id, label="Вариант 2"),
        PollVariant(poll_id=poll.id, label="Вариант 3"),
    ]
    db_session.add_all(variants)
    db_session.commit()
    db_session.refresh(poll)
    return poll


def test_create_poll_and_list_with_filters(client, regular_user, auth_headers_for):
    create_response = client.post(
        "/polls",
        json={
            "title": "Новый анонимный опрос",
            "description": "Проверка фильтров",
            "deadlineISO": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "type": "single",
            "variants": ["Да", "Нет"],
            "isAnonymous": True,
        },
        headers=auth_headers_for(regular_user),
    )
    assert create_response.status_code == 201
    poll_payload = create_response.json()
    assert poll_payload["ownerUserId"] == regular_user.id
    assert len(poll_payload["variants"]) == 2

    list_response = client.get("/polls?search=анонимный&isAnonymous=true&sortBy=title&sortOrder=asc&page=1&limit=5")
    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["title"] == "Новый анонимный опрос"


def test_create_poll_validates_deadline_and_variant_count(client, regular_user, auth_headers_for):
    response = client.post(
        "/polls",
        json={
            "title": "Некорректный опрос",
            "description": "Проверка валидации",
            "deadlineISO": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
            "type": "single",
            "variants": ["Да"],
            "isAnonymous": True,
        },
        headers=auth_headers_for(regular_user),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Provide at least two variants"


def test_vote_and_results_include_public_voters(client, db_session, admin_user, regular_user, auth_headers_for):
    poll = create_poll_record(db_session, admin_user.id, is_anonymous=False)
    variant_ids = [variant.id for variant in poll.variants]

    first_vote = client.post(
        f"/polls/{poll.id}/vote",
        json={"choices": [variant_ids[0], variant_ids[1]]},
        headers=auth_headers_for(admin_user),
    )
    assert first_vote.status_code == 200

    second_vote = client.post(
        f"/polls/{poll.id}/vote",
        json={"choices": [variant_ids[1]]},
        headers=auth_headers_for(regular_user),
    )
    assert second_vote.status_code == 200

    results_response = client.get(f"/polls/{poll.id}/results")
    assert results_response.status_code == 200
    results_payload = results_response.json()
    assert results_payload["isAnonymous"] is False
    assert results_payload["totalVoters"] == 2
    assert any(item["voters"] for item in results_payload["results"] if item["count"] > 0)

    csv_response = client.get(f"/polls/{poll.id}/results?format=csv")
    assert csv_response.status_code == 200
    assert csv_response.headers["content-type"].startswith("text/csv")


def test_vote_rejects_invalid_choice_and_closed_poll(client, db_session, regular_user, auth_headers_for):
    poll = create_poll_record(db_session, regular_user.id, poll_type="single", max_selections=1)
    poll.deadline_iso = datetime.now(timezone.utc) - timedelta(minutes=5)
    db_session.add(poll)
    db_session.commit()

    invalid_choice = client.post(
        f"/polls/{poll.id}/vote",
        json={"choices": ["missing-choice"]},
        headers=auth_headers_for(regular_user),
    )
    assert invalid_choice.status_code == 403
    assert invalid_choice.json()["detail"] == "Poll is closed"


def test_poll_attachment_crud_uses_object_storage(client, db_session, admin_user, auth_headers_for):
    poll = create_poll_record(db_session, admin_user.id)

    upload_response = client.post(
        f"/polls/{poll.id}/attachments",
        headers=auth_headers_for(admin_user),
        files={"file": ("report.txt", b"hello", "text/plain")},
    )
    assert upload_response.status_code == 201
    attachment = upload_response.json()
    assert attachment["originalName"] == "report.txt"
    assert attachment["downloadUrl"].endswith(f"/polls/{poll.id}/attachments/{attachment['id']}/download")

    list_response = client.get(
        f"/polls/{poll.id}/attachments",
        headers=auth_headers_for(admin_user),
    )
    assert list_response.status_code == 200
    assert len(list_response.json()["items"]) == 1

    download_response = client.get(
        attachment["downloadUrl"],
        headers=auth_headers_for(admin_user),
    )
    assert download_response.status_code == 200
    assert download_response.content == b"hello"

    delete_response = client.delete(
        f"/polls/{poll.id}/attachments/{attachment['id']}",
        headers=auth_headers_for(admin_user),
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "ok"


def test_user_cannot_delete_foreign_poll(client, db_session, admin_user, regular_user, auth_headers_for):
    poll = create_poll_record(db_session, admin_user.id)
    response = client.delete(f"/polls/{poll.id}", headers=auth_headers_for(regular_user))

    assert response.status_code == 403
    assert db_session.query(VoteModel).count() == 0
