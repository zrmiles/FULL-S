from typing import List, Optional, Dict
from collections import defaultdict
import logging
import os
import shutil
import io
import csv
from pathlib import Path
from fastapi import FastAPI, HTTPException, Response, Depends, Header, Request, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid
from sqlalchemy.orm import Session
from database import get_db, create_tables
from models import Poll as PollModel, PollVariant, Vote as VoteModel, User as UserModel
from passlib.context import CryptContext
from sqlalchemy.exc import IntegrityError, NoSuchTableError, OperationalError
from sqlalchemy import text, inspect
class PollCreate(BaseModel):
    title: str
    description: Optional[str] = None
    deadlineISO: Optional[str] = None
    type: str = Field(default="single", pattern=r"^(single|multi)$")
    variants: List[str]
    maxSelections: Optional[int] = 1
    isAnonymous: Optional[bool] = True
    ownerUserId: Optional[str] = None


class Poll(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    deadlineISO: Optional[str] = None
    type: str
    variants: List[Dict[str, str]]  
    maxSelections: int = 1
    isAnonymous: bool = True
    ownerUserId: Optional[str] = None


class VoteRequest(BaseModel):
    userId: str
    choices: List[str]


class PublicVoter(BaseModel):
    id: str
    username: Optional[str] = None
    name: Optional[str] = None
    avatarUrl: Optional[str] = None


class ResultItem(BaseModel):
    id: str
    label: str
    count: int
    voters: Optional[List[PublicVoter]] = None


class VoteResult(BaseModel):
    pollId: str
    total: int
    results: List[ResultItem]
    isAnonymous: bool
    totalVoters: int
    participationRate: float  # Процент участия (если есть данные о приглашенных)


app = FastAPI(title="MTUCI Backend", version="0.1.0")

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
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


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


def ensure_vote_constraints(db: Session) -> None:
    """Ensure votes table allows multi-select per variant."""
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
# ===== Users API =====

class UserCreate(BaseModel):
    email: str
    name: str
    role: str = Field(default="user", pattern=r"^(admin|user)$")


class User(BaseModel):
    id: str
    email: str
    name: str
    role: str
    username: Optional[str] = None
    avatarUrl: Optional[str] = None


# Legacy create_user (not password-based). Prefer /auth/register
@app.post("/users", response_model=User, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(UserModel).filter(UserModel.email == body.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="User with this email already exists")
    # generate temp username/password (not for production)
    tmp_username = body.email.split("@")[0]
    user = UserModel(email=body.email, name=body.name, role=body.role, username=tmp_username, password_hash=hash_password("changeme"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return serialize_user_model(user)


@app.get("/users", response_model=List[User])
def list_users(db: Session = Depends(get_db)):
    users = db.query(UserModel).all()
    return [serialize_user_model(u) for u in users]


@app.get("/users/{user_id}", response_model=User)
def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return serialize_user_model(user)


class RegisterRequest(BaseModel):
    username: str
    email: str
    name: str
    password: str
    role: str = Field(default="user", pattern=r"^(admin|user)$")


class UserUpdate(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=6)


def _require_user_from_header(db: Session, x_user_id: Optional[str]) -> UserModel:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user context")
    user = db.query(UserModel).filter(UserModel.id == x_user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")
    return user


def serialize_user_model(user: UserModel) -> User:
    return User(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        username=user.username,
        avatarUrl=user.avatar_url,
    )

@app.post("/auth/register", response_model=User, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db), x_admin_token: Optional[str] = Header(default=None)):
    try:
        # Ensure database structure is up to date before any operations
        create_tables()
        ensure_user_columns(db)
        # pre-check for clarity
        if db.query(UserModel).filter((UserModel.email == body.email) | (UserModel.username == body.username)).first():
            raise HTTPException(status_code=409, detail="User with this email or username already exists")
        desired_role = body.role or "user"
        if desired_role == "admin":
            existing_admin = db.query(UserModel).filter(UserModel.role == "admin").first()
            if ADMIN_SECRET:
                if x_admin_token != ADMIN_SECRET:
                    raise HTTPException(status_code=403, detail="Admin token is invalid or missing")
            else:
                if existing_admin:
                    raise HTTPException(status_code=403, detail="Admin registration disabled")
        user = UserModel(
            email=body.email,
            name=body.name,
            role=desired_role,
            username=body.username,
            password_hash=hash_password(body.password)
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Registered new user %s (%s)", user.id, user.email)
        return serialize_user_model(user)
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Registration conflict for %s: %s", body.email, exc)
        raise HTTPException(status_code=409, detail="User with this email or username already exists")
    except OperationalError as exc:
        db.rollback()
        logger.exception("Database unavailable during registration for %s", body.email)
        raise HTTPException(status_code=503, detail="Database unavailable")
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception("Unexpected error during registration for %s", body.email)
        raise


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/auth/login", response_model=User)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    try:
        create_tables()
        ensure_user_columns(db)
        ensure_vote_constraints(db)
        user = db.query(UserModel).filter(UserModel.username == body.username).first()
        if not user or not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        logger.info("User %s logged in", user.id)
        return serialize_user_model(user)
    except OperationalError:
        logger.exception("Database unavailable during login for %s", body.username)
        raise HTTPException(status_code=503, detail="Database unavailable")


@app.get("/me", response_model=User)
def read_profile(db: Session = Depends(get_db), x_user_id: Optional[str] = Header(default=None)):
    user = _require_user_from_header(db, x_user_id)
    return serialize_user_model(user)


@app.put("/me", response_model=User)
def update_profile(body: UserUpdate, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(default=None)):
    user = _require_user_from_header(db, x_user_id)
    changed = False

    if body.email and body.email != user.email:
        if db.query(UserModel).filter(UserModel.email == body.email, UserModel.id != user.id).first():
            raise HTTPException(status_code=409, detail="Email already exists")
        user.email = body.email
        changed = True

    if body.name and body.name != user.name:
        user.name = body.name
        changed = True

    if body.password:
        user.password_hash = hash_password(body.password)
        changed = True

    if changed:
        db.add(user)
        db.commit()
        db.refresh(user)

    return serialize_user_model(user)


@app.post("/me/avatar", response_model=User)
async def upload_avatar(file: UploadFile = File(...), db: Session = Depends(get_db), x_user_id: Optional[str] = Header(default=None)):
    user = _require_user_from_header(db, x_user_id)
    if file.content_type not in {"image/png", "image/jpeg", "image/jpg"}:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    ext = ".jpg"
    if file.content_type == "image/png":
        ext = ".png"
    # remove previous avatar file if exists
    if user.avatar_url:
        old_path = user.avatar_url.split("?")[0]
        old_name = Path(old_path).name
        if old_name:
            old_file = AVATAR_DIR / old_name
            if old_file.exists():
                try:
                    old_file.unlink()
                except Exception:
                    logger.warning("Failed to remove old avatar %s", old_file)
    filename = f"{user.id}_{uuid.uuid4().hex}{ext}"
    path = AVATAR_DIR / filename
    with path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    user.avatar_url = f"/static/avatars/{filename}"
    db.add(user)
    db.commit()
    db.refresh(user)
    return serialize_user_model(user)


origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost",
    "http://127.0.0.1",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Remove in-memory storage - now using database


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_id = str(uuid.uuid4())
    logger.exception("Unhandled error %s for %s %s", error_id, request.method, request.url, exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error. Check server logs with errorId for details.",
            "errorId": error_id,
        },
    )


@app.get("/")
def root():
    return {"name": "MTUCI Backend", "version": "0.1.0", "docs": "/docs"}


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.get("/polls", response_model=List[Poll])
def list_polls(db: Session = Depends(get_db)):
    polls = db.query(PollModel).all()
    return [
        Poll(
            id=poll.id,
            title=poll.title,
            description=poll.description,
            deadlineISO=poll.deadline_iso.isoformat() if poll.deadline_iso else None,
            type=poll.type,
            variants=[{"id": v.id, "label": v.label} for v in poll.variants],
            maxSelections=poll.max_selections,
            isAnonymous=poll.is_anonymous,
            ownerUserId=poll.owner_user_id
        )
        for poll in polls
    ]


@app.post("/polls", response_model=Poll, status_code=201)
def create_poll(body: PollCreate, db: Session = Depends(get_db)):
    if body.type == "multi" and (body.maxSelections is None or body.maxSelections < 1):
        raise HTTPException(status_code=400, detail="maxSelections must be >= 1 for multi polls")
    if len(body.variants) < 2:
        raise HTTPException(status_code=400, detail="Provide at least two variants")

    # Validate owner if provided
    if body.ownerUserId:
        owner = db.query(UserModel).filter(UserModel.id == body.ownerUserId).first()
        if not owner:
            raise HTTPException(status_code=400, detail="Owner user not found")

    deadline_dt = None
    now_utc = datetime.now(timezone.utc)
    if body.deadlineISO:
        try:
            deadline_dt = datetime.fromisoformat(body.deadlineISO.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid deadline format")
        if deadline_dt.tzinfo is None:
            deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)
        else:
            deadline_dt = deadline_dt.astimezone(timezone.utc)
        if deadline_dt <= now_utc:
            raise HTTPException(status_code=400, detail="Deadline must be in the future")

    # Create poll
    poll = PollModel(
        title=body.title,
        description=body.description,
        deadline_iso=deadline_dt,
        type=body.type,
        max_selections=body.maxSelections or 1,
        is_anonymous=body.isAnonymous if body.isAnonymous is not None else True,
        owner_user_id=body.ownerUserId
    )
    db.add(poll)
    db.flush()  # Get the ID
    
    # Create variants
    for variant_label in body.variants:
        variant = PollVariant(
            poll_id=poll.id,
            label=variant_label
        )
        db.add(variant)
    
    db.commit()
    db.refresh(poll)
    
    # Return in API format
    return Poll(
        id=poll.id,
        title=poll.title,
        description=poll.description,
        deadlineISO=poll.deadline_iso.isoformat() if poll.deadline_iso else None,
        type=poll.type,
        variants=[{"id": v.id, "label": v.label} for v in poll.variants],
        maxSelections=poll.max_selections,
        isAnonymous=poll.is_anonymous,
        ownerUserId=poll.owner_user_id
    )


@app.get("/polls/{poll_id}", response_model=Poll)
def get_poll(poll_id: str, db: Session = Depends(get_db)):
    poll = db.query(PollModel).filter(PollModel.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    
    return Poll(
        id=poll.id,
        title=poll.title,
        description=poll.description,
        deadlineISO=poll.deadline_iso.isoformat() if poll.deadline_iso else None,
        type=poll.type,
        variants=[{"id": v.id, "label": v.label} for v in poll.variants],
        maxSelections=poll.max_selections,
        isAnonymous=poll.is_anonymous,
        ownerUserId=poll.owner_user_id
    )


@app.post("/polls/{poll_id}/vote")
def vote(poll_id: str, body: VoteRequest, db: Session = Depends(get_db)):
    poll = db.query(PollModel).filter(PollModel.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if not body.choices:
        raise HTTPException(status_code=400, detail="choices must be non-empty")
    if poll.deadline_iso:
        deadline_dt = poll.deadline_iso
        if deadline_dt.tzinfo is None:
            deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)
        current_utc = datetime.now(timezone.utc)
        if current_utc > deadline_dt:
            raise HTTPException(status_code=403, detail="Poll is closed")

    # Validate user
    user = db.query(UserModel).filter(UserModel.id == body.userId).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    # Get variant IDs for this poll
    variant_ids = {v.id for v in poll.variants}
    invalid = [c for c in body.choices if c not in variant_ids]
    if invalid:
        raise HTTPException(status_code=400, detail=f"invalid choices: {invalid}")

    # Ensure unique choices
    unique_choices = list(dict.fromkeys(body.choices))

    if poll.type == "single" and len(unique_choices) != 1:
        raise HTTPException(status_code=400, detail="single poll requires exactly one choice")
    if poll.type == "multi" and len(unique_choices) > poll.max_selections:
        raise HTTPException(status_code=400, detail=f"too many choices, max {poll.max_selections}")

    # Delete existing votes for this user in this poll
    db.query(VoteModel).filter(
        VoteModel.poll_id == poll_id,
        VoteModel.user_id == body.userId
    ).delete()
    
    # Create new votes
    for choice_id in unique_choices:
        vote = VoteModel(
            poll_id=poll_id,
            variant_id=choice_id,
            user_id=body.userId
        )
        db.add(vote)
    
    db.commit()
    return {"status": "ok"}


@app.get("/polls/{poll_id}/results", response_model=VoteResult)
def get_results(
    poll_id: str,
    db: Session = Depends(get_db),
    format: Optional[str] = Query(default=None),
):
    poll = db.query(PollModel).filter(PollModel.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    # Count votes for each variant
    from sqlalchemy import func
    vote_counts = db.query(
        VoteModel.variant_id,
        func.count(VoteModel.id).label('count')
    ).filter(VoteModel.poll_id == poll_id).group_by(VoteModel.variant_id).all()
    
    # Count unique voters
    unique_voters = db.query(func.count(func.distinct(VoteModel.user_id))).filter(
        VoteModel.poll_id == poll_id
    ).scalar() or 0
    
    counts = {variant_id: count for variant_id, count in vote_counts}
    total = sum(counts.values())
    
    voter_map: Dict[str, List[PublicVoter]] = defaultdict(list)
    if not poll.is_anonymous:
        vote_details = (
            db.query(
                VoteModel.variant_id,
                UserModel.id,
                UserModel.username,
                UserModel.name,
                UserModel.avatar_url,
            )
            .join(UserModel, UserModel.id == VoteModel.user_id)
            .filter(VoteModel.poll_id == poll_id)
            .all()
        )
        for variant_id, user_id, username, name, avatar in vote_details:
            voter_map[variant_id].append(
                PublicVoter(
                    id=user_id,
                    username=name or username,
                    name=name,
                    avatarUrl=avatar,
                )
            )

    items: List[ResultItem] = []
    for v in poll.variants:
        items.append(
            ResultItem(
                id=v.id,
                label=v.label,
                count=counts.get(v.id, 0),
                voters=voter_map.get(v.id) if not poll.is_anonymous else None,
            )
        )
    
    result_payload = VoteResult(
        pollId=poll_id, 
        total=total, 
        results=items,
        isAnonymous=poll.is_anonymous,
        totalVoters=unique_voters,
        participationRate=100.0  # Пока всегда 100%, можно добавить логику расчета
    )
    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Вариант", "Количество голосов", "Голосовали"])
        for item in items:
            if poll.is_anonymous or not item.voters:
                voters_str = "—"
            else:
                names = [
                    (v.name or v.username or "").strip()
                    for v in item.voters
                    if (v.name or v.username)
                ]
                voters_str = ", ".join(names) if names else "—"
            writer.writerow([item.label, item.count, voters_str])
        csv_content = output.getvalue()
        safe_title = "".join(c for c in (poll.title or "poll") if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
        filename = f'{safe_title or "poll"}-results.csv'
        ascii_filename = filename.encode("ascii", "ignore").decode() or "results.csv"
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{ascii_filename}"'
            },
        )
    return result_payload


@app.delete("/polls/{poll_id}")
def delete_poll(poll_id: str, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(default=None)):
    """Delete a poll and all its data"""
    poll = db.query(PollModel).filter(PollModel.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    # Authorization: only admin
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user context")
    user = db.query(UserModel).filter(UserModel.id == x_user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # Delete poll (cascade will handle variants and votes)
    db.delete(poll)
    db.commit()
    return {"status": "ok", "message": "Poll deleted successfully"}


@app.on_event("startup")
def startup_event():
    """Initialize database tables"""
    try:
        create_tables()
        db_gen = get_db()
        db = next(db_gen)
        try:
            ensure_user_columns(db)
            ensure_vote_constraints(db)
        finally:
            db.close()
            try:
                db_gen.close()
            except Exception:
                pass
    except OperationalError:
        logger.exception("Database initialization failed: database unavailable")
    except Exception:
        logger.exception("Database initialization failed")
