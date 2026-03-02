from pydantic import BaseModel


class TeamCreate(BaseModel):
    name: str


class TeamResponse(BaseModel):
    id: int
    name: str
    created_at: str | None = None
    org_count: int = 0
    member_count: int = 0

    model_config = {"from_attributes": True}


class TeamOrgsUpdate(BaseModel):
    org_ids: list[int]


class TeamMembersUpdate(BaseModel):
    user_ids: list[int]
