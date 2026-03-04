import io
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from minio.error import S3Error
from sqlalchemy.orm import Session
from typing import List

from authz import (
    PERM_PROFILE_AVATAR_UPDATE,
    PERM_PROFILE_READ,
    PERM_PROFILE_UPDATE,
    PERM_USERS_READ_ALL,
    PERM_USERS_READ_SELF,
    PERM_USERS_ROLE_MANAGE,
    user_has_permission,
)
from database import get_db
from dependencies import get_current_user, require_permission
from models import User as UserModel
from presenters import serialize_user_model
from runtime import MINIO_BUCKET, MINIO_CLIENT, MINIO_PUBLIC_URL, hash_password, logger, remove_existing_avatar_resource
from schemas import RoleUpdateRequest, User, UserCreate, UserUpdate

router = APIRouter(tags=["users"])


@router.post("/users", response_model=User, status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_permission(PERM_USERS_ROLE_MANAGE)),
):
    _ = current_user
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


@router.get("/users", response_model=List[User])
def list_users(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_permission(PERM_USERS_READ_ALL)),
):
    _ = current_user
    users = db.query(UserModel).all()
    return [serialize_user_model(u) for u in users]


@router.get("/users/{user_id}", response_model=User)
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    if user_id == current_user.id:
        if not user_has_permission(current_user, PERM_USERS_READ_SELF):
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if not user_has_permission(current_user, PERM_USERS_READ_ALL):
            raise HTTPException(status_code=403, detail="Forbidden")
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return serialize_user_model(user)


@router.patch("/admin/users/{user_id}/role", response_model=User)
def update_user_role(
    user_id: str,
    body: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_permission(PERM_USERS_ROLE_MANAGE)),
):
    _ = current_user
    target = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.role == "admin" and body.role != "admin":
        admin_count = db.query(UserModel).filter(UserModel.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last admin")

    target.role = body.role
    db.add(target)
    db.commit()
    db.refresh(target)
    return serialize_user_model(target)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_permission(PERM_USERS_ROLE_MANAGE)),
):
    _ = current_user
    target = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == "admin":
        admin_count = db.query(UserModel).filter(UserModel.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")

    db.delete(target)
    db.commit()
    return {"status": "ok"}


@router.get("/me", response_model=User)
def read_profile(current_user: UserModel = Depends(require_permission(PERM_PROFILE_READ))):
    return serialize_user_model(current_user)


@router.put("/me", response_model=User)
def update_profile(
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_permission(PERM_PROFILE_UPDATE)),
):
    user = current_user
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


@router.post("/me/avatar", response_model=User)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_permission(PERM_PROFILE_AVATAR_UPDATE)),
):
    user = current_user
    if file.content_type not in {"image/png", "image/jpeg", "image/jpg"}:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    if not MINIO_CLIENT or not MINIO_PUBLIC_URL:
        raise HTTPException(status_code=503, detail="Avatar storage is not configured")

    ext = ".png" if file.content_type == "image/png" else ".jpg"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    object_name = f"{user.id}/{uuid.uuid4().hex}{ext}"
    remove_existing_avatar_resource(user.avatar_url)
    try:
        MINIO_CLIENT.put_object(
            MINIO_BUCKET,
            object_name,
            io.BytesIO(data),
            length=len(data),
            content_type=file.content_type,
        )
    except S3Error:
        logger.exception("Failed to upload avatar to MinIO for user %s", user.id)
        raise HTTPException(status_code=502, detail="Failed to store avatar")

    public_url = f"{MINIO_PUBLIC_URL}/{MINIO_BUCKET}/{object_name}"
    user.avatar_url = public_url
    db.add(user)
    db.commit()
    db.refresh(user)
    return serialize_user_model(user)
