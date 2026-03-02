import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, status

from app.core.config import settings
from app.core.deps import DB, CurrentUser, AdminUser
from app.models.request import Request
from app.schemas.request import (
    RequestCreate, RequestUpdate, RequestResponse, RequestListParams,
    ReassignRequest, ConfidentialRequest,
)
from app.services.request_service import (
    query_requests, accept_request, complete_request, withdraw_request, cancel_request,
)
from app.utils.datetime_utils import now_beijing

router = APIRouter(prefix="/requests", tags=["需求"])


@router.get("")
def list_requests(
    db: DB, user: CurrentUser,
    status_: str | None = None,
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
):
    # FastAPI reserves 'status' as query alias
    params = RequestListParams(
        status=status_, request_type=request_type, research_scope=research_scope,
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
    # Confidential check
    if req.is_confidential and user.role != "admin":
        if user.id not in (req.created_by, req.sales_id, req.researcher_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "无权查看保密需求")
    return req


@router.post("", status_code=status.HTTP_201_CREATED)
def create_request(body: RequestCreate, db: DB, user: CurrentUser):
    if user.role not in ("sales", "researcher", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "无权创建需求")

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
        status="pending",
        created_at=body.created_at or now_beijing(),
    )

    if user.role == "sales":
        req.sales_id = user.id
        req.created_by = user.id
    elif user.role == "researcher":
        # 研究员代提: sales_id 必填
        if not body.sales_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "研究员代提需求时必须指定销售")
        req.sales_id = body.sales_id
        req.created_by = user.id
    else:
        # admin
        req.sales_id = body.sales_id or user.id
        req.created_by = user.id

    db.add(req)
    db.commit()
    db.refresh(req)
    return {"id": req.id}


@router.put("/{request_id}")
def update_request(request_id: int, body: RequestUpdate, db: DB, admin: AdminUser):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        if k == "is_confidential" and v is not None:
            setattr(req, k, 1 if v else 0)
        else:
            setattr(req, k, v)
    req.updated_at = now_beijing()
    db.commit()
    return {"message": "ok"}


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
    if user.role != "researcher":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "仅研究员可接受任务")
    try:
        accept_request(db, request_id, user)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"message": "ok"}


@router.post("/{request_id}/complete")
async def complete(
    request_id: int, db: DB, user: CurrentUser,
    result_note: str = Form(None),
    work_hours: float = Form(None),
    attachment: UploadFile | None = File(None),
):
    if user.role != "researcher":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "仅研究员可完成任务")

    attachment_path = None
    if attachment and attachment.filename:
        upload_dir = settings.upload_path
        # Use request_id as subdirectory for easy lookup
        dest = upload_dir / f"{request_id}_{attachment.filename}"
        with open(dest, "wb") as f:
            shutil.copyfileobj(attachment.file, f)
        attachment_path = str(dest)

    try:
        complete_request(db, request_id, user, result_note, work_hours, attachment_path)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"message": "ok"}


@router.post("/{request_id}/withdraw")
def withdraw(request_id: int, db: DB, user: CurrentUser):
    if user.role != "researcher":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "仅研究员可撤回")
    try:
        withdraw_request(db, request_id, user)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"message": "ok"}


@router.post("/{request_id}/cancel")
def cancel(request_id: int, db: DB, user: CurrentUser):
    """销售撤回需求 (软删除): pending → canceled"""
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