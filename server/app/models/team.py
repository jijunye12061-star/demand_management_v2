from sqlalchemy import Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_at: Mapped[str | None] = mapped_column(String)
    is_deleted: Mapped[int] = mapped_column(Integer, default=0)


class TeamOrgMapping(Base):
    __tablename__ = "team_org_mapping"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("teams.id"), nullable=False)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=False)
    created_at: Mapped[str | None] = mapped_column(String)

    __table_args__ = (UniqueConstraint("team_id", "org_id"),)
