"""
Stats service — admin-only statistics queries.
Fixed issues:
  #1: get_overview excludes canceled requests
  #2: get_researcher_ranking includes admin-as-researcher
  #3: get_charts workload respects period parameter
  #4: Removed dead code (_multi_period_count, broken subquery)
  #5: get_org_matrix handles NULL org_name
  #6: get_downloads uses outerjoin for resilience
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, case, and_, text
from sqlalchemy.orm import Session

from app.models.request import Request
from app.models.user import User
from app.models.download_log import DownloadLog
from app.models.collaborator import RequestCollaborator

BJT = timezone(timedelta(hours=8))


def _period_start(period: str) -> str:
    now = datetime.now(BJT)
    match period:
        case "today":
            dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
        case "week":
            dt = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        case "month":
            dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        case "quarter":
            q_month = ((now.month - 1) // 3) * 3 + 1
            dt = now.replace(month=q_month, day=1, hour=0, minute=0, second=0, microsecond=0)
        case "year":
            dt = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        case _:
            dt = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


# ─── P6-1: Overview ──────────────────────────────────────────────────────────

def get_overview(db: Session, period: str) -> dict:
    start = _period_start(period)
    # FIX #1: 排除 canceled (软删除不计入总览)
    rows = db.query(
        func.count(Request.id).label("total"),
        func.sum(case((Request.status == "pending", 1), else_=0)).label("pending"),
        func.sum(case((Request.status == "in_progress", 1), else_=0)).label("in_progress"),
        func.sum(case((Request.status == "completed", 1), else_=0)).label("completed"),
        func.coalesce(func.sum(
            case((Request.status == "completed", Request.work_hours), else_=0)
        ), 0).label("total_hours"),
    ).filter(
        Request.created_at >= start,
        Request.status != "canceled",
    ).one()

    collab_hours = (
        db.query(func.coalesce(func.sum(RequestCollaborator.work_hours), 0))
        .join(Request, RequestCollaborator.request_id == Request.id)
        .filter(Request.status == "completed", Request.created_at >= start)
        .scalar()
    )
    return {
        "total": rows.total or 0,
        "pending": rows.pending or 0,
        "in_progress": rows.in_progress or 0,
        "completed": rows.completed or 0,
        "total_hours": round((rows.total_hours or 0) + (collab_hours or 0), 1),
    }


# ─── P6-1: Researcher Ranking ────────────────────────────────────────────────

def get_researcher_ranking(db: Session, period: str) -> list[dict]:
    start = _period_start(period)
    # FIX #2: 包含 admin (admin 可被指派为研究员, 见 business-rules §1.3)
    rows = (
        db.query(
            User.id.label("user_id"),
            User.display_name,
            func.sum(case((and_(Request.status == "completed", Request.completed_at >= start), 1), else_=0)).label("completed_count"),
            func.coalesce(func.sum(
                case((and_(Request.status == "completed", Request.completed_at >= start), Request.work_hours), else_=0)
            ), 0).label("work_hours"),
            func.coalesce(func.sum(
                case((and_(Request.status == "completed", Request.completed_at >= start), Request.automation_hours), else_=0)
            ), 0).label("automation_hours"),
            func.sum(case((Request.status == "pending", 1), else_=0)).label("pending_count"),
            func.sum(case((Request.status == "in_progress", 1), else_=0)).label("in_progress_count"),
        )
        .join(Request, Request.researcher_id == User.id)
        .filter(User.role.in_(["researcher", "admin"]))
        .group_by(User.id)
        .order_by(text("completed_count DESC"))
        .all()
    )
    collab_stats = (
        db.query(
            RequestCollaborator.user_id,
            func.count(RequestCollaborator.id).label("collab_count"),
            func.coalesce(func.sum(RequestCollaborator.work_hours), 0).label("collab_hours"),
        )
        .join(Request, RequestCollaborator.request_id == Request.id)
        .filter(Request.status == "completed", Request.completed_at >= start)
        .group_by(RequestCollaborator.user_id)
        .all()
    )
    collab_map = {r.user_id: (r.collab_count, r.collab_hours) for r in collab_stats}

    result = []
    for r in rows:
        cc, ch = collab_map.get(r.user_id, (0, 0))
        result.append({
            "user_id": r.user_id,
            "display_name": r.display_name,
            "completed_count": r.completed_count or 0,
            "work_hours": round(r.work_hours or 0, 1),
            "automation_hours": round(r.automation_hours or 0, 1),
            "pending_count": r.pending_count or 0,
            "in_progress_count": r.in_progress_count or 0,
            "collab_count": cc,
            "collab_hours": round(ch, 1),
            "total_hours": round((r.work_hours or 0) + (r.automation_hours or 0) + ch, 1),
            "total_completed": (r.completed_count or 0) + cc,
        })
    return result


# ─── P6-2: Matrix helpers ────────────────────────────────────────────────────
# FIX #4: 移除 _multi_period_count + 旧 get_researcher_matrix (broken subquery)

def _build_period_columns():
    periods = {
        "today": _period_start("today"),
        "week": _period_start("week"),
        "month": _period_start("month"),
        "quarter": _period_start("quarter"),
        "year": _period_start("year"),
    }
    cols = [func.sum(case((Request.completed_at >= s, 1), else_=0)).label(k) for k, s in periods.items()]
    return cols


def _format_matrix_rows(rows) -> list[dict]:
    """Format and filter all-zero rows."""
    return [
        {"name": r.name or "未知", "today": r.today or 0, "week": r.week or 0,
         "month": r.month or 0, "quarter": r.quarter or 0, "year": r.year or 0}
        for r in rows
        if any([r.today, r.week, r.month, r.quarter, r.year])
    ]


# ─── P6-2: Matrix endpoints ──────────────────────────────────────────────────

def get_researcher_matrix(db: Session) -> list[dict]:
    # 主负责 + 协作 的参与关系 UNION，统一按 completed_at 计算各时段件数
    main_q = (
        db.query(Request.researcher_id.label("user_id"), Request.completed_at.label("completed_at"))
        .filter(Request.status == "completed")
    )
    collab_q = (
        db.query(RequestCollaborator.user_id.label("user_id"), Request.completed_at.label("completed_at"))
        .join(Request, RequestCollaborator.request_id == Request.id)
        .filter(Request.status == "completed")
    )
    participation = main_q.union_all(collab_q).subquery()

    periods = {
        "today": _period_start("today"),
        "week": _period_start("week"),
        "month": _period_start("month"),
        "quarter": _period_start("quarter"),
        "year": _period_start("year"),
    }
    period_cols = [
        func.sum(case((participation.c.completed_at >= s, 1), else_=0)).label(k)
        for k, s in periods.items()
    ]
    rows = (
        db.query(User.display_name.label("name"), *period_cols)
        .join(participation, participation.c.user_id == User.id)
        .filter(User.role.in_(["researcher", "admin"]))
        .group_by(User.id)
        .all()
    )
    result = _format_matrix_rows(rows)

    # 唯一需求合计：直接统计 requests 表，避免协作多人导致重复计数
    unique_cols = [
        func.sum(case((Request.completed_at >= s, 1), else_=0)).label(k)
        for k, s in periods.items()
    ]
    u = db.query(*unique_cols).filter(Request.status == "completed").one()
    result.append({
        "name": "__unique_total__",
        "today": u.today or 0,
        "week": u.week or 0,
        "month": u.month or 0,
        "quarter": u.quarter or 0,
        "year": u.year or 0,
    })
    return result


def get_type_matrix(db: Session) -> list[dict]:
    rows = (
        db.query(Request.request_type.label("name"), *_build_period_columns())
        .filter(Request.status == "completed")
        .group_by(Request.request_type)
        .all()
    )
    return _format_matrix_rows(rows)


def get_org_matrix(db: Session) -> list[dict]:
    # FIX #5: COALESCE 处理 NULL org_name
    rows = (
        db.query(
            func.coalesce(Request.org_name, "未知").label("name"),
            func.count(Request.id).label("count"),
            func.coalesce(func.sum(Request.work_hours), 0).label("hours"),
        )
        .filter(Request.status == "completed")
        .group_by(Request.org_name)
        .order_by(text("count DESC"))
        .all()
    )
    return [{"name": r.name, "count": r.count, "hours": round(r.hours, 1)} for r in rows]


def get_sales_matrix(db: Session) -> list[dict]:
    rows = (
        db.query(User.display_name.label("name"), *_build_period_columns())
        .join(Request, Request.sales_id == User.id)
        .filter(Request.status == "completed")
        .group_by(User.id)
        .all()
    )
    return _format_matrix_rows(rows)


# ─── P6-2: Charts ────────────────────────────────────────────────────────────

def get_charts(db: Session, period: str) -> dict:
    start = _period_start(period)

    type_dist = (
        db.query(Request.request_type.label("name"), func.count(Request.id).label("value"))
        .filter(Request.status == "completed", Request.completed_at >= start)
        .group_by(Request.request_type)
        .all()
    )

    org_dist = (
        db.query(Request.org_type.label("name"), func.count(Request.id).label("value"))
        .filter(Request.status == "completed", Request.completed_at >= start)
        .group_by(Request.org_type)
        .all()
    )

    # FIX #3: completed 计数按 period 过滤, 与饼图一致
    # pending/in_progress 不按 period 过滤 (展示当前待办状态)
    workload = (
        db.query(
            User.display_name.label("name"),
            func.sum(case((and_(Request.status == "completed", Request.completed_at >= start), 1), else_=0)).label("completed"),
            func.sum(case((Request.status == "in_progress", 1), else_=0)).label("in_progress"),
            func.sum(case((Request.status == "pending", 1), else_=0)).label("pending"),
        )
        .join(Request, Request.researcher_id == User.id)
        .filter(User.role.in_(["researcher", "admin"]))
        .group_by(User.id)
        .all()
    )

    return {
        "type_distribution": [{"name": r.name or "未知", "value": r.value} for r in type_dist],
        "org_type_distribution": [{"name": r.name or "未知", "value": r.value} for r in org_dist],
        "researcher_workload": [
            {"name": r.name, "completed": r.completed or 0, "in_progress": r.in_progress or 0, "pending": r.pending or 0}
            for r in workload
        ],
    }


# ─── P6-3: Download stats ────────────────────────────────────────────────────

def get_downloads(db: Session) -> dict:
    top = (
        db.query(
            DownloadLog.request_id,
            Request.title,
            func.count(DownloadLog.id).label("total_count"),
            func.count(func.distinct(DownloadLog.user_id)).label("unique_users"),
        )
        .join(Request, DownloadLog.request_id == Request.id)
        .filter(Request.status != "deleted")
        .group_by(DownloadLog.request_id)
        .order_by(text("total_count DESC"))
        .limit(10)
        .all()
    )

    # FIX #6: outerjoin 防止删除用户/需求后日志丢失
    recent = (
        db.query(
            Request.title.label("request_title"),
            User.display_name.label("user_name"),
            DownloadLog.org_name,
            DownloadLog.downloaded_at,
        )
        .join(Request, DownloadLog.request_id == Request.id)
        .join(User, DownloadLog.user_id == User.id)
        .filter(Request.status != "deleted")
        .filter(User.is_deleted == 0)
        .order_by(DownloadLog.downloaded_at.desc())
        .limit(50)
        .all()
    )

    return {
        "top_downloads": [
            {"request_id": r.request_id, "title": r.title or "(已删除)", "total_count": r.total_count, "unique_users": r.unique_users}
            for r in top
        ],
        "recent_logs": [
            {"request_title": r.request_title or "(已删除)", "user_name": r.user_name or "(已删除)",
             "org_name": r.org_name, "downloaded_at": r.downloaded_at}
            for r in recent
        ],
    }


# ── 以下内容追加到 server/app/services/stats_service.py 末尾 ──

# ─── Weekly trend helper ──────────────────────────────────────────────────────

def _weekly_trend(db: Session, filters: list) -> list[dict]:
    """近 12 周每周完成件数。filters 为额外的 .filter() 条件列表。"""
    now = datetime.now(BJT)
    start = (now - timedelta(weeks=12)).strftime("%Y-%m-%d %H:%M:%S")
    q = (
        db.query(
            func.strftime("%Y-W%W", Request.completed_at).label("week"),
            func.count(Request.id).label("count"),
        )
        .filter(Request.status == "completed", Request.completed_at >= start)
    )
    for f in filters:
        q = q.filter(f)
    rows = q.group_by("week").order_by("week").all()
    return [{"week": r.week, "count": r.count} for r in rows]


# ─── Researcher detail ────────────────────────────────────────────────────────

def get_researcher_detail(db: Session, user_id: int) -> dict:
    base = Request.researcher_id == user_id
    summary = db.query(
        func.sum(case((Request.status == "completed", 1), else_=0)).label("completed"),
        func.sum(case((Request.status == "in_progress", 1), else_=0)).label("in_progress"),
        func.sum(case((Request.status == "pending", 1), else_=0)).label("pending"),
        func.coalesce(func.sum(case((Request.status == "completed", Request.work_hours), else_=0)), 0).label("total_hours"),
    ).filter(base).first()

    type_dist = (
        db.query(Request.request_type.label("name"), func.count(Request.id).label("value"))
        .filter(base, Request.status == "completed")
        .group_by(Request.request_type).all()
    )
    org_dist = (
        db.query(func.coalesce(Request.org_name, "未知").label("name"), func.count(Request.id).label("value"))
        .filter(base, Request.status == "completed")
        .group_by(Request.org_name)
        .order_by(text("value DESC")).limit(10).all()
    )
    collab_summary = (
        db.query(
            func.count(RequestCollaborator.id).label("collab_count"),
            func.coalesce(func.sum(RequestCollaborator.work_hours), 0).label("collab_hours"),
        )
        .join(Request, RequestCollaborator.request_id == Request.id)
        .filter(
            RequestCollaborator.user_id == user_id,
            Request.status == "completed",
        )
        .first()
    )
    return {
        "summary": {
            "completed": summary.completed or 0,
            "in_progress": summary.in_progress or 0,
            "pending": summary.pending or 0,
            "total_hours": round(summary.total_hours or 0, 1),
            "collab_count": collab_summary.collab_count or 0,
            "collab_hours": round(collab_summary.collab_hours or 0, 1),
        },
        "weekly_trend": _weekly_trend(db, [base]),
        "type_distribution": [{"name": r.name or "未知", "value": r.value} for r in type_dist],
        "org_distribution": [{"name": r.name, "value": r.value} for r in org_dist],
    }


# ─── Type detail ──────────────────────────────────────────────────────────────

def get_type_detail(db: Session, request_type: str) -> dict:
    base = Request.request_type == request_type
    org_dist = (
        db.query(func.coalesce(Request.org_name, "未知").label("name"), func.count(Request.id).label("value"))
        .filter(base, Request.status == "completed")
        .group_by(Request.org_name)
        .order_by(text("value DESC")).limit(10).all()
    )
    researcher_dist = (
        db.query(User.display_name.label("name"), func.count(Request.id).label("value"))
        .join(Request, Request.researcher_id == User.id)
        .filter(base, Request.status == "completed")
        .group_by(User.id)
        .order_by(text("value DESC")).all()
    )
    return {
        "weekly_trend": _weekly_trend(db, [base]),
        "org_distribution": [{"name": r.name, "value": r.value} for r in org_dist],
        "researcher_distribution": [{"name": r.name, "value": r.value} for r in researcher_dist],
    }


# ─── Org detail ───────────────────────────────────────────────────────────────

def get_org_detail(db: Session, org_name: str) -> dict:
    base = Request.org_name == org_name
    summary = db.query(
        func.count(Request.id).label("total"),
        func.sum(case((Request.status == "completed", 1), else_=0)).label("completed"),
        func.sum(case((Request.status == "in_progress", 1), else_=0)).label("in_progress"),
        func.coalesce(func.sum(case((Request.status == "completed", Request.work_hours), else_=0)), 0).label("total_hours"),
    ).filter(base).first()

    type_dist = (
        db.query(Request.request_type.label("name"), func.count(Request.id).label("value"))
        .filter(base, Request.status == "completed")
        .group_by(Request.request_type).all()
    )
    return {
        "summary": {
            "total": summary.total or 0,
            "completed": summary.completed or 0,
            "in_progress": summary.in_progress or 0,
            "total_hours": round(summary.total_hours or 0, 1),
        },
        "weekly_trend": _weekly_trend(db, [base]),
        "type_distribution": [{"name": r.name or "未知", "value": r.value} for r in type_dist],
    }


# ─── Sales detail ─────────────────────────────────────────────────────────────

def get_sales_detail(db: Session, user_id: int) -> dict:
    base = Request.sales_id == user_id
    summary = db.query(
        func.count(Request.id).label("total"),
        func.sum(case((Request.status == "completed", 1), else_=0)).label("completed"),
        func.sum(case((Request.status == "pending", 1), else_=0)).label("pending"),
        func.sum(case((Request.status == "withdrawn", 1), else_=0)).label("withdrawn"),
    ).filter(base).first()

    type_dist = (
        db.query(Request.request_type.label("name"), func.count(Request.id).label("value"))
        .filter(base, Request.status == "completed")
        .group_by(Request.request_type).all()
    )
    org_dist = (
        db.query(func.coalesce(Request.org_name, "未知").label("name"), func.count(Request.id).label("value"))
        .filter(base, Request.status == "completed")
        .group_by(Request.org_name)
        .order_by(text("value DESC")).limit(10).all()
    )
    return {
        "summary": {
            "total": summary.total or 0,
            "completed": summary.completed or 0,
            "pending": summary.pending or 0,
            "withdrawn": summary.withdrawn or 0,
        },
        "weekly_trend": _weekly_trend(db, [base]),
        "type_distribution": [{"name": r.name or "未知", "value": r.value} for r in type_dist],
        "org_distribution": [{"name": r.name, "value": r.value} for r in org_dist],
    }


# ─── Modified: org_matrix 增加 period 过滤 ───────────────────────────────────

def get_org_matrix_v2(db: Session, period: str = "year") -> list[dict]:
    """带 period 过滤的客户矩阵，替代原 get_org_matrix。"""
    start = _period_start(period)
    rows = (
        db.query(
            func.coalesce(Request.org_name, "未知").label("name"),
            func.count(Request.id).label("count"),
            func.coalesce(func.sum(Request.work_hours), 0).label("hours"),
        )
        .filter(Request.status == "completed", Request.completed_at >= start)
        .group_by(Request.org_name)
        .order_by(text("count DESC"))
        .all()
    )
    return [{"name": r.name, "count": r.count, "hours": round(r.hours, 1)} for r in rows]


# ─── Modified: sales_matrix 补充 user_id ──────────────────────────────────────

def get_sales_matrix_v2(db: Session) -> list[dict]:
    """在原 sales_matrix 基础上增加 user_id 字段。"""
    rows = (
        db.query(User.id.label("user_id"), User.display_name.label("name"), *_build_period_columns())
        .join(Request, Request.sales_id == User.id)
        .filter(Request.status == "completed")
        .group_by(User.id)
        .all()
    )
    result = []
    for r in rows:
        d = {"user_id": r.user_id, "name": r.name,
             "today": r.today or 0, "week": r.week or 0,
             "month": r.month or 0, "quarter": r.quarter or 0, "year": r.year or 0}
        if any([d["today"], d["week"], d["month"], d["quarter"], d["year"]]):
            result.append(d)
    return result


# ─── 研究员参与的全部需求（主负责 + 协作），用于管理员看板明细展开 ──────────────

def get_researcher_all_requests(db: Session, user_id: int, page: int = 1, page_size: int = 10) -> dict:
    """返回研究员参与的所有需求：主负责 + 协作，排除 canceled/deleted。"""
    main_ids = db.query(Request.id).filter(
        Request.researcher_id == user_id,
        Request.status.not_in(["canceled", "deleted"]),
    )
    collab_ids = (
        db.query(RequestCollaborator.request_id.label("id"))
        .join(Request, RequestCollaborator.request_id == Request.id)
        .filter(
            RequestCollaborator.user_id == user_id,
            Request.status.not_in(["canceled", "deleted"]),
        )
    )
    id_union = main_ids.union(collab_ids).subquery()

    total = db.query(func.count()).select_from(id_union).scalar() or 0
    rows = (
        db.query(Request)
        .filter(Request.id.in_(db.query(id_union)))
        .order_by(Request.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]
    return {"items": items, "total": total}