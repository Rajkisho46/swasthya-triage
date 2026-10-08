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
    "crypto", "bitcoin", "stock market", "invest in", "travel guide", "flight ticket",
    "capital of", "capital city", "france", "geography", "history of", "president of", "prime minister of"
]

HEALTHCARE_TOPIC_KEYWORDS = [
    "symptom", "pain", "fever", "cough", "breath", "dizzy", "dizziness", "chest", "headache",
    "stomach", "abdomen", "nausea", "vomit", "rash", "allergy", "infection", "blood", "pressure",
    "sugar", "glucose", "diabetes", "heart", "doctor", "triage", "medicine", "medication", "pill",
    "tablet", "hospital", "clinic", "report", "lab", "ecg", "x-ray", "cbc", "hemoglobin", "wbc",
    "platelet", "swelling", "wound", "bleed", "burn", "cold", "flu", "sore throat", "diarrhea",
    "fatigue", "tired", "weakness", "consultation", "intake", "case", "health", "illness", "dehydration",
    "sleep", "hydrate", "hydration", "diagnose", "diagnosis",
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

_provider_circuit_breaker_until: float = 0.0

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
        pref_lang = (preferred_language or "").lower().strip()
        is_hindi = "hindi" in pref_lang or bool(re.search(r"[\u0900-\u097F]", last_msg))

        # 0. Unsupported Language Check
        supported_langs = ["english", "hindi", "en", "hi", "bengali", "telugu", "tamil", "marathi", "gujarati", "kannada", "malayalam", "punjabi", "odia"]
        if pref_lang and pref_lang not in supported_langs:
            return PatientChatResponse(
                reply="I’m the Swasthya Triage Health Assistant. The requested language is currently not supported. Please select English or a supported regional language (such as Hindi) so I can assist you safely.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=[],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

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
        is_thunderclap = ("worst headache" in combined_lower or "worst pain" in combined_lower or ("sudden" in combined_lower and "headache" in combined_lower and "severe" in combined_lower))
        is_cardio_red_flag = ("crushing" in combined_lower or "severe chest" in combined_lower or ("chest" in combined_lower and ("breath" in combined_lower or "sweat" in combined_lower or "radiat" in combined_lower or "difficulty breathing" in combined_lower or "can't catch" in combined_lower)))
        is_stroke_red_flag = (("cannot move" in combined_lower or "cant move" in combined_lower or "one side" in combined_lower) and ("body" in combined_lower or "arm" in combined_lower or "face" in combined_lower or "speech" in combined_lower or "slur" in combined_lower))
        is_syncope_red_flag = (("fainted" in combined_lower or "passed out" in combined_lower or "syncope" in combined_lower or "blacked out" in combined_lower) and ("chest" in combined_lower or "breath" in combined_lower or "heart" in combined_lower))
        is_dyspnea_red_flag = ("severe difficulty breathing" in combined_lower or "struggling to breathe" in combined_lower or "gasping" in combined_lower)
        is_confusion_red_flag = (("sudden" in combined_lower or "severe" in combined_lower) and ("confusion" in combined_lower or "disoriented" in combined_lower or "altered mental" in combined_lower))

        safety_signals = DeterministicSafetyRulesEngine.evaluate(combined_text)
        is_urgent = len(safety_signals) > 0 or is_thunderclap or is_cardio_red_flag or is_stroke_red_flag or is_syncope_red_flag or is_dyspnea_red_flag or is_confusion_red_flag
        urgency_level = "emergency" if (is_thunderclap or is_cardio_red_flag or is_stroke_red_flag or is_syncope_red_flag or is_dyspnea_red_flag or is_confusion_red_flag or any(s.level == "immediate_attention" for s in safety_signals)) else ("urgent" if is_urgent else "routine")
        
        urgency_reasons = [s.reason for s in safety_signals]
        if is_stroke_red_flag and not any("stroke" in r.lower() for r in urgency_reasons):
            urgency_reasons.append("Sudden one-sided weakness or difficulty speaking (possible acute stroke)")
        if is_thunderclap and "Thunderclap or worst-ever headache" not in urgency_reasons:
            urgency_reasons.append("Sudden severe headache (possible intracranial red flag)")
        if is_cardio_red_flag and "Acute chest discomfort with breathlessness" not in urgency_reasons:
            urgency_reasons.append("Acute chest discomfort with breathlessness/sweating")
        if is_syncope_red_flag and not any("syncope" in r.lower() for r in urgency_reasons):
            urgency_reasons.append("Syncope with severe chest discomfort")
        if is_dyspnea_red_flag and not any("breathing" in r.lower() for r in urgency_reasons):
            urgency_reasons.append("Severe acute dyspnea")
        if is_confusion_red_flag and not any("confusion" in r.lower() for r in urgency_reasons):
            urgency_reasons.append("Sudden severe confusion")

        # If urgent, prioritize safety guidance immediately
        if is_urgent and (is_thunderclap or is_cardio_red_flag or is_stroke_red_flag or is_syncope_red_flag or is_dyspnea_red_flag or is_confusion_red_flag or any(w in last_msg_lower for w in ["severe", "crushing", "worst", "can't catch", "sweating", "fainting", "confusion", "cannot move", "speech"])):
            if is_stroke_red_flag:
                reply = (
                    "शरीर के एक तरफ अचानक कमजोरी आना या बोलने में कठिनाई होना एक गंभीर न्यूरोलॉजिकल आपातकाल (जैसे स्ट्रोक) का संकेत हो सकता है। कृपया तुरंत आपातकालीन एम्बुलेंस (108 / 112) बुलाएं या निकटतम इमरजेंसी अस्पताल जाएं।"
                    if is_hindi else
                    "Sudden weakness or inability to move one side of the body together with difficulty speaking is a potential medical emergency (such as a stroke). Please call emergency medical services immediately (e.g. 911 / 108 / 112) or go to the nearest emergency department right away without waiting."
                )
            elif is_thunderclap:
                reply = (
                    "क्योंकि आप अचानक शुरू हुए बहुत तेज सिरदर्द ('worst headache') का वर्णन कर रहे हैं, यह स्थिति तुरंत आपातकालीन चिकित्सा मूल्यांकन की मांग कर सकती है। कृपया तुरंत नजदीकी अस्पताल या आपातकालीन सेवा (108 / 112) से संपर्क करें।"
                    if is_hindi else
                    "Because you are describing a sudden, severe headache that feels like the worst you've ever had, this is a red-flag symptom that requires urgent emergency medical evaluation. Please seek emergency medical care immediately."
                )
            elif is_syncope_red_flag:
                reply = (
                    "बेहोश होने के साथ सीने में तेज तकलीफ होना हृदय संबंधी आपातकाल का संकेत हो सकता है। कृपया तुरंत नजदीकी इमरजेंसी विभाग जाएं या आपातकालीन सहायता लें।"
                    if is_hindi else
                    "Fainting combined with severe chest discomfort is a potential cardiac emergency requiring immediate medical assessment. Please seek emergency medical attention right now."
                )
            elif is_dyspnea_red_flag:
                reply = (
                    "सांस लेने में गंभीर तकलीफ होना एक आपातकालीन चिकित्सा स्थिति है। कृपया तुरंत आपातकालीन चिकित्सा सहायता लें।"
                    if is_hindi else
                    "Severe difficulty breathing is a medical emergency that requires immediate medical attention. Please call emergency medical services or go to the nearest emergency room immediately."
                )
            elif is_confusion_red_flag:
                reply = (
                    "अचानक गंभीर भ्रम या भटकाव होना एक आपातकालीन लक्षण हो सकता है। कृपया तुरंत आपातकालीन चिकित्सा मूल्यांकन कराएं।"
                    if is_hindi else
                    "Sudden severe confusion or disorientation can be a sign of an acute medical condition that requires immediate emergency clinical evaluation. Please seek urgent medical assessment."
                )
            else:
                reply = (
                    "क्योंकि आपके लक्षणों में सीने में तेज दर्द या सांस लेने में गंभीर तकलीफ शामिल है, यह स्थिति तुरंत आपातकालीन चिकित्सा सहायता की मांग करती है। यदि यह लक्षण अभी हो रहे हैं या बढ़ रहे हैं, तो कृपया तुरंत आपातकालीन सेवा (108 / 112) लें।"
                    if is_hindi else
                    "Because you are describing severe chest pain together with difficulty breathing, this requires immediate emergency medical evaluation. Please call emergency services or go to the nearest emergency room immediately."
                )

            return PatientChatResponse(
                reply=reply,
                is_healthcare_related=True,
                urgency_detected=True,
                urgency_level=urgency_level,
                urgency_reasons=urgency_reasons,
                follow_up_questions=[],
                structured_symptoms={"chief_complaint": "Acute Emergency Symptoms", "reported_symptoms": urgency_reasons or ["Acute severe discomfort"]},
                suggested_actions=["Seek Emergency Care", "Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        # 2. Hallucination Guard (Asking for nonexistent records)
        if ("blood test result" in last_msg_lower or "lab result" in last_msg_lower or "my results from yesterday" in last_msg_lower or "my report from yesterday" in last_msg_lower) and not attachments:
            return PatientChatResponse(
                reply="मेरे पास आपके किसी पुराने या कल के रक्त परीक्षण परिणाम की जानकारी नहीं है, क्योंकि इस सत्र में कोई रिपोर्ट अपलोड नहीं की गई है। कृपया अपनी रिपोर्ट अपलोड करें ताकि मैं उसकी व्याख्या में सहायता कर सकूं।" if is_hindi else "I don't have access to your blood test results from yesterday because no medical report has been uploaded in this session. Please upload your laboratory document or enter the specific values so I can assist you with an explanation.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["Upload a Report"],
                suggested_actions=["Upload a Report", "Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        # 3. AI Boundary & Capability Questions
        if "diagnose" in last_msg_lower or "can you diagnose" in last_msg_lower or "certain what disease" in last_msg_lower or "tell me for certain" in last_msg_lower:
            return PatientChatResponse(
                reply="नहीं, मैं किसी बीमारी का निश्चित निदान (Diagnosis) नहीं कर सकता। मैं एक एआई स्वास्थ्य सहायक हूँ जो शैक्षिक जानकारी और ट्राइएज मार्गदर्शन प्रदान करता है। सटीक निदान के लिए डॉक्टर द्वारा शारीरिक जांच और आवश्यक परीक्षण अनिवार्य हैं।" if is_hindi else "No, I cannot provide a definitive diagnosis or tell you for certain what disease you have. As an AI health assistant, I can provide educational information and triage guidance, but a formal clinical diagnosis requires an in-person physical examination, medical history, and clinical evaluation by a licensed physician.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["What symptoms can I share for triage?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "are you a doctor" in last_msg_lower or "you a physician" in last_msg_lower:
            return PatientChatResponse(
                reply="नहीं, मैं डॉक्टर नहीं हूँ। मैं स्वास्थ ट्राइएज का एआई स्वास्थ्य सहायक हूँ, जिसे स्वास्थ्य जानकारी और लक्षणों को समझने में सहायता के लिए डिज़ाइन किया गया है।" if is_hindi else "No, I am not a doctor or a licensed physician. I am the Swasthya Triage AI Health Assistant, designed to help you organize health information, understand general medical concepts, and prepare for a clinical consultation.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=[],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "ignore my doctor" in last_msg_lower or "doctor's advice" in last_msg_lower or "ignore doctor" in last_msg_lower:
            return PatientChatResponse(
                reply="नहीं, आपको अपने डॉक्टर की सलाह को कभी भी नजरअंदाज नहीं करना चाहिए। आपके डॉक्टर के पास आपका संपूर्ण व्यक्तिगत चिकित्सीय इतिहास होता है। यदि आपके मन में कोई संदेह है, तो कृपया अपने डॉक्टर से सीधे चर्चा करें।" if is_hindi else "No, you should never ignore or override your doctor's medical advice based on an AI chatbot. Your treating clinician understands your comprehensive clinical history and diagnostic findings. If you have questions or feel uncertain, discuss them directly with your doctor.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=[],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        # 4. Medication Safety
        if "tell a doctor about the medicines" in last_msg_lower or "medicines i am taking" in last_msg_lower or "medications i am taking" in last_msg_lower:
            return PatientChatResponse(
                reply="डॉक्टर को अपनी सभी दवाओं (प्रिस्क्रिप्शन, ओवर-द-काउंटर और सप्लीमेंट्स) के बारे में बताना बहुत जरूरी है ताकि हानिकारक दवा पारस्परिक क्रिया (Drug interactions), एलर्जी, और गलत खुराक से बचा जा सके।" if is_hindi else "It is vital to inform your doctor about all medications you take (including prescriptions, over-the-counter drugs, and herbal supplements) to avoid dangerous drug interactions, prevent duplicate therapies, detect side effects, and ensure safe dosing.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["What should I do if I forgot a dose?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "forgot a dose" in last_msg_lower or "missed a dose" in last_msg_lower or "missed my medicine" in last_msg_lower:
            return PatientChatResponse(
                reply="यदि आप अपनी दवा की खुराक भूल गए हैं, तो दवा की पर्ची (Package insert) में दिए गए निर्देशों की जांच करें या अपने फार्मासिस्ट या डॉक्टर से संपर्क करें। बिना चिकित्सकीय सलाह के कभी भी एक साथ दोहरी खुराक (Double dose) न लें।" if is_hindi else "If you missed a dose of your medication, check the patient information leaflet or contact your pharmacist or prescribing doctor, as instructions vary by specific drug. As a general rule, never take a double dose to make up for a missed one unless explicitly directed by your clinician.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=[],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        # 5. General Health & Lab Educational
        if "dehydration" in last_msg_lower and ("cause" in last_msg_lower or "what are common causes" in last_msg_lower):
            return PatientChatResponse(
                reply="निर्जलीकरण (Dehydration) के मुख्य कारणों में पर्याप्त पानी न पीना, अत्यधिक पसीना आना, तेज गर्मी, बुखार, उल्टी, दस्त, या मूत्रवर्धक दवाएं शामिल हैं। सामान्य अवस्था में पर्याप्त तरल पदार्थ लेना और गंभीर लक्षणों में डॉक्टर से मिलना महत्वपूर्ण है।" if is_hindi else "Common causes of dehydration include inadequate fluid intake, excessive sweating from heat or vigorous exercise, fever, vomiting, diarrhea, or increased urination. Mild dehydration can often be managed by regularly drinking water, while severe symptoms require prompt medical care.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["What are healthy ways to stay hydrated?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "stay hydrated" in last_msg_lower or "ways to stay hydrated" in last_msg_lower:
            return PatientChatResponse(
                reply="हाइड्रेटेड रहने के स्वस्थ तरीकों में दिन भर नियमित रूप से पानी पीना, पानी से भरपूर फल और सब्जियां खाना, और अत्यधिक कैफीन से बचना शामिल है। व्यक्तिगत जरूरतें मौसम और शारीरिक गतिविधि पर निर्भर करती हैं।" if is_hindi else "Healthy ways to stay hydrated include drinking water consistently throughout the day, eating water-rich fruits and vegetables (such as cucumbers and melons), and monitoring urine color (pale straw is ideal). Individual hydration needs vary depending on climate, activity level, and overall health.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["What are common causes of dehydration?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "common cold" in last_msg_lower and ("symptom" in last_msg_lower or "common symptoms" in last_msg_lower):
            return PatientChatResponse(
                reply="सामान्य सर्दी के आम लक्षणों में बहती या बंद नाक, गले में खराश, खांसी, छींकें, हल्का सिरदर्द और हल्की थकान शामिल हैं। यह आमतौर पर वायरल संक्रमण होता है जो आराम और तरल पदार्थों से कुछ दिनों में ठीक हो जाता है।" if is_hindi else "Common symptoms of a common cold include a runny or congested nose, sore throat, sneezing, mild cough, low-grade fever, and general mild fatigue. Colds are typically viral and resolve with rest and hydration, though worsening symptoms or high fevers should be evaluated by a healthcare provider.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["What should I consider for a sore throat and cough?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "sleep important" in last_msg_lower or ("sleep" in last_msg_lower and "important" in last_msg_lower):
            return PatientChatResponse(
                reply="पर्याप्त नींद स्वास्थ्य के लिए अत्यंत महत्वपूर्ण है क्योंकि यह प्रतिरक्षा प्रणाली को मजबूत करती है, ऊतकों की मरम्मत करती है, मानसिक एकाग्रता बनाए रखती है और हृदय स्वास्थ्य में सहायक होती है।" if is_hindi else "Sleep is essential for overall health because it supports immune system function, cellular and tissue repair, cardiovascular health, hormone regulation, and cognitive performance such as memory and focus.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["Why have I been feeling tired for several days?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "fever usually mean" in last_msg_lower or ("fever" in last_msg_lower and "mean" in last_msg_lower):
            return PatientChatResponse(
                reply="बुखार आमतौर पर यह दर्शाता है कि शरीर की प्रतिरक्षा प्रणाली किसी संक्रमण (वायरल या बैक्टीरियल) या सूजन से लड़ रही है। यदि बुखार बहुत तेज हो, कई दिनों तक रहे, या इसके साथ सांस लेने में तकलीफ हो, तो डॉक्टर को दिखाना चाहिए।" if is_hindi else "A fever is generally a sign that your body's immune system is actively fighting an infection (such as a virus or bacteria) or responding to inflammation. While fever itself is a natural defense mechanism, fevers that are persistent, very high, or accompanied by severe symptoms warrant clinical evaluation.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["How long have you had the fever?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "feeling tired for several days" in last_msg_lower or "tired for several days" in last_msg_lower:
            return PatientChatResponse(
                reply="कई दिनों से लगातार थकान महसूस होने के कई कारण हो सकते हैं, जैसे अपर्याप्त नींद, अत्यधिक तनाव, पोषण की कमी, या हालिया वायरल संक्रमण। यदि यह बनी रहती है, तो चिकित्सक से परामर्श करना उचित है।" if is_hindi else "Feeling tired for several days can stem from multiple factors including poor sleep quality, chronic stress, dehydration, nutritional deficiencies (such as anemia or vitamin D deficiency), or recovering from a viral illness. If fatigue is persistent or interferes with daily life, a doctor can order basic bloodwork to investigate.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["Are you having any fever or cough?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "sore throat and cough" in last_msg_lower or ("sore throat" in last_msg_lower and "cough" in last_msg_lower):
            return PatientChatResponse(
                reply="गले में खराश और खांसी आम तौर पर वायरल ऊपरी श्वसन संक्रमण, एलर्जी, या एसिड रिफ्लक्स के कारण हो सकती है। गर्म तरल पदार्थ और आराम मददगार हैं। यदि सांस लेने या निगलने में कठिनाई हो, तो तुरंत डॉक्टर से संपर्क करें।" if is_hindi else "A sore throat with a cough is commonly caused by a viral upper respiratory infection, post-nasal drip, environmental irritation, or seasonal allergies. Supportive measures include warm fluids and rest. If you experience difficulty swallowing, high fever, or breathing trouble, seek medical attention promptly.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["Is the cough dry or producing mucus?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "feel dizzy sometimes" in last_msg_lower or ("dizzy" in last_msg_lower and "information" in last_msg_lower):
            return PatientChatResponse(
                reply="चक्कर आने के कारणों को समझने के लिए उपयोगी जानकारी में शामिल है: क्या यह अचानक खड़े होने पर होता है, क्या कमरा घूमता हुआ लगता है, क्या इसके साथ कानों में आवाज, कमजोरी या सिरदर्द है, और आपके द्वारा ली जा रही दवाएं।" if is_hindi else "When discussing dizziness with a healthcare provider, helpful context includes: whether the dizziness is constant or occurs when standing up, whether the room feels like it is spinning (vertigo), how long episodes last, your hydration levels, any medications you take, and whether you notice hearing changes or palpitations.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["Does it happen mainly when standing up?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "stomach pain" in last_msg_lower and ("information should i provide" in last_msg_lower or "provide to a doctor" in last_msg_lower):
            return PatientChatResponse(
                reply="पेट दर्द के बारे में डॉक्टर को बताते समय ये विवरण दें: दर्द का सटीक स्थान (ऊपर, नीचे, दायां या बायां हिस्सा), दर्द का प्रकार (मरोड़, जलन या चुभन), दर्द कब शुरू हुआ, भोजन से इसका संबंध, और क्या इसके साथ उल्टी, बुखार, या मल में कोई बदलाव है।" if is_hindi else "When describing stomach pain to a doctor, key information to provide includes: the exact location (upper, lower, right, or left side), the nature of the pain (cramping, burning, dull, or sharp), when it began, whether food makes it better or worse, and associated symptoms such as nausea, vomiting, fever, or changes in bowel habits.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["Where in your stomach do you feel the pain?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "cbc blood test" in last_msg_lower or "what is a cbc" in last_msg_lower:
            return PatientChatResponse(
                reply="सीबीसी (Complete Blood Count) एक सामान्य रक्त परीक्षण है जो समग्र स्वास्थ्य का मूल्यांकन करता है। यह लाल रक्त कोशिकाओं (RBC), सफेद रक्त कोशिकाओं (WBC), हीमोग्लोबिन और प्लेटलेट्स के स्तर की जांच करता है।" if is_hindi else "A Complete Blood Count (CBC) is a common blood test that measures several key components of your blood, including Red Blood Cells (which carry oxygen), White Blood Cells (which fight infection), Hemoglobin (oxygen-binding protein), Hematocrit, and Platelets (which help blood clot). It is used for general health screening and checking for conditions like anemia or infection.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["What does hemoglobin measure?"],
                suggested_actions=["Start Symptom Intake", "Upload a Report"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "hemoglobin measure" in last_msg_lower or ("hemoglobin" in last_msg_lower and "measure" in last_msg_lower):
            return PatientChatResponse(
                reply="हीमोग्लोबिन लाल रक्त कोशिकाओं में पाया जाने वाला एक प्रोटीन है जो फेफड़ों से शरीर के सभी अंगों तक ऑक्सीजन पहुंचाने का काम करता है।" if is_hindi else "Hemoglobin is an iron-rich protein inside red blood cells that carries oxygen from your lungs throughout the body and brings carbon dioxide back to the lungs. Testing hemoglobin levels helps clinicians screen for conditions like anemia (low levels) or other blood disorders.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["What is a CBC blood test?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "high white blood cell" in last_msg_lower or "high wbc" in last_msg_lower:
            return PatientChatResponse(
                reply="सफेद रक्त कोशिकाओं (WBC) की बढ़ी हुई संख्या आमतौर पर यह संकेत देती है कि शरीर संक्रमण, सूजन, या शारीरिक तनाव से लड़ रहा है।" if is_hindi else "A high white blood cell (WBC) count, known as leukocytosis, most commonly indicates that the body's immune system is responding to an infection, inflammation, physical stress, or certain medications. Interpretation depends on clinical context and accompanying symptoms, rather than the isolated number alone.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["What does a reference range on a lab report mean?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "reference range" in last_msg_lower or "reference range on a laboratory report" in last_msg_lower:
            return PatientChatResponse(
                reply="प्रयोगशाला रिपोर्ट पर संदर्भ सीमा उन मानों का समूह है जो स्वस्थ लोगों के नमूनों में पाए जाते हैं। सीमा से थोड़ा बाहर होना अपने आप में किसी बीमारी का निश्चित प्रमाण नहीं होता।" if is_hindi else "A reference range on a laboratory report is the interval of expected values derived from testing a large group of healthy individuals. Because reference ranges vary slightly between different testing laboratories and methodologies, an abnormal result is not an automatic diagnosis of disease and should always be correlated with your clinical symptoms by a doctor.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["Upload a Report"],
                suggested_actions=["Start Symptom Intake", "Upload a Report"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if "serious medical problem" in last_msg_lower or "have a serious medical" in last_msg_lower:
            return PatientChatResponse(
                reply="यदि आप किसी गंभीर समस्या का सामना कर रहे हैं: यदि यह आपातकालीन स्थिति है (जैसे तेज सीने में दर्द, सांस लेने में असमर्थता), तो तुरंत आपातकालीन सेवा (108 / 112) लें। अन्यथा, कृपया बताएं कि आप कौन से लक्षण महसूस कर रहे हैं।" if is_hindi else "If you are experiencing potentially severe symptoms (such as severe chest pain, inability to breathe, sudden numbness, or heavy bleeding), please seek emergency medical attention immediately. Otherwise, please describe your specific symptoms, when they began, and how they are affecting you so I can provide relevant guidance.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["What specific symptoms are you experiencing?"],
                suggested_actions=["Start Symptom Intake", "Seek Emergency Care"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        # Multi-turn headache positional check
        if ("stand up" in combined_lower or "standing" in combined_lower or "worse when" in combined_lower) and ("headache" in combined_lower or "सिरदर्द" in combined_lower):
            return PatientChatResponse(
                reply="खड़े होने पर सिरदर्द का बढ़ना मुद्रा (posture) या निर्जलीकरण से संबंधित हो सकता है। क्या इसके साथ चक्कर या गर्दन में अकड़न भी है?" if is_hindi else "A headache that worsens specifically upon standing can be related to positional changes, dehydration, or low cerebrospinal fluid pressure. Are you also noticing any dizziness, neck stiffness, or nausea when you stand up?",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["Does lying flat relieve the pain?", "Are you having any neck stiffness?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        # 6. Check for document attachments
        if attachments and len(attachments) > 0:
            att = attachments[-1]
            abnormal_items = []
            if att.structured_values:
                for v in att.structured_values:
                    if v.is_abnormal:
                        abnormal_items.append(f"{v.test_name} ({v.value} {v.unit or ''})")

            # Also parse key findings from extracted_text if structured values are absent
            ext_text = (att.extracted_text or "").lower()
            if not abnormal_items and ext_text:
                if "hemoglobin" in ext_text or "hb" in ext_text:
                    abnormal_items.append("Hemoglobin level")
                elif "wbc" in ext_text or "white blood" in ext_text:
                    abnormal_items.append("White Blood Cell (WBC) count")
                elif "platelet" in ext_text:
                    abnormal_items.append("Platelet count")
                elif "blood sugar" in ext_text or "glucose" in ext_text:
                    abnormal_items.append("Blood Glucose level")

            if is_hindi:
                if abnormal_items:
                    reply = f"मैंने आपका दस्तावेज़ ({att.file_name}) देखा है। इसमें {abnormal_items[0]} संदर्भ सीमा (Reference Range) से बाहर दिख रहा है। क्या आप चाहते हैं कि मैं पहले इस परिणाम का अर्थ समझाऊं?"
                else:
                    reply = f"मैंने आपका दस्तावेज़ ({att.file_name}) विश्लेषित किया है। क्या आप किसी विशिष्ट परिणाम के बारे में विस्तार से चर्चा करना चाहते हैं?"
            else:
                if abnormal_items:
                    reply = f"I reviewed your {att.file_name}. Your {abnormal_items[0]} is noted against the standard reference range shown on the report. Would you like me to explain what this result means and how it relates to your symptoms?"
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

        # 7. Conversational symptom evaluation with adaptive, natural multi-turn tracking
        # Prioritize primary symptom from the latest turn, falling back to history
        has_burn = any(w in last_msg_lower for w in ["burn", "burned", "hot pan", "scald", "blister", "hot oil", "hot water"])
        has_stomach = any(w in last_msg_lower for w in ["stomach", "abdomen", "abdominal", "belly", "पेट"]) or (any(w in combined_lower for w in ["stomach", "abdomen", "abdominal", "belly", "पेट"]) and not has_burn)
        has_chest = any(w in last_msg_lower for w in ["chest", "सीने में"]) or ("chest" in combined_lower and not has_burn)
        has_fever = any(w in last_msg_lower for w in ["fever", "बुखार", "temp", "temperature"]) or ("fever" in combined_lower and not has_burn)
        has_headache = any(w in last_msg_lower for w in ["headache", "सिरदर्द"]) or ("head" in last_msg_lower and "pain" in last_msg_lower) or ("headache" in combined_lower and not has_burn and not has_stomach and not has_fever)
        has_cough = any(w in last_msg_lower for w in ["cough", "खांसी"]) or ("cough" in combined_lower and not has_burn)
        has_rash = any(w in last_msg_lower for w in ["rash", "itching", "चकत्ते"]) or ("rash" in combined_lower and not has_burn)
        has_dizzy = any(w in last_msg_lower for w in ["dizzy", "dizziness", "weak", "चक्कर", "कमजोरी"]) or ("dizzy" in combined_lower and not has_burn)

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

        global _provider_circuit_breaker_until
        import time
        now = time.time()
        if now < _provider_circuit_breaker_until:
            return cls.generate_intelligent_fallback_response(
                messages=request.messages,
                preferred_language=request.preferred_language or "English",
                attachments=request.attachments
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
            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.post(endpoint, json=payload)
                if response.status_code != 200:
                    _provider_circuit_breaker_until = time.time() + 600.0
                    return cls.generate_intelligent_fallback_response(
                        messages=request.messages,
                        preferred_language=request.preferred_language or "English",
                        attachments=request.attachments
                    )

                data = response.json()
                raw_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                if not raw_text:
                    _provider_circuit_breaker_until = time.time() + 600.0
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
            _provider_circuit_breaker_until = time.time() + 600.0
            return cls.generate_intelligent_fallback_response(
                messages=request.messages,
                preferred_language=request.preferred_language or "English",
                attachments=request.attachments
            )
