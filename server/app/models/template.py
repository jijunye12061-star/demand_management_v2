from sqlalchemy import Integer, String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RequestTemplate(Base):
    __tablename__ = "request_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    researcher_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    template_name: Mapped[str] = mapped_column(String, nullable=False)
    title_pattern: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    request_type: Mapped[str] = mapped_column(String, nullable=False)
    research_scope: Mapped[str | None] = mapped_column(String)
    org_name: Mapped[str | None] = mapped_column(String)
    org_type: Mapped[str | None] = mapped_column(String)
    department: Mapped[str | None] = mapped_column(String)
    is_confidential: Mapped[int] = mapped_column(Integer, default=0)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str | None] = mapped_column(String)
    updated_at: Mapped[str | None] = mapped_column(String)
    is_deleted: Mapped[int] = mapped_column(Integer, default=0)
    # 分类字段（与 requests 表对齐）
    sub_type: Mapped[str | None] = mapped_column(String)
    work_mode: Mapped[str] = mapped_column(String, default="service")
    # 定期调度字段
    is_recurring: Mapped[int] = mapped_column(Integer, default=0)
    recurrence_type: Mapped[str | None] = mapped_column(String)   # weekly/biweekly/monthly/quarterly
    recurrence_day: Mapped[int | None] = mapped_column(Integer)   # 1-7 或 1-28
    next_due_date: Mapped[str | None] = mapped_column(String)     # YYYY-MM-DD
    last_triggered_at: Mapped[str | None] = mapped_column(String)
    is_active: Mapped[int] = mapped_column(Integer, default=1)
