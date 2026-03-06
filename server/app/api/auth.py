from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.core.security import (
    create_access_token, create_refresh_token, verify_password,
    upgrade_password, verify_token,
)
from app.models.user import User
from app.schemas.auth import (
    LoginRequest, TokenResponse, UserInfo, RefreshRequest, ChangePasswordRequest,
)

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: DB):
    user = db.execute(select(User).where(User.username == body.username)).scalar_one_or_none()
    if not user or not verify_password(body.password, user.password, user.password_version):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户名或密码错误")

    # 软删除用户禁止登录
    if getattr(user, 'is_deleted', 0) == 1:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "该账户已被停用")

    # Auto-upgrade SHA256 → bcrypt on successful login
    if user.password_version == 1:
        new_hash, new_ver = upgrade_password(body.password)
        user.password = new_hash
        user.password_version = new_ver
        db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id),
        user=UserInfo(
            id=user.id, username=user.username, role=user.role,
            display_name=user.display_name, team_id=user.team_id,
        ),
    )


@router.post("/refresh")
def refresh(body: RefreshRequest, db: DB):
    payload = verify_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "无效的 refresh token")
    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户不存在")
    return {"access_token": create_access_token(user.id, user.role)}


@router.put("/password")
def change_password(body: ChangePasswordRequest, user: CurrentUser, db: DB):
    if not verify_password(body.old_password, user.password, user.password_version):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "旧密码错误")
    new_hash, new_ver = upgrade_password(body.new_password)
    user.password = new_hash
    user.password_version = new_ver
    db.commit()
    return {"message": "ok"}
