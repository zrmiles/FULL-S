from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("survey_backend.database")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_PATH = BASE_DIR / "survey.db"
DEFAULT_POSTGRES_URL = "postgresql+psycopg://uralazarev@localhost:5432/survey_db"

USE_SQLITE = os.getenv("USE_SQLITE", "false").lower() in {"1", "true", "yes"}

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH}" if USE_SQLITE else DEFAULT_POSTGRES_URL

engine_kwargs = {
    "echo": os.getenv("SQLALCHEMY_ECHO", "true").lower() in {"1", "true", "yes"},
    "pool_pre_ping": True,
}

if DATABASE_URL.startswith("sqlite"):
    DEFAULT_SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    logger.info("Using SQLite database at %s", DEFAULT_SQLITE_PATH)
else:
    logger.info("Using database at %s", DATABASE_URL)

# Create engine
engine = create_engine(DATABASE_URL, **engine_kwargs)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all tables in the database"""
    from models import Base
    Base.metadata.create_all(bind=engine)
