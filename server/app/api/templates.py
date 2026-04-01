from fastapi import APIRouter, HTTPException, status

from app.core.deps import DB, CurrentUser
from app.models.user import User
from app.schemas.template import (
    TemplateCreate, TemplateUpdate, TemplateResponse,
    CreateFromTemplate, SaveAsTemplate,
)
from app.services.template_service import (
    list_templates, get_template, create_template,
    update_template, delete_template, toggle_active,
    create_request_from_template, save_request_as_template,
)

router = APIRouter(prefix="/templates", tags=["模板"])


def _check_researcher(user: User):
    if user.role not in ("researcher", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "仅研究员/管理员可操作模板")


@router.get("", response_model=list[TemplateResponse])
def list_my_templates(db: DB, user: CurrentUser):
    _check_researcher(user)
    return list_templates(db, user.id)


@router.get("/{template_id}", response_model=TemplateResponse)
def get_one(template_id: int, db: DB, user: CurrentUser):
    _check_researcher(user)
    tmpl = get_template(db, template_id)
    if not tmpl:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "模板不存在")
    return tmpl


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
def create(body: TemplateCreate, db: DB, user: CurrentUser):
    _check_researcher(user)
    return create_template(db, user.id, body.model_dump())


@router.put("/{template_id}", response_model=TemplateResponse)
def update(template_id: int, body: TemplateUpdate, db: DB, user: CurrentUser):
    _check_researcher(user)
    try:
        return update_template(db, template_id, user.id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.delete("/{template_id}")
def delete(template_id: int, db: DB, user: CurrentUser):
    _check_researcher(user)
    try:
        delete_template(db, template_id, user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"message": "ok"}


@router.post("/{template_id}/toggle-active", response_model=TemplateResponse)
def toggle_active_endpoint(template_id: int, db: DB, user: CurrentUser):
    """暂停/恢复定期模板"""
    _check_researcher(user)
    try:
        return toggle_active(db, template_id, user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.post("/{template_id}/create-request")
def create_from_tmpl(template_id: int, body: CreateFromTemplate, db: DB, user: CurrentUser):
    """从模板一键创建需求"""
    _check_researcher(user)
    try:
        req = create_request_from_template(
            db, template_id, body.sales_id, user.id, body.description
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"request_id": req.id, "title": req.title}


@router.post("/save-from-request/{request_id}")
def save_from_request(request_id: int, body: SaveAsTemplate, db: DB, user: CurrentUser):
    """从已完成需求保存为模板"""
    _check_researcher(user)
    try:
        tmpl = save_request_as_template(db, request_id, body.template_name, user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"template_id": tmpl.id, "template_name": tmpl.template_name}
