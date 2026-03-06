from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DB, CurrentUser, AdminUser
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserResponse, ResetPasswordRequest
from app.utils.datetime_utils import now_beijing
from app.models.team import Team

router = APIRouter(prefix="/users", tags=["用户"])


@router.get("")
def list_users(db: DB, admin: AdminUser, role: str | None = None):
    q = (
        select(User, Team.name.label("team_name"))
        .outerjoin(Team, User.team_id == Team.id)
        .where(User.is_deleted == 0)  # ← 新增
    )
    if role:
        q = q.where(User.role == role)
    rows = db.execute(q.order_by(User.id)).all()
    return [
        {
            "id": u.id, "username": u.username, "role": u.role,
            "display_name": u.display_name, "team_id": u.team_id,
            "created_at": str(u.created_at) if u.created_at else None,
            "team_name": tn,
        }
        for u, tn in rows
    ]


@router.get("/researchers", response_model=list[UserResponse])
def list_researchers(db: DB, user: CurrentUser):
    return db.execute(
        select(User).where(User.role.in_(["researcher", "admin"]), User.is_deleted == 0)
        .order_by(User.display_name)
    ).scalars().all()


@router.get("/sales", response_model=list[UserResponse])
def list_sales(db: DB, user: CurrentUser):
    return db.execute(
        select(User).where(User.role.in_(["sales", "admin"]), User.is_deleted == 0)
        .order_by(User.display_name)
    ).scalars().all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, db: DB, admin: AdminUser):
    exists = db.execute(select(User).where(User.username == body.username)).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "用户名已存在")
    user = User(
        username=body.username, password=hash_password(body.password), password_version=2,
        role=body.role, display_name=body.display_name, team_id=body.team_id,
        created_at=now_beijing(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, body: UserUpdate, db: DB, admin: AdminUser):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "用户不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(user_id: int, db: DB, admin: AdminUser):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "用户不存在")
    user.is_deleted = 1
    db.commit()
    return {"message": "ok"}


@router.put("/{user_id}/reset-password")
def reset_password(user_id: int, body: ResetPasswordRequest, db: DB, admin: AdminUser):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "用户不存在")
    user.password = hash_password(body.new_password)
    user.password_version = 2
    db.commit()
    return {"message": "ok"}