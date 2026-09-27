from typing import List
from fastapi import HTTPException, status, Depends
from ..schemas.auth import UserProfile, UserRole
from ..api.deps import get_current_user_optional, get_current_active_user

class RequireRole:
    """
    Dependency that verifies the current authenticated user has one of the required roles.
    """
    def __init__(self, allowed_roles: List[UserRole]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: UserProfile = Depends(get_current_active_user)) -> UserProfile:
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role in {self.allowed_roles}, but user has role '{user.role}'."
            )
        return user

# Convenience dependencies
require_doctor = RequireRole(["DOCTOR", "ADMIN"])
require_clinician = RequireRole(["DOCTOR", "NURSE", "ADMIN"])
require_admin = RequireRole(["ADMIN"])
