from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import Session

from app.models.request import Request
from app.models.user import User
from app.models.download_log import DownloadLog
from app.schemas.request import RequestListParams
from app.utils.datetime_utils import now_beijing

# scope=feed 时需要置 null 的敏感字段
_FEED_MASKED_FIELDS = {"org_name", "department", "work_hours", "sales_id", "sales_name", "is_confidential"}


def _confidential_filter(user: User):
    """保密需求仅 admin / created_by / sales_id / researcher_id 可见"""
    if user.role == "admin":
        return True
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

    # scope=mine (default) — 排除 canceled 和 deleted
    visible = Request.status.not_in(("canceled", "deleted"))
    if user.role == "admin":
        return visible
    if user.role == "sales":
        return and_(Request.sales_id == user.id, visible)
    if user.role == "researcher":
        not_withdrawn = Request.status != "withdrawn"
        return and_(
            or_(Request.researcher_id == user.id, Request.created_by == user.id),
            visible,
            or_(
                Request.created_by == user.id,
                not_withdrawn,
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

    # Confidential filter (only for non-feed scope, feed already excludes confidential)
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

    is_feed = params.scope == "feed"
    items = []
    for req, s_name, r_name, dl in rows:
        d = {c.name: getattr(req, c.name) for c in req.__table__.columns}
        d["sales_name"] = s_name
        d["researcher_name"] = r_name
        d["download_count"] = dl

        # ── FIX: feed 模式字段脱敏 ──
        # business-rules §2.2: scope=feed 时 org_name, department, work_hours,
        # sales_id, sales_name, is_confidential 置 null
        if is_feed:
            for field in _FEED_MASKED_FIELDS:
                d[field] = None

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

def reopen_request(db: "Session", request_id: int, user: "User") -> "Request":
    """已完成 → 处理中：研究员撤销完成，重新处理"""
    req = db.get(Request, request_id)
    if not req:
        raise ValueError("需求不存在")
    if req.status != "completed":
        raise ValueError("仅已完成的需求可以撤销")
    if req.researcher_id != user.id:
        raise ValueError("仅负责研究员可以撤销完成")
    req.status = "in_progress"
    req.completed_at = None
    req.result_note = None
    req.work_hours = None
    # 保留附件不删，清空路径（文件留存用于审计）
    req.attachment_path = None
    req.updated_at = now_beijing()
    db.commit()
    db.refresh(req)
    return req


def revoke_accept(db: "Session", request_id: int, user: "User") -> "Request":
    """处理中 → 待处理：研究员撤销接受，退回待处理状态"""
    req = db.get(Request, request_id)
    if not req:
        raise ValueError("需求不存在")
    if req.status != "in_progress":
        raise ValueError("仅处理中的需求可以撤销接受")
    if req.researcher_id != user.id:
        raise ValueError("仅负责研究员可以撤销接受")
    req.status = "pending"
    req.updated_at = now_beijing()
    db.commit()
    db.refresh(req)
    return req
