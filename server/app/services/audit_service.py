import uuid
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models.audit import AuditEventModel
from ..utils.timestamps import utc_now_iso

class AuditService:
    @staticmethod
    async def log_event(
        db: AsyncSession,
        case_id: str,
        actor: str,
        provenance: str,
        action: str,
        details: str = "",
        role: str = "SYSTEM"
    ) -> AuditEventModel:
        """
        Record an immutable append-only audit event.
        Provenance must be one of: 'PATIENT' | 'AI_ADVISORY' | 'CLINICIAN' | 'SYSTEM' | 'MULTIMODAL'
        """
        event_id = f"aud_{uuid.uuid4().hex[:10]}"
        event = AuditEventModel(
            id=event_id,
            case_id=case_id,
            timestamp=utc_now_iso(),
            actor=actor,
            role=role,
            provenance=provenance,
            action=action,
            details=details
        )
        db.add(event)
        await db.commit()
        await db.refresh(event)
        return event

    @staticmethod
    async def get_events_for_case(db: AsyncSession, case_id: str) -> List[AuditEventModel]:
        stmt = select(AuditEventModel).where(AuditEventModel.case_id == case_id).order_by(AuditEventModel.timestamp.asc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_all_events(db: AsyncSession, limit: int = 100) -> List[AuditEventModel]:
        stmt = select(AuditEventModel).order_by(AuditEventModel.timestamp.desc()).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())
