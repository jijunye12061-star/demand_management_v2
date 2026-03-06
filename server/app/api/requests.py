import shutil
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, status

from app.core.config import settings
from app.core.deps import DB, CurrentUser, AdminUser
from app.models.request import Request
from app.schemas.request import (
    RequestCreate, RequestUpdate, RequestResponse, RequestListParams,
    WithdrawRequest, ResubmitRequest, ReassignRequest, ConfidentialRequest,
)
from app.services.request_service import (
    query_requests, accept_request, complete_request,
    withdraw_request, resubmit_request, cancel_request,
    reopen_request, revoke_accept
)
from app.utils.datetime_utils import now_beijing

router = APIRouter(prefix="/requests", tags=["需求"])


# ── FIX #1: status_ → Query(alias="status") ──────────────────────────
# FastAPI 暴露的 query param 名称取决于函数参数名, status_ 会变成 ?status_=xxx
# 前端传的是 ?status=xxx, 用 alias 映射
@router.get("")
def list_requests(
    db: DB, user: CurrentUser,
    request_type: str | None = None,
    research_scope: str | None = None,
    org_type: str | None = None,
    researcher_id: int | None = None,
    sales_id: int | None = None,
    keyword: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    scope: str | None = None,
    page: int = 1,
    page_size: int = 20,
    status_filter: str | None = Query(None, alias="status"),
):
    params = RequestListParams(
        status=status_filter, request_type=request_type, research_scope=research_scope,
        org_type=org_type, researcher_id=researcher_id, sales_id=sales_id,
        keyword=keyword, date_from=date_from, date_to=date_to,
        scope=scope, page=page, page_size=page_size,
    )
    items, total = query_requests(db, user, params)
    return {"items": items, "total": total}


@router.get("/{request_id}", response_model=RequestResponse)
def get_request(request_id: int, db: DB, user: CurrentUser):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")
    return req


@router.post("")
def create(body: RequestCreate, db: DB, user: CurrentUser):
    req = Request(
        title=body.title,
        description=body.description,
        request_type=body.request_type,
        research_scope=body.research_scope,
        org_name=body.org_name,
        org_type=body.org_type,
        department=body.department,
        researcher_id=body.researcher_id,
        is_confidential=1 if body.is_confidential else 0,
        sales_id=body.sales_id if body.sales_id else user.id,
        created_by=user.id,
        created_at=body.created_at or now_beijing(),
        updated_at=now_beijing(),
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"id": req.id}


# ── FIX #2: PUT 权限 — admin 全字段编辑 + sales 编辑自己的 pending/withdrawn ──
# 原代码用 AdminUser 限制仅 admin 可编辑, 与 business-rules §3.6 不一致
@router.put("/{request_id}")
def update(request_id: int, body: RequestUpdate, db: DB, user: CurrentUser):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")

    # admin: 可编辑任意需求的任意字段
    if user.role == "admin":
        for k, v in body.model_dump(exclude_unset=True).items():
            if k == "is_confidential" and v is not None:
                setattr(req, k, 1 if v else 0)
            else:
                setattr(req, k, v)
        req.updated_at = now_beijing()
        db.commit()
        return {"message": "ok"}

    # sales: 仅可编辑自己创建的 pending/withdrawn 需求, 限定字段
    if user.role == "sales":
        if req.status not in ("pending", "withdrawn"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "仅待处理或已退回状态可编辑")
        if user.id not in (req.sales_id, req.created_by):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "无权编辑此需求")
        sales_editable = {
            "title", "description", "request_type", "research_scope",
            "org_name", "org_type", "department", "researcher_id", "is_confidential",
        }
        for k, v in body.model_dump(exclude_unset=True).items():
            if k not in sales_editable:
                continue
            if k == "is_confidential" and v is not None:
                setattr(req, k, 1 if v else 0)
            else:
                setattr(req, k, v)
        req.updated_at = now_beijing()
        db.commit()
        return {"message": "ok"}

    raise HTTPException(status.HTTP_403_FORBIDDEN, "权限不足")


@router.delete("/{request_id}")
def delete_request(request_id: int, db: DB, admin: AdminUser):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")
    db.delete(req)
    db.commit()
    return {"message": "ok"}


@router.post("/{request_id}/accept")
def accept(request_id: int, db: DB, user: CurrentUser):
    try:
        accept_request(db, request_id, user)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"message": "ok"}


# ── FIX #3: 附件存储路径 uploads/{request_id}/filename ──
# 原代码存储为 upload_dir/{request_id}_{filename} (扁平), 与 business-rules §8 不一致
@router.post("/{request_id}/complete")
async def complete(
    request_id: int, db: DB, user: CurrentUser,
    result_note: str = Form(None),
    work_hours: float = Form(None),
    attachment: UploadFile | None = File(None),
):
    attachment_path = None
    if attachment and attachment.filename:
        dest_dir = settings.upload_path / str(request_id)
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / attachment.filename
        with open(dest, "wb") as f:
            shutil.copyfileobj(attachment.file, f)
        # 存相对路径, 与 seed_data 保持一致
        attachment_path = f"uploads/{request_id}/{attachment.filename}"

    try:
        complete_request(db, request_id, user, result_note, work_hours, attachment_path)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"message": "ok"}


@router.post("/{request_id}/withdraw")
def withdraw(request_id: int, body: WithdrawRequest, db: DB, user: CurrentUser):
    try:
        withdraw_request(db, request_id, user, body.reason)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"message": "ok"}


@router.post("/{request_id}/resubmit")
def resubmit(request_id: int, body: ResubmitRequest, db: DB, user: CurrentUser):
    try:
        resubmit_request(db, request_id, user, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"message": "ok"}


@router.post("/{request_id}/cancel")
def cancel(request_id: int, db: DB, user: CurrentUser):
    try:
        cancel_request(db, request_id, user)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"message": "ok"}


@router.put("/{request_id}/reassign")
def reassign(request_id: int, body: ReassignRequest, db: DB, admin: AdminUser):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")
    req.researcher_id = body.researcher_id
    req.updated_at = now_beijing()
    db.commit()
    return {"message": "ok"}


@router.put("/{request_id}/confidential")
def toggle_confidential(request_id: int, body: ConfidentialRequest, db: DB, admin: AdminUser):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")
    req.is_confidential = 1 if body.is_confidential else 0
    req.updated_at = now_beijing()
    db.commit()
    return {"message": "ok"}


@router.post("/{request_id}/reopen")
def reopen(request_id: int, db: DB, user: CurrentUser):
    """研究员撤销完成: completed → in_progress"""
    try:
        reopen_request(db, request_id, user)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"message": "ok"}


@router.post("/{request_id}/revoke-accept")
def revoke(request_id: int, db: DB, user: CurrentUser):
    """研究员撤销接受: in_progress → pending"""
    try:
        revoke_accept(db, request_id, user)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"message": "ok"}
