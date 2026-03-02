from datetime import datetime, timedelta, timezone

from sqlalchemy import func, case, and_, text
from sqlalchemy.orm import Session

from app.models.request import Request
from app.models.user import User
from app.models.download_log import DownloadLog

BJT = timezone(timedelta(hours=8))


def _period_start(period: str) -> str:
    """Return the start datetime string for the given period (Beijing time)."""
    now = datetime.now(BJT)
    match period:
        case "today":
            dt = now.replace(hour=0, minute=0, second=0)
        case "week":
            dt = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0)
        case "month":
            dt = now.replace(day=1, hour=0, minute=0, second=0)
        case "quarter":
            q_month = ((now.month - 1) // 3) * 3 + 1
            dt = now.replace(month=q_month, day=1, hour=0, minute=0, second=0)
        case "year":
            dt = now.replace(month=1, day=1, hour=0, minute=0, second=0)
        case _:
            dt = now.replace(month=1, day=1, hour=0, minute=0, second=0)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def get_overview(db: Session, period: str) -> dict:
    start = _period_start(period)
    rows = db.query(
        func.count(Request.id).label("total"),
        func.sum(case((Request.status == "pending", 1), else_=0)).label("pending"),
        func.sum(case((Request.status == "in_progress", 1), else_=0)).label("in_progress"),
        func.sum(case((Request.status == "completed", 1), else_=0)).label("completed"),
        func.coalesce(func.sum(
            case((Request.status == "completed", Request.work_hours), else_=0)
        ), 0).label("total_hours"),
    ).filter(Request.created_at >= start).one()

    return {
        "total": rows.total or 0,
        "pending": rows.pending or 0,
        "in_progress": rows.in_progress or 0,
        "completed": rows.completed or 0,
        "total_hours": round(rows.total_hours or 0, 1),
    }


def get_researcher_ranking(db: Session, period: str) -> list[dict]:
    start = _period_start(period)
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
        .filter(User.role == "researcher")
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


def _multi_period_count(db: Session, group_col, group_label: str) -> list[dict]:
    """Generic multi-time-dimension matrix: counts completed requests per group across time periods."""
    periods = {
        "today": _period_start("today"),
        "week": _period_start("week"),
        "month": _period_start("month"),
        "quarter": _period_start("quarter"),
        "year": _period_start("year"),
    }
    rows = (
        db.query(
            group_col.label("name"),
            *[
                func.sum(case((Request.completed_at >= start, 1), else_=0)).label(key)
                for key, start in periods.items()
            ],
        )
        .filter(Request.status == "completed")
        .group_by(group_col)
        .all()
    )
    return [
        {"name": r.name or "未知", "today": r.today, "week": r.week, "month": r.month, "quarter": r.quarter, "year": r.year}
        for r in rows
        if any([r.today, r.week, r.month, r.quarter, r.year])  # filter all-zero rows
    ]


def get_researcher_matrix(db: Session) -> list[dict]:
    return _multi_period_count(
        db,
        db.query(User.display_name).join(Request, Request.researcher_id == User.id).subquery().c.display_name,
        "researcher",
    )


def _researcher_matrix_direct(db: Session) -> list[dict]:
    """Direct researcher matrix using join."""
    periods = {
        "today": _period_start("today"),
        "week": _period_start("week"),
        "month": _period_start("month"),
        "quarter": _period_start("quarter"),
        "year": _period_start("year"),
    }
    rows = (
        db.query(
            User.display_name.label("name"),
            *[
                func.sum(case((Request.completed_at >= start, 1), else_=0)).label(key)
                for key, start in periods.items()
            ],
        )
        .join(Request, Request.researcher_id == User.id)
        .filter(Request.status == "completed")
        .group_by(User.id)
        .all()
    )
    return [
        {"name": r.name, "today": r.today, "week": r.week, "month": r.month, "quarter": r.quarter, "year": r.year}
        for r in rows
        if any([r.today, r.week, r.month, r.quarter, r.year])
    ]


def get_type_matrix(db: Session) -> list[dict]:
    periods = {
        "today": _period_start("today"),
        "week": _period_start("week"),
        "month": _period_start("month"),
        "quarter": _period_start("quarter"),
        "year": _period_start("year"),
    }
    rows = (
        db.query(
            Request.request_type.label("name"),
            *[func.sum(case((Request.completed_at >= start, 1), else_=0)).label(k) for k, start in periods.items()],
        )
        .filter(Request.status == "completed")
        .group_by(Request.request_type)
        .all()
    )
    return [
        {"name": r.name, "today": r.today, "week": r.week, "month": r.month, "quarter": r.quarter, "year": r.year}
        for r in rows
        if any([r.today, r.week, r.month, r.quarter, r.year])
    ]


def get_org_matrix(db: Session) -> list[dict]:
    """Org matrix: org_name × request count + work hours."""
    rows = (
        db.query(
            Request.org_name.label("name"),
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
    periods = {
        "today": _period_start("today"),
        "week": _period_start("week"),
        "month": _period_start("month"),
        "quarter": _period_start("quarter"),
        "year": _period_start("year"),
    }
    rows = (
        db.query(
            User.display_name.label("name"),
            *[func.sum(case((Request.completed_at >= start, 1), else_=0)).label(k) for k, start in periods.items()],
        )
        .join(Request, Request.sales_id == User.id)
        .filter(Request.status == "completed")
        .group_by(User.id)
        .all()
    )
    return [
        {"name": r.name, "today": r.today, "week": r.week, "month": r.month, "quarter": r.quarter, "year": r.year}
        for r in rows
        if any([r.today, r.week, r.month, r.quarter, r.year])
    ]


def get_charts(db: Session, period: str) -> dict:
    start = _period_start(period)

    # Type distribution
    type_dist = (
        db.query(Request.request_type.label("name"), func.count(Request.id).label("value"))
        .filter(Request.status == "completed", Request.completed_at >= start)
        .group_by(Request.request_type)
        .all()
    )

    # Org type distribution
    org_dist = (
        db.query(Request.org_type.label("name"), func.count(Request.id).label("value"))
        .filter(Request.status == "completed", Request.completed_at >= start)
        .group_by(Request.org_type)
        .all()
    )

    # Researcher workload
    workload = (
        db.query(
            User.display_name.label("name"),
            func.sum(case((Request.status == "completed", 1), else_=0)).label("completed"),
            func.sum(case((Request.status == "in_progress", 1), else_=0)).label("in_progress"),
            func.sum(case((Request.status == "pending", 1), else_=0)).label("pending"),
        )
        .join(Request, Request.researcher_id == User.id)
        .filter(User.role == "researcher")
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


def get_downloads(db: Session) -> dict:
    # Top 10 by download count
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

    # Recent 50 logs
    recent = (
        db.query(
            Request.title.label("request_title"),
            User.display_name.label("user_name"),
            DownloadLog.org_name,
            DownloadLog.downloaded_at,
        )
        .join(Request, DownloadLog.request_id == Request.id)
        .join(User, DownloadLog.user_id == User.id)
        .order_by(DownloadLog.downloaded_at.desc())
        .limit(50)
        .all()
    )

    return {
        "top_downloads": [
            {"request_id": r.request_id, "title": r.title, "total_count": r.total_count, "unique_users": r.unique_users}
            for r in top
        ],
        "recent_logs": [
            {"request_title": r.request_title, "user_name": r.user_name, "org_name": r.org_name, "downloaded_at": r.downloaded_at}
            for r in recent
        ],
    }
