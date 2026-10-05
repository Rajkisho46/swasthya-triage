from typing import Optional
from pydantic import BaseModel, Field

class PatientRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=128, description="Patient's full name")
    email: str = Field(..., min_length=5, max_length=256, description="Valid real email address")
    password: str = Field(..., min_length=8, max_length=128, description="Minimum 8 characters")
    preferred_language: Optional[str] = Field("English", description="Preferred clinical communication language")

class PatientVerifyEmailRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=256, description="Registered email address")
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit verification code")

class PatientLoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=256, description="Registered email address")
    password: str = Field(..., min_length=1, description="Account password")

class PatientResendOtpRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=256, description="Email address for resending code")
    purpose: Optional[str] = Field("EMAIL_VERIFICATION", description="EMAIL_VERIFICATION or PASSWORD_RESET")

class PatientForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=256, description="Registered email address")

class PatientResetPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=256, description="Registered email address")
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit password reset code")
    new_password: str = Field(..., min_length=8, max_length=128, description="Minimum 8 characters")

class PatientUserDTO(BaseModel):
    id: str
    email: str
    fullName: str
    role: str = "PATIENT"
    emailVerified: bool = True
    preferredLanguage: Optional[str] = "English"

class PatientAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: PatientUserDTO
    role: str = "PATIENT"
    username: str
    displayName: str
    userId: str

class PatientRegisterResponse(BaseModel):
    success: bool = True
    requires_verification: bool = True
    email: str
    message: str
    status: str = "success"

class MessageResponse(BaseModel):
    status: str = "success"
    message: str
