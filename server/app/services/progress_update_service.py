from datetime import datetime, timezone, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.progress_update import RequestUpdate
from app.models.request import Request
from app.models.user import User
from app.schemas.progress_update import (
    ProgressUpdateCreate, ProgressUpdateEdit,
    ProgressUpdateResponse, ProgressUpdateListResponse,
)
from app.utils.datetime_utils import now_beijing

BJT = timezone(timedelta(hours=8))
_24H = timedelta(hours=24)


def _parse_dt(dt_str: str | None) -> datetime | None:
    if not dt_str:
        return None
    try:
        return datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=BJT)
    except ValueError:
        return None


def _within_24h(created_at: str | None) -> bool:
    dt = _parse_dt(created_at)
    if dt is None:
        return False
    return datetime.now(BJT) - dt <= _24H


def _to_response(update: RequestUpdate, user_name: str, current_user_id: int) -> ProgressUpdateResponse:
    editable = update.user_id == current_user_id and _within_24h(update.created_at)
    return ProgressUpdateResponse(
        id=update.id,
        request_id=update.request_id,
        user_id=update.user_id,
        user_name=user_name,
        content=update.content,
        work_hours=update.work_hours,
        created_at=update.created_at,
        updated_at=update.updated_at,
        can_edit=editable,
        can_delete=editable,
    )


def create_update(
    db: Session, request_id: int, current_user: User, data: ProgressUpdateCreate
) -> ProgressUpdateResponse:
    req = db.get(Request, request_id)
    if not req or req.status == "deleted":
        raise HTTPException(404, "需求不存在")
    if req.status != "in_progress":
        raise HTTPException(400, "只能对处理中的需求记录进度")
    if req.researcher_id != current_user.id:
        raise HTTPException(403, "只有对接研究员可以记录进度")

    now = now_beijing()
    update = RequestUpdate(
        request_id=request_id,
        user_id=current_user.id,
        content=data.content,
        work_hours=data.work_hours,
        created_at=now,
        updated_at=now,
        is_deleted=0,
    )
    db.add(update)
    req.updated_at = now
    db.commit()
    db.refresh(update)
    return _to_response(update, current_user.display_name, current_user.id)


def list_updates(
    db: Session, request_id: int, current_user: User
) -> ProgressUpdateListResponse:
    req = db.get(Request, request_id)
    if not req or req.status == "deleted":
        raise HTTPException(404, "需求不存在")

    rows = db.execute(
        select(RequestUpdate, User.display_name.label("user_name"))
        .join(User, RequestUpdate.user_id == User.id)
        .where(
            RequestUpdate.request_id == request_id,
            RequestUpdate.is_deleted == 0,
        )
        .order_by(RequestUpdate.created_at.asc())
    ).all()

    items = [_to_response(row.RequestUpdate, row.user_name, current_user.id) for row in rows]
    total_work_hours = round(sum(i.work_hours for i in items), 2)
    return ProgressUpdateListResponse(items=items, total_work_hours=total_work_hours)


def edit_update(
    db: Session, request_id: int, update_id: int, current_user: User, data: ProgressUpdateEdit
) -> ProgressUpdateResponse:
    update = db.get(RequestUpdate, update_id)
    if not update or update.is_deleted == 1 or update.request_id != request_id:
        raise HTTPException(404, "进度记录不存在")
    if update.user_id != current_user.id:
        raise HTTPException(403, "只能编辑自己的记录")
    if not _within_24h(update.created_at):
        raise HTTPException(403, "超过24小时，不可编辑")

    req = db.get(Request, request_id)
    if not req or req.status != "in_progress":
        raise HTTPException(400, "只能对处理中的需求编辑进度")

    now = now_beijing()
    if data.content is not None:
        update.content = data.content
    if data.work_hours is not None:
        update.work_hours = data.work_hours
    update.updated_at = now
    req.updated_at = now
    db.commit()
    db.refresh(update)

    user = db.get(User, update.user_id)
    return _to_response(update, user.display_name if user else "", current_user.id)


def delete_update(
    db: Session, request_id: int, update_id: int, current_user: User
) -> dict:
    update = db.get(RequestUpdate, update_id)
    if not update or update.is_deleted == 1 or update.request_id != request_id:
        raise HTTPException(404, "进度记录不存在")
    if update.user_id != current_user.id:
        raise HTTPException(403, "只能删除自己的记录")
    if not _within_24h(update.created_at):
        raise HTTPException(403, "超过24小时，不可删除")

    req = db.get(Request, request_id)
    if not req or req.status != "in_progress":
        raise HTTPException(400, "只能对处理中的需求删除进度")

    update.is_deleted = 1
    req.updated_at = now_beijing()
    db.commit()
    return {"detail": "已删除"}
