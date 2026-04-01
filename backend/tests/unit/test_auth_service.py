from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from repositories.auth_repository import RefreshSessionRepository, UserRepository
from runtime import verify_password
from services.auth_service import AuthError, AuthService, AuthSettings, TokenService
from models import RefreshTokenSession

pytestmark = pytest.mark.unit


def build_auth_service(db_session):
    settings = AuthSettings(
        secret_key="unit-test-secret",
        algorithm="HS256",
        issuer="survey-app-tests",
        access_token_ttl_minutes=15,
        refresh_token_ttl_days=7,
    )
    return AuthService(
        user_repo=UserRepository(db_session),
        refresh_repo=RefreshSessionRepository(db_session),
        token_service=TokenService(settings),
        verify_password=verify_password,
    )


def test_authenticate_rejects_invalid_credentials(db_session, create_user):
    create_user(
        username="student",
        email="student@example.com",
        name="Студент",
        password="Student123!",
    )
    service = build_auth_service(db_session)

    with pytest.raises(AuthError, match="Invalid credentials"):
        service.authenticate("student", "wrong-password")


def test_issue_tokens_revokes_previous_active_sessions(db_session, create_user):
    user = create_user(
        username="admin",
        email="admin@example.com",
        name="Администратор",
        role="admin",
        password="Admin123!",
    )
    service = build_auth_service(db_session)

    first_tokens = service.issue_tokens(
        user=user,
        user_agent="pytest/1",
        ip_address="127.0.0.1",
        revoke_existing=False,
    )
    second_tokens = service.issue_tokens(
        user=user,
        user_agent="pytest/2",
        ip_address="127.0.0.1",
        revoke_existing=True,
    )

    sessions = db_session.query(RefreshTokenSession).filter(RefreshTokenSession.user_id == user.id).all()
    assert len(sessions) == 2
    revoked = [session for session in sessions if session.revoked_at is not None]
    active = [session for session in sessions if session.revoked_at is None]

    assert len(revoked) == 1
    assert len(active) == 1
    assert first_tokens.refresh_token != second_tokens.refresh_token


def test_refresh_tokens_rotates_refresh_session(db_session, create_user):
    user = create_user(
        username="student",
        email="student@example.com",
        name="Студент",
        password="Student123!",
    )
    service = build_auth_service(db_session)

    issued = service.issue_tokens(
        user=user,
        user_agent="pytest",
        ip_address="127.0.0.1",
    )
    rotated_user, rotated = service.refresh_tokens(
        refresh_token=issued.refresh_token,
        user_agent="pytest",
        ip_address="127.0.0.1",
    )

    sessions = db_session.query(RefreshTokenSession).filter(RefreshTokenSession.user_id == user.id).all()
    assert rotated_user.id == user.id
    assert rotated.refresh_token != issued.refresh_token
    assert len(sessions) == 2
    assert len([session for session in sessions if session.revoked_at is None]) == 1
    assert len([session for session in sessions if session.revoked_at is not None]) == 1


def test_refresh_token_mismatch_revokes_all_active_sessions(db_session, create_user):
    user = create_user(
        username="auditor",
        email="auditor@example.com",
        name="Аудитор",
        password="Student123!",
    )
    service = build_auth_service(db_session)
    issued = service.issue_tokens(
        user=user,
        user_agent="pytest",
        ip_address="127.0.0.1",
    )
    session = db_session.query(RefreshTokenSession).filter(RefreshTokenSession.user_id == user.id).one()
    session.token_hash = "tampered-token-hash"
    db_session.add(session)
    db_session.commit()

    with pytest.raises(AuthError, match="Refresh token mismatch"):
        service.refresh_tokens(
            refresh_token=issued.refresh_token,
            user_agent="pytest",
            ip_address="127.0.0.1",
        )

    updated_session = db_session.query(RefreshTokenSession).filter(RefreshTokenSession.user_id == user.id).one()
    assert updated_session.revoked_at is not None


def test_expired_refresh_session_is_rejected(db_session, create_user):
    user = create_user(
        username="expired",
        email="expired@example.com",
        name="Просроченный",
        password="Student123!",
    )
    service = build_auth_service(db_session)
    expired_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    refresh_token, _ = service.token_service.issue_refresh_token(
        user_id=user.id,
        role=user.role,
        session_id="expired-session",
        expires_at=expired_at,
    )
    service.refresh_repo.create(
        session_id="expired-session",
        user_id=user.id,
        token_hash=service.hash_refresh_token(refresh_token),
        expires_at=expired_at,
        user_agent="pytest",
        ip_address="127.0.0.1",
    )
    db_session.commit()

    with pytest.raises(AuthError, match="Token expired|Refresh token expired"):
        service.refresh_tokens(
            refresh_token=refresh_token,
            user_agent="pytest",
            ip_address="127.0.0.1",
        )
