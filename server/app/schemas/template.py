from pydantic import BaseModel


class TemplateCreate(BaseModel):
    template_name: str
    title_pattern: str
    description: str | None = None
    request_type: str
    research_scope: str | None = None
    org_name: str | None = None
    org_type: str | None = None
    department: str | None = None
    is_confidential: bool = False


class TemplateUpdate(BaseModel):
    template_name: str | None = None
    title_pattern: str | None = None
    description: str | None = None
    request_type: str | None = None
    research_scope: str | None = None
    org_name: str | None = None
    org_type: str | None = None
    department: str | None = None
    is_confidential: bool | None = None


class TemplateResponse(BaseModel):
    id: int
    researcher_id: int
    template_name: str
    title_pattern: str
    description: str | None = None
    request_type: str
    research_scope: str | None = None
    org_name: str | None = None
    org_type: str | None = None
    department: str | None = None
    is_confidential: int = 0
    usage_count: int = 0
    created_at: str | None = None
    updated_at: str | None = None

    model_config = {"from_attributes": True}


class CreateFromTemplate(BaseModel):
    """从模板创建需求"""
    sales_id: int
    description: str | None = None  # 覆盖模板的默认描述


class SaveAsTemplate(BaseModel):
    """从已完成需求保存为模板"""
    template_name: str
