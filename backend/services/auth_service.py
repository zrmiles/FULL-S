from __future__ import annotations

import hashlib
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional, Tuple

import jwt
from jwt import ExpiredSignatureError, InvalidTokenError

from models import User
from repositories.auth_repository import RefreshSessionRepository, UserRepository


@dataclass(frozen=True)
class AuthSettings:
    secret_key: str
    algorithm: str
    issuer: str
    access_token_ttl_minutes: int
    refresh_token_ttl_days: int


@dataclass(frozen=True)
class AuthTokens:
    access_token: str
    refresh_token: str
    token_type: str
    access_expires_in: int
    refresh_expires_in: int


class AuthError(Exception):
    def __init__(self, detail: str, status_code: int = 401) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class TokenService:
    def __init__(self, settings: AuthSettings) -> None:
        self.settings = settings

    def _utc_now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _base_payload(self, *, subject: str, token_type: str, expires_at: datetime) -> Dict[str, Any]:
        now = self._utc_now()
        return {
            "sub": subject,
            "type": token_type,
            "iss": self.settings.issuer,
            "iat": now,
            "nbf": now,
            "exp": expires_at,
        }

    def issue_access_token(self, *, user_id: str, role: str) -> Tuple[str, int]:
        expires_at = self._utc_now() + timedelta(minutes=self.settings.access_token_ttl_minutes)
        payload = self._base_payload(subject=user_id, token_type="access", expires_at=expires_at)
        payload["role"] = role
        encoded = jwt.encode(payload, self.settings.secret_key, algorithm=self.settings.algorithm)
        return encoded, int(self.settings.access_token_ttl_minutes * 60)

    def issue_refresh_token(self, *, user_id: str, role: str, session_id: str, expires_at: datetime) -> Tuple[str, int]:
        payload = self._base_payload(subject=user_id, token_type="refresh", expires_at=expires_at)
        payload["sid"] = session_id
        payload["jti"] = session_id
        payload["role"] = role
        encoded = jwt.encode(payload, self.settings.secret_key, algorithm=self.settings.algorithm)
        ttl_seconds = int((expires_at - self._utc_now()).total_seconds())
        return encoded, max(ttl_seconds, 0)

    def decode_access_token(self, token: str) -> Dict[str, Any]:
        return self._decode_typed_token(token, expected_type="access")

    def decode_refresh_token(self, token: str) -> Dict[str, Any]:
        return self._decode_typed_token(token, expected_type="refresh")

    def _decode_typed_token(self, token: str, *, expected_type: str) -> Dict[str, Any]:
        try:
            payload = jwt.decode(
                token,
                self.settings.secret_key,
                algorithms=[self.settings.algorithm],
                issuer=self.settings.issuer,
            )
        except ExpiredSignatureError as exc:
            raise AuthError("Token expired", status_code=401) from exc
        except InvalidTokenError as exc:
            raise AuthError("Invalid token", status_code=401) from exc
        if payload.get("type") != expected_type:
            raise AuthError("Invalid token type", status_code=401)
        return payload


class AuthService:
    def __init__(
        self,
        *,
        user_repo: UserRepository,
        refresh_repo: RefreshSessionRepository,
        token_service: TokenService,
        verify_password: Callable[[str, str], bool],
    ) -> None:
        self.user_repo = user_repo
        self.refresh_repo = refresh_repo
        self.token_service = token_service
        self.verify_password = verify_password

    def authenticate(self, identifier: str, password: str) -> User:
        user = self.user_repo.get_by_identifier(identifier)
        if not user or not self.verify_password(password, user.password_hash):
            raise AuthError("Invalid credentials", status_code=401)
        return user

    def resolve_user_from_access_token(self, access_token: str) -> User:
        payload = self.token_service.decode_access_token(access_token)
        user_id = str(payload.get("sub") or "")
        if not user_id:
            raise AuthError("Invalid token payload", status_code=401)
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise AuthError("User not found", status_code=401)
        return user

    def issue_tokens(
        self,
        *,
        user: User,
        user_agent: Optional[str],
        ip_address: Optional[str],
        revoke_existing: bool = False,
    ) -> AuthTokens:
        now = datetime.now(timezone.utc)
        if revoke_existing:
            self.refresh_repo.revoke_all_active_for_user(user.id, revoked_at=now)

        refresh_exp = now + timedelta(days=self.token_service.settings.refresh_token_ttl_days)
        session_id = str(uuid.uuid4())
        refresh_token, refresh_expires_in = self.token_service.issue_refresh_token(
            user_id=user.id,
            role=user.role,
            session_id=session_id,
            expires_at=refresh_exp,
        )
        self.refresh_repo.create(
            session_id=session_id,
            user_id=user.id,
            token_hash=self.hash_refresh_token(refresh_token),
            expires_at=refresh_exp,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        access_token, access_expires_in = self.token_service.issue_access_token(user_id=user.id, role=user.role)
        self.user_repo.db.commit()
        return AuthTokens(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            access_expires_in=access_expires_in,
            refresh_expires_in=refresh_expires_in,
        )

    def refresh_tokens(self, *, refresh_token: str, user_agent: Optional[str], ip_address: Optional[str]) -> Tuple[User, AuthTokens]:
        payload = self.token_service.decode_refresh_token(refresh_token)
        session_id = str(payload.get("sid") or "")
        user_id = str(payload.get("sub") or "")
        if not session_id or not user_id:
            raise AuthError("Invalid token payload", status_code=401)

        session = self.refresh_repo.get_by_id(session_id)
        token_hash = self.hash_refresh_token(refresh_token)

        if not session or session.user_id != user_id:
            self.refresh_repo.revoke_all_active_for_user(user_id)
            self.user_repo.db.commit()
            raise AuthError("Refresh token is not recognized", status_code=401)

        if session.revoked_at is not None:
            self.refresh_repo.revoke_all_active_for_user(session.user_id)
            self.user_repo.db.commit()
            raise AuthError("Refresh token already revoked", status_code=401)

        if session.token_hash != token_hash:
            self.refresh_repo.revoke_all_active_for_user(session.user_id)
            self.user_repo.db.commit()
            raise AuthError("Refresh token mismatch", status_code=401)

        if self._is_expired(session.expires_at):
            self.refresh_repo.revoke(session)
            self.user_repo.db.commit()
            raise AuthError("Refresh token expired", status_code=401)

        user = self.user_repo.get_by_id(session.user_id)
        if not user:
            self.refresh_repo.revoke(session)
            self.user_repo.db.commit()
            raise AuthError("User not found", status_code=401)

        now = datetime.now(timezone.utc)
        refresh_exp = now + timedelta(days=self.token_service.settings.refresh_token_ttl_days)
        next_session_id = str(uuid.uuid4())
        next_refresh_token, refresh_expires_in = self.token_service.issue_refresh_token(
            user_id=user.id,
            role=user.role,
            session_id=next_session_id,
            expires_at=refresh_exp,
        )

        self.refresh_repo.revoke(session, revoked_at=now, replaced_by_id=next_session_id)
        self.refresh_repo.create(
            session_id=next_session_id,
            user_id=user.id,
            token_hash=self.hash_refresh_token(next_refresh_token),
            expires_at=refresh_exp,
            user_agent=user_agent,
            ip_address=ip_address,
        )

        access_token, access_expires_in = self.token_service.issue_access_token(user_id=user.id, role=user.role)
        self.user_repo.db.commit()
        return (
            user,
            AuthTokens(
                access_token=access_token,
                refresh_token=next_refresh_token,
                token_type="bearer",
                access_expires_in=access_expires_in,
                refresh_expires_in=refresh_expires_in,
            ),
        )

    def logout(self, *, refresh_token: str) -> None:
        try:
            payload = self.token_service.decode_refresh_token(refresh_token)
        except AuthError:
            return

        session_id = str(payload.get("sid") or "")
        if not session_id:
            return

        session = self.refresh_repo.get_by_id(session_id)
        if session and session.revoked_at is None:
            self.refresh_repo.revoke(session)
            self.user_repo.db.commit()

    @staticmethod
    def hash_refresh_token(refresh_token: str) -> str:
        return hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()

    @staticmethod
    def _is_expired(expires_at: datetime) -> bool:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        else:
            expires_at = expires_at.astimezone(timezone.utc)
        return expires_at <= datetime.now(timezone.utc)


def load_auth_settings() -> AuthSettings:
    secret = os.getenv("JWT_SECRET", "dev-insecure-jwt-secret")
    return AuthSettings(
        secret_key=secret,
        algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        issuer=os.getenv("JWT_ISSUER", "survey-app"),
        access_token_ttl_minutes=int(os.getenv("ACCESS_TOKEN_TTL_MINUTES", "15")),
        refresh_token_ttl_days=int(os.getenv("REFRESH_TOKEN_TTL_DAYS", "14")),
    )
