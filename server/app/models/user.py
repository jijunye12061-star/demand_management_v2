from sqlalchemy import Integer, String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)  # sales | researcher | admin
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id"))
    created_at: Mapped[str | None] = mapped_column(String)
    password_version: Mapped[int] = mapped_column(Integer, default=1)  # 1=SHA256, 2=bcrypt
    is_deleted: Mapped[int] = mapped_column(Integer, default=0)  # 0=正常, 1=已删除