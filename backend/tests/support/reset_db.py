from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("USE_SQLITE", "1")
os.environ.setdefault("SQLALCHEMY_ECHO", "false")

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal, engine
from models import Base, Poll, PollVariant, User
from runtime import hash_password


def seed_users_and_polls() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    now = datetime.now(timezone.utc)

    with SessionLocal() as db:
        admin = User(
            username="admin",
            email="admin@example.com",
            name="Администратор",
            role="admin",
            password_hash=hash_password("Admin123!"),
        )
        user = User(
            username="student",
            email="student@example.com",
            name="Студент",
            role="user",
            password_hash=hash_password("Student123!"),
        )
        db.add_all([admin, user])
        db.flush()

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
            {
                "title": "Завершенный экзаменационный опрос",
                "description": "Completed scenario seed.",
                "deadline_iso": now - timedelta(days=1),
                "type": "single",
                "max_selections": 1,
                "is_anonymous": False,
                "owner_user_id": user.id,
                "variants": ["Сдал", "Не сдал"],
            },
            {
                "title": "Сортировка по названию 1",
                "description": "Для пагинации и сортировки.",
                "deadline_iso": now + timedelta(days=5),
                "type": "single",
                "max_selections": 1,
                "is_anonymous": True,
                "owner_user_id": user.id,
                "variants": ["A", "B"],
            },
            {
                "title": "Сортировка по названию 2",
                "description": "Для пагинации и сортировки.",
                "deadline_iso": now + timedelta(days=6),
                "type": "single",
                "max_selections": 1,
                "is_anonymous": False,
                "owner_user_id": user.id,
                "variants": ["A", "B"],
            },
            {
                "title": "Сортировка по названию 3",
                "description": "Для пагинации и сортировки.",
                "deadline_iso": now + timedelta(days=7),
                "type": "single",
                "max_selections": 1,
                "is_anonymous": True,
                "owner_user_id": admin.id,
                "variants": ["A", "B"],
            },
        ]

        for poll_data in polls:
            variants = poll_data.pop("variants")
            poll = Poll(**poll_data)
            db.add(poll)
            db.flush()
            for label in variants:
                db.add(PollVariant(poll_id=poll.id, label=label))

        db.commit()


if __name__ == "__main__":
    seed_users_and_polls()
