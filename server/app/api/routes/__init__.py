from fastapi import APIRouter
from .auth import router as auth_router
from .intake import router as intake_router
from .triage import router as triage_router
from .multimodal import router as multimodal_router
from .review import router as review_router
from .audit import router as audit_router
from .referral import router as referral_router
from .voice import router as voice_router
from .patient import router as patient_router
from .patient_auth import router as patient_auth_router
from .bedside import router as bedside_router
from .cases import router as cases_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(patient_auth_router)
api_router.include_router(cases_router)
api_router.include_router(intake_router)
api_router.include_router(triage_router)
api_router.include_router(multimodal_router)
api_router.include_router(voice_router)
api_router.include_router(review_router)
api_router.include_router(audit_router)
api_router.include_router(referral_router)
api_router.include_router(patient_router)
api_router.include_router(bedside_router)

__all__ = ["api_router"]
