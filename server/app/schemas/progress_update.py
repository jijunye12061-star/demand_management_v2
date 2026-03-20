from pydantic import BaseModel, field_validator


class ProgressUpdateCreate(BaseModel):
    content: str
    work_hours: float

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("进度内容不能为空")
        return v.strip()

    @field_validator("work_hours")
    @classmethod
    def work_hours_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("工时不能为负数")
        return v


class ProgressUpdateEdit(BaseModel):
    content: str | None = None
    work_hours: float | None = None

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("进度内容不能为空")
        return v.strip() if v else v

    @field_validator("work_hours")
    @classmethod
    def work_hours_non_negative(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("工时不能为负数")
        return v


class ProgressUpdateResponse(BaseModel):
    id: int
    request_id: int
    user_id: int
    user_name: str
    content: str
    work_hours: float
    created_at: str | None
    updated_at: str | None
    can_edit: bool
    can_delete: bool


class ProgressUpdateListResponse(BaseModel):
    items: list[ProgressUpdateResponse]
    total_work_hours: float
