from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from ...schemas.audit import AuditEventResponse
from ...models.database import get_db
from ...services.audit_service import AuditService

from ...api.deps import get_current_user_optional
from ...schemas.auth import UserProfile

router = APIRouter(prefix="/audit", tags=["Audit Trail & Evidence Provenance"])

@router.get("", response_model=List[AuditEventResponse])
async def list_audit_events(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if user and user.role not in ["ADMIN", "DOCTOR"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Admin or Doctor role required to inspect institutional audit logs, but user has role '{user.role}'."
        )
    events = await AuditService.get_all_events(db=db, limit=limit)
    return [
        AuditEventResponse(
            id=e.id,
            caseId=e.case_id,
            timestamp=e.timestamp,
            actor=e.actor,
            role=e.role,
            provenance=e.provenance,
            action=e.action,
            details=e.details
        )
        for e in events
    ]

@router.get("/{case_id}", response_model=List[AuditEventResponse])
async def get_case_audit_trail(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if user and user.role not in ["ADMIN", "DOCTOR"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Admin or Doctor role required to inspect case audit trail, but user has role '{user.role}'."
        )
    events = await AuditService.get_events_for_case(db=db, case_id=case_id)
    return [
        AuditEventResponse(
            id=e.id,
            caseId=e.case_id,
            timestamp=e.timestamp,
            actor=e.actor,
            role=e.role,
            provenance=e.provenance,
            action=e.action,
            details=e.details
        )
        for e in events
    ]
