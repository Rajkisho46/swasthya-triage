import json
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models.patient import PatientCase
from ..schemas.review import ReviewQueueItem

class QueueService:
    @staticmethod
    async def get_prioritized_queue(db: AsyncSession, status_filter: str = "awaiting_review") -> List[ReviewQueueItem]:
        """
        Prioritize review queue by:
        1. Deterministic safety signals (High Urgency > Elevated > Routine)
        2. Case creation timestamp (waiting time)
        """
        stmt = select(PatientCase)
        if status_filter != "all":
            stmt = stmt.where(PatientCase.review_status == status_filter)

        result = await db.execute(stmt)
        cases = result.scalars().all()

        queue_items: List[ReviewQueueItem] = []
        for c in cases:
            signals = json.loads(c.urgency_signals) if c.urgency_signals else []
            has_immediate = any(s.get("level") == "immediate_attention" for s in signals)
            has_attention = any(s.get("level") == "attention_required" for s in signals)

            if has_immediate:
                urgency = "HIGH_URGENCY"
                priority_weight = 100
            elif has_attention:
                urgency = "ELEVATED"
                priority_weight = 50
            else:
                urgency = "ROUTINE"
                priority_weight = 10

            item = ReviewQueueItem(
                caseId=c.id,
                patientId=c.patient_id,
                age=c.age,
                gender=c.gender,
                preferredLanguage=c.preferred_language or "English",
                createdAt=c.created_at,
                urgencyLevel=urgency,
                reviewPriority="PRIORITY_REVIEW" if has_immediate else ("ELEVATED_REVIEW" if has_attention else "ROUTINE_REVIEW"),
                safetySignalCount=len(signals),
                hasImmediateAttention=has_immediate,
                rawSymptomsExcerpt=(c.raw_symptoms[:80] + "...") if len(c.raw_symptoms) > 80 else c.raw_symptoms,
                reviewStatus=c.review_status
            )
            # Store temporary weight for sorting
            queue_items.append((priority_weight, c.created_at, item))

        # Sort: Highest priority weight first, then oldest created_at first (FIFO within priority)
        queue_items.sort(key=lambda x: (-x[0], x[1]))

        return [item[2] for item in queue_items]
