from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class PollCreate(BaseModel):
    title: str
    description: Optional[str] = None
    deadlineISO: Optional[str] = None
    type: str = Field(default="single", pattern=r"^(single|multi)$")
    variants: List[str]
    maxSelections: Optional[int] = 1
    isAnonymous: Optional[bool] = True
    ownerUserId: Optional[str] = None


class PollUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    deadlineISO: Optional[str] = None
    type: Optional[str] = Field(default=None, pattern=r"^(single|multi)$")
    variants: Optional[List[str]] = None
    maxSelections: Optional[int] = None
    isAnonymous: Optional[bool] = None


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


class PollListResponse(BaseModel):
    items: List[Poll]
    total: int


class PollAttachment(BaseModel):
    id: str
    pollId: str
    originalName: str
    contentType: str
    sizeBytes: int
    uploaderUserId: str
    createdAt: str
    downloadUrl: str


class PollAttachmentListResponse(BaseModel):
    items: List[PollAttachment]


class VoteRequest(BaseModel):
    # Legacy field kept for backward compatibility; server uses current user from access token.
    userId: Optional[str] = None
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
    participationRate: float


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


class RoleUpdateRequest(BaseModel):
    role: str = Field(..., pattern=r"^(admin|user)$")


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenPair(BaseModel):
    accessToken: str
    refreshToken: str
    tokenType: str
    accessTokenExpiresIn: int
    refreshTokenExpiresIn: int


class AuthResponse(BaseModel):
    user: User
    tokens: TokenPair


class RefreshRequest(BaseModel):
    refreshToken: str


class LogoutRequest(BaseModel):
    refreshToken: str
