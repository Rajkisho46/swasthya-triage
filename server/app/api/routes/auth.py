from fastapi import APIRouter, HTTPException, status, Depends
from ...schemas.auth import UserLoginRequest, TokenResponse, UserProfile
from ...services.auth_service import AuthService
from ...api.deps import get_current_active_user

router = APIRouter(prefix="/auth", tags=["Authentication & RBAC"])

@router.post("/login", response_model=TokenResponse)
async def login(req: UserLoginRequest):
    token_resp = AuthService.login_user(req.username, req.password, req.role)
    if not token_resp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials or demo role user not found"
        )
    return token_resp

@router.get("/me", response_model=UserProfile)
async def get_current_user_profile(user: UserProfile = Depends(get_current_active_user)):
    return user
