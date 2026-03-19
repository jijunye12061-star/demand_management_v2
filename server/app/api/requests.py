import json
import shutil
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, status

from app.core.config import settings
from app.core.deps import DB, CurrentUser, AdminUser
from app.models.request import Request
from app.models.user import User
from app.models.collaborator import RequestCollaborator
from app.schemas.request import (
    RequestCreate, RequestUpdate, RequestResponse, RequestListParams,
    WithdrawRequest, ResubmitRequest, ReassignRequest, ConfidentialRequest,
    CollaboratorsUpdate,
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


@router.get("/feed-stats")
def feed_stats(
    db: DB, user: CurrentUser,
    request_type: str | None = None,
    research_scope: str | None = None,
    org_type: str | None = None,
    keyword: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """需求动态图表统计：按筛选条件聚合 org_type × request_type × research_scope"""
    from sqlalchemy import func, and_, or_

    q = db.query(Request).filter(
        Request.status == "completed",
        Request.is_confidential == 0,
        Request.request_type != "工具/系统开发",
    )
    if request_type:
        q = q.filter(Request.request_type == request_type)
    if research_scope:
        q = q.filter(Request.research_scope == research_scope)
    if org_type:
        q = q.filter(Request.org_type == org_type)
    if keyword:
        kw = f"%{keyword}%"
        q = q.filter(or_(Request.title.like(kw), Request.description.like(kw)))
    if date_from:
        q = q.filter(Request.created_at >= date_from)
    if date_to:
        q = q.filter(Request.created_at <= date_to + " 23:59:59")

    rows = q.all()

    # 聚合: org_type × request_type
    ot_rt: dict[tuple, int] = {}
    # 聚合: org_type × research_scope
    ot_rs: dict[tuple, int] = {}
    for r in rows:
        ot = r.org_type or "未知"
        rt = r.request_type or "未知"
        rs = r.research_scope or "未知"
        ot_rt[(ot, rt)] = ot_rt.get((ot, rt), 0) + 1
        ot_rs[(ot, rs)] = ot_rs.get((ot, rs), 0) + 1

    return {
        "total": len(rows),
        "by_org_request": [
            {"org_type": k[0], "request_type": k[1], "count": v}
            for k, v in sorted(ot_rt.items())
        ],
        "by_org_scope": [
            {"org_type": k[0], "research_scope": k[1], "count": v}
            for k, v in sorted(ot_rs.items())
        ],
    }


@router.get("/search-linkable")
def search_linkable(
    db: DB, user: CurrentUser,
    keyword: str = "",
    limit: int = 10,
):
    """关联需求搜索：返回 completed/in_progress 的需求供选择"""
    q = (
        db.query(Request, User.display_name.label("researcher_name"))
        .outerjoin(User, Request.researcher_id == User.id)
        .filter(
            Request.status.in_(["completed", "in_progress"]),
            Request.status != "deleted",
        )
    )
    if keyword:
        q = q.filter(Request.title.like(f"%{keyword}%"))
    rows = (
        q.order_by(Request.completed_at.desc(), Request.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": req.id,
            "title": req.title,
            "researcher_name": r_name,
            "completed_at": req.completed_at,
        }
        for req, r_name in rows
    ]


@router.get("/{request_id}")
def get_request(request_id: int, db: DB, user: CurrentUser):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")
    result = {c.name: getattr(req, c.name) for c in req.__table__.columns}
    # 追加协作者详情
    collabs = (
        db.query(
            RequestCollaborator.user_id,
            User.display_name,
            RequestCollaborator.work_hours,
        )
        .join(User, RequestCollaborator.user_id == User.id)
        .filter(RequestCollaborator.request_id == request_id)
        .all()
    )
    result["collaborators"] = [
        {"user_id": c.user_id, "display_name": c.display_name, "work_hours": c.work_hours}
        for c in collabs
    ]
    # 拼接研究员名字（主负责人 + 协作者）
    researcher = db.get(User, req.researcher_id)
    base_name = researcher.display_name if researcher else None
    if collabs:
        collab_names = [c.display_name for c in collabs]
        result["researcher_name"] = ", ".join(filter(None, [base_name] + collab_names))
    else:
        result["researcher_name"] = base_name
    # 关联原始需求标题
    if req.parent_request_id:
        parent = db.get(Request, req.parent_request_id)
        result["parent_title"] = parent.title if parent else None
    else:
        result["parent_title"] = None
    # 衍生需求列表
    children = (
        db.query(Request)
        .filter(Request.parent_request_id == request_id, Request.status != "deleted")
        .order_by(Request.created_at.desc())
        .all()
    )
    result["children"] = [
        {
            "id": c.id,
            "title": c.title,
            "status": c.status,
            "work_hours": c.work_hours,
            "completed_at": c.completed_at,
        }
        for c in children
    ]
    return result


@router.post("")
def create(body: RequestCreate, db: DB, user: CurrentUser):
    if body.request_type == "调研":
        is_self_initiated = 1
        org_name = body.org_name or "内部调研"
        org_type = body.org_type
        department = body.department
    else:
        if not body.org_name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "org_name 必填")
        is_self_initiated = 0
        org_name = body.org_name
        org_type = body.org_type
        department = body.department

    # 校验 parent_request_id
    if body.parent_request_id is not None:
        parent = db.get(Request, body.parent_request_id)
        if not parent or parent.status == "deleted":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "关联的原始需求不存在")

    req = Request(
        title=body.title,
        description=body.description,
        request_type=body.request_type,
        research_scope=body.research_scope,
        org_name=org_name,
        org_type=org_type,
        department=department,
        researcher_id=body.researcher_id,
        is_confidential=1 if body.is_confidential else 0,
        is_self_initiated=is_self_initiated,
        sales_id=body.sales_id if body.sales_id else user.id,
        created_by=user.id,
        created_at=body.created_at or now_beijing(),
        updated_at=now_beijing(),
        status="pending",
        parent_request_id=body.parent_request_id,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"id": req.id}


def _check_parent_loop(db, request_id: int, new_parent_id: int, max_depth: int = 10) -> bool:
    """沿 parent 链向上追溯，检查是否会产生循环引用。返回 True 表示有循环。"""
    current_id = new_parent_id
    for _ in range(max_depth):
        if current_id is None:
            return False
        if current_id == request_id:
            return True
        parent = db.get(Request, current_id)
        if not parent:
            return False
        current_id = parent.parent_request_id
    return False


# ── FIX #2: PUT 权限 — admin 全字段编辑 + sales 编辑自己的 pending/withdrawn ──
# 原代码用 AdminUser 限制仅 admin 可编辑, 与 business-rules §3.6 不一致
@router.put("/{request_id}")
def update(request_id: int, body: RequestUpdate, db: DB, user: CurrentUser):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")

    updates = body.model_dump(exclude_unset=True)

    # 校验 parent_request_id（有提供时）
    if "parent_request_id" in updates and updates["parent_request_id"] is not None:
        new_parent_id = updates["parent_request_id"]
        parent = db.get(Request, new_parent_id)
        if not parent or parent.status == "deleted":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "关联的原始需求不存在")
        if _check_parent_loop(db, request_id, new_parent_id):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "关联需求存在循环引用")

    # admin: 可编辑任意需求的任意字段
    if user.role == "admin":
        for k, v in updates.items():
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
            "parent_request_id",
        }
        for k, v in updates.items():
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
    req.status = "deleted"
    req.updated_at = now_beijing()
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
    automation_hours: float = Form(None),
    attachment: UploadFile | None = File(None),
    collaborators: str = Form(None),  # JSON: [{"user_id": 2, "work_hours": 3.0}, ...]
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
        complete_request(db, request_id, user, result_note, work_hours, attachment_path, automation_hours)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    # 保存协作者
    if collaborators:
        collab_list = json.loads(collaborators)
        for c in collab_list:
            if c.get("user_id") == user.id:
                continue  # 过滤主负责人自己
            db.add(RequestCollaborator(
                request_id=request_id,
                user_id=c["user_id"],
                work_hours=c.get("work_hours", 0),
                created_at=now_beijing(),
            ))
        db.commit()

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


@router.put("/{request_id}/collaborators")
def update_collaborators(request_id: int, body: CollaboratorsUpdate, db: DB, admin: AdminUser):
    """管理员全量替换协作者列表"""
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")
    # 清除旧协作者
    db.query(RequestCollaborator).filter(RequestCollaborator.request_id == request_id).delete()
    # 写入新协作者（过滤主负责人）
    for c in body.collaborators:
        if c.user_id == req.researcher_id:
            continue
        db.add(RequestCollaborator(
            request_id=request_id,
            user_id=c.user_id,
            work_hours=c.work_hours,
            created_at=now_beijing(),
        ))
    db.commit()
    return {"message": "ok"}
