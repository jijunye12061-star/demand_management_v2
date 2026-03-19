from sqlalchemy import Integer, Float, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RequestCollaborator(Base):
    __tablename__ = "request_collaborators"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(Integer, ForeignKey("requests.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    work_hours: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[str | None] = mapped_column(String)
