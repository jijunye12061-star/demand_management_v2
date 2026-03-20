from pydantic import BaseModel


class RequestCreate(BaseModel):
    title: str
    description: str | None = None
    request_type: str
    research_scope: str | None = None
    org_name: str | None = None
    org_type: str | None = None
    department: str | None = None
    researcher_id: int
    is_confidential: bool = False
    is_self_initiated: bool = False
    created_at: str | None = None
    sales_id: int | None = None  # 研究员代提时必填
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


class RequestResponse(BaseModel):
    id: int
    title: str
    description: str | None = None
    request_type: str
    research_scope: str | None = None
    org_name: str
    org_type: str | None = None
    department: str | None = None
    sales_id: int
    researcher_id: int | None = None
    is_confidential: int = 0
    status: str = "pending"
    result_note: str | None = None
    attachment_path: str | None = None
    work_hours: float = 0
    withdraw_reason: str | None = None
    is_self_initiated: int = 0
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