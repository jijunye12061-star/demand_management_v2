from typing import Optional

from pydantic import BaseModel


class RequestCreate(BaseModel):
    title: str
    description: str | None = None
    request_type: str
    research_scope: str | None = None
    org_name: Optional[str] = None
    org_type: str | None = None
    department: str | None = None
    researcher_id: int
    is_confidential: bool = False
    sub_type: Optional[str] = None
    work_mode: str = "service"
    visibility: str = "public"
    created_at: str | None = None
    sales_id: Optional[int] = None  # 研究员代提时必填
    parent_request_id: int | None = None
    link_type: str | None = None  # 'revision'


class RequestUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    request_type: str | None = None
    research_scope: str | None = None
    org_name: str | None = None
    org_type: str | None = None
    department: str | None = None
    sales_id: int | None = None
    researcher_id: int | None = None
    is_confidential: bool | None = None
    status: str | None = None
    result_note: str | None = None
    work_hours: float | None = None
    parent_request_id: int | None = None
    sub_type: Optional[str] = None
    work_mode: Optional[str] = None
    visibility: Optional[str] = None


class RequestResponse(BaseModel):
    id: int
    title: str
    description: str | None = None
    request_type: str
    research_scope: str | None = None
    org_name: Optional[str] = None
    org_type: str | None = None
    department: str | None = None
    sales_id: Optional[int] = None
    researcher_id: int | None = None
    is_confidential: int = 0
    status: str = "pending"
    result_note: str | None = None
    attachment_path: str | None = None
    work_hours: float = 0
    withdraw_reason: str | None = None
    sub_type: Optional[str] = None
    work_mode: str = "service"
    visibility: str = "public"
    created_by: int | None = None
    created_at: str | None = None
    updated_at: str | None = None
    completed_at: str | None = None
    automation_hours: float | None = None
    parent_request_id: int | None = None
    link_type: str | None = None
    # joined fields
    sales_name: str | None = None
    researcher_name: str | None = None
    download_count: int = 0
    revision_count: int = 0
    parent_title: str | None = None
    children: list[dict] | None = None
    revisions: list[dict] | None = None

    model_config = {"from_attributes": True}


class RequestListParams(BaseModel):
    status: str | None = None
    request_type: str | None = None
    research_scope: str | None = None
    org_type: str | None = None
    researcher_id: int | None = None
    sales_id: int | None = None
    keyword: str | None = None
    date_from: str | None = None
    date_to: str | None = None
    scope: str | None = None  # mine | feed
    page: int = 1
    page_size: int = 20
    sub_type: Optional[str] = None
    work_mode: Optional[str] = None
    visibility: Optional[str] = None


class WithdrawRequest(BaseModel):
    reason: str


class ResubmitRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    request_type: str | None = None
    research_scope: str | None = None
    org_name: str | None = None
    org_type: str | None = None
    department: str | None = None
    researcher_id: int | None = None


class ReassignRequest(BaseModel):
    researcher_id: int


class ConfidentialRequest(BaseModel):
    is_confidential: bool


class CollaboratorItem(BaseModel):
    user_id: int
    work_hours: float = 0


class CollaboratorsUpdate(BaseModel):
    collaborators: list[CollaboratorItem] = []