from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import Session

from app.models.request import Request
from app.models.user import User
from app.models.download_log import DownloadLog
from app.schemas.request import RequestListParams
from app.utils.datetime_utils import now_beijing


def _confidential_filter(user: User):
    """保密需求仅 admin / created_by / sales_id / researcher_id 可见"""
    if user.role == "admin":
        return True  # no filter
    return or_(
        Request.is_confidential == 0,
        Request.created_by == user.id,
        Request.sales_id == user.id,
        Request.researcher_id == user.id,
    )


def _scope_filter(user: User, scope: str | None):
    """mine/feed scope visibility rules"""
    if scope == "feed":
        return and_(Request.status == "completed", Request.is_confidential == 0)

    # scope=mine (default)
    not_canceled = Request.status != "canceled"
    if user.role == "admin":
        return not_canceled
    if user.role == "sales":
        return and_(Request.sales_id == user.id, not_canceled)
    if user.role == "researcher":
        # 研究员: 排除 withdrawn 和 canceled
        not_withdrawn = Request.status != "withdrawn"
        return and_(
            or_(Request.researcher_id == user.id, Request.created_by == user.id),
            not_canceled,
            or_(
                Request.created_by == user.id,  # 自己代提的需求始终可见
                not_withdrawn,  # 非自己代提的需求排除 withdrawn
            ),
        )
    return False


def query_requests(db: Session, user: User, params: RequestListParams) -> tuple[list, int]:
    """Build filtered request query with visibility, confidential, and search filters."""
    sales_user = db.query(User.id, User.display_name).subquery("sales_u")
    researcher_user = db.query(User.id, User.display_name).subquery("researcher_u")

    dl_count = (
        db.query(DownloadLog.request_id, func.count(DownloadLog.id).label("dl_count"))
        .group_by(DownloadLog.request_id)
        .subquery("dl")
    )

    q = (
        db.query(
            Request,
            sales_user.c.display_name.label("sales_name"),
            researcher_user.c.display_name.label("researcher_name"),
            func.coalesce(dl_count.c.dl_count, 0).label("download_count"),
        )
        .outerjoin(sales_user, Request.sales_id == sales_user.c.id)
        .outerjoin(researcher_user, Request.researcher_id == researcher_user.c.id)
        .outerjoin(dl_count, Request.id == dl_count.c.request_id)
    )

    # Scope filter
    scope_cond = _scope_filter(user, params.scope)
    if scope_cond is not True:
        q = q.filter(scope_cond)

    # Confidential filter (only for non-feed scope)
    if params.scope != "feed":
        conf_cond = _confidential_filter(user)
        if conf_cond is not True:
            q = q.filter(conf_cond)

    # Optional filters
    if params.status:
        q = q.filter(Request.status == params.status)
    if params.request_type:
        q = q.filter(Request.request_type == params.request_type)
    if params.research_scope:
        q = q.filter(Request.research_scope == params.research_scope)
    if params.org_type:
        q = q.filter(Request.org_type == params.org_type)
    if params.researcher_id:
        q = q.filter(Request.researcher_id == params.researcher_id)
    if params.sales_id:
        q = q.filter(Request.sales_id == params.sales_id)
    if params.keyword:
        kw = f"%{params.keyword}%"
        q = q.filter(or_(Request.title.like(kw), Request.description.like(kw)))
    if params.date_from:
        q = q.filter(Request.created_at >= params.date_from)
    if params.date_to:
        q = q.filter(Request.created_at <= params.date_to + " 23:59:59")

    total = q.count()
    rows = (
        q.order_by(Request.created_at.desc())
        .offset((params.page - 1) * params.page_size)
        .limit(params.page_size)
        .all()
    )

    items = []
    for req, s_name, r_name, dl in rows:
        d = {c.name: getattr(req, c.name) for c in req.__table__.columns}
        d["sales_name"] = s_name
        d["researcher_name"] = r_name
        d["download_count"] = dl
        items.append(d)

    return items, total


def accept_request(db: Session, request_id: int, user: User) -> Request:
    req = db.get(Request, request_id)
    if not req:
        raise ValueError("需求不存在")
    if req.status != "pending" or req.researcher_id != user.id:
        raise ValueError("无法接受此需求")
    req.status = "in_progress"
    req.updated_at = now_beijing()
    db.commit()
    db.refresh(req)
    return req


def complete_request(
    db: Session, request_id: int, user: User,
    result_note: str | None = None,
    work_hours: float | None = None,
    attachment_path: str | None = None,
) -> Request:
    req = db.get(Request, request_id)
    if not req:
        raise ValueError("需求不存在")
    if req.status != "in_progress" or req.researcher_id != user.id:
        raise ValueError("无法完成此需求")
    req.status = "completed"
    req.completed_at = now_beijing()
    req.updated_at = now_beijing()
    if result_note is not None:
        req.result_note = result_note
    if work_hours is not None:
        req.work_hours = work_hours
    if attachment_path:
        req.attachment_path = attachment_path
    db.commit()
    db.refresh(req)
    return req


def withdraw_request(db: Session, request_id: int, user: User, reason: str) -> Request:
    """研究员退回: pending → withdrawn, 保留 researcher_id, 写入 withdraw_reason"""
    req = db.get(Request, request_id)
    if not req:
        raise ValueError("需求不存在")
    if req.status != "pending" or req.researcher_id != user.id:
        raise ValueError("无法退回此需求")
    req.status = "withdrawn"
    req.withdraw_reason = reason
    req.updated_at = now_beijing()
    # 保留 researcher_id 用于审计 (business-rules §3.3)
    db.commit()
    db.refresh(req)
    return req


def resubmit_request(db: Session, request_id: int, user: User, updates: dict) -> Request:
    """销售重新提交: withdrawn → pending, 清空 withdraw_reason"""
    req = db.get(Request, request_id)
    if not req:
        raise ValueError("需求不存在")
    if req.status != "withdrawn":
        raise ValueError("仅退回状态可重新提交")
    if user.role != "admin" and user.id not in (req.sales_id, req.created_by):
        raise ValueError("无权重新提交此需求")
    # 更新可编辑字段
    editable = {"title", "description", "request_type", "research_scope",
                "org_name", "org_type", "department", "researcher_id"}
    for k, v in updates.items():
        if k in editable and v is not None:
            setattr(req, k, v)
    req.status = "pending"
    req.withdraw_reason = None
    req.updated_at = now_beijing()
    db.commit()
    db.refresh(req)
    return req


def cancel_request(db: Session, request_id: int, user: User) -> Request:
    """销售/admin 取消需求: pending/withdrawn → canceled (软删除)"""
    req = db.get(Request, request_id)
    if not req:
        raise ValueError("需求不存在")
    if req.status not in ("pending", "withdrawn"):
        raise ValueError("仅待处理或已退回状态可取消")
    if user.role != "admin" and user.id not in (req.created_by, req.sales_id):
        raise ValueError("无权取消此需求")
    req.status = "canceled"
    req.updated_at = now_beijing()
    db.commit()
    db.refresh(req)
    return req