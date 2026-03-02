from pydantic import BaseModel


class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    display_name: str
    team_id: int | None = None


class UserUpdate(BaseModel):
    display_name: str | None = None
    role: str | None = None
    team_id: int | None = None


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    display_name: str
    team_id: int | None = None
    created_at: str | None = None

    model_config = {"from_attributes": True}


class ResetPasswordRequest(BaseModel):
    new_password: str
