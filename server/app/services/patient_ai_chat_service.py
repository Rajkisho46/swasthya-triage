import json
import os
import re
from typing import Dict, Any, List, Optional, Tuple
import httpx

from ..config import settings
from ..schemas.chat import PatientChatRequest, PatientChatResponse, ChatMessage, ChatDocumentAttachment
from ..services.rules_engine import DeterministicSafetyRulesEngine
from ..services.health_ai_safety import HealthAISafetyPipeline
from ..utils.validation import check_ai_safety_compliance

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
    "homework", "essay on", "solve math", "calculus", "algebra", "joke", "tell me a joke",
    "crypto", "bitcoin", "stock market", "invest in", "travel guide", "flight ticket"
]

HEALTHCARE_TOPIC_KEYWORDS = [
    "symptom", "pain", "fever", "cough", "breath", "dizzy", "dizziness", "chest", "headache",
    "stomach", "abdomen", "nausea", "vomit", "rash", "allergy", "infection", "blood", "pressure",
    "sugar", "glucose", "diabetes", "heart", "doctor", "triage", "medicine", "medication", "pill",
    "tablet", "hospital", "clinic", "report", "lab", "ecg", "x-ray", "cbc", "hemoglobin", "wbc",
    "platelet", "swelling", "wound", "bleed", "burn", "cold", "flu", "sore throat", "diarrhea",
    "fatigue", "tired", "weakness", "consultation", "intake", "case", "health", "illness",
    "बुखार", "दर्द", "सांस", "खांसी", "सिरदर्द", "सीने में दर्द", "चक्कर", "दवा", "इलाज", "अस्पताल"
]

PATIENT_AI_SYSTEM_INSTRUCTION = """You are the Swasthya Triage Health Assistant.
You are a healthcare-focused conversational AI assistant inside the Swasthya Triage Patient Portal.
Your primary goal is to understand the patient's concern and provide useful, safe healthcare guidance.

You should communicate naturally rather than behaving like a form or medical questionnaire.
- Ask only the most relevant follow-up questions based on what the patient has already said.
- Normally ask no more than one or two questions at a time.
- Never repeatedly ask for information that the patient has already provided.
- Use conversation context to determine the next most useful question.
- Prioritize potentially urgent symptoms when present.
- Explain healthcare information clearly and in patient-friendly language.
- Do NOT produce huge bullet lists or robotic question checklists. Keep responses concise, natural, and easy to read.

CRITICAL SAFETY DIRECTIVES:
1. Do not diagnose with certainty (e.g. discuss possibilities educationally: "Headaches can have several causes, including tension, migraine, dehydration, or lack of sleep. The pattern can help clarify, but an online chat cannot establish a diagnosis.").
2. Do not prescribe or modify medications or recommend dosages.
3. Do not replace professional clinical evaluation.
4. When the patient asks something unrelated to healthcare (e.g. coding, entertainment, homework, politics, gaming, jokes), politely redirect them with:
"I’m the Swasthya Triage Health Assistant, so I can only help with healthcare-related questions, symptoms, medical information, documents, and the triage process."
5. When potentially serious symptoms are described (e.g. severe chest pain with breathlessness, thunderclap/worst headache of life, sudden one-sided weakness, massive bleeding, anaphylaxis):
- Set urgency_detected = true and urgency_level = "emergency" or "urgent".
- Provide an appropriate urgency recommendation immediately rather than continuing casual conversation.

OUTPUT FORMAT (JSON ONLY):
{
  "reply": "string - your natural conversational response",
  "is_healthcare_related": true | false,
  "urgency_detected": true | false,
  "urgency_level": "emergency" | "urgent" | "routine",
  "urgency_reasons": ["string"],
  "follow_up_questions": ["string"],
  "structured_symptoms": {
    "chief_complaint": "string",
    "reported_symptoms": ["string"],
    "duration": "string",
    "severity": "string"
  },
  "suggested_actions": ["Start Symptom Intake", "Speak Instead", "Upload a Report", "Seek Emergency Care"]
}
"""

class PatientAIChatService:
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
    def generate_intelligent_fallback_response(
        cls,
        messages: List[ChatMessage],
        preferred_language: str = "English",
        attachments: Optional[List[ChatDocumentAttachment]] = None
    ) -> PatientChatResponse:
        """
        Natural, context-aware, adaptive clinical conversational fallback.
        Asks only 1-2 relevant questions at a time, remembers previous answers,
        and avoids robotic question checklists.
        """
        last_msg = messages[-1].content if messages else ""
        last_msg_lower = last_msg.lower().strip()
        is_hindi = "hindi" in (preferred_language or "").lower() or bool(re.search(r"[\u0900-\u097F]", last_msg))

        # 1. Check off-topic domain
        if not cls.is_query_healthcare_related(last_msg):
            return PatientChatResponse(
                reply=NON_HEALTHCARE_STANDARD_REPLY if not is_hindi else "मैं स्वास्थ्य ट्राइएज हेल्थ असिस्टेंट हूँ, इसलिए मैं केवल स्वास्थ्य संबंधी प्रश्नों, लक्षणों, चिकित्सा जानकारी, दस्तावेजों और ट्राइएज प्रक्रिया में मदद कर सकता हूँ।",
                is_healthcare_related=False,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=[],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        # Full context aggregation across all user turns
        user_turns = [m.content.lower().strip() for m in messages if m.role == "user"]
        all_user_text = " ".join(user_turns)
        combined_text = all_user_text
        if attachments:
            for att in attachments:
                if att.extracted_text:
                    combined_text += f" {att.extracted_text}"

        combined_lower = combined_text.lower()

        # Check for emergency/red-flag triggers
        is_thunderclap = ("worst headache" in combined_lower or "worst pain" in combined_lower or "sudden" in combined_lower and "headache" in combined_lower and "severe" in combined_lower)
        is_cardio_red_flag = ("crushing" in combined_lower or "severe chest" in combined_lower or ("chest" in combined_lower and ("breath" in combined_lower or "sweat" in combined_lower or "radiat" in combined_lower)))
        
        safety_signals = DeterministicSafetyRulesEngine.evaluate(combined_text)
        is_urgent = len(safety_signals) > 0 or is_thunderclap or is_cardio_red_flag
        urgency_level = "emergency" if (is_thunderclap or is_cardio_red_flag or any(s.level == "immediate_attention" for s in safety_signals)) else ("urgent" if is_urgent else "routine")
        urgency_reasons = [s.reason for s in safety_signals]
        if is_thunderclap and "Thunderclap or worst-ever headache" not in urgency_reasons:
            urgency_reasons.append("Sudden severe headache (possible intracranial red flag)")
        if is_cardio_red_flag and "Acute chest discomfort with breathlessness" not in urgency_reasons:
            urgency_reasons.append("Acute chest discomfort with breathlessness/sweating")

        # If urgent, prioritize safety guidance immediately
        if is_urgent and (is_thunderclap or is_cardio_red_flag or any(w in last_msg_lower for w in ["severe", "crushing", "worst", "can't catch", "sweating", "fainting"])):
            if is_thunderclap:
                reply = (
                    "क्योंकि आप अचानक शुरू हुए बहुत तेज सिरदर्द ('worst headache') का वर्णन कर रहे हैं, यह स्थिति तुरंत आपातकालीन चिकित्सा मूल्यांकन की मांग कर सकती है। कृपया तुरंत नजदीकी अस्पताल या आपातकालीन सेवा (108 / 112) से संपर्क करें।"
                    if is_hindi else
                    "Because you are describing a sudden, severe headache that feels like the worst you've ever had, this is a red-flag symptom that may require urgent medical evaluation. If this is happening now, please seek emergency medical care immediately."
                )
            else:
                reply = (
                    "क्योंकि आपके लक्षणों में सीने में तेज दर्द या सांस लेने में गंभीर तकलीफ शामिल है, यह स्थिति तुरंत आपातकालीन चिकित्सा सहायता की मांग करती है। यदि यह लक्षण अभी हो रहे हैं या बढ़ रहे हैं, तो कृपया तुरंत आपातकालीन सेवा (108 / 112) लें।"
                    if is_hindi else
                    "Because you're describing severe chest discomfort together with difficulty breathing, this may require urgent medical attention. If these symptoms are happening now or worsening, please seek emergency medical care immediately."
                )

            return PatientChatResponse(
                reply=reply,
                is_healthcare_related=True,
                urgency_detected=True,
                urgency_level=urgency_level,
                urgency_reasons=urgency_reasons,
                follow_up_questions=[],
                structured_symptoms={"chief_complaint": "Acute Emergency Symptoms", "reported_symptoms": ["Acute severe discomfort"]},
                suggested_actions=["Seek Emergency Care", "Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        # 2. Check for document attachments
        if attachments and len(attachments) > 0:
            att = attachments[-1]
            abnormal_items = []
            if att.structured_values:
                for v in att.structured_values:
                    if v.is_abnormal:
                        abnormal_items.append(f"{v.test_name} ({v.value} {v.unit or ''})")

            if is_hindi:
                if abnormal_items:
                    reply = f"मैंने आपका दस्तावेज़ ({att.file_name}) देखा है। इसमें {abnormal_items[0]} संदर्भ सीमा (Reference Range) से बाहर दिख रहा है। क्या आप चाहते हैं कि मैं पहले इस परिणाम का अर्थ समझाऊं?"
                else:
                    reply = f"मैंने आपका दस्तावेज़ ({att.file_name}) विश्लेषित किया है। क्या आप किसी विशिष्ट परिणाम के बारे में विस्तार से चर्चा करना चाहते हैं?"
            else:
                if abnormal_items:
                    reply = f"I found a few results worth discussing in {att.file_name}. Your {abnormal_items[0]} is outside the standard reference range shown on the report. Would you like me to explain what that result means first?"
                else:
                    reply = f"I have reviewed the information in {att.file_name}. What specific questions do you have about this report, or would you like to prepare it for clinical triage intake?"

            return PatientChatResponse(
                reply=reply,
                is_healthcare_related=True,
                urgency_detected=is_urgent,
                urgency_level=urgency_level,
                urgency_reasons=urgency_reasons,
                follow_up_questions=["Explain what this lab value means", "How does this relate to my symptoms?"],
                suggested_actions=["Start Symptom Intake", "Upload Another Report"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        # 3. Conversational symptom evaluation with adaptive, natural multi-turn tracking
        # Prioritize primary symptom from the latest turn, falling back to history
        has_burn = any(w in last_msg_lower for w in ["burn", "burned", "hot pan", "scald", "blister", "hot oil", "hot water"])
        has_stomach = any(w in last_msg_lower for w in ["stomach", "abdomen", "abdominal", "belly", "पेट"]) or (any(w in combined_lower for w in ["stomach", "abdomen", "abdominal", "belly", "पेट"]) and not has_burn)
        has_chest = any(w in last_msg_lower for w in ["chest", "सीने में"]) or ("chest" in combined_lower and not has_burn)
        has_fever = any(w in last_msg_lower for w in ["fever", "बुखार", "temp", "temperature"]) or ("fever" in combined_lower and not has_burn)
        has_headache = any(w in last_msg_lower for w in ["headache", "सिरदर्द"]) or ("head" in last_msg_lower and "pain" in last_msg_lower) or ("headache" in combined_lower and not has_burn and not has_stomach and not has_fever)
        has_cough = any(w in last_msg_lower for w in ["cough", "खांसी"]) or ("cough" in combined_lower and not has_burn)
        has_rash = any(w in last_msg_lower for w in ["rash", "itching", "चकत्ते"]) or ("rash" in combined_lower and not has_burn)
        has_dizzy = any(w in last_msg_lower for w in ["dizzy", "dizziness", "weak", "चक्कर", "कमजोरी"]) or ("dizzy" in combined_lower and not has_burn)

        # Contextual question evaluation
        reply = ""
        follow_ups: List[str] = []
        structured_symptoms: Dict[str, Any] = {"chief_complaint": "", "reported_symptoms": []}

        # BURN INJURY FLOW
        if has_burn:
            structured_symptoms["chief_complaint"] = "Thumb burn" if "thumb" in last_msg_lower else "Burn injury"
            structured_symptoms["reported_symptoms"] = ["Burn", "Pain"]
            structured_symptoms["location"] = "Thumb" if "thumb" in last_msg_lower else "Hand / Skin"
            structured_symptoms["duration"] = "Just now"
            if is_hindi:
                reply = (
                    "जलने पर तुरंत जले हुए हिस्से को 10 से 20 मिनट तक ठंडे बहते नल के पानी के नीचे रखें ताकि गर्मी और त्वचा की क्षति कम हो सके। "
                    "बर्फ, मक्खन, या टूथपेस्ट बिल्कुल न लगाएं। यदि छाले (blisters) बन रहे हैं या दर्द बहुत अधिक है, तो साफ पट्टी से ढंकें और डॉक्टर को दिखाएं। "
                    "क्या त्वचा पर छाले बने हैं या सिर्फ लालिमा और जलन है?"
                )
            else:
                reply = (
                    "For an acute burn, immediately hold the burned area under cool running tap water for 10 to 20 minutes to reduce tissue heat and swelling. "
                    "Do NOT apply ice, butter, or toothpaste, and do not pop any blisters. Cover the area loosely with a clean, sterile, non-stick cloth or bandage. "
                    "Is there blistering, open skin, or mainly redness and burning pain?"
                )
            follow_ups = ["Mainly redness and stinging pain", "Small blister starting to form", "Happened just a minute ago"]

        # HEADACHE FLOW
        elif has_headache:
            structured_symptoms["chief_complaint"] = "Headache"
            structured_symptoms["reported_symptoms"].append("Headache")

            has_location = any(w in combined_lower for w in ["right side", "left side", "frontal", "behind my eyes", "forehead", "back of head", "one side", "एक तरफ", "माथे"])
            has_onset_type = any(w in combined_lower for w in ["gradual", "slowly", "sudden", "अचानक", "धीरे-धीरे"])
            has_nausea = "nausea" in combined_lower or "nauseous" in combined_lower or "vomit" in combined_lower or "उल्टी" in combined_lower or "मतली" in combined_lower
            has_severity = bool(re.search(r"\b(\d{1,2}(?:/10)?|mild|moderate|severe)\b", combined_lower))

            if "what could cause" in last_msg_lower or "causes" in last_msg_lower or "कारण" in last_msg_lower:
                if is_hindi:
                    reply = "सिरदर्द के कई सामान्य कारण हो सकते हैं, जैसे तनाव (Tension), माइग्रेन, निर्जलीकरण (Dehydration), या नींद की कमी। दर्द का स्वरूप और स्थान इसे समझने में मदद करता है। क्या दर्द एक तरफ धड़कन (throbbing) जैसा महसूस होता है?"
                else:
                    reply = "Headaches can have several causes, including tension, migraine, dehydration, lack of sleep, or sinus pressure. The pattern of pain and symptoms that occur with it help distinguish between them, though a chat alone cannot establish a diagnosis. Where exactly does the headache hurt most?"
                follow_ups = ["It feels like a throbbing pain on one side", "It feels like a tight band around my head"]

            elif "nausea" in last_msg_lower or "nauseous" in last_msg_lower or "vomit" in last_msg_lower or "मतली" in last_msg_lower:
                # Turn with nausea / Photophobia connection
                if is_hindi:
                    reply = "समझा। मतली (Nausea) अक्सर माइग्रेन जैसे सिरदर्द के साथ हो सकती है। क्या आपको तेज रोशनी या आवाज से भी परेशानी हो रही है?"
                else:
                    reply = "Got it. Nausea can often accompany certain types of headaches, like migraines. Are you also noticing any sensitivity to bright light or loud sounds?"
                follow_ups = ["Yes, light bothers my eyes", "No sensitivity to light"]

            elif not has_location and not has_onset_type:
                # Turn 1: Onset & Location
                if is_hindi:
                    reply = "मैं इसे बेहतर समझने में मदद कर सकता हूँ। सिर में दर्द ठीक किस जगह हो रहा है, और क्या यह अचानक शुरू हुआ या धीरे-धीरे बढ़ा?"
                else:
                    reply = "I can help you narrow this down. Where exactly does the headache hurt, and did it start suddenly or build up gradually?"
                follow_ups = ["It is mostly on the right side and started gradually", "It hurts behind my eyes"]

            elif has_location and not has_severity and not has_nausea:
                # Turn 2: Severity & Prior history
                if is_hindi:
                    reply = "धन्यवाद। 0 से 10 के पैमाने पर दर्द अभी कितना तेज है? और क्या यह सिरदर्द पहले हुए सिरदर्द जैसा है या असामान्य लग रहा है?"
                else:
                    reply = "Thanks. How severe is it right now on a scale of 0–10? And is this similar to headaches you've had before, or does it feel unusually different?"
                follow_ups = ["Around 6/10, feels like previous headaches", "It feels much more intense than usual"]

            elif has_nausea:
                if is_hindi:
                    reply = "समझा। मतली (Nausea) अक्सर माइग्रेन जैसे सिरदर्द के साथ हो सकती है। क्या आपको तेज रोशनी या आवाज से भी परेशानी हो रही है?"
                else:
                    reply = "Got it. Nausea can often accompany certain types of headaches, like migraines. Are you also noticing any sensitivity to bright light or loud sounds?"
                follow_ups = ["Yes, light bothers my eyes", "No sensitivity to light"]

            else:
                if is_hindi:
                    reply = "यह जानकारी मददगार है। क्या इस सिरदर्द के साथ गर्दन में अकड़न या दृष्टि में कोई धुंधलापन महसूस हो रहा है?"
                else:
                    reply = "That helps clarify things. Are you noticing any neck stiffness, fever, or vision changes alongside the headache?"
                follow_ups = ["No neck stiffness or vision issues", "I also have a slight fever"]

        # FEVER FLOW
        elif has_fever:
            structured_symptoms["chief_complaint"] = "Fever"
            structured_symptoms["reported_symptoms"].append("Fever")

            has_duration = any(w in combined_lower for w in ["day", "days", "yesterday", "since", "दिन", "कल"])
            has_temp_value = any(w in combined_lower for w in ["100", "101", "102", "103", "104", "degree", "°", "बुखार है"])

            if not has_duration and not has_temp_value:
                # Turn 1: Duration & temp
                if is_hindi:
                    reply = "बुखार कितने दिनों से है, और क्या आपने थर्मामीटर से अपना तापमान नापा है?"
                else:
                    reply = "How long have you had the fever, and do you know what your temperature has been?"
                follow_ups = ["About 2 days, around 101-102°F", "Started since yesterday"]

            elif has_cough or "cough" in last_msg_lower:
                # Turn with cough
                if is_hindi:
                    reply = "क्या खांसी सूखी है, या बलगम (mucus) आ रहा है?"
                else:
                    reply = "Thanks. Is the cough dry, or are you bringing up mucus or phlegm?"
                follow_ups = ["It is a dry cough", "Bringing up yellowish mucus"]

            else:
                if is_hindi:
                    reply = "धन्यवाद। क्या आपको खांसी, सांस लेने में तकलीफ, उल्टी, या शरीर में बहुत तेज ठंड लग रही है?"
                else:
                    reply = "Thanks. Are you also experiencing a cough, difficulty breathing, or any severe body chills?"
                follow_ups = ["I have a mild cough", "Just feeling cold and shivering"]

        # CHEST DISCOMFORT FLOW
        elif has_chest:
            structured_symptoms["chief_complaint"] = "Chest Discomfort"
            structured_symptoms["reported_symptoms"].append("Chest discomfort")
            if is_hindi:
                reply = "क्या यह बेचैनी या दर्द अभी इस समय हो रहा है? और क्या यह भारीपन, दबाव, या चुभने जैसा महसूस हो रहा है?"
            else:
                reply = "Is this discomfort happening right now? And does it feel like tightness, pressure, or a sharp pain?"
            follow_ups = ["It feels like pressure on my chest", "It is happening right now"]

        # STOMACH PAIN FLOW
        elif has_stomach:
            structured_symptoms["chief_complaint"] = "Abdominal Pain"
            structured_symptoms["reported_symptoms"].append("Stomach pain")
            if is_hindi:
                reply = "पेट में दर्द किस हिस्से में हो रहा है (ऊपर, नाभि के पास, या नीचे)? और क्या इसके साथ उल्टी, दस्त, या गैस की समस्या है?"
            else:
                reply = "Where in your stomach do you feel the pain, and is it accompanied by any nausea, vomiting, or diarrhea?"
            follow_ups = ["Upper stomach, feeling nauseous", "Lower right side pain"]

        # RASH FLOW
        elif has_rash:
            structured_symptoms["chief_complaint"] = "Skin Rash"
            structured_symptoms["reported_symptoms"].append("Rash")
            if is_hindi:
                reply = "यह चकत्ता (rash) शरीर के किस हिस्से में है, और क्या इसमें खुजली, दर्द, या सूजन हो रही है?"
            else:
                reply = "Where is the rash located on your body, and is it itchy, painful, or spreading?"
            follow_ups = ["On my arms and chest, very itchy", "On my face, slightly painful"]

        # DIZZINESS / WEAKNESS FLOW
        elif has_dizzy:
            structured_symptoms["chief_complaint"] = "Dizziness / Weakness"
            structured_symptoms["reported_symptoms"].append("Dizziness")
            if is_hindi:
                reply = "क्या चक्कर लगातार आ रहे हैं, या मुख्य रूप से खड़े होने और चलने पर महसूस होते हैं?"
            else:
                reply = "Has the dizziness been constant, or does it mainly happen when you stand up or move around?"
            follow_ups = ["Mainly when standing up quickly", "It feels constant all day"]

        # GENERAL FALLBACK
        else:
            if is_hindi:
                reply = f"मैंने आपका विवरण समझ लिया है। इसे और स्पष्ट करने के लिए: यह समस्या कब शुरू हुई, और क्या यह समय के साथ बढ़ रही है?"
            else:
                reply = f"I understand what you're experiencing. When did this first start, and is it getting better or worse?"
            follow_ups = ["Started yesterday and getting worse", "Started a few hours ago"]

        suggested_actions = ["Start Symptom Intake", "Speak Instead", "Upload a Report"]
        if is_urgent:
            suggested_actions.insert(0, "Seek Emergency Care")

        return PatientChatResponse(
            reply=reply,
            is_healthcare_related=True,
            urgency_detected=is_urgent,
            urgency_level=urgency_level,
            urgency_reasons=urgency_reasons,
            follow_up_questions=follow_ups,
            structured_symptoms=structured_symptoms,
            suggested_actions=suggested_actions,
            fallback_used=True,
            model_name="deterministic-clinical-engine"
        )

    @classmethod
    async def chat(cls, request: PatientChatRequest) -> PatientChatResponse:
        """
        Main Conversational AI Entrypoint.
        Executes Gemini with updated conversational prompt, falls back to adaptive clinical reasoning engine.
        """
        if not request.messages:
            return cls.generate_intelligent_fallback_response(
                messages=[],
                preferred_language=request.preferred_language or "English",
                attachments=request.attachments
            )

        last_msg = request.messages[-1].content
        if not cls.is_query_healthcare_related(last_msg):
            is_hindi = "hindi" in (request.preferred_language or "").lower()
            return PatientChatResponse(
                reply=NON_HEALTHCARE_STANDARD_REPLY if not is_hindi else "मैं स्वास्थ्य ट्राइएज हेल्थ असिस्टेंट हूँ, इसलिए मैं केवल स्वास्थ्य संबंधी प्रश्नों, लक्षणों, चिकित्सा जानकारी, दस्तावेजों और ट्राइएज प्रक्रिया में मदद कर सकता हूँ।",
                is_healthcare_related=False,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=[],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=False,
                model_name="domain-filter"
            )

        api_key = settings.GEMINI_API_KEY
        if not api_key or len(api_key.strip()) < 5:
            return cls.generate_intelligent_fallback_response(
                messages=request.messages,
                preferred_language=request.preferred_language or "English",
                attachments=request.attachments
            )

        # Build conversation history
        formatted_history = []
        for msg in request.messages:
            formatted_history.append(f"{msg.role.upper()}: {msg.content}")

        history_str = "\n".join(formatted_history)

        attachments_str = ""
        if request.attachments:
            attachments_str = "\nATTACHED DOCUMENTS/REPORTS:\n"
            for att in request.attachments:
                attachments_str += f"- File: {att.file_name} ({att.file_type})\n  Extracted Text: {att.extracted_text or 'None'}\n"
                if att.structured_values:
                    vals = [f"{v.test_name}: {v.value} {v.unit or ''} (Ref: {v.reference_range or 'N/A'})" for v in att.structured_values]
                    attachments_str += f"  Lab Values: {', '.join(vals)}\n"

        prompt_body = f"""PATIENT PREFERRED LANGUAGE: {request.preferred_language or 'English'}
PATIENT ID: {request.patient_id or 'Anonymous'}
{attachments_str}

CONVERSATION HISTORY (Most recent message is at the end):
{history_str}

Remember:
- Ask at most 1 or 2 high-value questions.
- Never repeat questions for things the patient already answered.
- Speak naturally and conversationally without question checklists.
- Adhere strictly to the non-diagnostic and safety directives."""

        model_name = settings.AI_MODEL_NAME or "gemini-1.5-flash"
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{PATIENT_AI_SYSTEM_INSTRUCTION}\n\n{prompt_body}"}]
                }
            ],
            "generationConfig": {
                "temperature": 0.25,
                "responseMimeType": "application/json"
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(endpoint, json=payload)
                if response.status_code != 200:
                    return cls.generate_intelligent_fallback_response(
                        messages=request.messages,
                        preferred_language=request.preferred_language or "English",
                        attachments=request.attachments
                    )

                data = response.json()
                raw_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                if not raw_text:
                    return cls.generate_intelligent_fallback_response(
                        messages=request.messages,
                        preferred_language=request.preferred_language or "English",
                        attachments=request.attachments
                    )

                cleaned = raw_text.strip()
                if cleaned.startswith("```json"):
                    cleaned = re.sub(r"^```json\s*", "", cleaned)
                    cleaned = re.sub(r"\s*```$", "", cleaned)
                elif cleaned.startswith("```"):
                    cleaned = re.sub(r"^```\s*", "", cleaned)
                    cleaned = re.sub(r"\s*```$", "", cleaned)

                parsed = json.loads(cleaned)
                reply_text = parsed.get("reply", "")

                # Safety compliance check
                is_safe, violation = check_ai_safety_compliance(reply_text)
                if not is_safe:
                    return cls.generate_intelligent_fallback_response(
                        messages=request.messages,
                        preferred_language=request.preferred_language or "English",
                        attachments=request.attachments
                    )

                sanitized_reply = HealthAISafetyPipeline.sanitize_output_text(reply_text)

                return PatientChatResponse(
                    reply=sanitized_reply,
                    is_healthcare_related=parsed.get("is_healthcare_related", True),
                    urgency_detected=parsed.get("urgency_detected", False),
                    urgency_level=parsed.get("urgency_level", "routine"),
                    urgency_reasons=[HealthAISafetyPipeline.sanitize_output_text(r) for r in parsed.get("urgency_reasons", []) if r],
                    follow_up_questions=[HealthAISafetyPipeline.sanitize_output_text(q) for q in parsed.get("follow_up_questions", []) if q],
                    structured_symptoms=parsed.get("structured_symptoms", {}),
                    suggested_actions=parsed.get("suggested_actions", ["Start Symptom Intake", "Speak Instead"]),
                    fallback_used=False,
                    model_name=model_name
                )
        except Exception:
            return cls.generate_intelligent_fallback_response(
                messages=request.messages,
                preferred_language=request.preferred_language or "English",
                attachments=request.attachments
            )
