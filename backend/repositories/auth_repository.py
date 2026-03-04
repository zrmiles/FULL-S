from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from models import RefreshTokenSession, User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, user_id: str) -> Optional[User]:
        return self.db.query(User).filter(User.id == user_id).first()

    def get_by_identifier(self, identifier: str) -> Optional[User]:
        normalized = identifier.strip()
        return (
            self.db.query(User)
            .filter((User.username == normalized) | (User.email == normalized))
            .first()
        )


class RefreshSessionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        *,
        session_id: str,
        user_id: str,
        token_hash: str,
        expires_at: datetime,
        user_agent: Optional[str],
        ip_address: Optional[str],
    ) -> RefreshTokenSession:
        session = RefreshTokenSession(
            id=session_id,
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.db.add(session)
        return session

    def get_by_id(self, session_id: str) -> Optional[RefreshTokenSession]:
        return (
            self.db.query(RefreshTokenSession)
            .filter(RefreshTokenSession.id == session_id)
            .first()
        )

    def revoke(
        self,
        session: RefreshTokenSession,
        *,
        revoked_at: Optional[datetime] = None,
        replaced_by_id: Optional[str] = None,
    ) -> None:
        session.revoked_at = revoked_at or _utc_now()
        if replaced_by_id:
            session.replaced_by_id = replaced_by_id
        self.db.add(session)

    def revoke_all_active_for_user(self, user_id: str, *, revoked_at: Optional[datetime] = None) -> int:
        marker = revoked_at or _utc_now()
        updated = (
            self.db.query(RefreshTokenSession)
            .filter(
                RefreshTokenSession.user_id == user_id,
                RefreshTokenSession.revoked_at.is_(None),
            )
            .update({RefreshTokenSession.revoked_at: marker}, synchronize_session=False)
        )
        return int(updated or 0)
