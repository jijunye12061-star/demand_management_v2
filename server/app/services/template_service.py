"""模板业务逻辑: CRUD + 从模板创建需求 + 从需求保存模板"""
from datetime import datetime, date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.template import RequestTemplate
from app.models.request import Request
from app.models.user import User
from app.utils.datetime_utils import now_beijing


def _render_title(pattern: str) -> str:
    """将标题模式中的占位符替换为实际值"""
    today = date.today()
    return (
        pattern
        .replace("{date}", today.strftime("%Y-%m-%d"))
        .replace("{week}", f"{today.year}-W{today.isocalendar()[1]:02d}")
        .replace("{month}", today.strftime("%Y-%m"))
        .replace("{year}", str(today.year))
    )


def list_templates(db: Session, researcher_id: int) -> list[RequestTemplate]:
    return db.execute(
        select(RequestTemplate)
        .where(RequestTemplate.researcher_id == researcher_id, RequestTemplate.is_deleted == 0)
        .order_by(RequestTemplate.updated_at.desc().nullslast(), RequestTemplate.id.desc())
    ).scalars().all()


def get_template(db: Session, template_id: int) -> RequestTemplate | None:
    tmpl = db.get(RequestTemplate, template_id)
    return tmpl if tmpl and not tmpl.is_deleted else None


def create_template(db: Session, researcher_id: int, data: dict) -> RequestTemplate:
    tmpl = RequestTemplate(
        researcher_id=researcher_id,
        template_name=data["template_name"],
        title_pattern=data["title_pattern"],
        description=data.get("description"),
        request_type=data["request_type"],
        research_scope=data.get("research_scope"),
        org_name=data.get("org_name"),
        org_type=data.get("org_type"),
        department=data.get("department"),
        is_confidential=1 if data.get("is_confidential") else 0,
        sub_type=data.get("sub_type"),
        work_mode=data.get("work_mode", "service"),
        is_recurring=1 if data.get("is_recurring") else 0,
        recurrence_type=data.get("recurrence_type"),
        recurrence_day=data.get("recurrence_day"),
        next_due_date=data.get("next_due_date"),
        is_active=1,
        created_at=now_beijing(),
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return tmpl


def update_template(db: Session, template_id: int, researcher_id: int, data: dict) -> RequestTemplate:
    tmpl = get_template(db, template_id)
    if not tmpl:
        raise ValueError("模板不存在")
    if tmpl.researcher_id != researcher_id:
        raise ValueError("无权修改他人模板")

    bool_fields = {"is_confidential", "is_recurring", "is_active"}
    for key, val in data.items():
        if val is None or not hasattr(tmpl, key):
            continue
        if key in bool_fields:
            setattr(tmpl, key, 1 if val else 0)
        else:
            setattr(tmpl, key, val)
    tmpl.updated_at = now_beijing()
    db.commit()
    db.refresh(tmpl)
    return tmpl


def toggle_active(db: Session, template_id: int, researcher_id: int) -> RequestTemplate:
    """暂停/恢复定期模板（翻转 is_active）"""
    tmpl = get_template(db, template_id)
    if not tmpl:
        raise ValueError("模板不存在")
    if tmpl.researcher_id != researcher_id:
        raise ValueError("无权操作他人模板")
    tmpl.is_active = 0 if tmpl.is_active else 1
    tmpl.updated_at = now_beijing()
    db.commit()
    db.refresh(tmpl)
    return tmpl


def delete_template(db: Session, template_id: int, researcher_id: int):
    tmpl = get_template(db, template_id)
    if not tmpl:
        raise ValueError("模板不存在")
    if tmpl.researcher_id != researcher_id:
        raise ValueError("无权删除他人模板")
    tmpl.is_deleted = 1
    tmpl.updated_at = now_beijing()
    db.commit()


def create_request_from_template(
    db: Session, template_id: int, sales_id: int | None, researcher_id: int,
    description_override: str | None = None,
) -> Request:
    """从模板一键创建需求"""
    tmpl = get_template(db, template_id)
    if not tmpl:
        raise ValueError("模板不存在")

    title = _render_title(tmpl.title_pattern)
    work_mode = tmpl.work_mode or "service"
    is_proactive = work_mode == "proactive"

    req = Request(
        title=title,
        description=description_override or tmpl.description,
        request_type=tmpl.request_type,
        research_scope=tmpl.research_scope,
        org_name=None if is_proactive else (tmpl.org_name or ""),
        org_type=None if is_proactive else tmpl.org_type,
        department=None if is_proactive else tmpl.department,
        sales_id=None if is_proactive else sales_id,
        researcher_id=researcher_id,
        is_confidential=tmpl.is_confidential,
        sub_type=tmpl.sub_type,
        work_mode=work_mode,
        status="in_progress" if is_proactive else "pending",
        created_by=researcher_id,
        created_at=now_beijing(),
    )
    db.add(req)

    tmpl.usage_count = (tmpl.usage_count or 0) + 1
    tmpl.updated_at = now_beijing()

    db.commit()
    db.refresh(req)
    return req


def save_request_as_template(
    db: Session, request_id: int, template_name: str, researcher_id: int,
) -> RequestTemplate:
    """从已完成需求保存为模板"""
    req = db.get(Request, request_id)
    if not req:
        raise ValueError("需求不存在")

    tmpl = RequestTemplate(
        researcher_id=researcher_id,
        template_name=template_name,
        title_pattern=req.title,
        description=req.description,
        request_type=req.request_type,
        research_scope=req.research_scope,
        org_name=req.org_name,
        org_type=req.org_type,
        department=req.department,
        is_confidential=req.is_confidential,
        sub_type=req.sub_type,
        work_mode=req.work_mode or "service",
        created_at=now_beijing(),
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return tmpl
