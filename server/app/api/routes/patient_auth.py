import uuid
import re
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from ...models.database import get_db
from ...models.patient_user import PatientUser, utc_now_iso
from ...models.otp import EmailVerificationToken, utc_now
from ...api.deps import get_current_active_user, get_current_user_optional
from ...schemas.auth import UserProfile
from ...schemas.patient_auth import (
    PatientRegisterRequest,
    PatientVerifyEmailRequest,
    PatientLoginRequest,
    PatientResendOtpRequest,
    PatientForgotPasswordRequest,
    PatientResetPasswordRequest,
    PatientAuthResponse,
    PatientUserDTO,
    PatientRegisterResponse,
    MessageResponse
)
from ...utils.security import (
    hash_password,
    verify_password,
    generate_secure_otp,
    hash_otp,
    verify_otp,
    check_rate_limit,
    create_access_token
)
from ...services.email_service import EmailService
from ...services.audit_service import AuditService
from ...config import settings

router = APIRouter(prefix="/patient/auth", tags=["Real Patient Authentication"])

def mask_email(email_str: str) -> str:
    """Mask email for privacy in public API responses (e.g. k***@gmail.com)."""
    if not email_str or "@" not in email_str:
        return email_str
    user, domain = email_str.split("@", 1)
    if len(user) <= 2:
        return f"{user[:1]}***@{domain}"
    return f"{user[0]}***{user[-1]}@{domain}"

def validate_password_strength(password: str) -> None:
    """Validate password against institutional security policy."""
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least 8 characters."
        )

@router.post("/register", response_model=PatientRegisterResponse)
async def register_patient(
    req: PatientRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    normalized_email = req.email.strip().lower()
    validate_password_strength(req.password)

    # Rate limiting on registration per email
    rate_key = f"reg:{normalized_email}"
    if not check_rate_limit(rate_key, max_requests=5, window_seconds=600):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts for this email. Please try again later."
        )

    # Check for existing verified account
    stmt = select(PatientUser).where(PatientUser.email_normalized == normalized_email)
    res = await db.execute(stmt)
    existing_user = res.scalars().first()

    if existing_user and existing_user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists. Please log in instead."
        )

    pw_hash = hash_password(req.password)
    user_id = existing_user.id if existing_user else f"PT-{uuid.uuid4().hex[:8].upper()}"

    if existing_user:
        # Update existing unverified account
        existing_user.password_hash = pw_hash
        existing_user.full_name = req.full_name.strip()
        existing_user.preferred_language = req.preferred_language or "English"
        existing_user.updated_at = utc_now_iso()
    else:
        new_user = PatientUser(
            id=user_id,
            email=req.email.strip(),
            email_normalized=normalized_email,
            password_hash=pw_hash,
            full_name=req.full_name.strip(),
            email_verified=False,
            status="active",
            preferred_language=req.preferred_language or "English",
            created_at=utc_now_iso(),
            updated_at=utc_now_iso()
        )
        db.add(new_user)

    # Invalidate previous registration tokens for this email
    del_stmt = delete(EmailVerificationToken).where(
        EmailVerificationToken.email_normalized == normalized_email,
        EmailVerificationToken.purpose == "EMAIL_VERIFICATION"
    )
    await db.execute(del_stmt)

    # Generate secure 6-digit OTP and store hash
    otp = generate_secure_otp(6)
    token_record = EmailVerificationToken(
        id=f"tok_{uuid.uuid4().hex[:12]}",
        email_normalized=normalized_email,
        otp_hash=hash_otp(otp),
        purpose="EMAIL_VERIFICATION",
        expires_at=utc_now() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
        attempt_count=0,
        used=False,
        created_at=utc_now(),
        last_sent_at=utc_now()
    )
    db.add(token_record)
    await db.commit()

    # Dispatch OTP via real SMTP email service (server-side only)
    sent = EmailService.send_verification_otp(req.email.strip(), otp, req.full_name.strip())
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification email could not be sent. Please check the email address or try again later."
        )

    masked = mask_email(req.email.strip())
    return PatientRegisterResponse(
        success=True,
        requires_verification=True,
        email=masked,
        message=f"Verification code sent to {masked}. Please verify your email to complete registration.",
        status="success"
    )

@router.post("/verify-email", response_model=PatientAuthResponse)
async def verify_patient_email(
    req: PatientVerifyEmailRequest,
    db: AsyncSession = Depends(get_db)
):
    normalized_email = req.email.strip().lower()

    # Retrieve valid token record
    stmt = (
        select(EmailVerificationToken)
        .where(
            EmailVerificationToken.email_normalized == normalized_email,
            EmailVerificationToken.purpose == "EMAIL_VERIFICATION",
            EmailVerificationToken.used.is_(False)
        )
        .order_by(EmailVerificationToken.created_at.desc())
    )
    res = await db.execute(stmt)
    token_record = res.scalars().first()

    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code or no pending verification found."
        )

    if token_record.is_expired():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification code has expired. Please request a new code."
        )

    if token_record.attempt_count >= settings.OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification attempts. Please request a new code."
        )

    if not verify_otp(req.otp, token_record.otp_hash):
        token_record.attempt_count += 1
        await db.commit()
        remaining = settings.OTP_MAX_ATTEMPTS - token_record.attempt_count
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid verification code. {max(0, remaining)} attempts remaining."
        )

    # Mark token used
    token_record.used = True

    # Retrieve and activate patient account
    u_stmt = select(PatientUser).where(PatientUser.email_normalized == normalized_email)
    u_res = await db.execute(u_stmt)
    patient = u_res.scalars().first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient account record not found."
        )

    patient.email_verified = True
    patient.last_login_at = utc_now_iso()
    await db.commit()

    # Issue authenticated PATIENT JWT
    token_data = {
        "sub": patient.email_normalized,
        "user_id": patient.id,
        "role": "PATIENT",
        "display_name": patient.full_name
    }
    jwt_token = create_access_token(token_data)

    user_dto = PatientUserDTO(
        id=patient.id,
        email=patient.email,
        fullName=patient.full_name,
        role="PATIENT",
        emailVerified=True,
        preferredLanguage=patient.preferred_language
    )

    return PatientAuthResponse(
        access_token=jwt_token,
        token_type="bearer",
        user=user_dto,
        role="PATIENT",
        username=patient.email_normalized,
        displayName=patient.full_name,
        userId=patient.id
    )

@router.post("/verify-otp", response_model=PatientAuthResponse)
async def verify_patient_otp(
    req: PatientVerifyEmailRequest,
    db: AsyncSession = Depends(get_db)
):
    """Alias for email verification with OTP."""
    return await verify_patient_email(req, db)

@router.get("/me", response_model=PatientUserDTO)
async def get_current_patient_profile(
    user: UserProfile = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve authenticated patient's profile."""
    if user.role != "PATIENT":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Patient role required, but user has role '{user.role}'."
        )
    stmt = select(PatientUser).where(
        (PatientUser.id == user.user_id) | (PatientUser.email_normalized == user.username.lower())
    )
    res = await db.execute(stmt)
    patient = res.scalars().first()
    if not patient:
        return PatientUserDTO(
            id=user.user_id,
            email=user.username,
            fullName=user.display_name,
            role="PATIENT",
            emailVerified=True,
            preferredLanguage="English"
        )
    return PatientUserDTO(
        id=patient.id,
        email=patient.email,
        fullName=patient.full_name,
        role="PATIENT",
        emailVerified=patient.email_verified,
        preferredLanguage=patient.preferred_language
    )

@router.post("/login", response_model=PatientAuthResponse)
async def login_patient(
    req: PatientLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    normalized_email = req.email.strip().lower()

    stmt = select(PatientUser).where(PatientUser.email_normalized == normalized_email)
    res = await db.execute(stmt)
    patient = res.scalars().first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found. Create a Patient Account."
        )

    if not patient.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email first."
        )

    if not verify_password(req.password, patient.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    if patient.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your patient account has been suspended or deactivated. Contact support."
        )

    patient.last_login_at = utc_now_iso()
    await db.commit()

    token_data = {
        "sub": patient.email_normalized,
        "user_id": patient.id,
        "role": "PATIENT",
        "display_name": patient.full_name
    }
    jwt_token = create_access_token(token_data)

    user_dto = PatientUserDTO(
        id=patient.id,
        email=patient.email,
        fullName=patient.full_name,
        role="PATIENT",
        emailVerified=patient.email_verified,
        preferredLanguage=patient.preferred_language
    )

    return PatientAuthResponse(
        access_token=jwt_token,
        token_type="bearer",
        user=user_dto,
        role="PATIENT",
        username=patient.email_normalized,
        displayName=patient.full_name,
        userId=patient.id
    )

@router.post("/resend-verification", response_model=MessageResponse)
@router.post("/resend-otp", response_model=MessageResponse)
async def resend_otp(
    req: PatientResendOtpRequest,
    db: AsyncSession = Depends(get_db)
):
    normalized_email = req.email.strip().lower()
    purpose = (req.purpose or "EMAIL_VERIFICATION").upper()

    rate_key = f"resend:{normalized_email}"
    if not check_rate_limit(rate_key, max_requests=1, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait 60 seconds before requesting another code."
        )

    # Invalidate previous tokens
    del_stmt = delete(EmailVerificationToken).where(
        EmailVerificationToken.email_normalized == normalized_email,
        EmailVerificationToken.purpose == purpose
    )
    await db.execute(del_stmt)

    otp = generate_secure_otp(6)
    token_record = EmailVerificationToken(
        id=f"tok_{uuid.uuid4().hex[:12]}",
        email_normalized=normalized_email,
        otp_hash=hash_otp(otp),
        purpose=purpose,
        expires_at=utc_now() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
        attempt_count=0,
        used=False,
        created_at=utc_now(),
        last_sent_at=utc_now()
    )
    db.add(token_record)
    await db.commit()

    if purpose == "PASSWORD_RESET":
        sent = EmailService.send_password_reset_otp(req.email.strip(), otp)
    else:
        sent = EmailService.send_verification_otp(req.email.strip(), otp)

    if not sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification email could not be sent. Please check the email address or try again later."
        )

    masked = mask_email(req.email.strip())
    return MessageResponse(
        status="success",
        message=f"A new verification code has been dispatched to {masked}."
    )

@router.post("/request-password-reset", response_model=MessageResponse)
async def request_password_reset(
    req: PatientForgotPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    normalized_email = req.email.strip().lower()

    rate_key = f"reset_req:{normalized_email}"
    if not check_rate_limit(rate_key, max_requests=4, window_seconds=600):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password reset requests. Please try again later."
        )

    stmt = select(PatientUser).where(PatientUser.email_normalized == normalized_email)
    res = await db.execute(stmt)
    patient = res.scalars().first()

    if patient and patient.email_verified:
        # Invalidate old reset tokens
        del_stmt = delete(EmailVerificationToken).where(
            EmailVerificationToken.email_normalized == normalized_email,
            EmailVerificationToken.purpose == "PASSWORD_RESET"
        )
        await db.execute(del_stmt)

        otp = generate_secure_otp(6)
        token_record = EmailVerificationToken(
            id=f"tok_{uuid.uuid4().hex[:12]}",
            email_normalized=normalized_email,
            otp_hash=hash_otp(otp),
            purpose="PASSWORD_RESET",
            expires_at=utc_now() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
            attempt_count=0,
            used=False,
            created_at=utc_now(),
            last_sent_at=utc_now()
        )
        db.add(token_record)
        await db.commit()

        EmailService.send_password_reset_otp(patient.email, otp, patient.full_name)

    # Generic response to prevent email enumeration
    return MessageResponse(
        status="success",
        message="If an account exists for this email, a password reset code has been sent."
    )

@router.post("/verify-password-reset", response_model=MessageResponse)
async def verify_password_reset(
    req: PatientResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    normalized_email = req.email.strip().lower()
    validate_password_strength(req.new_password)

    stmt = (
        select(EmailVerificationToken)
        .where(
            EmailVerificationToken.email_normalized == normalized_email,
            EmailVerificationToken.purpose == "PASSWORD_RESET",
            EmailVerificationToken.used.is_(False)
        )
        .order_by(EmailVerificationToken.created_at.desc())
    )
    res = await db.execute(stmt)
    token_record = res.scalars().first()

    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset request."
        )

    if token_record.is_expired():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset code has expired. Please request a new code."
        )

    if token_record.attempt_count >= settings.OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification attempts. Please request a new code."
        )

    if not verify_otp(req.otp, token_record.otp_hash):
        token_record.attempt_count += 1
        await db.commit()
        remaining = settings.OTP_MAX_ATTEMPTS - token_record.attempt_count
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid password reset code. {max(0, remaining)} attempts remaining."
        )

    # Mark token used
    token_record.used = True

    # Update patient password
    u_stmt = select(PatientUser).where(PatientUser.email_normalized == normalized_email)
    u_res = await db.execute(u_stmt)
    patient = u_res.scalars().first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient account not found."
        )

    patient.password_hash = hash_password(req.new_password)
    patient.updated_at = utc_now_iso()
    await db.commit()

    return MessageResponse(
        status="success",
        message="Password has been successfully reset. Please log in with your new password."
    )
