import re
from typing import List, Dict, Any
from ..schemas.triage import UrgencySignalSchema

class DeterministicSafetyRulesEngine:
    """
    Independent Deterministic Safety Rules Engine.
    Evaluates multi-source narrative text, vitals, and lab triggers against
    auditable clinical safety thresholds.
    
    IMPORTANT:
    These rules output SIGNALS FOR HUMAN CLINICAL REVIEW.
    They do NOT make disease diagnoses.
    """

    RULES = [
        {
            "id": "RULE-001",
            "name": "Cardiorespiratory Distress",
            "keywords_a": ["chest pain", "angina", "pressure in chest", "chest discomfort", "chest heaviness", "सीने में", "छाती में", "सीने", "छाती"],
            "keywords_b": ["breathless", "breathing difficulty", "difficulty in breathing", "shortness of breath", "dyspnea", "gasping", "breath", "सांस लेने", "सांस", "दम फूलना"],
            "level": "immediate_attention",
            "signal": "Potential Acute Cardiorespiratory Distress Signal",
            "reason": "Deterministic rule match: Combined chest discomfort and breathing difficulty requires prioritized human evaluation."
        },
        {
            "id": "RULE-002",
            "name": "Severe Febrile with Meningeal / Neurological Signs",
            "keywords_a": ["high fever", "fever", "tezz bukhar", "तेज बुखार", "बुखार"],
            "keywords_b": ["stiff neck", "neck rigidity", "neck pain", "altered consciousness", "confusion", "गर्दन में अकड़न", "गर्दन में दर्द", "गर्दन"],
            "level": "immediate_attention",
            "signal": "High Febrile State with Neurological Signs",
            "reason": "Deterministic rule match: High fever accompanied by neck stiffness or altered mental state requires urgent clinical triage."
        },
        {
            "id": "RULE-003",
            "name": "Obstetric Emergency Bleeding",
            "keywords_a": ["pregnant", "pregnancy", "trimester", "गर्भवती", "गर्भ"],
            "keywords_b": ["bleeding", "heavy bleeding", "hemorrhage", "रक्तस्राव", "खून बहना", "खून"],
            "level": "immediate_attention",
            "signal": "Obstetric Vaginal Bleeding Alert",
            "reason": "Deterministic rule match: Active bleeding during pregnancy requires immediate emergency physician review."
        },
        {
            "id": "RULE-004",
            "name": "Severe Isolated Respiratory Failure",
            "keywords_a": ["severe shortness of breath", "gasping for air", "unable to breathe", "severe breathing difficulty"],
            "keywords_b": None,
            "level": "immediate_attention",
            "signal": "Severe Acute Respiratory Impairment Signal",
            "reason": "Deterministic rule match: Marked respiratory distress identified."
        },
        {
            "id": "RULE-005",
            "name": "Acute Abdominal Guarding / Rigidity",
            "keywords_a": ["severe abdominal pain", "stomach pain", "acute abdomen", "पेट में तेज दर्द", "पेट में दर्द"],
            "keywords_b": ["vomiting", "rigid", "guarding", "उल्टी", "चक्कर", "दौरा"],
            "level": "attention_required",
            "signal": "Acute Abdominal Pain with Associated Symptoms",
            "reason": "Deterministic rule match: Significant abdominal distress noted."
        },
        {
            "id": "RULE-006",
            "name": "Severe Lab Anomaly Alert",
            "keywords_a": ["platelet", "hemoglobin", "wbc", "creatinine"],
            "keywords_b": ["critical", "low", "severe", "abnormal", "elevated"],
            "level": "attention_required",
            "signal": "Critical Lab Biomarker Alert",
            "reason": "Deterministic rule match: Documented lab values indicate potential physiological anomaly."
        }
    ]

    @classmethod
    def evaluate(cls, combined_text: str) -> List[UrgencySignalSchema]:
        """
        Evaluate text against deterministic clinical safety rules.
        """
        if not combined_text:
            return []

        text_lower = combined_text.lower()
        matched_signals: List[UrgencySignalSchema] = []

        for rule in cls.RULES:
            match_a = any(k in text_lower for k in rule["keywords_a"])
            
            if rule["keywords_b"] is not None:
                match_b = any(k in text_lower for k in rule["keywords_b"])
                is_triggered = match_a and match_b
            else:
                is_triggered = match_a

            if is_triggered:
                matched_signals.append(
                    UrgencySignalSchema(
                        signal=rule["signal"],
                        level=rule["level"],
                        reason=rule["reason"],
                        source="DETERMINISTIC_RULE_ENGINE",
                        rule_id=rule["id"],
                        requires_human_review=True
                    )
                )

        return matched_signals

    @classmethod
    def compute_overall_urgency(cls, signals: List[UrgencySignalSchema]) -> str:
        """
        Determine overall priority based on deterministic rule output.
        """
        if any(s.level == "immediate_attention" for s in signals):
            return "HIGH_URGENCY"
        elif any(s.level == "attention_required" for s in signals):
            return "ELEVATED"
        return "ROUTINE"
