import os
import hashlib
import secrets
import string
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import jwt
import bcrypt
from ..config import settings

# Demo User Store with RBAC roles (Demo Staff logins remain intact)
DEMO_USERS = {
    "dr_sharma": {
        "user_id": "usr_doc_01",
        "username": "dr_sharma",
        "display_name": "Dr. Ananya Sharma, MD",
        "role": "DOCTOR",
        "password": "doctorpassword123"
    },
    "nurse_priya": {
        "user_id": "usr_nur_01",
        "username": "nurse_priya",
        "display_name": "Nurse Priya Nair, RN",
        "role": "NURSE",
        "password": "nursepassword123"
    },
    "patient_demo": {
        "user_id": "usr_pat_01",
        "username": "patient_demo",
        "display_name": "Rajesh Kumar (Patient)",
        "role": "PATIENT",
        "password": "patientpassword123"
    },
    "admin_user": {
        "user_id": "usr_adm_01",
        "username": "admin_user",
        "display_name": "System Administrator",
        "role": "ADMIN",
        "password": "adminpassword123"
    }
}

def hash_password(password: str) -> str:
    """Hash a password using bcrypt with random salt."""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def generate_secure_otp(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP."""
    digits = string.digits
    return "".join(secrets.choice(digits) for _ in range(length))

def hash_otp(otp: str) -> str:
    """Hash OTP using SHA-256 with server-side secret key salt before storing."""
    salted = f"{settings.SECRET_KEY}:{otp}"
    return hashlib.sha256(salted.encode("utf-8")).hexdigest()

def verify_otp(plain_otp: str, hashed_otp: str) -> bool:
    """Verify a plain OTP against its stored hash."""
    return secrets.compare_digest(hash_otp(plain_otp.strip()), hashed_otp)

# Rate limiting store: in-memory map of {key: [timestamp, ...]}
_rate_limits: Dict[str, list] = {}

def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> bool:
    """Check if action exceeds rate limit within sliding window."""
    now = time.time()
    timestamps = _rate_limits.get(key, [])
    # Remove timestamps older than window
    timestamps = [ts for ts in timestamps if now - ts < window_seconds]
    if len(timestamps) >= max_requests:
        _rate_limits[key] = timestamps
        return False
    timestamps.append(now)
    _rate_limits[key] = timestamps
    return True

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create signed JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify JWT token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except Exception:
        return None

def authenticate_demo_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticate against demo user store."""
    user = DEMO_USERS.get(username)
    if not user:
        return None
    if user["password"] == password:
        return user
    return None
