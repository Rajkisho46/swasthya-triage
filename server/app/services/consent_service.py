import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models.consent import ConsentRecord
from ..utils.timestamps import utc_now_iso

class ConsentService:
    @staticmethod
    async def record_consent(
        db: AsyncSession,
        case_id: str,
        patient_id: str,
        consent_given: bool,
        actor: str = "Patient / Guardian",
        version: str = "v1.0"
    ) -> ConsentRecord:
        record_id = f"cst_{uuid.uuid4().hex[:8]}"
        consent = ConsentRecord(
            id=record_id,
            case_id=case_id,
            patient_id=patient_id,
            consent_given=consent_given,
            consent_version=version,
            actor=actor,
            timestamp=utc_now_iso()
        )
        db.add(consent)
        await db.commit()
        await db.refresh(consent)
        return consent

    @staticmethod
    async def check_consent(db: AsyncSession, case_id: str) -> bool:
        stmt = select(ConsentRecord).where(ConsentRecord.case_id == case_id)
        result = await db.execute(stmt)
        record = result.scalars().first()
        return bool(record and record.consent_given)
