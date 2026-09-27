from typing import Optional, Literal
from pydantic import BaseModel, Field

UserRole = Literal["PATIENT", "NURSE", "DOCTOR", "ADMIN"]

class UserLoginRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=1)
    role: Optional[UserRole] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    username: str
    display_name: str
    user_id: str

class UserProfile(BaseModel):
    user_id: str
    username: str
    display_name: str
    role: UserRole
