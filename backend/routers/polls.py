import csv
import io
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from minio.error import S3Error
from sqlalchemy import asc, desc, func, or_
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from authz import (
    PERM_POLLS_ASSIGN_OWNER,
    PERM_POLLS_CREATE,
    PERM_POLLS_VOTE,
    can_manage_poll,
    user_has_permission,
)
from database import get_db
from dependencies import get_current_user, require_permission
from models import Poll as PollModel
from models import PollAttachment as PollAttachmentModel
from models import PollVariant, User as UserModel
from models import Vote as VoteModel
from runtime import MINIO_BUCKET, MINIO_CLIENT, logger
from schemas import (
    Poll,
    PollAttachment,
    PollAttachmentListResponse,
    PollCreate,
    PollListResponse,
    PollUpdate,
    PublicVoter,
    ResultItem,
    VoteRequest,
    VoteResult,
)

router = APIRouter(tags=["polls"])

POLL_DEFAULT_LIMIT = 8
POLL_MAX_LIMIT = 50
POLL_ALLOWED_SORT_BY = {"deadline", "created", "title"}
POLL_ALLOWED_SORT_ORDER = {"asc", "desc"}
ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024
ATTACHMENT_ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
    "text/plain",
}
MIN_SORT_DATETIME = datetime(1970, 1, 1)


def _sanitize_filename(name: Optional[str]) -> str:
    raw = Path(name or "file").name
    safe = "".join(ch for ch in raw if ch.isalnum() or ch in ("-", "_", ".")).strip("._")
    return safe or "file"


def _poll_attachment_download_url(poll_id: str, attachment_id: str) -> str:
    return f"/polls/{poll_id}/attachments/{attachment_id}/download"


def _close_minio_response(response) -> None:
    try:
        response.close()
    except Exception:
        pass
    try:
        response.release_conn()
    except Exception:
        pass


def _serialize_attachment(attachment: PollAttachmentModel) -> PollAttachment:
    return PollAttachment(
        id=attachment.id,
        pollId=attachment.poll_id,
        originalName=attachment.original_name,
        contentType=attachment.content_type,
        sizeBytes=attachment.size_bytes,
        uploaderUserId=attachment.uploader_user_id,
        createdAt=attachment.created_at.isoformat(),
        downloadUrl=_poll_attachment_download_url(attachment.poll_id, attachment.id),
    )


@router.get("/polls", response_model=PollListResponse)
def list_polls(
    status: Literal["all", "active", "completed", "upcoming"] = Query("all"),
    search: Optional[str] = Query(default=None, min_length=1, max_length=120),
    is_anonymous: Optional[bool] = Query(default=None, alias="isAnonymous"),
    owner_user_id: Optional[str] = Query(default=None, alias="ownerUserId"),
    sort_by: str = Query(default="deadline", alias="sortBy"),
    sort_order: str = Query(default="asc", alias="sortOrder"),
    page: int = Query(1, ge=1),
    limit: int = Query(POLL_DEFAULT_LIMIT, ge=1, le=POLL_MAX_LIMIT),
    db: Session = Depends(get_db),
):
    if sort_by not in POLL_ALLOWED_SORT_BY:
        raise HTTPException(status_code=400, detail=f"Unsupported sortBy, allowed: {sorted(POLL_ALLOWED_SORT_BY)}")
    if sort_order not in POLL_ALLOWED_SORT_ORDER:
        raise HTTPException(status_code=400, detail=f"Unsupported sortOrder, allowed: {sorted(POLL_ALLOWED_SORT_ORDER)}")

    offset = (page - 1) * limit
    now = datetime.now(timezone.utc)
    base_query = db.query(PollModel)
    if status == "active":
        base_query = base_query.filter(
            PollModel.deadline_iso.isnot(None),
            PollModel.deadline_iso > now,
        )
    elif status == "completed":
        base_query = base_query.filter(
            PollModel.deadline_iso.isnot(None),
            PollModel.deadline_iso <= now,
        )
    elif status == "upcoming":
        base_query = base_query.filter(PollModel.deadline_iso.is_(None))

    if search and search.strip():
        pattern = f"%{search.strip().lower()}%"
        base_query = base_query.filter(
            or_(
                func.lower(PollModel.title).like(pattern),
                func.lower(func.coalesce(PollModel.description, "")).like(pattern),
            )
        )
    if is_anonymous is not None:
        base_query = base_query.filter(PollModel.is_anonymous == is_anonymous)
    if owner_user_id:
        base_query = base_query.filter(PollModel.owner_user_id == owner_user_id)

    if sort_by == "title":
        order_expr = func.lower(PollModel.title)
    elif sort_by == "created":
        order_expr = PollModel.created_at
    else:
        if sort_order == "asc":
            order_expr = func.coalesce(PollModel.deadline_iso, datetime.max)
        else:
            order_expr = func.coalesce(PollModel.deadline_iso, MIN_SORT_DATETIME)
    order_clause = asc(order_expr) if sort_order == "asc" else desc(order_expr)

    total = base_query.count()
    polls = (
        base_query
        .order_by(order_clause)
        .offset(offset)
        .limit(limit)
        .all()
    )

    payload = []
    for poll in polls:
        payload.append(
            Poll(
                id=poll.id,
                title=poll.title,
                description=poll.description,
                deadlineISO=poll.deadline_iso.isoformat() if poll.deadline_iso else None,
                type=poll.type,
                variants=[{"id": v.id, "label": v.label} for v in poll.variants],
                maxSelections=poll.max_selections,
                isAnonymous=poll.is_anonymous,
                ownerUserId=poll.owner_user_id,
            )
        )

    return PollListResponse(items=payload, total=total)


@router.post("/polls", response_model=Poll, status_code=201)
def create_poll(
    body: PollCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_permission(PERM_POLLS_CREATE)),
):
    if body.type == "multi" and (body.maxSelections is None or body.maxSelections < 1):
        raise HTTPException(status_code=400, detail="maxSelections must be >= 1 for multi polls")
    if len(body.variants) < 2:
        raise HTTPException(status_code=400, detail="Provide at least two variants")

    owner_user_id = current_user.id
    # Only users with explicit permission can assign owner other than themselves.
    if body.ownerUserId:
        if body.ownerUserId != current_user.id and not user_has_permission(current_user, PERM_POLLS_ASSIGN_OWNER):
            raise HTTPException(status_code=403, detail="Forbidden")
        owner = db.query(UserModel).filter(UserModel.id == body.ownerUserId).first()
        if not owner:
            raise HTTPException(status_code=400, detail="Owner user not found")
        owner_user_id = body.ownerUserId

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
        owner_user_id=owner_user_id
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


@router.put("/polls/{poll_id}", response_model=Poll)
def update_poll(
    poll_id: str,
    body: PollUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    poll = db.query(PollModel).filter(PollModel.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if not can_manage_poll(current_user, poll):
        raise HTTPException(status_code=403, detail="Forbidden")

    if body.title is not None:
        title = body.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        poll.title = title
    if body.description is not None:
        poll.description = body.description.strip()

    updated_type = body.type or poll.type
    updated_max = body.maxSelections if body.maxSelections is not None else poll.max_selections
    if updated_type == "single":
        updated_max = 1
    if updated_type == "multi" and (updated_max is None or updated_max < 1):
        raise HTTPException(status_code=400, detail="maxSelections must be >= 1 for multi polls")
    poll.type = updated_type
    poll.max_selections = updated_max

    if body.isAnonymous is not None:
        poll.is_anonymous = body.isAnonymous

    if body.deadlineISO is not None:
        if body.deadlineISO.strip() == "":
            poll.deadline_iso = None
        else:
            try:
                deadline_dt = datetime.fromisoformat(body.deadlineISO.replace("Z", "+00:00"))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid deadline format")
            if deadline_dt.tzinfo is None:
                deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)
            else:
                deadline_dt = deadline_dt.astimezone(timezone.utc)
            if deadline_dt <= datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="Deadline must be in the future")
            poll.deadline_iso = deadline_dt

    if body.variants is not None:
        normalized = [variant.strip() for variant in body.variants if variant.strip()]
        if len(normalized) < 2:
            raise HTTPException(status_code=400, detail="Provide at least two variants")
        db.query(VoteModel).filter(VoteModel.poll_id == poll_id).delete()
        db.query(PollVariant).filter(PollVariant.poll_id == poll_id).delete()
        for variant_label in normalized:
            db.add(PollVariant(poll_id=poll_id, label=variant_label))

    db.add(poll)
    db.commit()
    db.refresh(poll)
    return Poll(
        id=poll.id,
        title=poll.title,
        description=poll.description,
        deadlineISO=poll.deadline_iso.isoformat() if poll.deadline_iso else None,
        type=poll.type,
        variants=[{"id": v.id, "label": v.label} for v in poll.variants],
        maxSelections=poll.max_selections,
        isAnonymous=poll.is_anonymous,
        ownerUserId=poll.owner_user_id,
    )


@router.get("/polls/{poll_id}", response_model=Poll)
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


@router.post("/polls/{poll_id}/vote")
def vote(
    poll_id: str,
    body: VoteRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_permission(PERM_POLLS_VOTE)),
):
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

    if body.userId and body.userId != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot vote on behalf of another user")

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
        VoteModel.user_id == current_user.id
    ).delete()

    # Create new votes
    for choice_id in unique_choices:
        vote = VoteModel(
            poll_id=poll_id,
            variant_id=choice_id,
            user_id=current_user.id
        )
        db.add(vote)

    db.commit()
    return {"status": "ok"}


@router.get("/polls/{poll_id}/results", response_model=VoteResult)
def get_results(
    poll_id: str,
    db: Session = Depends(get_db),
    format: Optional[str] = Query(default=None),
):
    poll = db.query(PollModel).filter(PollModel.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    # Count votes for each variant
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


@router.delete("/polls/{poll_id}")
def delete_poll(
    poll_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Delete a poll and all its data"""
    poll = db.query(PollModel).filter(PollModel.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if not can_manage_poll(current_user, poll):
        raise HTTPException(status_code=403, detail="Forbidden")

    attachments = (
        db.query(PollAttachmentModel)
        .filter(PollAttachmentModel.poll_id == poll_id)
        .all()
    )
    if attachments and MINIO_CLIENT:
        for attachment in attachments:
            try:
                MINIO_CLIENT.remove_object(MINIO_BUCKET, attachment.object_name)
            except S3Error:
                logger.exception("Failed to remove attachment object %s while deleting poll", attachment.object_name)
                raise HTTPException(status_code=502, detail="Failed to remove attached files")

    # Delete poll (cascade will handle variants and votes)
    db.delete(poll)
    db.commit()
    return {"status": "ok", "message": "Poll deleted successfully"}


@router.get("/polls/{poll_id}/attachments", response_model=PollAttachmentListResponse)
def list_poll_attachments(
    poll_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    _ = current_user
    poll = db.query(PollModel).filter(PollModel.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if not MINIO_CLIENT:
        raise HTTPException(status_code=503, detail="File storage is not configured")

    attachments = (
        db.query(PollAttachmentModel)
        .filter(PollAttachmentModel.poll_id == poll_id)
        .order_by(desc(PollAttachmentModel.created_at))
        .all()
    )
    return PollAttachmentListResponse(items=[_serialize_attachment(item) for item in attachments])


@router.post("/polls/{poll_id}/attachments", response_model=PollAttachment, status_code=201)
async def upload_poll_attachment(
    poll_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    poll = db.query(PollModel).filter(PollModel.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if not can_manage_poll(current_user, poll):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not MINIO_CLIENT:
        raise HTTPException(status_code=503, detail="File storage is not configured")
    if file.content_type not in ATTACHMENT_ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(payload) > ATTACHMENT_MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File is too large. Max size is {ATTACHMENT_MAX_SIZE_BYTES // (1024 * 1024)} MB",
        )

    safe_name = _sanitize_filename(file.filename)
    object_name = f"attachments/{poll_id}/{uuid.uuid4().hex}-{safe_name}"
    try:
        MINIO_CLIENT.put_object(
            MINIO_BUCKET,
            object_name,
            io.BytesIO(payload),
            length=len(payload),
            content_type=file.content_type,
        )
    except S3Error:
        logger.exception("Failed to upload poll attachment for poll %s", poll_id)
        raise HTTPException(status_code=502, detail="Failed to store file")

    attachment = PollAttachmentModel(
        poll_id=poll_id,
        uploader_user_id=current_user.id,
        original_name=safe_name,
        content_type=file.content_type,
        size_bytes=len(payload),
        object_name=object_name,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return _serialize_attachment(attachment)


@router.delete("/polls/{poll_id}/attachments/{attachment_id}")
def delete_poll_attachment(
    poll_id: str,
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    poll = db.query(PollModel).filter(PollModel.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if not can_manage_poll(current_user, poll):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not MINIO_CLIENT:
        raise HTTPException(status_code=503, detail="File storage is not configured")

    attachment = (
        db.query(PollAttachmentModel)
        .filter(PollAttachmentModel.id == attachment_id, PollAttachmentModel.poll_id == poll_id)
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    try:
        MINIO_CLIENT.remove_object(MINIO_BUCKET, attachment.object_name)
    except S3Error:
        logger.exception("Failed to remove attachment object %s", attachment.object_name)
        raise HTTPException(status_code=502, detail="Failed to remove file")

    db.delete(attachment)
    db.commit()
    return {"status": "ok"}


@router.get("/polls/{poll_id}/attachments/{attachment_id}/download")
def download_poll_attachment(
    poll_id: str,
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    _ = current_user
    if not MINIO_CLIENT:
        raise HTTPException(status_code=503, detail="File storage is not configured")

    attachment = (
        db.query(PollAttachmentModel)
        .filter(PollAttachmentModel.id == attachment_id, PollAttachmentModel.poll_id == poll_id)
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    try:
        object_response = MINIO_CLIENT.get_object(MINIO_BUCKET, attachment.object_name)
    except S3Error:
        logger.exception("Failed to download attachment object %s", attachment.object_name)
        raise HTTPException(status_code=502, detail="Failed to read file")

    ascii_filename = attachment.original_name.encode("ascii", "ignore").decode() or "attachment"
    return StreamingResponse(
        object_response.stream(32 * 1024),
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{ascii_filename}"',
        },
        background=BackgroundTask(_close_minio_response, object_response),
    )
