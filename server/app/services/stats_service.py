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

    return {
        "total": rows.total or 0,
        "pending": rows.pending or 0,
        "in_progress": rows.in_progress or 0,
        "completed": rows.completed or 0,
        "total_hours": round(rows.total_hours or 0, 1),
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
            func.sum(case((Request.status == "pending", 1), else_=0)).label("pending_count"),
            func.sum(case((Request.status == "in_progress", 1), else_=0)).label("in_progress_count"),
        )
        .join(Request, Request.researcher_id == User.id)
        .filter(User.role.in_(["researcher", "admin"]))
        .group_by(User.id)
        .order_by(text("completed_count DESC"))
        .all()
    )
    return [
        {
            "user_id": r.user_id,
            "display_name": r.display_name,
            "completed_count": r.completed_count or 0,
            "work_hours": round(r.work_hours or 0, 1),
            "pending_count": r.pending_count or 0,
            "in_progress_count": r.in_progress_count or 0,
        }
        for r in rows
    ]


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
    rows = (
        db.query(User.display_name.label("name"), *_build_period_columns())
        .join(Request, Request.researcher_id == User.id)
        .filter(Request.status == "completed")
        .group_by(User.id)
        .all()
    )
    return _format_matrix_rows(rows)


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
        .outerjoin(Request, DownloadLog.request_id == Request.id)
        .outerjoin(User, DownloadLog.user_id == User.id)
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