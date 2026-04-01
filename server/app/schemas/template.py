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
    sub_type: str | None = None
    work_mode: str = "service"
    is_recurring: bool = False
    recurrence_type: str | None = None   # weekly/biweekly/monthly/quarterly
    recurrence_day: int | None = None    # 1-7 或 1-28
    next_due_date: str | None = None     # YYYY-MM-DD


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
    sub_type: str | None = None
    work_mode: str | None = None
    is_recurring: bool | None = None
    recurrence_type: str | None = None
    recurrence_day: int | None = None
    next_due_date: str | None = None
    is_active: bool | None = None


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
    sub_type: str | None = None
    work_mode: str = "service"
    is_recurring: int = 0
    recurrence_type: str | None = None
    recurrence_day: int | None = None
    next_due_date: str | None = None
    last_triggered_at: str | None = None
    is_active: int = 1

    model_config = {"from_attributes": True}


class CreateFromTemplate(BaseModel):
    """从模板创建需求"""
    sales_id: int | None = None          # proactive 模式时可为空
    description: str | None = None      # 覆盖模板的默认描述


class SaveAsTemplate(BaseModel):
    """从已完成需求保存为模板"""
    template_name: str
