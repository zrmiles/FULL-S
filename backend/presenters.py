from models import User as UserModel
from schemas import TokenPair, User
from services.auth_service import AuthTokens


def serialize_user_model(user: UserModel) -> User:
    return User(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        username=user.username,
        avatarUrl=user.avatar_url,
    )


def serialize_tokens(tokens: AuthTokens) -> TokenPair:
    return TokenPair(
        accessToken=tokens.access_token,
        refreshToken=tokens.refresh_token,
        tokenType=tokens.token_type,
        accessTokenExpiresIn=tokens.access_expires_in,
        refreshTokenExpiresIn=tokens.refresh_expires_in,
    )
