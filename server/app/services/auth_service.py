from typing import Optional, Dict, Any
from ..utils.security import authenticate_demo_user, create_access_token, decode_access_token, DEMO_USERS
from ..schemas.auth import TokenResponse, UserProfile, UserRole

class AuthService:
    @staticmethod
    def login_user(username: str, password: str, requested_role: Optional[UserRole] = None) -> Optional[TokenResponse]:
        # Strict credential verification against authenticated user store
        user = authenticate_demo_user(username.strip().lower(), password.strip())
        if not user:
            return None

        # Role is STRICTLY determined by backend user record, never overridden by client request
        role = user["role"]
        token_data = {
            "sub": user["username"],
            "user_id": user["user_id"],
            "role": role,
            "display_name": user["display_name"]
        }
        token = create_access_token(token_data)

        return TokenResponse(
            access_token=token,
            token_type="bearer",
            role=role,
            username=user["username"],
            display_name=user["display_name"],
            user_id=user["user_id"]
        )

    @staticmethod
    def get_current_user(token: str) -> Optional[UserProfile]:
        payload = decode_access_token(token)
        if not payload:
            return None
        return UserProfile(
            user_id=payload.get("user_id", "usr_anon"),
            username=payload.get("sub", "anonymous"),
            display_name=payload.get("display_name", "Anonymous"),
            role=payload.get("role", "PATIENT")
        )
