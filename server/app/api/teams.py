from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, func

from app.core.deps import DB, AdminUser
from app.models.team import Team, TeamOrgMapping
from app.models.user import User
from app.models.organization import Organization
from app.schemas.team import TeamCreate, TeamResponse, TeamOrgsUpdate, TeamMembersUpdate
from app.schemas.organization import OrgResponse
from app.utils.datetime_utils import now_beijing

router = APIRouter(prefix="/teams", tags=["团队"])


@router.get("", response_model=list[TeamResponse])
def list_teams(db: DB, admin: AdminUser):
    teams = db.execute(select(Team).order_by(Team.id)).scalars().all()
    result = []
    for t in teams:
        org_count = db.execute(select(func.count(TeamOrgMapping.id)).where(TeamOrgMapping.team_id == t.id)).scalar() or 0
        member_count = db.execute(select(func.count(User.id)).where(User.team_id == t.id)).scalar() or 0
        result.append(TeamResponse(
            id=t.id, name=t.name, created_at=t.created_at,
            org_count=org_count, member_count=member_count,
        ))
    return result


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
def create_team(body: TeamCreate, db: DB, admin: AdminUser):
    team = Team(name=body.name, created_at=now_beijing())
    db.add(team)
    db.commit()
    db.refresh(team)
    return TeamResponse(id=team.id, name=team.name, created_at=team.created_at)


@router.delete("/{team_id}")
def delete_team(team_id: int, db: DB, admin: AdminUser):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "团队不存在")
    # Clean up mappings and user references
    db.execute(select(TeamOrgMapping).where(TeamOrgMapping.team_id == team_id))
    for m in db.execute(select(TeamOrgMapping).where(TeamOrgMapping.team_id == team_id)).scalars():
        db.delete(m)
    for u in db.execute(select(User).where(User.team_id == team_id)).scalars():
        u.team_id = None
    db.delete(team)
    db.commit()
    return {"message": "ok"}


@router.get("/{team_id}/organizations", response_model=list[OrgResponse])
def get_team_orgs(team_id: int, db: DB, admin: AdminUser):
    org_ids = db.execute(select(TeamOrgMapping.org_id).where(TeamOrgMapping.team_id == team_id)).scalars().all()
    if not org_ids:
        return []
    return db.execute(select(Organization).where(Organization.id.in_(org_ids))).scalars().all()


@router.put("/{team_id}/organizations")
def set_team_orgs(team_id: int, body: TeamOrgsUpdate, db: DB, admin: AdminUser):
    """Full replace: delete all existing mappings, insert new ones."""
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "团队不存在")
    # Delete existing
    for m in db.execute(select(TeamOrgMapping).where(TeamOrgMapping.team_id == team_id)).scalars():
        db.delete(m)
    # Insert new
    for org_id in body.org_ids:
        db.add(TeamOrgMapping(team_id=team_id, org_id=org_id, created_at=now_beijing()))
    db.commit()
    return {"message": "ok"}


@router.put("/{team_id}/members")
def set_team_members(team_id: int, body: TeamMembersUpdate, db: DB, admin: AdminUser):
    """Set team members: unassign current, assign new."""
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "团队不存在")
    # Unassign current members
    for u in db.execute(select(User).where(User.team_id == team_id)).scalars():
        u.team_id = None
    # Assign new members
    for uid in body.user_ids:
        u = db.get(User, uid)
        if u:
            u.team_id = team_id
    db.commit()
    return {"message": "ok"}
