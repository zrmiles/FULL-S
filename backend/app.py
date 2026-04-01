import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from database import get_db
from routers.auth import router as auth_router
from routers.core import router as core_router
from routers.external import router as external_router
from routers.polls import router as polls_router
from routers.users import router as users_router
from runtime import STATIC_DIR, ensure_minio_bucket, ensure_runtime_schema, logger

app = FastAPI(title="MTUCI Backend", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost",
    "http://127.0.0.1",
]
origins = [
    origin.strip()
    for origin in os.getenv("BACKEND_CORS_ORIGINS", ",".join(default_origins)).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=700)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import uuid

    error_id = str(uuid.uuid4())
    logger.exception("Unhandled error %s for %s %s", error_id, request.method, request.url, exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error. Check server logs with errorId for details.",
            "errorId": error_id,
        },
    )


app.include_router(core_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(polls_router)
app.include_router(external_router)


@app.on_event("startup")
def startup_event():
    """Initialize database tables"""
    db_gen = None
    db = None
    try:
        db_gen = get_db()
        db = next(db_gen)
        ensure_runtime_schema(db, include_vote_constraints=True)
    except OperationalError:
        logger.exception("Database initialization failed: database unavailable")
    except Exception:
        logger.exception("Database initialization failed")
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass
        if db_gen is not None:
            try:
                db_gen.close()
            except Exception:
                pass

    try:
        ensure_minio_bucket()
    except Exception:
        logger.exception("Object storage initialization failed")
