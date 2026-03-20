from fastapi import APIRouter, status

from app.core.deps import DB, CurrentUser
from app.schemas.progress_update import (
    ProgressUpdateCreate, ProgressUpdateEdit,
    ProgressUpdateResponse, ProgressUpdateListResponse,
)
from app.services.progress_update_service import (
    create_update, list_updates, edit_update, delete_update,
)

router = APIRouter(prefix="/requests/{request_id}/updates", tags=["进度更新"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ProgressUpdateResponse)
def create_progress_update(request_id: int, data: ProgressUpdateCreate, db: DB, user: CurrentUser):
    return create_update(db, request_id, user, data)


@router.get("", response_model=ProgressUpdateListResponse)
def get_progress_updates(request_id: int, db: DB, user: CurrentUser):
    return list_updates(db, request_id, user)


@router.put("/{update_id}", response_model=ProgressUpdateResponse)
def edit_progress_update(request_id: int, update_id: int, data: ProgressUpdateEdit, db: DB, user: CurrentUser):
    return edit_update(db, request_id, update_id, user, data)


@router.delete("/{update_id}")
def delete_progress_update(request_id: int, update_id: int, db: DB, user: CurrentUser):
    return delete_update(db, request_id, update_id, user)
