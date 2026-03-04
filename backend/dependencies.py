from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from authz import user_has_permission
from database import get_db
from models import User as UserModel
from repositories.auth_repository import RefreshSessionRepository, UserRepository
from runtime import logger, verify_password
from services.auth_service import AuthError, AuthService, TokenService, load_auth_settings

auth_settings = load_auth_settings()
if auth_settings.secret_key == "dev-insecure-jwt-secret":
    logger.warning("JWT_SECRET is not configured. Using insecure development secret.")

token_service = TokenService(auth_settings)
bearer_scheme = HTTPBearer(auto_error=False)


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(
        user_repo=UserRepository(db),
        refresh_repo=RefreshSessionRepository(db),
        token_service=token_service,
        verify_password=verify_password,
    )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    auth_service: AuthService = Depends(get_auth_service),
) -> UserModel:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        return auth_service.resolve_user_from_access_token(credentials.credentials)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def require_permission(permission: str):
    def dependency(current_user: UserModel = Depends(get_current_user)) -> UserModel:
        if not user_has_permission(current_user, permission):
            raise HTTPException(status_code=403, detail="Forbidden")
        return current_user

    return dependency
