from sqlalchemy import Integer, String, Text, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Request(Base):
    __tablename__ = "requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    request_type: Mapped[str] = mapped_column(Text, nullable=False)
    research_scope: Mapped[str | None] = mapped_column(Text)
    org_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    org_type: Mapped[str | None] = mapped_column(Text)
    department: Mapped[str | None] = mapped_column(Text)
    sales_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    researcher_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"))
    is_confidential: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(Text, default="pending")
    result_note: Mapped[str | None] = mapped_column(Text)
    attachment_path: Mapped[str | None] = mapped_column(Text)
    work_hours: Mapped[float] = mapped_column(Float, default=0)
    withdraw_reason: Mapped[str | None] = mapped_column(Text)  # 研究员退回原因
    sub_type: Mapped[str | None] = mapped_column(Text)
    work_mode: Mapped[str] = mapped_column(Text, default="service")
    visibility: Mapped[str] = mapped_column(Text, default="public")
    automation_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    parent_request_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("requests.id"), nullable=True)
    link_type: Mapped[str | None] = mapped_column(Text)  # 'revision' | None
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[str | None] = mapped_column(String)
    updated_at: Mapped[str | None] = mapped_column(String)
    completed_at: Mapped[str | None] = mapped_column(String)
