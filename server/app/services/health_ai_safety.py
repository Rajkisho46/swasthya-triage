import re
from typing import Dict, Any, List, Optional, Tuple
from ..services.rules_engine import DeterministicSafetyRulesEngine

NON_HEALTHCARE_STANDARD_REPLY = (
    "I’m the Swasthya Triage Health Assistant, so I can only help with healthcare-related "
    "questions, symptoms, medical information, documents, and the triage process."
)

OFF_TOPIC_KEYWORDS = [
    "python", "javascript", "react", "c++", "java", "coding", "programming", "sql",
    "write code", "html", "css", "bug fix", "github", "function", "script to scrape",
    "weather", "sports", "cricket score", "football", "movie", "celebrity", "actor",
    "politics", "election", "prime minister", "president", "parliament",
    "gaming", "game", "playstation", "xbox", "fortnite", "minecraft",
    "homework", "essay on", "solve math", "calculus", "algebra", "tell me a joke",
    "crypto", "bitcoin", "stock market", "invest in", "travel guide", "flight ticket"
]

HEALTHCARE_TOPIC_KEYWORDS = [
    "symptom", "pain", "fever", "cough", "breath", "dizzy", "dizziness", "chest", "headache",
    "stomach", "abdomen", "nausea", "vomit", "rash", "allergy", "infection", "blood", "pressure",
    "sugar", "glucose", "diabetes", "heart", "doctor", "triage", "medicine", "medication", "pill",
    "tablet", "hospital", "clinic", "report", "lab", "ecg", "x-ray", "cbc", "hemoglobin", "wbc",
    "platelet", "swelling", "wound", "bleed", "burn", "cold", "flu", "sore throat", "diarrhea",
    "fatigue", "tired", "weakness", "consultation", "intake", "case", "health", "illness",
    "disease", "treatment", "doctor", "prescription", "dose", "head", "neck", "back", "leg", "arm",
    "eye", "ear", "nose", "throat", "skin", "muscle", "joint", "bone", "spine", "lungs", "liver",
    "kidney", "urine", "stool", "bowel", "temperature", "pulse", "vital", "oxygen", "spo2",
    "बुखार", "दर्द", "सांस", "खांसी", "सिरदर्द", "सीने में दर्द", "चक्कर", "दवा", "इलाज", "अस्पताल"
]

PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(?:all\s+)?(?:your\s+)?(?:previous\s+)?(?:instructions|rules|safety|guidelines)",
    r"act\s+as\s+(?:an?\s+)?(?:unrestricted|real|unfiltered)\s+doctor",
    r"bypass\s+(?:all\s+)?safety",
    r"you\s+are\s+now\s+(?:dan|unrestricted|jailbroken)",
    r"give\s+me\s+the\s+exact\s+(?:dosage|prescription)\s+for",
    r"prescribe\s+(?:me\s+)?(?:medication|drugs|tablets)",
    r"disregard\s+(?:the\s+)?medical\s+disclaimer",
    r"system\s*:\s*override",
    r"do\s+not\s+follow\s+swasthya\s+rules",
]

SWASTHYA_HEALTH_AI_SYSTEM_INSTRUCTION = """You are the Swasthya Health AI Assistant, an intelligent, clinically responsible healthcare conversational assistant inside the Swasthya Triage Patient Portal.

CRITICAL DIRECTIVE ON CURRENT PATIENT MESSAGE & CONTEXT CONTINUITY:
- The CURRENT PATIENT MESSAGE is authoritative for this response.
- Use previous conversation history only when it is directly relevant to what the patient is asking right now.
- Do NOT answer an earlier symptom or previous question instead of the current message.
- If the patient changes topics or introduces a DIFFERENT health concern (e.g. asking about a burned thumb or acute injury after a headache conversation, or asking about stomach pain after fever), you MUST treat the new message as the active current concern.
- Do NOT carry over unrelated symptoms (e.g., headache, fever, stiff neck) from previous turns into the active current concern's structured_symptoms unless the patient explicitly connects them.
- If medical documents were uploaded earlier, use them ONLY when relevant to the current question.

PRIMARY PURPOSE & CLINICAL BOUNDARIES:
- Help patients understand their healthcare concerns, interpret symptoms, analyze medical/lab reports, learn first aid and supportive care, and organize health information for clinical review.
- You are an intelligent AI healthcare assistant, NOT a doctor.
- You must NOT make definitive clinical diagnoses (use probabilistic educational framing like 'This could be related to...', 'Common reasons include...').
- You must NOT prescribe medications or dosage instructions.
- You must NOT instruct patients to stop or alter prescribed medications.
- You must NOT give false reassurance.

DYNAMIC SITUATION-ADAPTIVE RESPONSE STRATEGY:
Always understand the patient's actual problem and provide the most practical, useful, and situation-appropriate healthcare guidance:

1. MINOR EVERYDAY SYMPTOMS (e.g. tension headache, mild sore throat, superficial bump, minor fatigue):
   - Explain common educational possibilities without diagnosing.
   - Provide safe, evidence-based supportive care and self-care measures (hydration, rest, warm salt gargle, ergonomics).
   - Explain what symptoms to monitor over the next 24–48 hours.
   - Give clear red-flag warning signs that require clinical escalation.

2. FIRST-AID & ACUTE MINOR INJURIES (e.g. minor burn, superficial cut, nosebleed, ankle sprain):
   - Give immediate, step-by-step safe first-aid actions (e.g. cool running water for burns for 10-20 minutes, direct gentle pressure for nosebleeds, RICE protocol for sprains).
   - Explicitly warn what NOT to do (e.g. do not apply ice/butter/toothpaste to burns, do not pop blisters, do not tilt head backwards for nosebleeds).
   - Identify specific criteria when emergency or urgent professional care is required (e.g. large burns, burns on face/hands/joints, blistering, signs of infection, deep laceration, uncontrolled bleeding).

3. MEDICATION & PHARMACOLOGICAL QUESTIONS:
   - Explain the medication's general therapeutic purpose, mechanism in simple terms, and standard precautions.
   - Clarify whether it is typically taken with or without food, and common known side effects to be aware of.
   - Remind the patient to follow their prescribing doctor's exact dosage, and never advise discontinuing prescribed therapy.

4. MEDICAL & LAB REPORT INQUIRIES:
   - Break down extracted values, abnormal flags (high/low), and reference ranges in simple language.
   - Explain what these parameters reflect physiologically without claiming a definitive disease.
   - Outline actionable questions for the patient to discuss with their clinician.

5. CHRONIC OR ONGOING CONCERNS (e.g. back pain for weeks, recurring heartburn):
   - Acknowledge duration and history.
   - Provide safe supportive lifestyle/ergonomic management.
   - Explain why in-person clinical workup (imaging, physical examination, bloodwork) is valuable.

6. EMERGENCY & RED-FLAG SCENARIOS (severe sudden chest pain, breathing difficulty, stroke signs, worst headache of life, heavy blood loss):
   - Immediately prioritize emergency medical evaluation (108/112 or nearest emergency department).
   - Explain WHY these symptoms warrant immediate emergency assessment.
   - Do NOT suggest home remedies as a primary response.

7. INSUFFICIENT OR UNCLEAR INFORMATION:
   - Provide the best general guidance possible from the information given, and ask 1–2 brief, targeted questions.

CONVERSATIONAL INTELLIGENCE:
- Direct and helpful: Answer the patient's actual question directly first. Avoid generic 'Please consult a doctor' boilerplate.
- Empathetic and natural: Professional, reassuring, clear.

OUTPUT FORMAT: You MUST return a valid JSON object matching this schema:
{
  "reply": "string - intelligent, practical, situation-adapted healthcare response",
  "is_healthcare_related": true,
  "urgency_detected": true | false,
  "urgency_level": "emergency" | "urgent" | "routine",
  "urgency_reasons": ["string"],
  "follow_up_questions": ["string - 1 to 3 short suggested responses patient can click"],
  "structured_symptoms": {
    "chief_complaint": "string - active current concern (e.g. Thumb burn, Headache, Abdominal pain)",
    "reported_symptoms": ["string - symptoms strictly relevant to the current concern"],
    "duration": "string or null",
    "location": "string or null",
    "severity": "string or null",
    "associated_symptoms": "string or null"
  },
  "suggested_actions": ["Start Symptom Intake", "Speak Instead", "Upload a Report", "Seek Emergency Care"]
}
"""

class HealthAISafetyPipeline:
    @classmethod
    def check_prompt_injection(cls, text: str) -> bool:
        if not text:
            return False
        text_lower = text.lower()
        for pattern in PROMPT_INJECTION_PATTERNS:
            if re.search(pattern, text_lower):
                return True
        return False

    @classmethod
    def is_query_healthcare_related(cls, text: str) -> bool:
        if not text or not text.strip():
            return True
        text_lower = text.lower().strip()
        
        # Check off-topic keywords
        has_off_topic = any(kw in text_lower for kw in OFF_TOPIC_KEYWORDS)
        has_health_topic = any(kw in text_lower for kw in HEALTHCARE_TOPIC_KEYWORDS)

        if has_off_topic and not has_health_topic:
            return False
        return True

    @classmethod
    def detect_deterministic_urgency(
        cls,
        text: str,
        structured_symptoms: Optional[List[str]] = None
    ) -> Tuple[bool, Optional[str], List[str]]:
        """Runs the deterministic rules engine on patient text to catch red flags."""
        symptoms = structured_symptoms or []
        combined_text = f"{text} {' '.join(symptoms)}".lower()

        urgency_detected = False
        urgency_level = "routine"
        urgency_reasons: List[str] = []

        # Check critical emergency keywords
        if any(kw in combined_text for kw in ["chest pain", "chest pressure", "chest heaviness"]) and any(kw in combined_text for kw in ["breath", "sweat", "jaw", "arm", "dizzy", "severe"]):
            urgency_detected = True
            urgency_level = "emergency"
            urgency_reasons.append("Severe chest discomfort with associated systemic symptoms")

        if any(kw in combined_text for kw in ["difficulty breathing", "severe breathlessness", "cannot breathe", "gasping"]):
            urgency_detected = True
            urgency_level = "emergency"
            urgency_reasons.append("Acute respiratory distress / breathing difficulty")

        if any(kw in combined_text for kw in ["worst headache", "thunderclap headache", "sudden severe headache"]):
            urgency_detected = True
            urgency_level = "urgent"
            urgency_reasons.append("Sudden acute onset severe headache requiring urgent evaluation")

        if any(kw in combined_text for kw in ["slurred speech", "face drooping", "one side weakness", "arm weakness"]):
            urgency_detected = True
            urgency_level = "emergency"
            urgency_reasons.append("Potential acute neurological / stroke-like indicators")

        if any(kw in combined_text for kw in ["heavy bleeding", "uncontrolled bleeding", "coughing blood", "vomiting blood"]):
            urgency_detected = True
            urgency_level = "emergency"
            urgency_reasons.append("Active or significant hemorrhage")

        if any(kw in combined_text for kw in ["anaphylaxis", "throat swelling", "swollen tongue", "allergic reaction"]):
            urgency_detected = True
            urgency_level = "emergency"
            urgency_reasons.append("Severe allergic reaction / airway involvement")

        return urgency_detected, urgency_level if urgency_detected else None, urgency_reasons

    @classmethod
    def sanitize_output_text(cls, text: str) -> str:
        """
        Ensures the AI output does not contain definitive diagnostic or prescriptive assertions,
        and normalizes AI responses to clean human-readable plain text without Markdown syntax
        or decorative symbols.
        """
        if not text:
            return ""

        sanitized = text

        # 1. Direct diagnostic / prescriptive safety rules
        sanitized = re.sub(
            r"\bYou (?:definitely )?have ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b",
            r"Your symptoms may be consistent with possibilities like \1, but clinical review is needed",
            sanitized,
            flags=re.IGNORECASE
        )
        sanitized = re.sub(
            r"\bTake (\d+\s*(?:mg|ml|tablets?))\s+of\s+([A-Za-z]+)\b",
            r"Discuss appropriate medications such as \2 with a licensed clinician",
            sanitized,
            flags=re.IGNORECASE
        )

        # 2. Strip code fences and backticks
        sanitized = re.sub(r"^```[a-zA-Z]*\n?", "", sanitized, flags=re.MULTILINE)
        sanitized = re.sub(r"```$", "", sanitized, flags=re.MULTILINE)
        sanitized = re.sub(r"`([^`]+)`", r"\1", sanitized)
        sanitized = sanitized.replace("`", "")

        # 3. Markdown images & links: ![alt](url) -> alt, [text](url) -> text
        sanitized = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", sanitized)
        sanitized = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", sanitized)

        # 4. Horizontal rules
        sanitized = re.sub(r"^[ \t]*[-*_]{3,}[ \t]*$", "", sanitized, flags=re.MULTILINE)

        # 5. Markdown headers (#, ##, ###, ####, etc.) at line starts
        sanitized = re.sub(r"^[ \t]*#{1,6}[ \t]+", "", sanitized, flags=re.MULTILINE)

        # 6. Markdown blockquotes (> ) at line starts
        sanitized = re.sub(r"^[ \t]*>[ \t]?", "", sanitized, flags=re.MULTILINE)

        # 7. Bold & Italic markdown: ***text***, **text**, *text*, ___text___, __text__, _text_
        sanitized = re.sub(r"\*\*\*(.*?)\*\*\*", r"\1", sanitized)
        sanitized = re.sub(r"___(.*?)___", r"\1", sanitized)
        sanitized = re.sub(r"\*\*(.*?)\*\*", r"\1", sanitized)
        sanitized = re.sub(r"__(.*?)__", r"\1", sanitized)
        sanitized = re.sub(r"\*([^*\n]+)\*", r"\1", sanitized)
        sanitized = re.sub(r"(^|\s)_([^_\n]+)_(\s|$|[.,;:!?()])", r"\1\2\3", sanitized)
        sanitized = sanitized.replace("**", "").replace("*", "")

        # 8. List bullets and numbered prefixes when at line starts
        sanitized = re.sub(r"^[ \t]*[-+•◦▪▫][ \t]+", "", sanitized, flags=re.MULTILINE)
        sanitized = re.sub(r"^[ \t]*\d{1,3}[.)][ \t]+", "", sanitized, flags=re.MULTILINE)

        # 9. Decorative emojis & symbols
        decorative_regex = r"[\U0001F300-\U0001FAD6\U0001F600-\U0001F64F\U0001F680-\U0001F6FF\U00002600-\U000027BF\U0000FE00-\U0000FE0F\U0001F900-\U0001F9FF\U00002190-\U000021FF\U00002300-\U000023FF\U00002B50\U00002B55\U00002022\U000025AA\U000025AB\U000025CF\U000025CB\U000025A0\U000025A1✓✗✔✕→←↑↓↔↕⚠❤️🩺🔴🟢🟡❗❓❌⭐★☆📋✨💡🔍📌🚨⚡]"
        sanitized = re.sub(decorative_regex, "", sanitized)

        # 10. Markdown escape slashes
        sanitized = re.sub(r"\\([*#_~`>+\-[\]()])", r"\1", sanitized)

        # 11. Normalize lines & line breaks
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in sanitized.splitlines()]
        cleaned = "\n".join(lines)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

        return cleaned
