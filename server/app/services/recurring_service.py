"""
定期报告自动创建服务

每日 08:00 执行 process_recurring_templates():
  1. 查询 is_recurring=1 AND is_active=1 AND is_deleted=0 AND next_due_date <= today
  2. 调用 create_request_from_template() 创建需求（status=in_progress）
  3. 更新 last_triggered_at 和 next_due_date
"""
import logging
from calendar import monthrange
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.template import RequestTemplate
from app.services.template_service import create_request_from_template
from app.utils.datetime_utils import now_beijing

logger = logging.getLogger("recurring")


# ── next_due_date 计算 ────────────────────────────────────────────────────────

def _next_date_weekly(current: date, day: int) -> date:
    """weekly: +7 天"""
    return current + timedelta(days=7)


def _next_date_biweekly(current: date, day: int) -> date:
    """biweekly: +14 天"""
    return current + timedelta(days=14)


def _next_date_monthly(current: date, day: int) -> date:
    """monthly: 下个月的 day 号（如 day > 月末则取月末）"""
    month = current.month + 1 if current.month < 12 else 1
    year = current.year if current.month < 12 else current.year + 1
    max_day = monthrange(year, month)[1]
    return date(year, month, min(day, max_day))


def _next_date_quarterly(current: date, day: int) -> date:
    """quarterly: 下个季度首月的 day 号
    季度首月: 1/4/7/10
    """
    quarter_starts = [1, 4, 7, 10]
    current_quarter_start = next(
        m for m in reversed(quarter_starts) if m <= current.month
    )
    next_qs_idx = quarter_starts.index(current_quarter_start) + 1
    if next_qs_idx >= len(quarter_starts):
        next_month = 1
        next_year = current.year + 1
    else:
        next_month = quarter_starts[next_qs_idx]
        next_year = current.year
    max_day = monthrange(next_year, next_month)[1]
    return date(next_year, next_month, min(day, max_day))


_NEXT_DATE_FN = {
    "weekly": _next_date_weekly,
    "biweekly": _next_date_biweekly,
    "monthly": _next_date_monthly,
    "quarterly": _next_date_quarterly,
}


def _compute_next_due(tmpl: RequestTemplate, current_due: date) -> str:
    fn = _NEXT_DATE_FN.get(tmpl.recurrence_type or "")
    if fn is None:
        logger.warning(f"模板 {tmpl.id} 的 recurrence_type={tmpl.recurrence_type!r} 不支持，跳过计算")
        return str(current_due)
    day = tmpl.recurrence_day or 1
    return str(fn(current_due, day))


# ── 主函数 ────────────────────────────────────────────────────────────────────

def process_recurring_templates():
    """定时任务主函数，每日 08:00 执行"""
    today = date.today()
    today_str = str(today)
    logger.info(f"[recurring] 开始处理，today={today_str}")

    db: Session = SessionLocal()
    try:
        templates = (
            db.query(RequestTemplate)
            .filter(
                RequestTemplate.is_recurring == 1,
                RequestTemplate.is_active == 1,
                RequestTemplate.is_deleted == 0,
                RequestTemplate.next_due_date <= today_str,
                RequestTemplate.next_due_date.isnot(None),
            )
            .all()
        )
        logger.info(f"[recurring] 待触发模板数: {len(templates)}")

        for tmpl in templates:
            try:
                req = create_request_from_template(
                    db=db,
                    template_id=tmpl.id,
                    sales_id=None,       # 自动触发时不关联销售
                    researcher_id=tmpl.researcher_id,
                    description_override=None,
                )
                current_due = date.fromisoformat(tmpl.next_due_date)
                tmpl.last_triggered_at = now_beijing()
                tmpl.next_due_date = _compute_next_due(tmpl, current_due)
                db.commit()
                logger.info(
                    f"[recurring] 模板 {tmpl.id}({tmpl.template_name}) → 需求 #{req.id}，"
                    f"下次触发: {tmpl.next_due_date}"
                )
            except Exception:
                logger.exception(f"[recurring] 模板 {tmpl.id} 创建需求失败")
                db.rollback()

    finally:
        db.close()

    logger.info("[recurring] 处理完成")
