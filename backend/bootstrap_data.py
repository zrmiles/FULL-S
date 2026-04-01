import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from database import SessionLocal
from models import Poll, PollVariant, User, Vote
from runtime import ensure_runtime_schema, hash_password, logger


def _to_datetime(value: str | None):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError:
        return None


def import_sqlite_data(db: Session, source_path: Path) -> int:
    if not source_path.exists():
        logger.info("SQLite import skipped: %s does not exist", source_path)
        return 0

    connection = sqlite3.connect(source_path)
    connection.row_factory = sqlite3.Row
    imported_polls = 0

    try:
        table_columns: dict[str, set[str]] = {}
        for table_name in ("users", "polls", "poll_variants", "votes"):
            table_columns[table_name] = {
                row["name"]
                for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
            }

        def column_or_null(table_name: str, column_name: str) -> str:
            return column_name if column_name in table_columns.get(table_name, set()) else f"NULL AS {column_name}"

        users = connection.execute(
            f"""
            SELECT
                id,
                username,
                email,
                name,
                role,
                password_hash,
                {column_or_null("users", "created_at")},
                {column_or_null("users", "avatar_url")}
            FROM users
            """
        ).fetchall()
        for row in users:
            existing = db.query(User).filter(User.id == row["id"]).first()
            if existing:
                continue
            db.add(
                User(
                    id=row["id"],
                    username=row["username"] or f"user-{row['id'][:8]}",
                    email=row["email"] or f"{row['id']}@example.local",
                    name=row["name"] or row["username"] or "Пользователь",
                    role=row["role"] or "user",
                    password_hash=row["password_hash"] or hash_password("changeme"),
                    created_at=_to_datetime(row["created_at"]),
                    avatar_url=row["avatar_url"],
                )
            )
        db.flush()

        polls = connection.execute(
            f"""
            SELECT
                id,
                title,
                description,
                {column_or_null("polls", "deadline_iso")},
                type,
                {column_or_null("polls", "max_selections")},
                {column_or_null("polls", "is_anonymous")},
                {column_or_null("polls", "created_at")},
                {column_or_null("polls", "owner_user_id")}
            FROM polls
            """
        ).fetchall()
        for row in polls:
            existing = db.query(Poll).filter(Poll.id == row["id"]).first()
            if existing:
                continue
            db.add(
                Poll(
                    id=row["id"],
                    title=row["title"],
                    description=row["description"],
                    deadline_iso=_to_datetime(row["deadline_iso"]),
                    type=row["type"],
                    max_selections=row["max_selections"] or 1,
                    is_anonymous=bool(row["is_anonymous"]),
                    created_at=_to_datetime(row["created_at"]),
                    owner_user_id=row["owner_user_id"],
                )
            )
            imported_polls += 1
        db.flush()

        variants = connection.execute(
            f"""
            SELECT
                id,
                poll_id,
                label,
                {column_or_null("poll_variants", "created_at")}
            FROM poll_variants
            """
        ).fetchall()
        for row in variants:
            existing = db.query(PollVariant).filter(PollVariant.id == row["id"]).first()
            if existing:
                continue
            db.add(
                PollVariant(
                    id=row["id"],
                    poll_id=row["poll_id"],
                    label=row["label"],
                    created_at=_to_datetime(row["created_at"]),
                )
            )

        vote_tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        if "votes" in vote_tables:
            votes = connection.execute(
                f"""
                SELECT
                    id,
                    poll_id,
                    variant_id,
                    user_id,
                    {column_or_null("votes", "created_at")}
                FROM votes
                """
            ).fetchall()
            for row in votes:
                existing = db.query(Vote).filter(Vote.id == row["id"]).first()
                if existing:
                    continue
                db.add(
                    Vote(
                        id=row["id"],
                        poll_id=row["poll_id"],
                        variant_id=row["variant_id"],
                        user_id=row["user_id"],
                        created_at=_to_datetime(row["created_at"]),
                    )
                )

        db.commit()
        logger.info("Imported %s polls from SQLite source %s", imported_polls, source_path)
        return imported_polls
    finally:
        connection.close()


def seed_demo_data(db: Session) -> None:
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = User(
            username="admin",
            email="admin@example.com",
            name="Администратор",
            role="admin",
            password_hash=hash_password("Admin123!"),
        )
        db.add(admin)
        db.flush()

    student = db.query(User).filter(User.username == "student").first()
    if not student:
        student = User(
            username="student",
            email="student@example.com",
            name="Студент",
            role="user",
            password_hash=hash_password("Student123!"),
        )
        db.add(student)
        db.flush()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    polls = [
        {
            "title": "Анонимный опрос студентов",
            "description": "Базовый активный опрос для фильтров.",
            "deadline_iso": now + timedelta(days=2),
            "type": "single",
            "max_selections": 1,
            "is_anonymous": True,
            "owner_user_id": admin.id,
            "variants": ["Да", "Нет"],
        },
        {
            "title": "Публичный опрос кафедры",
            "description": "Публичный опрос для проверки результатов и вложений.",
            "deadline_iso": now + timedelta(days=3),
            "type": "multi",
            "max_selections": 2,
            "is_anonymous": False,
            "owner_user_id": admin.id,
            "variants": ["Вариант A", "Вариант B", "Вариант C"],
        },
        {
            "title": "Без дедлайна для навигации",
            "description": "Опрос без дедлайна.",
            "deadline_iso": None,
            "type": "single",
            "max_selections": 1,
            "is_anonymous": True,
            "owner_user_id": admin.id,
            "variants": ["За", "Против"],
        },
    ]

    for poll_data in polls:
        if db.query(Poll).filter(Poll.title == poll_data["title"]).first():
            continue
        variants = poll_data.pop("variants")
        poll = Poll(**poll_data)
        db.add(poll)
        db.flush()
        for label in variants:
            db.add(PollVariant(poll_id=poll.id, label=label))

    db.commit()
    logger.info("Seeded demo users and polls into empty database")


def main() -> None:
    source_path = Path(os.getenv("IMPORT_SQLITE_PATH", "/seed/survey.db"))
    seed_on_empty = os.getenv("SEED_DEMO_DATA_ON_EMPTY", "true").lower() in {"1", "true", "yes"}

    with SessionLocal() as db:
        ensure_runtime_schema(db, include_vote_constraints=True)
        if db.query(Poll).count() > 0:
            logger.info("Data bootstrap skipped: target database already has polls")
            return

        imported = import_sqlite_data(db, source_path)
        if imported == 0 and db.query(Poll).count() == 0 and seed_on_empty:
            seed_demo_data(db)


if __name__ == "__main__":
    main()
