from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_auth_service, get_current_user
from models import User as UserModel
from presenters import serialize_tokens, serialize_user_model
from runtime import ADMIN_SECRET, ensure_runtime_schema, hash_password, logger
from schemas import AuthResponse, LoginRequest, LogoutRequest, RefreshRequest, RegisterRequest, User
from services.auth_service import AuthError, AuthService

router = APIRouter(tags=["auth"])


def request_client_ip(request: Request) -> Optional[str]:
    if not request.client:
        return None
    return request.client.host


@router.post("/auth/register", response_model=User, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db), x_admin_token: Optional[str] = Header(default=None)):
    try:
        ensure_runtime_schema(db)
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
    except Exception:
        db.rollback()
        logger.exception("Unexpected error during registration for %s", body.email)
        raise


@router.post("/auth/login", response_model=AuthResponse)
def login(
    body: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service),
):
    try:
        ensure_runtime_schema(db, include_vote_constraints=True)
        user = auth_service.authenticate(body.username.strip(), body.password)
        tokens = auth_service.issue_tokens(
            user=user,
            user_agent=request.headers.get("user-agent"),
            ip_address=request_client_ip(request),
            revoke_existing=True,
        )
        logger.info("User %s logged in with refresh-session rotation", user.id)
        return AuthResponse(user=serialize_user_model(user), tokens=serialize_tokens(tokens))
    except AuthError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except OperationalError:
        db.rollback()
        logger.exception("Database unavailable during login for %s", body.username)
        raise HTTPException(status_code=503, detail="Database unavailable")


@router.post("/auth/refresh", response_model=AuthResponse)
def refresh_tokens(
    body: RefreshRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service),
):
    try:
        user, tokens = auth_service.refresh_tokens(
            refresh_token=body.refreshToken,
            user_agent=request.headers.get("user-agent"),
            ip_address=request_client_ip(request),
        )
        logger.info("Session rotated for user %s", user.id)
        return AuthResponse(user=serialize_user_model(user), tokens=serialize_tokens(tokens))
    except AuthError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/auth/logout")
def logout(
    body: LogoutRequest,
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service),
):
    try:
        auth_service.logout(refresh_token=body.refreshToken)
    except Exception:
        db.rollback()
        raise
    return {"status": "ok"}


@router.get("/auth/me", response_model=User)
def auth_me(current_user: UserModel = Depends(get_current_user)):
    return serialize_user_model(current_user)
