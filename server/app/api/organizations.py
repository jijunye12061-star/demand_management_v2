from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DB, CurrentUser, AdminUser
from app.models.organization import Organization
from app.models.team import TeamOrgMapping
from app.schemas.organization import OrgCreate, OrgUpdate, OrgResponse
from app.utils.datetime_utils import now_beijing

router = APIRouter(prefix="/organizations", tags=["机构"])


@router.get("", response_model=list[OrgResponse])
def list_organizations(db: DB, admin: AdminUser, team_id: int | None = None):
    q = select(Organization)
    if team_id:
        org_ids = db.execute(select(TeamOrgMapping.org_id).where(TeamOrgMapping.team_id == team_id)).scalars().all()
        q = q.where(Organization.id.in_(org_ids))
    return db.execute(q.order_by(Organization.name)).scalars().all()


@router.get("/by-team", response_model=list[OrgResponse])
def list_orgs_by_user_team(db: DB, user: CurrentUser, team_id: int | None = None):
    """Get orgs for current user's team, or specified team_id (for researcher proxy submit)."""
    tid = team_id or user.team_id
    if not tid:
        return []
    org_ids = db.execute(select(TeamOrgMapping.org_id).where(TeamOrgMapping.team_id == tid)).scalars().all()
    if not org_ids:
        return []
    return db.execute(select(Organization).where(Organization.id.in_(org_ids)).order_by(Organization.name)).scalars().all()


@router.post("", response_model=OrgResponse, status_code=status.HTTP_201_CREATED)
def create_org(body: OrgCreate, db: DB, admin: AdminUser):
    org = Organization(name=body.name, org_type=body.org_type, created_at=now_beijing())
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.put("/{org_id}", response_model=OrgResponse)
def update_org(org_id: int, body: OrgUpdate, db: DB, admin: AdminUser):
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "机构不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(org, k, v)
    db.commit()
    db.refresh(org)
    return org


@router.delete("/{org_id}")
def delete_org(org_id: int, db: DB, admin: AdminUser):
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "机构不存在")
    db.delete(org)
    db.commit()
    return {"message": "ok"}
