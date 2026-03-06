from functools import wraps
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_token
from app.models.user import User

security_scheme = HTTPBearer()


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "无效或过期的 token")
    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户不存在")
    if getattr(user, 'is_deleted', 0) == 1:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "该账户已被停用")
    return user


def require_role(*roles: str):
    """Dependency factory: restrict access to specific roles."""
    def checker(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "权限不足")
        return current_user
    # @wraps 无法直接装饰内部函数（需要包裹体），手动拷贝 __name__ 供 FastAPI 生成唯一依赖 key
    checker.__name__ = f"require_role_{'_'.join(roles)}"
    return checker


# Commonly used dependency shortcuts
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_role("admin"))]
DB = Annotated[Session, Depends(get_db)]
