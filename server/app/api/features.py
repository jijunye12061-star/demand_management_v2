from fastapi import APIRouter

from app.core.config import settings
from app.core.deps import CurrentUser

router = APIRouter(prefix="/features", tags=["功能开关"])


@router.get("")
def get_features(user: CurrentUser):
    return {"researcher_self_edit_enabled": settings.RESEARCHER_SELF_EDIT_ENABLED}
