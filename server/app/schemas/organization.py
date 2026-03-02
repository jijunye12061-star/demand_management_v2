from pydantic import BaseModel


class OrgCreate(BaseModel):
    name: str
    org_type: str | None = None


class OrgUpdate(BaseModel):
    name: str | None = None
    org_type: str | None = None


class OrgResponse(BaseModel):
    id: int
    name: str
    org_type: str | None = None
    created_at: str | None = None

    model_config = {"from_attributes": True}
