from datetime import datetime

from fastapi import APIRouter, Response

router = APIRouter(tags=["core"])


@router.get("/")
def root():
    return {"name": "MTUCI Backend", "version": "0.1.0", "docs": "/docs"}


@router.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@router.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}
