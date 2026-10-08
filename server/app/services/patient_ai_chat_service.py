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

# ==============================================================================
# 1. MULTILINGUAL DICTIONARIES & RESPONSE TEMPLATES (11 SUPPORTED LANGUAGES)
# ==============================================================================

SUPPORTED_LANGUAGES = [
    "english", "hindi", "odia", "bengali", "telugu",
    "tamil", "kannada", "malayalam", "marathi", "gujarati", "punjabi"
]

LANGUAGE_DISPLAY_NAMES = {
    "english": "English",
    "hindi": "हिन्दी (Hindi)",
    "odia": "ଓଡ଼ିଆ (Odia)",
    "bengali": "বাংলা (Bengali)",
    "telugu": "తెలుగు (Telugu)",
    "tamil": "தமிழ் (Tamil)",
    "kannada": "ಕನ್ನಡ (Kannada)",
    "malayalam": "മലയാളം (Malayalam)",
    "marathi": "मराठी (Marathi)",
    "gujarati": "ગુજરાતી (Gujarati)",
    "punjabi": "ਪੰਜਾਬੀ (Punjabi)",
}

NON_HEALTHCARE_STANDARD_REPLIES = {
    "english": (
        "I’m the Swasthya Triage Health Assistant, so I can only help with healthcare-related "
        "questions, symptoms, medical information, documents, and the triage process."
    ),
    "hindi": (
        "मैं स्वास्थ्य ट्राइएज हेल्थ असिस्टेंट हूँ, इसलिए मैं केवल स्वास्थ्य संबंधी प्रश्नों, लक्षणों, "
        "चिकित्सा जानकारी, दस्तावेजों और ट्राइएज प्रक्रिया में मदद कर सकता हूँ।"
    ),
    "odia": (
        "ମୁଁ ସ୍ୱାସ୍ଥ୍ୟ ଟ୍ରାଇଏଜ୍ ହେଲ୍ଥ ଆସିଷ୍ଟାଣ୍ଟ, ତେଣୁ ମୁଁ କେବଳ ସ୍ୱାସ୍ଥ୍ୟ ସମ୍ବନ୍ଧୀୟ ପ୍ରଶ୍ନ, ଲକ୍ଷଣ, "
        "ଚିକିତ୍ସା ସୂଚନା, ଡକ୍ୟୁମେଣ୍ଟ ଏବଂ ଟ୍ରାଇଏଜ୍ ପ୍ରକ୍ରିୟାରେ ସାହାଯ୍ୟ କରିପାରିବି।"
    ),
    "bengali": (
        "আমি স্বাস্থ্য ট্রায়াজ হেলথ অ্যাসিস্ট্যান্ট, তাই আমি শুধুমাত্র স্বাস্থ্য সম্পর্কিত প্রশ্ন, লক্ষণ, "
        "চিকিৎসা তথ্য, নথিপত্র এবং ট্রায়াজ প্রক্রিয়ায় সহায়তা করতে পারি।"
    ),
    "telugu": (
        "నేను స్వాస్థ్య ట్రయాజ్ హెల్త్ అసిస్టెంట్‌ని, కాబట్టి నేను ఆరోగ్య సంబంధిత ప్రశ్నలు, లక్షణాలు, "
        "వైద్య సమాచారం, పత్రాలు మరియు ట్రయాజ్ ప్రక్రియలో మాత్రమే సహాయం చేయగలను."
    ),
    "tamil": (
        "நான் ஸ்வஸ்த்யா ட்ரையേജ് ஹெல்த் அசிஸ்டெண்ட், எனவே என்னால் உடல்நலம் தொடர்பான கேள்விகள், அறிகுறிகள், "
        "மருத்துவத் தகவல்கள், ஆவணங்கள் மற்றும் ட்ரையേജ് செயல்முறைகளில் மட்டுமே உதவ முடியும்."
    ),
    "kannada": (
        "ನಾನು ಸ್ವಾಸ್ಥ್ಯ ಟ್ರಯೇಜ್ ಹೆಲ್ತ್ ಅಸಿಸ್ಟೆಂಟ್, ಆದ್ದರಿಂದ ನಾನು ಆರೋಗ್ಯ ಸಂಬಂಧಿತ ಪ್ರಶ್ನೆಗಳು, ರೋಗಲಕ್ಷಣಗಳು, "
        "ವೈದ್ಯಕೀಯ ಮಾಹಿತಿ, ದಾಖಲೆಗಳು ಮತ್ತು ಟ್ರಯೇಜ್ ಪ್ರಕ್ರಿಯೆಯಲ್ಲಿ ಮಾತ್ರ ಸಹಾಯ ಮಾಡಬಲ್ಲೆ."
    ),
    "malayalam": (
        "ഞാൻ സ്വാസ്ഥ്യ ട്രയേജ് ഹെൽത്ത് അസിസ്റ്റന്റാണ്, അതിനാൽ ആരോഗ്യ സംബന്ധിയായ ചോദ്യങ്ങൾ, ലക്ഷണങ്ങൾ, "
        "മെഡിക്കൽ വിവരങ്ങൾ, രേഖകൾ, ട്രയേജ് പ്രക്രിയ എന്നിവയിൽ മാത്രമേ എന്നെ സഹായിക്കാൻ കഴിയൂ."
    ),
    "marathi": (
        "मी स्वास्थ्य ट्रायज हेल्थ असिस्टंट आहे, त्यामुळे मी फक्त आरोग्यविषयक प्रश्न, लक्षणे, "
        "वैद्यकीय माहिती, कागदपत्रे आणि ट्रायज प्रक्रियेत मदत करू शकतो."
    ),
    "gujarati": (
        "હું સ્વાસ્થ્ય ટ્રાયેજ હેલ્થ આસિસ્ટન્ટ છું, તેથી હું ફક્ત સ્વાસ્થ્ય સંબંધિત પ્રશ્નો, લક્ષણો, "
        "તબીબી માહિતી, દસ્તાવેજો અને ટ્રાયેજ પ્રક્રિયામાં જ મદદ કરી શકું છું."
    ),
    "punjabi": (
        "ਮੈਂ ਸਵਾਸਥਿਆ ਟ੍ਰਾਈਏਜ ਹੈਲਥ ਅਸਿਸਟੈਂਟ ਹਾਂ, ਇਸ ਲਈ ਮੈਂ ਸਿਰਫ਼ ਸਿਹਤ ਸੰਬੰਧੀ ਸਵਾਲਾਂ, ਲੱਛਣਾਂ, "
        "ਡਾਕਟਰੀ ਜਾਣਕਾਰੀ, ਦਸਤਾਵੇਜ਼ਾਂ ਅਤੇ ਟ੍ਰਾਈਏਜ ਪ੍ਰਕਿਰਿਆ ਵਿੱਚ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ।"
    )
}

NON_HEALTHCARE_STANDARD_REPLY = NON_HEALTHCARE_STANDARD_REPLIES["english"]

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
    # Hindi / Marathi
    "बुखार", "दर्द", "सांस", "खांसी", "सिरदर्द", "सीने में दर्द", "चक्कर", "दवा", "इलाज", "अस्पताल", "ताप", "पोट",
    # Odia
    "ଜ୍ୱର", "ଯନ୍ତ୍ରଣା", "ବ୍ୟଥା", "ଶ୍ୱାସ", "କାଶ", "ମୁଣ୍ଡବିନ୍ଧା", "ଛାତି", "ଔଷଧ", "ଡାକ୍ତରଖାନା",
    # Bengali
    "জ্বর", "ব্যথা", "শ্বাস", "কাশি", "মাথাব্যথা", "বুক", "ওষুধ", "হাসপাতাল",
    # Telugu
    "జ్వరం", "నొప్పి", "శ్వాస", "దగ్గు", "తలనొప్పి", "ఛాతీ", "మందులు", "ఆసుపత్రి",
    # Tamil
    "காய்ச்சல்", "வலி", "மூச்சு", "இருமல்", "தலைவலி", "மார்பு", "மருந்து", "மருத்துவமனை",
    # Kannada
    "ಜ್ವರ", "ನೋವು", "ಉಸಿರು", "ಕೆಮ್ಮು", "ತಲೆನೋವು", "ಎದೆ", "ಔಷಧಿ", "ಆಸ್ಪತ್ರೆ",
    # Malayalam
    "പനി", "വേദന", "ശ്വാസം", "ചുമ", "തലവേദന", "നെഞ്ച്", "മരുന്ന്", "ആശുപത്രി",
    # Gujarati
    "તાવ", "દુખાવો", "શ્વાસ", "ખાંસી", "માથાનો દુખાવો", "છાતી", "દવા", "હોસ્પિટલ",
    # Punjabi
    "ਬੁਖਾਰ", "ਦਰਦ", "ਸਾਹ", "ਖੰਘ", "ਸਿਰਦਰਦ", "ਛਾਤੀ", "ਦਵਾਈ", "ਹਸਪਤਾਲ"
]

class LanguageDetector:
    """
    Robust Multilingual Language Detector for Health AI.
    Accurately classifies text across 11 Indian & regional languages, script ranges,
    and transliterated input (Hinglish, Banglish, etc.).
    """

    @classmethod
    def normalize_language_name(cls, lang: Optional[str]) -> str:
        if not lang or not lang.strip():
            return "auto"
        l = lang.lower().strip()
        if l in ["auto", "detect", "auto-detect", "auto_detect", "autodetect"]:
            return "auto"
        if "eng" in l or l == "en":
            return "english"
        if "hin" in l or l == "hi" or "हिन्दी" in l:
            return "hindi"
        if "odi" in l or "ori" in l or l == "or" or "ଓଡ଼ିଆ" in l:
            return "odia"
        if "ben" in l or "bang" in l or l == "bn" or "বাংলা" in l:
            return "bengali"
        if "tel" in l or l == "te" or "తెలుగు" in l:
            return "telugu"
        if "tam" in l or l == "ta" or "தமிழ்" in l:
            return "tamil"
        if "kan" in l or l == "kn" or "ಕನ್ನಡ" in l:
            return "kannada"
        if "mal" in l or l == "ml" or "മലയാളം" in l:
            return "malayalam"
        if "mar" in l or l == "mr" or "मराठी" in l:
            return "marathi"
        if "guj" in l or l == "gu" or "ગુજરાતી" in l:
            return "gujarati"
        if "pun" in l or "pan" in l or l == "pa" or "ਪੰਜਾਬੀ" in l:
            return "punjabi"
        return l

    @classmethod
    def detect_language(
        cls,
        text: str,
        preferred_language: Optional[str] = None,
        previous_language: Optional[str] = None
    ) -> str:
        # 1. Explicit patient-selected language (if valid and not 'auto')
        pref = cls.normalize_language_name(preferred_language)
        if pref and pref != "auto":
            return pref

        if not text or not text.strip():
            return previous_language or "english"

        # 2. Reliable Unicode Script Detection
        if re.search(r"[\u0B00-\u0B7F]", text):
            return "odia"
        if re.search(r"[\u0980-\u09FF]", text):
            return "bengali"
        if re.search(r"[\u0C00-\u0C7F]", text):
            return "telugu"
        if re.search(r"[\u0B80-\u0BFF]", text):
            return "tamil"
        if re.search(r"[\u0C80-\u0CFF]", text):
            return "kannada"
        if re.search(r"[\u0D00-\u0D7F]", text):
            return "malayalam"
        if re.search(r"[\u0A80-\u0AFF]", text):
            return "gujarati"
        if re.search(r"[\u0A00-\u0A7F]", text):
            return "punjabi"
        
        # Devanagari script: differentiate Marathi vs Hindi
        if re.search(r"[\u0900-\u097F]", text):
            marathi_markers = ["आहे", "नाही", "मला", "होते", "ताप", "डोकेदुखी", "पोटात", "छातीत", "त्रास", "कळ", "दवाखाना", "औषध", "गेल्या", "काही", "दिवसांपासून"]
            if any(m in text for m in marathi_markers) and not any(h in text for h in ["मुझे", "हूँ", "सीने में", "सिरदर्द"]):
                return "marathi"
            return "hindi"

        # 3. Transliterated / Romanized / Mixed Language Keyword Detection
        t_low = text.lower()

        # Odia Romanized / Mixed
        if any(w in t_low for w in ["mote", "heuchi", "karuchi", "byatha", "chhati", "jwara", "jvara", "petare"]):
            return "odia"
        # Bengali Romanized / Mixed (Banglish)
        if any(w in t_low for w in ["amar", "hocche", "buke", "matha", "betha", "batha", "jor"]):
            return "bengali"
        # Telugu Romanized / Mixed
        if any(w in t_low for w in ["naaku", "undi", "noppi", "vachindi", "jwaram", "talanoppi", "kadupulo"]):
            return "telugu"
        # Tamil Romanized / Mixed
        if any(w in t_low for w in ["enakku", "irukku", "irukkiradhu", "kaichal", "thalaivali"]):
            return "tamil"
        # Kannada Romanized / Mixed
        if any(w in t_low for w in ["nanage", "ide", "bandide", "talenovu", "hotte"]):
            return "kannada"
        # Malayalam Romanized / Mixed
        if any(w in t_low for w in ["enikku", "undu", "thalavedana", "nenjuvethana"]):
            return "malayalam"
        # Marathi Romanized / Mixed
        if any(w in t_low for w in ["mala", "aahe", "hotay", "dukhate", "dokedukhi", "potat"]):
            return "marathi"
        # Gujarati Romanized / Mixed
        if any(w in t_low for w in ["mane", "chhe", "thay", "mathano dukhavo", "petma"]):
            return "gujarati"
        # Punjabi Romanized / Mixed
        if any(w in t_low for w in ["mainu", "mennu", "sardard"]):
            return "punjabi"
        # Hindi Romanized / Mixed (Hinglish)
        if any(w in t_low for w in ["mujhe", "mera", "meri", "dard", "bukhar", "sirdard", "seene", "pet me", "ho raha"]):
            return "hindi"

        # 4. Fall back to previous turn language, or default to English
        return previous_language or "english"


PATIENT_AI_SYSTEM_INSTRUCTION = """You are the Swasthya Triage Health Assistant.
You are a healthcare-focused conversational AI assistant inside the Swasthya Triage Patient Portal.
Your primary goal is to understand the patient's concern and provide useful, safe healthcare guidance.

COMMUNICATION GUIDELINES:
- Communicate naturally, empathetically, and clearly in the patient's detected or preferred language.
- Support Indian regional languages fluently (English, Hindi, Odia, Bengali, Telugu, Tamil, Kannada, Malayalam, Marathi, Gujarati, Punjabi).
- Ask only the most relevant follow-up questions based on what the patient has already said (max 1 or 2).
- Never repeatedly ask for information that the patient has already provided.
- Explain healthcare information clearly in patient-friendly terms without excessive jargon.
- Retain recognized clinical values, units, and terms accurately (e.g. Hemoglobin 9.2 g/dL, WBC 11,500 /uL, BP 120/80 mmHg).

CRITICAL SAFETY DIRECTIVES:
1. Do not diagnose with certainty (e.g. discuss possibilities educationally: "Headaches can have several causes, including tension, migraine, dehydration, or lack of sleep. An online chat cannot establish a definitive diagnosis.").
2. Do not prescribe or modify medications or recommend dosages.
3. Do not replace professional clinical evaluation.
4. When the patient asks something unrelated to healthcare (e.g. coding, entertainment, homework, politics, gaming, jokes), politely redirect them.
5. When potentially serious symptoms are described (e.g. severe chest pain with breathlessness, thunderclap/worst headache of life, sudden one-sided weakness, massive bleeding, anaphylaxis):
- Set urgency_detected = true and urgency_level = "emergency" or "urgent".
- Provide an emergency guidance recommendation immediately (e.g. advising 108 / 112 or emergency room evaluation).
6. When asking about lab test results without an uploaded report, do NOT fabricate or hallucinate values. Ask the patient to upload their document.

OUTPUT FORMAT (JSON ONLY):
{
  "reply": "string - your natural conversational response in the patient's language",
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
    def get_multilingual_emergency_reply(cls, language: str, red_flag_type: str) -> str:
        lang = language if language in SUPPORTED_LANGUAGES else "english"
        
        replies = {
            "stroke": {
                "english": "Sudden weakness or inability to move one side of the body together with difficulty speaking is a potential medical emergency (such as a stroke). Please call emergency medical services immediately (108 / 112) or go to the nearest emergency department right away.",
                "hindi": "शरीर के एक तरफ अचानक कमजोरी आना या बोलने में कठिनाई होना एक गंभीर न्यूरोलॉजिकल आपातकाल (जैसे स्ट्रोक) का संकेत हो सकता है। कृपया तुरंत आपातकालीन एम्बुलेंस (108 / 112) बुलाएं या निकटतम इमरजेंसी अस्पताल जाएं।",
                "odia": "ଶରୀରର ଗୋଟିଏ ପାର୍ଶ୍ୱରେ ହଠାତ୍ ଦୁର୍ବଳତା କିମ୍ବା କଥା କହିବାରେ ଅସୁବିଧା ଏକ ଜରୁରୀକାଳୀନ ସ୍ଥିତି (ଷ୍ଟ୍ରୋକ୍ ଭଳି) ହୋଇପାରେ। ଦୟାକରି ତୁରନ୍ତ ଜରୁରୀକାଳୀନ ଆମ୍ବୁଲାନ୍ସ (108 / 112) କୁ ଫୋନ୍ କରନ୍ତୁ କିମ୍ବା ନିକଟତମ ହସ୍ପିଟାଲକୁ ଯାଆନ୍ତୁ।",
                "bengali": "শরীরের একপাশে হঠাৎ দুর্বলতা বা কথা বলতে অসুবিধা হওয়া একটি গুরুতর জরুরি অবস্থা (যেমন স্ট্রোক)। অনুগ্রহ করে অবিলম্বে জরুরি অ্যাম্বুলেন্স (108 / 112) ডাকুন বা নিকটস্থ জরুরি হাসপাতালে যান।",
                "telugu": "శరీరం యొక్క ఒక వైపు ఆకస్మిక బలహీనత లేదా మాట్లాడటంలో ఇబ్బంది తీవ్రమైన అత్యవసర పరిస్థితి (స్ట్రోక్ వంటిది) కావచ్చు. దయచేసి వెంటనే అత్యవసర అంబులెన్స్ (108 / 112) కు కాల్ చేయండి లేదా సమీప ఆసుపత్రికి వెళ్లండి.",
                "tamil": "உடலின் ஒரு பக்கத்தில் திடீர் பலவீனம் அல்லது பேசுவதில் சிரமம் ஏற்படுவது தீவிர அவசரநிலை (ஸ்ட்ரோக் போன்றவை) ஆகும். தயவுசெய்து உடனடியாக ஆம்புலன்ஸை (108 / 112) அழைக்கவும் அல்லது அருகிலுள்ள அவசர சிகிச்சைப் பிரிவுக்குச் செல்லவும்.",
                "kannada": "ದೇಹದ ಒಂದು ಬದಿಯಲ್ಲಿ ಹಠಾತ್ ದೌರ್ಬಲ್ಯ ಅಥವಾ ಮಾತನಾಡಲು ಕಷ್ಟವಾಗುವುದು ಗಂಭೀರ ತುರ್ತು ಪರಿಸ್ಥಿತಿಯಾಗಿದೆ (ಸ್ಟ್ರೋಕ್‌ನಂತಹ). ದಯವಿಟ್ಟು ತಕ್ಷಣವೇ ತುರ್ತು ಆಂಬ್ಯುಲೆನ್ಸ್‌ಗೆ (108 / 112) ಕರೆ ಮಾಡಿ ಅಥವಾ ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಗೆ ತೆರಳಿ.",
                "malayalam": "ശരീരത്തിന്റെ ഒരു വശത്ത് പെട്ടെന്നുണ്ടാകുന്ന ബലഹീനതയോ സംസാരിക്കാൻ ബുദ്ധിമുട്ടോ അടിയന്തര സാഹചര്യമാണ് (സ്ട്രോക്ക് പോലുള്ളവ). ദയവായി ഉടൻ തന്നെ ആംബുലൻസിനെ (108 / 112) വിളിക്കുകയോ അടുത്തുള്ള ആശുപത്രിയിൽ എത്തുകയോ ചെയ്യുക.",
                "marathi": "शरीराच्या एका बाजूला अचानक अशक्तपणा येणे किंवा बोलण्यात अडचण येणे ही गंभीर तातडीची स्थिती (स्ट्रोकसारखी) असू शकते. कृपया ताबडतोब रुग्णवाहिका (108 / 112) बोलवा किंवा जवळच्या रुग्णालयात जा.",
                "gujarati": "શરીરની એક બાજુ અચાનક નબળાઈ આવવી અથવા બોલવામાં તકલીફ થવી એ ગંભીર કટોકટી (સ્ટ્રોક જેવી) હોઈ શકે છે. કૃપા કરીને તાત્કાલિક એમ્બ્યુલન્સ (108 / 112) બોલાવો અથવા નજીકની હોસ્પિટલમાં જાઓ.",
                "punjabi": "ਸਰੀਰ ਦੇ ਇੱਕ ਪਾਸੇ ਅਚਾਨਕ ਕਮਜ਼ੋਰੀ ਆਉਣਾ ਜਾਂ ਬੋਲਣ ਵਿੱਚ ਮੁਸ਼ਕਲ ਹੋਣਾ ਇੱਕ ਗੰਭੀਰ ਐਮਰਜੈਂਸੀ (ਜਿਵੇਂ ਸਟ੍ਰੋਕ) ਦਾ ਸੰਕੇਤ ਹੋ ਸਕਦਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਤੁਰੰਤ ਐਂਬੂਲੈਂਸ (108 / 112) ਬੁਲਾਓ ਜਾਂ ਨਜ਼ਦੀਕੀ ਹਸਪਤਾਲ ਜਾਓ।"
            },
            "thunderclap": {
                "english": "Because you are describing a sudden, severe headache that feels like the worst you've ever had, this is a red-flag symptom that requires urgent emergency medical evaluation. Please seek emergency medical care immediately (108 / 112).",
                "hindi": "क्योंकि आप अचानक शुरू हुए बहुत तेज सिरदर्द ('worst headache') का वर्णन कर रहे हैं, यह स्थिति तुरंत आपातकालीन चिकित्सा मूल्यांकन की मांग करती है। कृपया तुरंत नजदीकी अस्पताल या आपातकालीन सेवा (108 / 112) से संपर्क करें।",
                "odia": "ଯେହେତୁ ଆପଣ ହଠାତ୍ ଆରମ୍ଭ ହୋଇଥିବା ପ୍ରବଳ ମୁଣ୍ଡବିନ୍ଧାର ବର୍ଣ୍ଣନା କରୁଛନ୍ତି, ଏହା ଏକ ଜରୁରୀକାଳୀନ ଚିକିତ୍ସା ମୂଲ୍ୟାୟନ ଆବଶ୍ୟକ କରେ। ଦୟାକରି ତୁରନ୍ତ ଡାକ୍ତରଖାନା କିମ୍ବା ଜରୁରୀକାଳୀନ ସେବା (108 / 112) ସହିତ ଯୋଗାଯୋଗ କରନ୍ତୁ।",
                "bengali": "যেহেতু আপনি হঠাৎ শুরু হওয়া খুব তীব্র মাথাব্যথার কথা বলছেন, এটি জরুরি চিকিৎসা মূল্যায়নের দাবি রাখে। অনুগ্রহ করে অবিলম্বে জরুরি চিকিৎসা সহায়তা (108 / 112) নিন।",
                "telugu": "మీరు అకస్మాత్తుగా తీవ్రమైన తలనొప్పిని ఎదుర్కొంటున్నట్లు పేర్కొంటున్నారు, కాబట్టి ఇది తక్షణ అత్యవసర వైద్య పరీక్ష అవసరం. దయచేసి వెంటనే అత్యవసర సంరక్షణ (108 / 112) ను కోరండి.",
                "tamil": "திடீரெனத் தொடங்கிய கடுமையான தலைவலியை நீங்கள் விவரிப்பதால், இதற்கு உடனடி அவசர மருத்துவ பரிசோதனை தேவைப்படுகிறது. உடனடியாக அவசர மருத்துவ உதவியை (108 / 112) நாடவும்.",
                "kannada": "ನೀವು ಹಠಾತ್ ತೀವ್ರ ತಲೆನೋವನ್ನು ಅನುಭವಿಸುತ್ತಿರುವುದರಿಂದ, ಇದು ತಕ್ಷಣದ ತುರ್ತು ವೈದ್ಯಕೀಯ ಮೌಲ್ಯಮಾಪನವನ್ನು ಬಯಸುತ್ತದೆ. ದಯವಿಟ್ಟು ತಕ್ಷಣವೇ ತುರ್ತು ವೈದ್ಯಕೀಯ ಆರೈಕೆಯನ್ನು (108 / 112) ಪಡೆಯಿರಿ.",
                "malayalam": "പെട്ടെന്നുണ്ടായ കഠിനമായ തലവേദന അടിയന്തര വൈദ്യപരിശോധന ആവശ്യപ്പെടുന്ന ഒരു ലക്ഷണമാണ്. ദയവായി ഉടൻ തന്നെ അടിയന്തര വൈദ്യസഹായം (108 / 112) തേടുക.",
                "marathi": "अचानक उद्भवलेली अतिशय तीव्र डोकेदुखी हे तातडीच्या वैद्यकीय तपासणीची गरज असलेले लक्षण आहे. कृपया ताबडतोब आपत्कालीन वैद्यकीय मदत (108 / 112) घ्या.",
                "gujarati": "અચાનક શરૂ થયેલો અતિ તીવ્ર માથાનો દુખાવો તાત્કાલિક કટોકટી તબીબી મૂલ્યાંકનની માંગ કરે છે. કૃપા કરીને તાત્કાલિક કટોકટી તબીબી સેવા (108 / 112) નો સંપર્ક કરો.",
                "punjabi": "ਅਚਾਨਕ ਸ਼ੁਰੂ ਹੋਇਆ ਬਹੁਤ ਤੇਜ਼ ਸਿਰਦਰਦ ਤੁਰੰਤ ਐਮਰਜੈਂਸੀ ਡਾਕਟਰੀ ਜਾਂਚ ਦੀ ਮੰਗ ਕਰਦਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਤੁਰੰਤ ਐਮਰਜੈਂਸੀ ਡਾਕਟਰੀ ਸਹਾਇਤਾ (108 / 112) ਲਓ।"
            },
            "cardio": {
                "english": "Because you are describing severe chest pain together with difficulty breathing, this requires immediate emergency medical evaluation. Please call emergency services (108 / 112) or go to the nearest emergency room immediately.",
                "hindi": "क्योंकि आपके लक्षणों में सीने में तेज दर्द या सांस लेने में गंभीर तकलीफ शामिल है, यह स्थिति तुरंत आपातकालीन चिकित्सा सहायता की मांग करती है। कृपया तुरंत आपातकालीन सेवा (108 / 112) लें या अस्पताल जाएं।",
                "odia": "ଯେହେତୁ ଆପଣ ଛାତିରେ ତୀବ୍ର ଯନ୍ତ୍ରଣା ଏବଂ ଶ୍ୱାସ ନେବାରେ ଗମ୍ଭୀର କଷ୍ଟ ବର୍ଣ୍ଣନା କରୁଛନ୍ତି, ଏହା ଏକ ଜରୁରୀକାଳୀନ ଚିକିତ୍ସା ମୂଲ୍ୟାୟନ ଆବଶ୍ୟକ କରେ। ଦୟାକରି ତୁରନ୍ତ ଜରୁରୀକାଳୀନ ଆମ୍ବୁଲାନ୍ସ (108 / 112) କୁ ଫୋନ୍ କରନ୍ତୁ କିମ୍ବା ନିକଟତମ ଡାକ୍ତରଖାନାର ଜରୁରୀ ବିଭାଗକୁ ଯାଆନ୍ତୁ।",
                "bengali": "যেহেতু আপনি বুকে তীব্র ব্যথা এবং শ্বাস নিতে গুরুতর অসুবিধার কথা বলছেন, এটি অবিলম্বে জরুরি চিকিৎসা মূল্যায়নের দাবি রাখে। অনুগ্রহ করে অবিলম্বে জরুরি সেবা (108 / 112) তে কল করুন বা নিকটস্থ হাসপাতালের জরুরি বিভাগে যান।",
                "telugu": "మీరు ఛాతీలో తీవ్రమైన నొప్పి మరియు శ్వాస తీసుకోవడంలో తీవ్ర ఇబ్బందిని ఎదుర్కొంటున్నట్లు పేర్కొంటున్నారు, కాబట్టి ఇది తక్షణ అత్యవసర వైద్య పరీక్ష అవసరం. దయచేసి వెంటనే అత్యవసర సేవలకు (108 / 112) కాల్ చేయండి లేదా సమీపంలోని అత్యవసర ఆసుపత్రికి వెళ్లండి.",
                "tamil": "நெஞ்சில் கடுமையான வலி மற்றும் மூச்சு விடுவதில் தீவிர சிரமம் இருப்பதாக நீங்கள் கூறுவதால், இதற்கு உடனடி அவசர மருத்துவ பரிசோதனை தேவை. தயவுசெய்து உடனடியாக அவசர உதவிக்கு (108 / 112) அழைக்கவும் அல்லது அருகிலுள்ள அவசர சிகிச்சைப் பிரிவுக்குச் செல்லவும்.",
                "kannada": "ನೀವು ಎದೆಯಲ್ಲಿ ತೀವ್ರ ನೋವು ಮತ್ತು ಉಸಿರಾಟದ ಗಂಭೀರ ತೊಂದರೆಯನ್ನು ಅನುಭವಿಸುತ್ತಿರುವುದರಿಂದ, ಇದು ತಕ್ಷಣದ ತುರ್ತು ವೈದ್ಯಕೀಯ ಮೌಲ್ಯಮಾಪನವನ್ನು ಬಯಸುತ್ತದೆ. ದಯವಿಟ್ಟು ತಕ್ಷಣವೇ ತುರ್ತು ಸೇವೆಗೆ (108 / 112) ಕರೆ ಮಾಡಿ ಅಥವಾ ಹತ್ತಿರದ ತುರ್ತು ಚಿಕಿತ್ಸಾ ವಿಭಾಗಕ್ಕೆ ತೆರಳಿ.",
                "malayalam": "നെഞ്ചിൽ കഠിനമായ വേദനയും ശ്വാസമെടുക്കാൻ ഗുരുതരമായ ബുദ്ധിമുട്ടും അനുഭവപ്പെടുന്നതിനാൽ, ഇതിന് ഉടനടി അടിയന്തര വൈദ്യസഹായം ആവശ്യമാണ്. ദയവായി ഉടൻ തന്നെ അടിയന്തര സേവനങ്ങളെ (108 / 112) വിളിക്കുകയോ അടുത്തുള്ള എമർജൻസി വിഭാഗത്തിൽ എത്തുകയോ ചെയ്യുക.",
                "marathi": "तुमच्या लक्षणांमध्ये छातीत तीव्र वेदना आणि श्वास घेण्यास गंभीर त्रास समाविष्ट असल्याने, यासाठी त्वरित तातडीच्या वैद्यकीय मूल्यांकनाची आवश्यकता आहे. कृपया ताबडतोब रुग्णवाहिका (108 / 112) बोलवा किंवा जवळच्या आपत्कालीन रुग्णालयात जा.",
                "gujarati": "કારણ કે તમે છાતીમાં તીવ્ર દુખાવો અને શ્વાસ લેવામાં ગંભીર તકલીફ અનુભવી રહ્યા છો, આ સ્થિતિ માટે તાત્કાલિક કટોકટી તબીબી તપાસ જરૂરી છે. કૃપા કરીને તાત્કાલિક કટોકટી સેવા (108 / 112) પર સંપર્ક કરો અથવા નજીકની ઇમરજન્સી હોસ્પિટલમાં જાઓ.",
                "punjabi": "ਕਿਉਂਕਿ ਤੁਸੀਂ ਛਾਤੀ ਵਿੱਚ ਤੇਜ਼ ਦਰਦ ਅਤੇ ਸਾਹ ਲੈਣ ਵਿੱਚ ਗੰਭੀਰ ਮੁਸ਼ਕਲ ਮਹਿਸੂਸ ਕਰ ਰਹੇ ਹੋ, ਇਸ ਲਈ ਤੁਰੰਤ ਐਮਰਜੈਂਸੀ ਡਾਕਟਰੀ ਜਾਂਚ ਦੀ ਲੋੜ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਤੁਰੰਤ ਐਂਬੂਲੈਂਸ (108 / 112) ਨੂੰ ਕਾਲ ਕਰੋ ਜਾਂ ਨਜ਼ਦੀਕੀ ਐਮਰਜੈਂਸੀ ਹਸਪਤਾਲ ਜਾਓ।"
            },
            "dyspnea": {
                "english": "Severe difficulty breathing is a medical emergency that requires immediate medical attention. Please call emergency medical services (108 / 112) or go to the nearest emergency room immediately.",
                "hindi": "सांस लेने में गंभीर तकलीफ होना एक आपातकालीन चिकित्सा स्थिति है। कृपया तुरंत आपातकालीन चिकित्सा सहायता (108 / 112) लें।",
                "odia": "ଶ୍ୱାସ ନେବାରେ ଗମ୍ଭୀର କଷ୍ଟ ହେବା ଏକ ଜରୁରୀକାଳୀନ ଚିକିତ୍ସା ସ୍ଥିତି। ଦୟାକରି ତୁରନ୍ତ ଜରୁରୀକାଳୀନ ସହାୟତା (108 / 112) ନିଅନ୍ତୁ।",
                "bengali": "শ্বাস নিতে মারাত্মক কষ্ট হওয়া একটি জরুরি চিকিৎসা পরিস্থিতি। অনুগ্রহ করে অবিলম্বে জরুরি চিকিৎসা সহায়তা (108 / 112) নিন।",
                "telugu": "శ్వాస తీసుకోవడంలో తీవ్రమైన ఇబ్బంది ఒక అత్యవసర వైద్య పరిస్థితి. దయచేసి వెంటనే అత్యవసర వైద్య సహాయం (108 / 112) తీసుకోండి.",
                "tamil": "மூச்சு விடுவதில் தீவிர சிரமம் ஏற்படுவது ஒரு மருத்துவ அவசரநிலையாகும். தயவுசெய்து உடனடியாக அவசர மருத்துவ உதவியை (108 / 112) நாடவும்.",
                "kannada": "ಉಸಿರಾಟದಲ್ಲಿ ತೀವ್ರ ತೊಂದರೆಯಾಗುವುದು ವೈದ್ಯಕೀಯ ತುರ್ತು ಪರಿಸ್ಥಿತಿಯಾಗಿದೆ. ದಯವಿಟ್ಟು ತಕ್ಷಣವೇ ತುರ್ತು ವೈದ್ಯಕೀಯ ಸಹಾಯವನ್ನು (108 / 112) ಪಡೆಯಿರಿ.",
                "malayalam": "ശ്വാസമെടുക്കാൻ കഠിനമായ ബുദ്ധിമുട്ട് ഉണ്ടാകുന്നത് അടിയന്തര വൈദ്യസഹായം ആവശ്യമുള്ള സാഹചര്യമാണ്. ദയവായി ഉടൻ തന്നെ അടിയന്തര സഹായം (108 / 112) തേടുക.",
                "marathi": "श्वास घेण्यास गंभीर त्रास होणे ही एक तातडीची वैद्यकीय स्थिती आहे. कृपया ताबडतोब आपत्कालीन वैद्यकीय मदत (108 / 112) घ्या.",
                "gujarati": "શ્વાસ લેવામાં ગંભીર મુશ્કેલી એ એક કટોકટીની તબીબી સ્થિતિ છે. કૃપા કરીને તાત્કાલિક કટોકટી તબીબી સહાય (108 / 112) મેળવો.",
                "punjabi": "ਸਾਹ ਲੈਣ ਵਿੱਚ ਗੰਭੀਰ ਮੁਸ਼ਕਲ ਹੋਣਾ ਇੱਕ ਐਮਰਜੈਂਸੀ ਡਾਕਟਰੀ ਸਥਿਤੀ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਤੁਰੰਤ ਐਮਰਜੈਂਸੀ ਡਾਕਟਰੀ ਸਹਾਇਤਾ (108 / 112) ਲਓ।"
            },
            "syncope": {
                "english": "Fainting combined with severe chest discomfort is a potential cardiac emergency requiring immediate medical assessment. Please seek emergency medical attention right now (108 / 112).",
                "hindi": "बेहोश होने के साथ सीने में तेज तकलीफ होना हृदय संबंधी आपातकाल का संकेत हो सकता है। कृपया तुरंत नजदीकी इमरजेंसी विभाग जाएं या आपातकालीन सहायता (108 / 112) लें।",
                "odia": "ମୂର୍ଚ୍ଛା ହେବା ସହିତ ଛାତିରେ ଯନ୍ତ୍ରଣା ଏକ ହୃଦୟ ସମ୍ବନ୍ଧୀୟ ଜରୁରୀ ସ୍ଥିତି ହୋଇପାରେ। ଦୟାକରି ତୁରନ୍ତ ଜରୁରୀକାଳୀନ ଚିକିତ୍ସା ସହାୟତା (108 / 112) ନିଅନ୍ତୁ।",
                "bengali": "অজ্ঞান হওয়ার সাথে বুকে তীব্র অস্বস্তি হৃদরোগজনিত জরুরি অবস্থার লক্ষণ হতে পারে। অনুগ্রহ করে এখনই জরুরি চিকিৎসা সহায়তা (108 / 112) নিন।",
                "telugu": "స్పృహ తప్పిపోవడంతో పాటు ఛాతీలో తీవ్రమైన నొప్పి ఉండటం గుండె సంబంధిత అత్యవసర పరిస్థితి కావచ్చు. దయచేసి వెంటనే అత్యవసర సహాయం (108 / 112) పొందండి.",
                "tamil": "மயக்கம் அடைவதுடன் நெஞ்சில் கடுமையான வலி இருப்பது இதய அவசரநிலையைக் குறிக்கலாம். தயவுசெய்து உடனடியாக அவசர மருத்துவ உதவியை (108 / 112) அணுகவும்.",
                "kannada": "ಪ್ರಜ್ಞೆ ತಪ್ಪುವುದರೊಂದಿಗೆ ಎದೆಯಲ್ಲಿ ತೀವ್ರ ನೋವು ಇರುವುದು ಹೃದಯ ಸಂಬಂಧಿತ ತುರ್ತು ಪರಿಸ್ಥಿತಿಯ ಸಂಕೇತವಾಗಿರಬಹುದು. ದಯವಿಟ್ಟು ತಕ್ಷಣ ತುರ್ತು ವೈದ್ಯಕೀಯ ಚಿಕಿತ್ಸೆ (108 / 112) ಪಡೆಯಿರಿ.",
                "malayalam": "ബോധക്ഷയത്തോടൊപ്പം കഠിനമായ നെഞ്ചുവേദന ഉണ്ടാകുന്നത് ഹൃദയസംബന്ധമായ അടിയന്തര സാഹചര്യമാകാം. ദയവായി ഉടൻ തന്നെ അടിയന്തര സഹായം (108 / 112) തേടുക.",
                "marathi": "चक्कर येऊन बेशुद्ध पडणे आणि छातीत तीव्र त्रास होणे ही हृदयविकाराची तातडीची स्थिती असू शकते. कृपया ताबडतोब आपत्कालीन मदत (108 / 112) घ्या.",
                "gujarati": "બેભાન થવાની સાથે છાતીમાં તીવ્ર અસ્વસ્થતા હૃદય સંબંધિત કટોકટી હોઈ શકે છે. કૃપા કરીને તરત જ કટોકટી તબીબી સહાય (108 / 112) લો.",
                "punjabi": "ਬੇਹੋਸ਼ ਹੋਣ ਦੇ ਨਾਲ ਛਾਤੀ ਵਿੱਚ ਤੇਜ਼ ਦਰਦ ਹੋਣਾ ਦਿਲ ਸੰਬੰਧੀ ਐਮਰਜੈਂਸੀ ਦਾ ਸੰਕੇਤ ਹੋ ਸਕਦਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਤੁਰੰਤ ਐਮਰਜੈਂਸੀ ਸਹਾਇਤਾ (108 / 112) ਲਓ।"
            },
            "confusion": {
                "english": "Sudden severe confusion or disorientation can be a sign of an acute medical condition that requires immediate emergency clinical evaluation. Please seek urgent medical assessment (108 / 112).",
                "hindi": "अचानक गंभीर भ्रम या भटकाव होना एक आपातकालीन लक्षण हो सकता है। कृपया तुरंत आपातकालीन चिकित्सा मूल्यांकन (108 / 112) कराएं।",
                "odia": "ହଠାତ୍ ପ୍ରବଳ ଭ୍ରମ ବା ଅସ୍ଥିରତା ଏକ ଜରୁରୀ ଚିକିତ୍ସା ଲକ୍ଷଣ ହୋଇପାରେ। ଦୟାକରି ତୁରନ୍ତ ଜରୁରୀକାଳୀନ ଚିକିତ୍ସା ମୂଲ୍ୟାୟନ କରାନ୍ତୁ।",
                "bengali": "হঠাৎ তীব্র বিভ্রান্তি একটি জরুরি লক্ষণ হতে পারে। অনুগ্রহ করে অবিলম্বে জরুরি চিকিৎসা মূল্যায়ন করান।",
                "telugu": "ఆకస్మిక తీవ్రమైన గందరగోళం అత్యవసర లక్షణం కావచ్చు. దయచేసి వెంటనే అత్యవసర వైద్య పరీక్ష చేయించుకోండి.",
                "tamil": "திடீர் தீவிர குழப்பம் அல்லது திசைதிருப்பல் அவசர மருத்துவ அறிகுறியாக இருக்கலாம். உடனடியாக அவசர மருத்துவ மதிப்பீட்டைப் பெறவும்.",
                "kannada": "ಹಠಾತ್ ತೀವ್ರ ಗೊಂದಲವು ತುರ್ತು ಲಕ್ಷಣವಾಗಿರಬಹುದು. ದಯವಿಟ್ಟು ತಕ್ಷಣ ತುರ್ತು ವೈದ್ಯಕೀಯ ತಪಾಸಣೆ ಮಾಡಿಸಿಕೊಳ್ಳಿ.",
                "malayalam": "പെട്ടെന്നുണ്ടാകുന്ന ആശയക്കുഴപ്പം അടിയന്തര ലക്ഷണമാകാം. ദയവായി ഉടൻ തന്നെ അടിയന്തര വൈദ്യപരിശോധന നടത്തുക.",
                "marathi": "अचानक तीव्र गोंधळ उडणे हे तातडीचे वैद्यकीय लक्षण असू शकते. कृपया त्वरित आपत्कालीन वैद्यकीय तपासणी करून घ्या.",
                "gujarati": "અચાનક ગંભીર મૂંઝવણ થવી એ કટોકટીનું લક્ષણ હોઈ શકે છે. કૃપા કરીને તાત્કાલિક કટોકટી તબીબી મૂલ્યાંકન મેળવો.",
                "punjabi": "ਅਚਾਨਕ ਗੰਭੀਰ ਉਲਝਣ ਹੋਣਾ ਇੱਕ ਐਮਰਜੈਂਸੀ ਲੱਛਣ ਹੋ ਸਕਦਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਤੁਰੰਤ ਐਮਰਜੈਂਸੀ ਡਾਕਟਰੀ ਜਾਂਚ ਕਰਵਾਓ।"
            }
        }

        category_map = replies.get(red_flag_type, replies["cardio"])
        return category_map.get(lang, category_map["english"])

    @classmethod
    def get_hallucination_reply(cls, language: str) -> str:
        lang = language if language in SUPPORTED_LANGUAGES else "english"
        replies = {
            "english": "I don't have access to your blood test results because no medical report has been uploaded in this session. Please upload your laboratory document or enter the specific values so I can assist you with an explanation.",
            "hindi": "मेरे पास आपके किसी रक्त परीक्षण परिणाम की जानकारी नहीं है, क्योंकि इस सत्र में कोई रिपोर्ट अपलोड नहीं की गई है। कृपया अपनी रिपोर्ट अपलोड करें ताकि मैं उसकी व्याख्या में सहायता कर सकूं।",
            "odia": "ମୋ ପାଖରେ ଆପଣଙ୍କର କୌଣସି ରକ୍ତ ପରୀକ୍ଷା ରିପୋର୍ଟ ଉପଲବ୍ଧ ନାହିଁ କାରଣ ଏହି ସେସନରେ କୌଣସି ଦଲିଲ ଅପଲୋଡ୍ କରାଯାଇନାହିଁ। ଦୟାକରି ଆପଣଙ୍କର ରିପୋର୍ଟ ଅପଲୋଡ୍ କରନ୍ତୁ ଯାହାଫଳରେ ମୁଁ ଏହା ବୁଝାଇବାରେ ସାହାଯ୍ୟ କରିପାରିବି।",
            "bengali": "আমার কাছে আপনার কোনো রক্ত পরীক্ষার ফলাফলের তথ্য নেই কারণ এই সেশনে কোনো রিপোর্ট আপলোড করা হয়নি। অনুগ্রহ করে আপনার রিপোর্ট আপলোড করুন যাতে আমি ফলাফল ব্যাখ্যায় সহায়তা করতে পারি।",
            "telugu": "ఈ సెషన్‌లో ఎలాంటి నివేదిక అప్‌లోడ్ చేయనందున నా వద్ద మీ రక్త పరీక్ష ఫలితాల సమాచారం లేదు. దయచేసి మీ ల్యాబ్ నివేదికను అప్‌లోడ్ చేయండి, తద్వారా నేను ఫలితాలను వివరించడంలో సహాయపడగలను.",
            "tamil": "இந்த அமர்வில் எந்த மருத்துவ அறிக்கையும் பதிவேற்றப்படாததால், உங்கள் இரத்த பரிசோதனை முடிவுகள் என்னிடம் இல்லை. தயவுசெய்து உங்கள் அறிக்கையைப் பதிவேற்றவும், அதனால் நான் விளக்க உதவ முடியும்.",
            "kannada": "ಈ ಅಧಿವೇಶನದಲ್ಲಿ ಯಾವುದೇ ವೈದ್ಯಕೀಯ ವರದಿಯನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡದಿರುವುದರಿಂದ ನನ್ನ ಬಳಿ ನಿಮ್ಮ ರಕ್ತ ಪರೀಕ್ಷೆಯ ಫಲಿತಾಂಶಗಳಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ವರದಿಯನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ, ಇದರಿಂದ ನಾನು ವಿವರಣೆಗೆ ಸಹಾಯ ಮಾಡಬಹುದು.",
            "malayalam": "ഈ സെഷനിൽ മെഡിക്കൽ റിപ്പോർട്ടുകളൊന്നും അപ്‌ലോഡ് ചെയ്യാത്തതിനാൽ നിങ്ങളുടെ രക്തപരിശോധനാ ഫലങ്ങൾ എന്റെ പക്കലില്ല. ഫലങ്ങൾ വിശദീകരിക്കാൻ സഹായിക്കുന്നതിന് ദയവായി നിങ്ങളുടെ റിപ്പോർട്ട് അപ്‌ലോഡ് ചെയ്യുക.",
            "marathi": "या सत्रात कोणताही अहवाल अपलोड केलेला नसल्यामुळे माझ्याकडे तुमच्या रक्त चाचणी निकालांची माहिती उपलब्ध नाही. कृपया तुमचा अहवाल अपलोड करा जेणेकरून मी त्याचे विश्लेषण करण्यात मदत करू शकेन.",
            "gujarati": "આ સત્રમાં કોઈ રિપોર્ટ અપલોડ થયો ન હોવાથી મારી પાસે તમારા બ્લડ ટેસ્ટ પરિણામોની માહિતી નથી. કૃપા કરીને તમારો રિપોર્ટ અપલોડ કરો જેથી હું વિશ્લેષણમાં મદદ કરી શકું.",
            "punjabi": "ਇਸ ਸੈਸ਼ਨ ਵਿੱਚ ਕੋਈ ਰਿਪੋਰਟ ਅੱਪਲੋਡ ਨਹੀਂ ਕੀਤੀ ਗਈ ਹੈ, ਇਸ ਲਈ ਮੇਰੇ ਕੋਲ ਤੁਹਾਡੇ ਖੂਨ ਦੇ ਟੈਸਟ ਦੇ ਨਤੀਜੇ ਨਹੀਂ ਹਨ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ਰਿਪੋਰਟ ਅੱਪਲੋਡ ਕਰੋ ਤਾਂ ਜੋ ਮੈਂ ਨਤੀਜੇ ਸਮਝਾਉਣ ਵਿੱਚ ਮਦਦ ਕਰ ਸਕਾਂ।"
        }
        return replies.get(lang, replies["english"])

    @classmethod
    def get_non_diagnostic_reply(cls, language: str) -> str:
        lang = language if language in SUPPORTED_LANGUAGES else "english"
        replies = {
            "english": "No, I cannot provide a definitive diagnosis or tell you for certain what disease you have. As an AI health assistant, I can provide educational information and triage guidance, but a formal clinical diagnosis requires an in-person physical examination, medical history, and clinical evaluation by a licensed physician.",
            "hindi": "नहीं, मैं किसी बीमारी का निश्चित निदान (Diagnosis) नहीं कर सकता। मैं एक एआई स्वास्थ्य सहायक हूँ जो शैक्षिक जानकारी और ट्राइएज मार्गदर्शन प्रदान करता है। सटीक निदान के लिए डॉक्टर द्वारा शारीरिक जांच और आवश्यक परीक्षण अनिवार्य हैं।",
            "odia": "ନା, ମୁଁ କୌଣସି ରୋଗର ନିର୍ଦ୍ଦିଷ୍ଟ ରୋଗ ନିର୍ଣ୍ଣୟ (Diagnosis) କରିପାରିବି ନାହିଁ। ମୁଁ ଏକ ଏଆଇ ସ୍ୱାସ୍ଥ୍ୟ ସହାୟକ ଯିଏ ଶିକ୍ଷଣୀୟ ସୂଚନା ଏବଂ ଟ୍ରାଇଏଜ୍ ମାର୍ଗଦର୍ଶନ ପ୍ରଦାନ କରେ। ସଠିକ୍ ରୋଗ ନିର୍ଣ୍ଣୟ ପାଇଁ ଡାକ୍ତରଙ୍କ ଦ୍ୱାରା ଶାରୀରିକ ପରୀକ୍ଷା ଆବଶ୍ୟକ।",
            "bengali": "না, আমি কোনো রোগের চূড়ান্ত নির্ণয় (Diagnosis) দিতে পারি না। আমি একজন এআই স্বাস্থ্য সহকারী যা শিক্ষামূলক তথ্য এবং ট্রায়াজ নির্দেশনা প্রদান করে। সঠিক রোগ নির্ণয়ের জন্য চিকিৎসকের শারীরিক পরীক্ষা প্রয়োজন।",
            "telugu": "లేదు, నేను నిర్దిష్ట వ్యాధి నిర్ధారణ (Diagnosis) చేయలేను. నేను విద్యా సమాచారం మరియు ట్రయాజ్ మార్గదర్శకత్వాన్ని అందించే ఏఐ ఆరోగ్య సహాయకుడిని. ఖచ్చితమైన నిర్ధారణ కోసం లైసెన్స్ పొందిన వైద్యుని ద్వారా శారీరక పరీక్ష అవసరం.",
            "tamil": "இல்லை, என்னால் உறுதியான நோய் கண்டறிதலை (Diagnosis) வழங்க முடியாது. நான் கல்வித் தகவல் மற்றும் ட்ரையേജ് வழிகாட்டுதலை வழங்கும் AI சுகாதார உதவியாளர். முறையான நோயறிதலுக்கு மருத்துவரிடம் நேரில் பரிசோதனை செய்வது அவசியம்.",
            "kannada": "ಇಲ್ಲ, ನಾನು ಯಾವುದೇ ರೋಗದ ಖಚಿತ ರೋಗನಿರ್ಣಯವನ್ನು (Diagnosis) ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ. ನಾನು ಶೈಕ್ಷಣಿಕ ಮಾಹಿತಿ ಮತ್ತು ಟ್ರಯೇಜ್ ಮಾರ್ಗದರ್ಶನ ನೀಡುವ ಎಐ ಆರೋಗ್ಯ ಸಹಾಯಕ. ನಿಖರವಾದ ರೋಗನಿರ್ಣಯಕ್ಕಾಗಿ ಪರವಾನಗಿ ಪಡೆದ ವೈದ್ಯರಿಂದ ವೈಯಕ್ತಿಕ ತಪಾಸಣೆ ಅಗತ್ಯ.",
            "malayalam": "ഇല്ല, എനിക്ക് കൃത്യമായ രോഗനിർണ്ണയം (Diagnosis) നൽകാൻ കഴിയില്ല. ഞാൻ വിദ്യാഭ്യാസ വിവരങ്ങളും ട്രയേജ് മാർഗ്ഗനിർദ്ദേശങ്ങളും നൽകുന്ന ഒരു AI ആരോഗ്യ സഹായിയാണ്. കൃത്യമായ രോഗനിർണ്ണയത്തിന് ഒരു ഡോക്ടറുടെ നേരിട്ടുള്ള പരിശോധന ആവശ്യമാണ്.",
            "marathi": "नाही, मी कोणत्याही आजाराचे निश्चित निदान (Diagnosis) करू शकत नाही. मी एक एआय आरोग्य सहाय्यक आहे जो शैक्षणिक माहिती आणि ट्रायज मार्गदर्शन प्रदान करतो. अचूक निदानासाठी डॉक्टरांकडून प्रत्यक्ष शारीरिक तपासणी आवश्यक आहे.",
            "gujarati": "ના, હું કોઈ રોગનું ચોક્કસ નિદાન (Diagnosis) કરી શકતો નથી. હું એક AI સ્વાસ્થ્ય સહાયક છું જે શૈક્ષણિક માહિતી અને ટ્રાયેજ માર્ગદર્શન પૂરું પાડે છે. ચોક્કસ નિદાન માટે લાયસન્સ પ્રાપ્ત ડૉક્ટર દ્વારા શારીરિક તપાસ જરૂરી છે.",
            "punjabi": "ਨਹੀਂ, ਮੈਂ ਕਿਸੇ ਬਿਮਾਰੀ ਦਾ ਨਿਸ਼ਚਿਤ ਨਿਦਾਨ (Diagnosis) ਨਹੀਂ ਕਰ ਸਕਦਾ। ਮੈਂ ਇੱਕ AI ਸਿਹਤ ਸਹਾਇਕ ਹਾਂ ਜੋ ਵਿਦਿਅਕ ਜਾਣਕਾਰੀ ਅਤੇ ਟ੍ਰਾਈਏਜ ਮਾਰਗਦਰਸ਼ਨ ਪ੍ਰਦਾਨ ਕਰਦਾ ਹੈ। ਸਹੀ ਨਿਦਾਨ ਲਈ ਡਾਕਟਰ ਦੁਆਰਾ ਸਰੀਰਕ ਜਾਂਚ ਲਾਜ਼ਮੀ ਹੈ।"
        }
        return replies.get(lang, replies["english"])

    @classmethod
    def get_fever_reply(cls, language: str) -> str:
        lang = language if language in SUPPORTED_LANGUAGES else "english"
        replies = {
            "english": "How long have you had the fever, and do you know what your temperature has been?",
            "hindi": "बुखार कितने दिनों से है, और क्या आपने थर्मामीटर से अपना तापमान नापा है?",
            "odia": "ଜ୍ୱର କେତେ ଦିନରୁ ହେଉଛି, ଏବଂ ଆପଣ ଥର୍ମୋମିଟରରେ ଶରୀରର ତାପମାତ୍ରା ମାପିଛନ୍ତି କି?",
            "bengali": "জ্বর কত দিন ধরে হচ্ছে, এবং আপনি কি থার্মোমিটার দিয়ে তাপমাত্রা মেপে দেখেছেন?",
            "telugu": "జ్వరం ఎన్ని రోజులుగా ఉంది, మరియు మీరు థర్మామీటర్‌తో ఉష్ణోగ్రతను కొలిచారా?",
            "tamil": "காய்ச்சல் எத்தனை நாட்களாக உள்ளது, மற்றும் தெர்மாமீட்டர் மூலம் உடல் வெப்பநிலையை அளவிட்டீர்களா?",
            "kannada": "ಜ್ವರ ಎಷ್ಟು ದಿನಗಳಿಂದ ಇದೆ, ಮತ್ತು ನೀವು ಥರ್ಮಾಮೀಟರ್ ಮೂಲಕ ದೇಹದ ತಾಪಮಾನವನ್ನು ಅಳೆದಿದ್ದೀರಾ?",
            "malayalam": "പനി എത്ര ദിവസമായി ഉണ്ട്, തെർമോമീറ്റർ ഉപയോഗിച്ച് താപനില പരിശോധിച്ചിരുന്നോ?",
            "marathi": "ताप किती दिवसांपासून आहे, आणि तुम्ही थर्मामीटरने शरीराचे तापमान तपासले आहे का?",
            "gujarati": "તાવ કેટલા દિવસથી છે, અને શું તમે થર્મોમીટરથી શરીરનું તાપમાન માપ્યું છે?",
            "punjabi": "ਬੁਖਾਰ ਕਿੰਨੇ ਦਿਨਾਂ ਤੋਂ ਹੈ, ਅਤੇ ਕੀ ਤੁਸੀਂ ਥਰਮਾਮੀਟਰ ਨਾਲ ਆਪਣਾ ਤਾਪਮਾਨ ਮਾਪਿਆ ਹੈ?"
        }
        return replies.get(lang, replies["english"])

    @classmethod
    def generate_intelligent_fallback_response(
        cls,
        messages: List[ChatMessage],
        preferred_language: str = "English",
        attachments: Optional[List[ChatDocumentAttachment]] = None
    ) -> PatientChatResponse:
        """
        Natural, context-aware, adaptive clinical conversational fallback.
        Supports 11 Indian and regional languages with safe triage decisions.
        """
        last_msg = messages[-1].content if messages else ""
        last_msg_lower = last_msg.lower().strip()
        
        # Determine previous turn language if multi-turn
        prev_lang = None
        if len(messages) > 1:
            for m in reversed(messages[:-1]):
                if m.role == "user" and m.content:
                    prev_lang = LanguageDetector.detect_language(m.content, None, None)
                    if prev_lang != "english":
                        break

        active_lang = LanguageDetector.detect_language(last_msg, preferred_language, prev_lang)

        # 0. Unsupported Language Check
        norm_pref = LanguageDetector.normalize_language_name(preferred_language)
        if norm_pref and norm_pref not in SUPPORTED_LANGUAGES and norm_pref != "auto":
            return PatientChatResponse(
                reply="I’m the Swasthya Triage Health Assistant. The requested language is currently not supported. Please select English or a supported regional language (such as Hindi, Odia, Bengali, Telugu, Tamil, Kannada, Malayalam, Marathi, Gujarati, or Punjabi) so I can assist you safely.",
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
            reply_text = NON_HEALTHCARE_STANDARD_REPLIES.get(active_lang, NON_HEALTHCARE_STANDARD_REPLIES["english"])
            return PatientChatResponse(
                reply=reply_text,
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

        # Check for emergency/red-flag triggers across all languages
        is_thunderclap = any(w in combined_lower for w in [
            "worst headache", "worst pain", "sudden severe headache",
            "सबसे तेज सिरदर्द", "ଅସହ୍ୟ ମୁଣ୍ଡବିନ୍ଧା", "তীব্র মাথাব্যথা",
            "తీవ్ర తలనొప్పి", "கடுமையான தலைவலி", "ತೀವ್ರ ತಲೆನೋವು", "കഠിനമായ തലവേദന", "खूप तीव्र डोकेदुखी", "ખૂબ તીવ્ર માથાનો દુખાવો", "ਬਹੁਤ ਤੇਜ਼ ਸਿਰਦਰਦ"
        ])
        
        is_cardio_red_flag = (
            ("crushing" in combined_lower or "severe chest" in combined_lower or "तेज दर्द" in combined_lower or "ଯନ୍ତ୍ରଣା" in combined_lower or "ব্যথা" in combined_lower or "నొప్పి" in combined_lower or "வலி" in combined_lower or "ನೋವು" in combined_lower or "വേദന" in combined_lower or "कळ" in combined_lower or "દુખાવો" in combined_lower or "ਦਰਦ" in combined_lower) and
            ("chest" in combined_lower or "सीने" in combined_lower or "ଛାତି" in combined_lower or "বুক" in combined_lower or "ఛాతీ" in combined_lower or "மார்பு" in combined_lower or "ನೆஞ்சு" in combined_lower or "ಎದೆ" in combined_lower or "നെഞ്ച്" in combined_lower or "छातीत" in combined_lower or "છાતી" in combined_lower or "ਛਾਤੀ" in combined_lower)
        ) or (
            ("chest" in combined_lower or "सीने" in combined_lower or "ଛାତି" in combined_lower or "বুক" in combined_lower or "ఛాతీ" in combined_lower or "மார்பு" in combined_lower or "ಎದೆ" in combined_lower or "നെഞ്ച്" in combined_lower or "छातीत" in combined_lower or "છાતી" in combined_lower or "ਛਾਤੀ" in combined_lower) and
            ("breath" in combined_lower or "सांस" in combined_lower or "ଶ୍ୱାସ" in combined_lower or "শ্বাস" in combined_lower or "శ్వాస" in combined_lower or "மூச்சு" in combined_lower or "ಉಸಿರು" in combined_lower or "ശ്വാസം" in combined_lower or "श्वास" in combined_lower or "શ્વાસ" in combined_lower or "ਸਾਹ" in combined_lower or "sweat" in combined_lower or "difficulty breathing" in combined_lower)
        )
        
        is_stroke_red_flag = (
            ("cannot move" in combined_lower or "cant move" in combined_lower or "one side" in combined_lower or "एक तरफ" in combined_lower or "ଗୋଟିଏ ପାର୍ଶ୍ୱ" in combined_lower or "একপাশে" in combined_lower or "ఒక వైపు" in combined_lower or "ஒரு பக்கம்" in combined_lower or "ಒಂದು ಬದಿ" in combined_lower or "ഒരു വശം" in combined_lower or "एका बाजूला" in combined_lower) and
            ("body" in combined_lower or "arm" in combined_lower or "face" in combined_lower or "speech" in combined_lower or "slur" in combined_lower or "बोलने" in combined_lower or "କଥା" in combined_lower or "কথা" in combined_lower or "మాట" in combined_lower or "பேச்சு" in combined_lower)
        )
        
        is_syncope_red_flag = (
            ("fainted" in combined_lower or "passed out" in combined_lower or "syncope" in combined_lower or "blacked out" in combined_lower or "बेहोश" in combined_lower or "ମୂର୍ଚ୍ଛା" in combined_lower or "অজ্ঞান" in combined_lower or "స్పృహ" in combined_lower or "மயக்கம்" in combined_lower) and
            ("chest" in combined_lower or "breath" in combined_lower or "heart" in combined_lower or "सीने" in combined_lower or "ଛାତି" in combined_lower or "বুক" in combined_lower or "ఛాతీ" in combined_lower)
        )
        
        is_dyspnea_red_flag = (
            "severe difficulty breathing" in combined_lower or "struggling to breathe" in combined_lower or "gasping" in combined_lower or
            "सांस लेने में बहुत" in combined_lower or "ଶ୍ୱାସକଷ୍ଟ" in combined_lower or "মারাত্মক শ্বাসকষ্ট" in combined_lower or "శ్వాస ఆడకపోవడం" in combined_lower or "மூச்சு திணறல்" in combined_lower
        )
        
        is_confusion_red_flag = (
            ("sudden" in combined_lower or "severe" in combined_lower or "अचानक" in combined_lower or "হঠাৎ" in combined_lower or "ఆకస్మిక" in combined_lower or "திடீர்" in combined_lower) and
            ("confusion" in combined_lower or "disoriented" in combined_lower or "altered mental" in combined_lower or "भ्रम" in combined_lower or "ଭ୍ରମ" in combined_lower or "বিভ্রান্তি" in combined_lower or "గందరగోళం" in combined_lower or "குழப்பம்" in combined_lower)
        )

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

        # If urgent, prioritize safety guidance immediately across all 11 languages
        if is_urgent and (is_thunderclap or is_cardio_red_flag or is_stroke_red_flag or is_syncope_red_flag or is_dyspnea_red_flag or is_confusion_red_flag or any(w in last_msg_lower for w in ["severe", "crushing", "worst", "can't catch", "sweating", "fainting", "confusion", "cannot move", "speech", "तेज", "ତୀବ୍ର", "তীব্র", "తీవ్ర", "கடுமையான", "ತೀವ್ರ", "കഠിനമായ"])):
            if is_stroke_red_flag:
                reply = cls.get_multilingual_emergency_reply(active_lang, "stroke")
            elif is_thunderclap:
                reply = cls.get_multilingual_emergency_reply(active_lang, "thunderclap")
            elif is_syncope_red_flag:
                reply = cls.get_multilingual_emergency_reply(active_lang, "syncope")
            elif is_dyspnea_red_flag:
                reply = cls.get_multilingual_emergency_reply(active_lang, "dyspnea")
            elif is_confusion_red_flag:
                reply = cls.get_multilingual_emergency_reply(active_lang, "confusion")
            else:
                reply = cls.get_multilingual_emergency_reply(active_lang, "cardio")

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

        # 2. Hallucination Guard (Asking for nonexistent records / lab results / hemoglobin level)
        if any(w in last_msg_lower for w in [
            "blood test result", "lab result", "my results from yesterday", "my report from yesterday",
            "what is my hemoglobin", "what was my hemoglobin", "mera hemoglobin", "mo hemoglobin",
            "हीमोग्लोबिन", "ହିମୋଗ୍ଲୋବିନ", "আমার হিমোগ্লোবিন", "হিমোগ্লোবিন", "నా హిమోగ్లోబిన్", "హిమోగ్లోబిన్",
            "என் ஹீமோகுளோபின்", "ஹீமோகுளோபின்", "ನನ್ನ ಹಿಮೋಗ್ಲೋಬಿನ್", "ಹಿಮೋಗ್ಲೋಬಿನ್", "എന്റെ ഹീമോഗ്ലോബിൻ", "ഹീമോഗ്ലോബിൻ",
            "माझे हिमोग्लोबिन", "हिमोग्लोबिन", "મારું હિમોગ્લોબિન", "હિમોગ્લોબિન", "ਮੇਰਾ ਹੀਮੋਗਲੋਬਿਨ", "ਹੀਮੋਗਲੋਬਿਨ"
        ]) and not attachments:
            return PatientChatResponse(
                reply=cls.get_hallucination_reply(active_lang),
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
        if any(w in last_msg_lower for w in ["diagnose", "can you diagnose", "certain what disease", "tell me for certain", "निदान", "ନିର୍ଣ୍ଣୟ", "রোগ নির্ণয়", "నిర్ధారణ", "நோயறிதல்", "ರೋಗನಿರ್ಣಯ", "രോഗനിർണ്ണയം"]):
            return PatientChatResponse(
                reply=cls.get_non_diagnostic_reply(active_lang),
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=["What symptoms can I share for triage?"],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if any(w in last_msg_lower for w in ["are you a doctor", "you a physician", "क्या आप डॉक्टर", "ଆପଣ ଡାକ୍ତର", "আপনি কি ডাক্তার"]):
            doctor_reply = (
                "नहीं, मैं डॉक्टर नहीं हूँ। मैं स्वास्थ ट्राइएज का एआई स्वास्थ्य सहायक हूँ, जिसे स्वास्थ्य जानकारी और लक्षणों को समझने में सहायता के लिए डिज़ाइन किया गया है।"
                if active_lang == "hindi" else
                "ନା, ମୁଁ ଡାକ୍ତର ନୁହେଁ। ମୁଁ ସ୍ୱାସ୍ଥ୍ୟ ଟ୍ରାଇଏଜ୍ ଏଆଇ ସ୍ୱାସ୍ଥ୍ୟ ସହାୟକ।"
                if active_lang == "odia" else
                "No, I am not a doctor or a licensed physician. I am the Swasthya Triage AI Health Assistant, designed to help you organize health information, understand general medical concepts, and prepare for a clinical consultation."
            )
            return PatientChatResponse(
                reply=doctor_reply,
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=[],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=True,
                model_name="deterministic-clinical-engine"
            )

        if any(w in last_msg_lower for w in ["ignore my doctor", "doctor's advice", "ignore doctor"]):
            advice_reply = (
                "नहीं, आपको अपने डॉक्टर की सलाह को कभी भी नजरअंदाज नहीं करना चाहिए। आपके डॉक्टर के पास आपका संपूर्ण व्यक्तिगत चिकित्सीय इतिहास होता है। यदि आपके मन में कोई संदेह है, तो कृपया अपने डॉक्टर से सीधे चर्चा करें।"
                if active_lang == "hindi" else
                "No, you should never ignore or override your doctor's medical advice based on an AI chatbot. Your treating clinician understands your comprehensive clinical history and diagnostic findings. If you have questions or feel uncertain, discuss them directly with your doctor."
            )
            return PatientChatResponse(
                reply=advice_reply,
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
                reply="It is vital to inform your doctor about all medications you take (including prescriptions, over-the-counter drugs, and herbal supplements) to avoid dangerous drug interactions, prevent duplicate therapies, detect side effects, and ensure safe dosing.",
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
                reply="If you missed a dose of your medication, check the patient information leaflet or contact your pharmacist or prescribing doctor, as instructions vary by specific drug. As a general rule, never take a double dose to make up for a missed one unless explicitly directed by your clinician.",
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
                reply="Common causes of dehydration include inadequate fluid intake, excessive sweating from heat or vigorous exercise, fever, vomiting, diarrhea, or increased urination. Mild dehydration can often be managed by regularly drinking water, while severe symptoms require prompt medical care.",
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
                reply="Healthy ways to stay hydrated include drinking water consistently throughout the day, eating water-rich fruits and vegetables (such as cucumbers and melons), and monitoring urine color (pale straw is ideal). Individual hydration needs vary depending on climate, activity level, and overall health.",
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
                reply="Common symptoms of a common cold include a runny or congested nose, sore throat, sneezing, mild cough, low-grade fever, and general mild fatigue. Colds are typically viral and resolve with rest and hydration, though worsening symptoms or high fevers should be evaluated by a healthcare provider.",
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
                reply="Sleep is essential for overall health because it supports immune system function, cellular and tissue repair, cardiovascular health, hormone regulation, and cognitive performance such as memory and focus.",
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
                reply="A fever is generally a sign that your body's immune system is actively fighting an infection (such as a virus or bacteria) or responding to inflammation. While fever itself is a natural defense mechanism, fevers that are persistent, very high, or accompanied by severe symptoms warrant clinical evaluation.",
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
                reply="Feeling tired for several days can stem from multiple factors including poor sleep quality, chronic stress, dehydration, nutritional deficiencies (such as anemia or vitamin D deficiency), or recovering from a viral illness. If fatigue is persistent or interferes with daily life, a doctor can order basic bloodwork to investigate.",
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
                reply="A sore throat with a cough is commonly caused by a viral upper respiratory infection, post-nasal drip, environmental irritation, or seasonal allergies. Supportive measures include warm fluids and rest. If you experience difficulty swallowing, high fever, or breathing trouble, seek medical attention promptly.",
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
                reply="When discussing dizziness with a healthcare provider, helpful context includes: whether the dizziness is constant or occurs when standing up, whether the room feels like it is spinning (vertigo), how long episodes last, your hydration levels, any medications you take, and whether you notice hearing changes or palpitations.",
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
                reply="When describing stomach pain to a doctor, key information to provide includes: the exact location (upper, lower, right, or left side), the nature of the pain (cramping, burning, dull, or sharp), when it began, whether food makes it better or worse, and associated symptoms such as nausea, vomiting, fever, or changes in bowel habits.",
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
                reply="A Complete Blood Count (CBC) is a common blood test that measures several key components of your blood, including Red Blood Cells (which carry oxygen), White Blood Cells (which fight infection), Hemoglobin (oxygen-binding protein), Hematocrit, and Platelets (which help blood clot). It is used for general health screening and checking for conditions like anemia or infection.",
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
                reply="Hemoglobin is an iron-rich protein inside red blood cells that carries oxygen from your lungs throughout the body and brings carbon dioxide back to the lungs. Testing hemoglobin levels helps clinicians screen for conditions like anemia (low levels) or other blood disorders.",
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
                reply="A high white blood cell (WBC) count, known as leukocytosis, most commonly indicates that the body's immune system is responding to an infection, inflammation, physical stress, or certain medications. Interpretation depends on clinical context and accompanying symptoms, rather than the isolated number alone.",
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
                reply="A reference range on a laboratory report is the interval of expected values derived from testing a large group of healthy individuals. Because reference ranges vary slightly between different testing laboratories and methodologies, an abnormal result is not an automatic diagnosis of disease and should always be correlated with your clinical symptoms by a doctor.",
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
                reply="If you are experiencing potentially severe symptoms (such as severe chest pain, inability to breathe, sudden numbness, or heavy bleeding), please seek emergency medical attention immediately. Otherwise, please describe your specific symptoms, when they began, and how they are affecting you so I can provide relevant guidance.",
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
                reply="A headache that worsens specifically upon standing can be related to positional changes, dehydration, or low cerebrospinal fluid pressure. Are you also noticing any dizziness, neck stiffness, or nausea when you stand up?",
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

            if active_lang == "hindi":
                if abnormal_items:
                    reply = f"मैंने आपका दस्तावेज़ ({att.file_name}) देखा है। इसमें {abnormal_items[0]} संदर्भ सीमा (Reference Range) से बाहर दिख रहा है। क्या आप चाहते हैं कि मैं पहले इस परिणाम का अर्थ समझाऊं?"
                else:
                    reply = f"मैंने आपका दस्तावेज़ ({att.file_name}) विश्लेषित किया है। क्या आप किसी विशिष्ट परिणाम के बारे में विस्तार से चर्चा करना चाहते हैं?"
            elif active_lang == "odia":
                reply = f"ମୁଁ ଆପଣଙ୍କ ଦଲିଲ ({att.file_name}) ଦେଖିଛି। ଏହି ରିପୋର୍ଟ ସମ୍ବନ୍ଧରେ ଆପଣଙ୍କର କୌଣସି ନିର୍ଦ୍ଦିଷ୍ଟ ପ୍ରଶ୍ନ ଅଛି କି?"
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

        # 7. Conversational symptom evaluation with adaptive, natural multi-turn tracking across languages
        has_burn = any(w in last_msg_lower for w in ["burn", "burned", "hot pan", "scald", "blister", "hot oil", "hot water", "जल गया", "ପୋଡ଼ି", "জ্বলে"])
        has_stomach = any(w in last_msg_lower for w in ["stomach", "abdomen", "abdominal", "belly", "पेट", "ପେଟ", "পেট", "కడుపు", "வயிறு", "ಹೊಟ್ಟೆ", "വയർ", "પેટ", "ਢਿੱਡ"])
        has_chest = any(w in last_msg_lower for w in ["chest", "सीने में", "ଛାତି", "বুক", "ఛాతీ", "மார்பு", "ಎದೆ", "നെഞ്ച്", "छातीत", "છાતી", "ਛਾਤੀ"])
        has_fever = any(w in last_msg_lower for w in ["fever", "बुखार", "temp", "temperature", "ଜ୍ୱର", "জ্বর", "జ్వరం", "காய்ச்சல்", "ಜ್ವರ", "പനി", "ताप", "તાવ", "ਬੁਖਾਰ"])
        has_headache = any(w in last_msg_lower for w in ["headache", "सिरदर्द", "ମୁଣ୍ଡବିନ୍ଧା", "মাথাব্যথা", "తలనొప్పి", "தலைவலி", "ತಲೆನೋವು", "തലവേദന", "डोकेदुखी", "માથાનો દુખાવો", "ਸਿਰਦਰਦ"]) or ("head" in last_msg_lower and "pain" in last_msg_lower)
        has_cough = any(w in last_msg_lower for w in ["cough", "खांसी", "କାଶ", "কাশি", "దగ్గు", "இருமல்", "ಕೆಮ್ಮು", "ചുമ", "खोकला", "ખાંસી", "ਖੰਘ"])
        has_rash = any(w in last_msg_lower for w in ["rash", "itching", "चकत्ते", "କୁଣ୍ଡାଇ", "চুলকানি", "துரத", "தினவு", "ತುರಿಕೆ", "ചൊറിച്ചിൽ", "खाज", "ખંજવાળ", "ਖਾਰਸ਼"])
        has_dizzy = any(w in last_msg_lower for w in ["dizzy", "dizziness", "weak", "चक्कर", "କମଜୋର", "মাথা ঘোরা", "కళ్ళు తిరగడం", "மயக்கம்", "ತಲೆತಿರುಗುವಿಕೆ", "തലകറക്കം", "चक्कर येणे", "ચક્કર", "ਚੱਕਰ"])

        reply = ""
        follow_ups: List[str] = []
        structured_symptoms: Dict[str, Any] = {"chief_complaint": "", "reported_symptoms": []}

        # FEVER FLOW (Evaluates in all 11 languages)
        if has_fever:
            structured_symptoms["chief_complaint"] = "Fever"
            structured_symptoms["reported_symptoms"].append("Fever")
            reply = cls.get_fever_reply(active_lang)
            follow_ups = ["About 2 days, around 101-102°F", "Started since yesterday"]

        # HEADACHE FLOW
        elif has_headache or ("headache" in combined_lower or "सिरदर्द" in combined_lower or "ମୁଣ୍ଡବିନ୍ଧା" in combined_lower):
            structured_symptoms["chief_complaint"] = "Headache"
            structured_symptoms["reported_symptoms"].append("Headache")

            # Multi-turn checks: location/onset answered or nausea associated
            if "nausea" in combined_lower or "nauseous" in last_msg_lower or "उल्टी" in last_msg_lower:
                if active_lang == "hindi":
                    reply = "सिरदर्द के साथ मतली (nausea) होना अक्सर माइग्रेन या तनाव से जुड़ा हो सकता है। क्या आपको तेज रोशनी या आवाज से भी परेशानी हो रही है?"
                elif active_lang == "odia":
                    reply = "ମୁଣ୍ଡବିନ୍ଧା ସହିତ ବାନ୍ତି ଭାବ ହେବା ମାଇଗ୍ରେନ୍ କିମ୍ବା ଗମ୍ଭୀର ଚାପର ଲକ୍ଷଣ ହୋଇପାରେ। ଆପଣଙ୍କୁ ଆଲୋକରେ କଷ୍ଟ ହେଉଛି କି?"
                else:
                    reply = "Nausea together with a one-sided headache can commonly indicate migraine or tension. Are you also experiencing any sensitivity to bright light, sound, or visual disturbances?"
                follow_ups = ["Yes, light bothers my eyes", "No sensitivity to light"]
            elif ("right side" in combined_lower or "left side" in combined_lower or "gradual" in combined_lower or "one side" in combined_lower):
                if active_lang == "hindi":
                    reply = "धन्यवाद। दर्द की गंभीरता 0 से 10 के पैमाने (scale) पर कितनी है, और क्या आपको पहले भी ऐसा सिरदर्द हुआ है?"
                elif active_lang == "odia":
                    reply = "ଧନ୍ୟବାଦ। ଯନ୍ତ୍ରଣା 0 ରୁ 10 ମଧ୍ୟରେ କେତେ ଗମ୍ଭୀର (scale) ଏବଂ ପୂର୍ବରୁ ଏପରି ହୋଇଛି କି?"
                else:
                    reply = "Thanks for providing that detail. How severe is the headache right now on a scale of 0 to 10, and have you had similar episodes in the past?"
                follow_ups = ["About 6 out of 10", "First time having this type of headache"]
            elif "what could cause" in last_msg_lower or "causes" in last_msg_lower or "कारण" in last_msg_lower or "କାରଣ" in last_msg_lower:
                if active_lang == "hindi":
                    reply = "सिरदर्द के कई सामान्य कारण हो सकते हैं, जैसे तनाव (Tension), माइग्रेन, निर्जलीकरण (Dehydration), या नींद की कमी। दर्द का स्वरूप और स्थान इसे समझने में मदद करता है। क्या दर्द एक तरफ धड़कन (throbbing) जैसा महसूस होता है?"
                elif active_lang == "odia":
                    reply = "ମୁଣ୍ଡବିନ୍ଧାର କାରଣଗୁଡ଼ିକ ମଧ୍ୟରେ ମାନସିକ ଚାପ, ମାଇଗ୍ରେନ୍, କିମ୍ବା ଶରୀରରେ ଜଳୀୟ ଅଂଶର ଅଭାବ ଅନ୍ତର୍ଭୁକ୍ତ ହୋଇପାରେ। ଦରଜ କେଉଁ ଅଂଶରେ ଅଧିକ ହେଉଛି?"
                else:
                    reply = "Headaches can have several causes, including tension, migraine, dehydration, lack of sleep, or sinus pressure. The pattern of pain and symptoms that occur with it help distinguish between them, though a chat alone cannot establish a diagnosis. Where exactly does the headache hurt most?"
                follow_ups = ["It feels like a throbbing pain on one side", "It feels like a tight band around my head"]
            else:
                if active_lang == "hindi":
                    reply = "मैं इसे बेहतर समझने में मदद कर सकता हूँ। सिर में दर्द ठीक किस जगह हो रहा है, और क्या यह अचानक शुरू हुआ या धीरे-धीरे बढ़ा?"
                elif active_lang == "odia":
                    reply = "ମୁଁ ଏହା ବୁଝିବାରେ ସାହାଯ୍ୟ କରିପାରିବି। ମୁଣ୍ଡର କେଉଁ ସ୍ଥାନରେ ଯନ୍ତ୍ରଣା ହେଉଛି, ଏବଂ ଏହା କେବେଠାରୁ ଆରମ୍ଭ ହେଲା?"
                else:
                    reply = "I can help you narrow this down. Where exactly does the headache hurt, and did it start suddenly or build up gradually?"
                follow_ups = ["It is mostly on the right side and started gradually", "It hurts behind my eyes"]

        # CHEST DISCOMFORT FLOW
        elif has_chest:
            structured_symptoms["chief_complaint"] = "Chest Discomfort"
            structured_symptoms["reported_symptoms"].append("Chest discomfort")
            if active_lang == "hindi":
                reply = "क्या यह बेचैनी या दर्द अभी इस समय हो रहा है? और क्या यह भारीपन, दबाव, या चुभने जैसा महसूस हो रहा है?"
            elif active_lang == "odia":
                reply = "ଏହି ଯନ୍ତ୍ରଣା ଏବେ ହେଉଛି କି? ଏବଂ ଏହା ଚାପ ଭଳି ନା ତୀବ୍ର ବିନ୍ଧା ଭଳି ଲାଗୁଛି?"
            else:
                reply = "Is this discomfort happening right now? And does it feel like tightness, pressure, or a sharp pain?"
            follow_ups = ["It feels like pressure on my chest", "It is happening right now"]

        # STOMACH PAIN FLOW
        elif has_stomach:
            structured_symptoms["chief_complaint"] = "Abdominal Pain"
            structured_symptoms["reported_symptoms"].append("Stomach pain")
            if active_lang == "hindi":
                reply = "पेट में दर्द किस हिस्से में हो रहा है (ऊपर, नाभि के पास, या नीचे)? और क्या इसके साथ उल्टी, दस्त, या गैस की समस्या है?"
            elif active_lang == "odia":
                reply = "ପେଟର କେଉଁ ଅଂଶରେ ଯନ୍ତ୍ରଣା ହେଉଛି? ଏବଂ ଏହା ସହିତ ବାନ୍ତି କିମ୍ବା ଝାଡ଼ା ହେଉଛି କି?"
            else:
                reply = "Where in your stomach do you feel the pain, and is it accompanied by any nausea, vomiting, or diarrhea?"
            follow_ups = ["Upper stomach, feeling nauseous", "Lower right side pain"]

        # BURN INJURY FLOW
        elif has_burn:
            structured_symptoms["chief_complaint"] = "Burn injury"
            structured_symptoms["reported_symptoms"] = ["Burn", "Pain"]
            if active_lang == "hindi":
                reply = "जलने पर तुरंत जले हुए हिस्से को 10 से 20 मिनट तक ठंडे बहते नल के पानी के नीचे रखें। बर्फ या टूथपेस्ट न लगाएं। क्या त्वचा पर छाले बने हैं?"
            else:
                reply = "For an acute burn, immediately hold the burned area under cool running tap water for 10 to 20 minutes to reduce tissue heat and swelling. Do NOT apply ice, butter, or toothpaste, and do not pop any blisters. Is there blistering or mainly redness?"
            follow_ups = ["Mainly redness and stinging pain", "Small blister starting to form"]

        # RASH FLOW
        elif has_rash:
            structured_symptoms["chief_complaint"] = "Skin Rash"
            structured_symptoms["reported_symptoms"].append("Rash")
            if active_lang == "hindi":
                reply = "यह चकत्ता (rash) शरीर के किस हिस्से में है, और क्या इसमें खुजली, दर्द, या सूजन हो रही है?"
            else:
                reply = "Where is the rash located on your body, and is it itchy, painful, or spreading?"
            follow_ups = ["On my arms and chest, very itchy", "On my face, slightly painful"]

        # DIZZINESS / WEAKNESS FLOW
        elif has_dizzy:
            structured_symptoms["chief_complaint"] = "Dizziness / Weakness"
            structured_symptoms["reported_symptoms"].append("Dizziness")
            if active_lang == "hindi":
                reply = "क्या चक्कर लगातार आ रहे हैं, या मुख्य रूप से खड़े होने और चलने पर महसूस होते हैं?"
            else:
                reply = "Has the dizziness been constant, or does it mainly happen when you stand up or move around?"
            follow_ups = ["Mainly when standing up quickly", "It feels constant all day"]

        # GENERAL FALLBACK
        else:
            if active_lang == "hindi":
                reply = "मैंने आपका विवरण समझ लिया है। इसे और स्पष्ट करने के लिए: यह समस्या कब शुरू हुई, और क्या यह समय के साथ बढ़ रही है?"
            elif active_lang == "odia":
                reply = "ମୁଁ ଆପଣଙ୍କ ବିବରଣୀ ବୁଝିପାରିଲି। ଏହି ସମସ୍ୟା କେବେ ଆରମ୍ଭ ହେଲା ଏବଂ ଏହା ବଢୁଛି କି?"
            elif active_lang == "bengali":
                reply = "আমি আপনার কথা বুঝতে পেরেছি। এই সমস্যাটি কখন শুরু হয়েছিল এবং এটি কি বাড়ছে?"
            elif active_lang == "telugu":
                reply = "నేను మీ సమస్యను అర్థం చేసుకున్నాను. ఈ సమస్య ఎప్పుడు ప్రారంభమైంది మరియు ఇది పెరుగుతోందా?"
            elif active_lang == "tamil":
                reply = "உங்கள் நிலையை நான் புரிந்துகொள்கிறேன். இந்த பிரச்சனை எப்போது தொடங்கியது, இது தீவிரமடைகிறதா?"
            elif active_lang == "kannada":
                reply = "ನಿಮ್ಮ ವಿವರಣೆಯನ್ನು ನಾನು ಅರ್ಥಮಾಡಿಕೊಂಡಿದ್ದೇನೆ. ಈ ಸಮಸ್ಯೆ ಯಾವಾಗ ಪ್ರಾರಂಭವಾಯಿತು ಮತ್ತು ಇದು ಹೆಚ್ಚಾಗುತ್ತಿದೆಯೇ?"
            elif active_lang == "malayalam":
                reply = "നിങ്ങളുടെ അവസ്ഥ ഞാൻ മനസ്സിലാക്കുന്നു. ഈ പ്രശ്നം എപ്പോഴാണ് ആരംഭിച്ചത്, ഇത് കൂടുന്നുണ്ടോ?"
            elif active_lang == "marathi":
                reply = "मी तुमचे म्हणणे समजून घेतले आहे. ही समस्या कधी सुरू झाली आणि ती वाढत आहे का?"
            elif active_lang == "gujarati":
                reply = "મેં તમારી વિગત સમજી લીધી છે. આ સમસ્યા ક્યારે શરૂ થઈ અને શું તે વધી રહી છે?"
            elif active_lang == "punjabi":
                reply = "ਮੈਂ ਤੁਹਾਡਾ ਵੇਰਵਾ ਸਮਝ ਲਿਆ ਹੈ। ਇਹ ਸਮੱਸਿਆ ਕਦੋਂ ਸ਼ੁਰੂ ਹੋਈ ਅਤੇ ਕੀ ਇਹ ਵੱਧ ਰਹੀ ਹੈ?"
            else:
                reply = "I understand what you're experiencing. When did this first start, and is it getting better or worse?"
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
        Executes Gemini with multilingual prompt instructions, falling back to deterministic clinical engine.
        """
        if not request.messages:
            return cls.generate_intelligent_fallback_response(
                messages=[],
                preferred_language=request.preferred_language or "English",
                attachments=request.attachments
            )

        last_msg = request.messages[-1].content
        active_lang = LanguageDetector.detect_language(last_msg, request.preferred_language, None)

        # Unsupported Language Check
        norm_pref = LanguageDetector.normalize_language_name(request.preferred_language)
        if norm_pref and norm_pref not in SUPPORTED_LANGUAGES and norm_pref != "auto":
            return PatientChatResponse(
                reply="I’m the Swasthya Triage Health Assistant. The requested language is currently not supported. Please select English or a supported regional language (such as Hindi, Odia, Bengali, Telugu, Tamil, Kannada, Malayalam, Marathi, Gujarati, or Punjabi) so I can assist you safely.",
                is_healthcare_related=True,
                urgency_detected=False,
                urgency_level="routine",
                urgency_reasons=[],
                follow_up_questions=[],
                suggested_actions=["Start Symptom Intake"],
                fallback_used=False,
                model_name="unsupported-language-filter"
            )

        # Off-topic domain check
        if not cls.is_query_healthcare_related(last_msg):
            reply_text = NON_HEALTHCARE_STANDARD_REPLIES.get(active_lang, NON_HEALTHCARE_STANDARD_REPLIES["english"])
            return PatientChatResponse(
                reply=reply_text,
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

        target_lang_display = LANGUAGE_DISPLAY_NAMES.get(active_lang, "English")

        prompt_body = f"""DETECTED PATIENT LANGUAGE: {target_lang_display} ({active_lang})
PATIENT PREFERRED LANGUAGE: {request.preferred_language or 'Auto Detect'}
PATIENT ID: {request.patient_id or 'Anonymous'}
{attachments_str}

CONVERSATION HISTORY (Most recent message is at the end):
{history_str}

Remember:
- You MUST generate your response ('reply' field) naturally and fluently in {target_lang_display} ({active_lang}).
- Ask at most 1 or 2 high-value questions.
- Never repeat questions for things the patient already answered.
- Speak naturally and conversationally without question checklists.
- Adhere strictly to the non-diagnostic and safety directives.
- Preserve extracted clinical values (e.g. 9.2 g/dL) verbatim."""

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
            async with httpx.AsyncClient(timeout=2.0) as client:
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
