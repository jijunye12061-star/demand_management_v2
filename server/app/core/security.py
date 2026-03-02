import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

ALGORITHM = "HS256"


def create_access_token(user_id: int, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": str(user_id), "role": role, "exp": expire}, settings.SECRET_KEY, ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "type": "refresh", "exp": expire}, settings.SECRET_KEY, ALGORITHM)


def verify_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str, password_version: int = 1) -> bool:
    """Verify password with SHA256 legacy (v1) or bcrypt (v2) support."""
    if password_version == 2:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    # Legacy SHA256
    return hashlib.sha256(plain.encode()).hexdigest() == hashed


def upgrade_password(plain: str) -> tuple[str, int]:
    """Return (bcrypt_hash, version=2) for auto-migration on login."""
    return hash_password(plain), 2