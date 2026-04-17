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
    CollaboratorsUpdate, ResearcherEditRequest,
)
from app.models.request_edit_log import RequestEditLog
from app.services.request_service import (
    query_requests, accept_request, complete_request,
    withdraw_request, resubmit_request, cancel_request,
    reopen_request, revoke_accept, validate_parent_request, get_revisions,
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
    sub_type: str | None = None,
    work_mode: str | None = None,
    completed_at_from: str | None = None,
    completed_at_to: str | None = None,
    sort_by: str = "submitted_at",
    sort_order: str = "desc",
):
    params = RequestListParams(
        status=status_filter, request_type=request_type, research_scope=research_scope,
        org_type=org_type, researcher_id=researcher_id, sales_id=sales_id,
        keyword=keyword, date_from=date_from, date_to=date_to,
        scope=scope, page=page, page_size=page_size,
        sub_type=sub_type, work_mode=work_mode,
        completed_at_from=completed_at_from, completed_at_to=completed_at_to,
        sort_by=sort_by, sort_order=sort_order,
    )
    items, total = query_requests(db, user, params)
    # researcher_note 仅 researcher 本人 + admin 可见
    if user.role != "admin":
        for item in items:
            if item.get("researcher_id") != user.id:
                item["researcher_note"] = None
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
    from app.utils.constants import REQUEST_TYPES, RESEARCH_SCOPES

    q = db.query(Request).filter(
        Request.status == "completed",
        Request.is_confidential == 0,
        Request.request_type.in_(REQUEST_TYPES),
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

    # 聚合: org_type × request_type；研究范围仅展示白名单值
    ot_rt: dict[tuple, int] = {}
    ot_rs: dict[tuple, int] = {}
    valid_scopes = set(RESEARCH_SCOPES)
    for r in rows:
        ot = r.org_type or "其他"
        rt = r.request_type
        rs = r.research_scope
        ot_rt[(ot, rt)] = ot_rt.get((ot, rt), 0) + 1
        if rs in valid_scopes:
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
    # researcher_note 仅 researcher 本人 + admin 可见
    if user.role != "admin" and user.id != req.researcher_id:
        result["researcher_note"] = None
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
    # 衍生需求列表（排除 revision，revision 走单独的 revisions 字段）
    children = (
        db.query(Request)
        .filter(
            Request.parent_request_id == request_id,
            Request.status != "deleted",
            Request.link_type != "revision",
        )
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
    # 修改迭代列表（link_type='revision'，带研究员名字）
    result["revisions"] = get_revisions(db, request_id)
    # revision_count 供提交页面预填标题用（"修改N"）
    result["revision_count"] = len(result["revisions"])
    return result


@router.post("")
def create(body: RequestCreate, db: DB, user: CurrentUser):
    from app.utils.constants import WORK_MODE_RULES, SUB_TYPES

    # 确定 work_mode：locked 类型强制覆盖，user_select 类型使用前端传值
    rule = WORK_MODE_RULES.get(body.request_type)
    if rule and rule["mode"] == "locked":
        work_mode = rule["value"]
    else:
        work_mode = body.work_mode or "service"

    # 校验 sub_type：如果该 request_type 有子类型定义，sub_type 填了就得合法
    if body.sub_type is not None and body.request_type in SUB_TYPES:
        if body.sub_type not in SUB_TYPES[body.request_type]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"sub_type '{body.sub_type}' 不合法")

    # 根据 work_mode 设置字段
    if work_mode == "proactive":
        org_name = None
        org_type = body.org_type
        department = body.department
        sales_id = None
        researcher_id = body.researcher_id or user.id
        initial_status = "in_progress"
    else:
        # service 模式：org_name 必填
        if not body.org_name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "service 模式下机构名称不能为空")
        org_name = body.org_name
        org_type = body.org_type
        department = body.department
        sales_id = body.sales_id if body.sales_id else user.id
        researcher_id = body.researcher_id
        initial_status = "pending"

    # 校验 parent_request_id（revision 关联校验）
    # link_type 未传时默认 'sub'（手动关联衍生需求场景的兜底）
    final_link_type = body.link_type
    if body.parent_request_id is not None:
        final_link_type = body.link_type or "sub"
        validate_parent_request(db, body.parent_request_id, final_link_type)

    req = Request(
        title=body.title,
        description=body.description,
        request_type=body.request_type,
        research_scope=body.research_scope,
        org_name=org_name,
        org_type=org_type,
        department=department,
        researcher_id=researcher_id,
        is_confidential=1 if body.is_confidential else 0,
        sub_type=body.sub_type,
        work_mode=work_mode,
        sales_id=sales_id,
        created_by=user.id,
        created_at=body.created_at or now_beijing(),
        submitted_at=body.submitted_at or body.created_at or now_beijing(),
        updated_at=now_beijing(),
        status=initial_status,
        parent_request_id=body.parent_request_id,
        link_type=final_link_type,
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

    # admin: 可编辑任意需求的任意字段（含 researcher_note）
    if user.role == "admin":
        for k, v in updates.items():
            if k == "is_confidential" and v is not None:
                setattr(req, k, 1 if v else 0)
            else:
                setattr(req, k, v)
        req.updated_at = now_beijing()
        db.commit()
        return {"message": "ok"}

    # researcher_note: 仅 researcher_id 本人可写（非 admin 的其他角色丢弃此字段）
    if "researcher_note" in updates and user.id != req.researcher_id:
        updates.pop("researcher_note")

    # sales/researcher: 仅可编辑自己创建的 pending/withdrawn 需求, 限定字段
    editable_fields = {
        "title", "description", "request_type", "research_scope",
        "org_name", "org_type", "department", "researcher_id", "is_confidential",
        "parent_request_id", "submitted_at", "researcher_note",
    }
    if user.role in ("sales", "researcher"):
        if req.status not in ("pending", "withdrawn"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "仅待处理或已退回状态可编辑")
        if user.id not in (req.sales_id, req.created_by):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "无权编辑此需求")
        for k, v in updates.items():
            if k not in editable_fields:
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
    completed_at: str = Form(None),   # 可选历史完成时间，格式 YYYY-MM-DD
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
        complete_request(db, request_id, user, result_note, work_hours, attachment_path, automation_hours, completed_at)
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


@router.put("/{request_id}/researcher-edit")
def researcher_edit(request_id: int, body: ResearcherEditRequest, db: DB, user: CurrentUser):
    if not settings.RESEARCHER_SELF_EDIT_ENABLED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "功能未开放")
    if user.role not in ("researcher", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "权限不足")
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")
    if req.status != "completed":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "仅已完成需求可编辑")
    if req.researcher_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "仅本人接单的条目可编辑")

    updates = body.model_dump(exclude_unset=True)
    changed_fields = []
    for k, new_val in updates.items():
        old_val = getattr(req, k)
        if old_val != new_val:
            db.add(RequestEditLog(
                request_id=request_id,
                editor_id=user.id,
                field_name=k,
                old_value=str(old_val) if old_val is not None else None,
                new_value=str(new_val) if new_val is not None else None,
                edited_at=now_beijing(),
            ))
            setattr(req, k, new_val)
            changed_fields.append(k)

    if changed_fields:
        req.updated_at = now_beijing()
    db.commit()
    return {"message": "ok", "changed_fields": changed_fields}


@router.get("/{request_id}/edit-logs")
def get_edit_logs(request_id: int, db: DB, admin: AdminUser):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")
    logs = (
        db.query(RequestEditLog, User)
        .join(User, RequestEditLog.editor_id == User.id)
        .filter(RequestEditLog.request_id == request_id)
        .order_by(RequestEditLog.edited_at.desc())
        .all()
    )
    return [
        {
            "id": log.id,
            "editor_id": log.editor_id,
            "editor_name": user.name,
            "field_name": log.field_name,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "edited_at": log.edited_at,
        }
        for log, user in logs
    ]
