import logging
import os
from pathlib import Path
from typing import List, Optional

from minio import Minio
from minio.error import S3Error
from passlib.context import CryptContext
from sqlalchemy import inspect, text
from sqlalchemy.exc import NoSuchTableError
from sqlalchemy.orm import Session

from database import create_tables

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

logger = logging.getLogger("survey_backend")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

ADMIN_SECRET = os.getenv("ADMIN_SECRET")
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
AVATAR_DIR = STATIC_DIR / "avatars"
STATIC_DIR.mkdir(exist_ok=True)
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "avatars")
MINIO_USE_SSL = os.getenv("MINIO_USE_SSL", "false").lower() in {"1", "true", "yes"}
MINIO_PUBLIC_URL = os.getenv("MINIO_PUBLIC_URL")
MINIO_CLIENT: Optional[Minio] = None

if MINIO_ENDPOINT and MINIO_ACCESS_KEY and MINIO_SECRET_KEY:
    try:
        MINIO_CLIENT = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_USE_SSL,
        )
        if not MINIO_PUBLIC_URL:
            scheme = "https" if MINIO_USE_SSL else "http"
            MINIO_PUBLIC_URL = f"{scheme}://{MINIO_ENDPOINT}"
        MINIO_PUBLIC_URL = MINIO_PUBLIC_URL.rstrip("/")
    except Exception:
        logger.exception("Failed to initialize MinIO client")
        MINIO_CLIENT = None
else:
    if MINIO_ENDPOINT or MINIO_ACCESS_KEY or MINIO_SECRET_KEY:
        logger.warning("MinIO configuration is incomplete; avatar uploads are disabled")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def ensure_runtime_schema(db: Session, include_vote_constraints: bool = False) -> None:
    """Initialize and align schema for runtime compatibility."""
    create_tables()
    ensure_user_columns(db)
    ensure_poll_columns(db)
    if include_vote_constraints:
        ensure_vote_constraints(db)


def ensure_user_columns(db: Session) -> None:
    """Ensure legacy databases have auth columns and constraints."""
    engine = db.get_bind()
    inspector = inspect(engine)

    try:
        columns = {col["name"] for col in inspector.get_columns("users")}
    except NoSuchTableError:
        # Table will be created on startup via create_tables()
        return

    statements: List[str] = []

    if "username" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN username VARCHAR")
        columns.add("username")
        logger.info("Added missing column users.username")
    if "password_hash" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN password_hash VARCHAR")
        columns.add("password_hash")
        logger.info("Added missing column users.password_hash")
    if "created_at" not in columns:
        default_expr = "CURRENT_TIMESTAMP"
        if engine.dialect.name in {"postgresql", "postgresql+psycopg2", "postgresql+psycopg"}:
            default_expr = "TIMEZONE('utc', NOW())"
        statements.append(f"ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT {default_expr}")
        columns.add("created_at")
        logger.info("Added missing column users.created_at")
    if "avatar_url" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN avatar_url VARCHAR")
        columns.add("avatar_url")
        logger.info("Added missing column users.avatar_url")

    executed = False
    for stmt in statements:
        db.execute(text(stmt))
        executed = True
    if executed:
        db.commit()

    # Backfill and deduplicate usernames
    if "username" in columns:
        rows = db.execute(
            text("SELECT id, email FROM users WHERE username IS NULL OR username = ''")
        ).fetchall()
        updated = 0
        for row in rows:
            base = (row.email.split("@")[0] if row.email else f"user_{row.id[:8]}") or f"user_{row.id[:8]}"
            base = base.lower()
            candidate = base
            suffix = 1
            while db.execute(
                text("SELECT 1 FROM users WHERE username = :username AND id <> :id"),
                {"username": candidate, "id": row.id},
            ).scalar():
                candidate = f"{base}{suffix}"
                suffix += 1
            db.execute(
                text("UPDATE users SET username = :username WHERE id = :id"),
                {"username": candidate, "id": row.id},
            )
            updated += 1
        if updated:
            db.commit()
            logger.info("Backfilled usernames for %s existing users", updated)

        duplicates = db.execute(
            text(
                """
                SELECT username FROM users
                WHERE username IS NOT NULL AND username <> ''
                GROUP BY username
                HAVING COUNT(*) > 1
                """
            )
        ).fetchall()

        deduped = 0
        for dup in duplicates:
            users = db.execute(
                text(
                    "SELECT id FROM users WHERE username = :username ORDER BY id"
                ),
                {"username": dup.username},
            ).fetchall()
            # keep the first record, adjust the rest
            for idx, user_row in enumerate(users[1:], start=1):
                candidate = f"{dup.username}{idx}"
                suffix = idx
                while db.execute(
                    text("SELECT 1 FROM users WHERE username = :username AND id <> :id"),
                    {"username": candidate, "id": user_row.id},
                ).scalar():
                    suffix += 1
                    candidate = f"{dup.username}{suffix}"
                db.execute(
                    text("UPDATE users SET username = :username WHERE id = :id"),
                    {"username": candidate, "id": user_row.id},
                )
                deduped += 1
        if deduped:
            db.commit()
            logger.warning("Resolved %s duplicate usernames in users table", deduped)

    if "password_hash" in columns:
        rows = db.execute(
            text("SELECT id FROM users WHERE password_hash IS NULL OR password_hash = ''")
        ).fetchall()
        if rows:
            for row in rows:
                db.execute(
                    text("UPDATE users SET password_hash = :password WHERE id = :id"),
                    {"password": hash_password("changeme"), "id": row.id},
                )
            db.commit()
            logger.info("Backfilled password hashes for %s existing users", len(rows))

    if "role" in columns:
        migrated = db.execute(
            text("UPDATE users SET role = 'admin' WHERE role = 'owner'")
        )
        if migrated.rowcount:
            db.commit()
            logger.info("Normalized %s legacy owner roles to admin", migrated.rowcount)

    unique_constraints = {
        tuple(uc.get("column_names", []))
        for uc in inspector.get_unique_constraints("users")
    }
    unique_indexes = {
        tuple(idx.get("column_names", []))
        for idx in inspector.get_indexes("users")
        if idx.get("unique")
    }

    idx_statements: List[str] = []
    if ("username",) not in unique_constraints and ("username",) not in unique_indexes:
        idx_statements.append("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (username)")
    if ("email",) not in unique_constraints and ("email",) not in unique_indexes:
        idx_statements.append("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (email)")

    ran_indexes = False
    for stmt in idx_statements:
        db.execute(text(stmt))
        ran_indexes = True
    if ran_indexes:
        db.commit()


def ensure_poll_columns(db: Session) -> None:
    """Ensure legacy databases contain poll ownership column."""
    inspector = inspect(db.get_bind())
    try:
        columns = {col["name"] for col in inspector.get_columns("polls")}
    except NoSuchTableError:
        return
    if "owner_user_id" in columns:
        return
    db.execute(text("ALTER TABLE polls ADD COLUMN owner_user_id VARCHAR"))
    db.commit()
    logger.info("Added missing column polls.owner_user_id")


def ensure_vote_constraints(db: Session) -> None:
    """Ensure votes table allows multi-select per variant."""
    if db.get_bind().dialect.name == "sqlite":
        # SQLite test environments build the current constraint layout from metadata,
        # but do not support the ALTER TABLE constraint operations used for Postgres.
        return
    inspector = inspect(db.get_bind())
    try:
        constraints = {uc.get("name") for uc in inspector.get_unique_constraints("votes")}
    except NoSuchTableError:
        return
    if "unique_user_poll_vote" in constraints:
        db.execute(text('ALTER TABLE votes DROP CONSTRAINT IF EXISTS unique_user_poll_vote'))
        db.commit()
        constraints.remove("unique_user_poll_vote")
    if "unique_user_poll_variant" not in constraints:
        db.execute(
            text('ALTER TABLE votes ADD CONSTRAINT unique_user_poll_variant UNIQUE (poll_id, user_id, variant_id)')
        )
        db.commit()


def ensure_minio_bucket() -> None:
    if not MINIO_CLIENT:
        return
    try:
        if not MINIO_CLIENT.bucket_exists(MINIO_BUCKET):
            MINIO_CLIENT.make_bucket(MINIO_BUCKET)
            logger.info("Created MinIO bucket %s", MINIO_BUCKET)
    except S3Error:
        logger.exception("Failed to ensure MinIO bucket %s", MINIO_BUCKET)
    except Exception:
        # Network/transport errors are not always wrapped as S3Error.
        logger.exception("Failed to connect to MinIO while ensuring bucket %s", MINIO_BUCKET)


def remove_existing_avatar_resource(avatar_url: Optional[str]) -> None:
    if not avatar_url:
        return
    if avatar_url.startswith("/static/avatars/"):
        old_path = avatar_url.split("?")[0]
        old_name = Path(old_path).name
        if old_name:
            old_file = AVATAR_DIR / old_name
            if old_file.exists():
                try:
                    old_file.unlink()
                except Exception:
                    logger.warning("Failed to remove legacy avatar %s", old_file)
        return
    if MINIO_CLIENT and MINIO_BUCKET:
        marker = f"/{MINIO_BUCKET}/"
        if marker in avatar_url:
            object_name = avatar_url.split(marker, 1)[1]
            if object_name:
                try:
                    MINIO_CLIENT.remove_object(MINIO_BUCKET, object_name)
                except S3Error:
                    logger.warning("Failed to remove old MinIO avatar object %s", object_name)
