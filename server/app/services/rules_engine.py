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
            "keywords_a": [
                "chest pain", "angina", "pressure in chest", "chest discomfort", "chest heaviness", "chest",
                "सीने में", "छाती में", "सीने", "छाती",
                "ଛାତିରେ", "ଛାତି", "ଛାତିରେ ଯନ୍ତ୍ରଣା", "ଛାତିରେ ବ୍ୟଥା",
                "বুকে", "বুক", "বুকে ব্যথা", "বুকে চাপ",
                "ఛాతీలో", "ఛాతీ", "ఛాతీలో నొప్పి", "ఛాతీ నొప్పి",
                "நெஞ்சு", "மார்பு", "நெஞ்சு வலி", "மார்பு வலி",
                "ಎದೆ", "ಎದೆಯಲ್ಲಿ", "ಎದೆ ನೋವು", "ಎದೆಯಲ್ಲಿ ನೋವು",
                "നെഞ്ച്", "നെഞ്ചിൽ", "നെഞ്ചുവേദന", "നെഞ്ചിൽ വേദന",
                "छातीत", "छातीत दुखणे", "छातीत कळ",
                "છાતીમાં", "છાતી", "છાતીમાં દુખાવો",
                "ਛਾਤੀ ਵਿੱਚ", "ਛਾਤੀ ਚ", "ਛਾਤੀ ਵਿੱਚ ਦਰਦ",
                "chhati", "buke", "seene", "nenju", "ede novu", "nenjuvethana", "chhatit"
            ],
            "keywords_b": [
                "breathless", "breathing difficulty", "difficulty in breathing", "shortness of breath", "dyspnea", "gasping", "breath",
                "सांस लेने", "सांस", "दम फूलना", "सांस में तकलीफ",
                "ଶ୍ୱାସ", "ଶ୍ୱାସକଷ୍ଟ", "ନିଶ୍ୱାସ", "ଶ୍ୱାସ ନେବାରେ ଅସୁବିଧା",
                "শ্বাস", "শ্বাসকষ্ট", "নিঃশ্বাস", "শ্বাস নিতে কষ্ট",
                "శ్వాస", "శ్వాస తీసుకోవడంలో ఇబ్బంది", "శ్వాస ఆడకపోవడం",
                "மூச்சு", "மூச்சு திணறல்", "மூச்சு விடுவதில் சிரமம்",
                "ಉಸಿರು", "ಉಸಿರಾಟ", "ಉಸಿರಾಟದ ತೊಂದರೆ", "ಉಸಿರಾಡಲು ಕಷ್ಟ",
                "ശ്വാസം", "ശ്വാസമെടുക്കാൻ ബുദ്ധിമുട്ട്", "ശ്വാസതടസ്സം",
                "श्वास", "श्वास घेण्यास त्रास", "दम लागणे",
                "શ્વાસ", "શ્વાસ લેવામાં તકલીફ", "શ્વાસ ચડવો",
                "ਸਾਹ", "ਸਾਹ ਲੈਣ ਵਿੱਚ ਤਕਲੀਫ਼", "ਸਾਹ ਚੜ੍ਹਨਾ",
                "swas", "swaskosto", "shwas", "moochu", "usirata", "saah"
            ],
            "level": "immediate_attention",
            "signal": "Potential Acute Cardiorespiratory Distress Signal",
            "reason": "Deterministic rule match: Combined chest discomfort and breathing difficulty requires prioritized human evaluation."
        },
        {
            "id": "RULE-002",
            "name": "Severe Febrile with Meningeal / Neurological Signs",
            "keywords_a": [
                "high fever", "fever", "tezz bukhar", "तेज बुखार", "बुखार",
                "ଜ୍ୱର", "ପ୍ରବଳ ଜ୍ୱର", "ତୀବ୍ର ଜ୍ୱର",
                "জ্বর", "তীব্র জ্বর", "বেশি জ্বর",
                "జ్వరం", "తీవ్ర జ్వరం", "అధిక జ్వరం",
                "காய்ச்சல்", "அதிக காய்ச்சல்",
                "ಜ್ವರ", "ತೀವ್ರ ಜ್ವರ",
                "പനി", "കഠിനമായ പനി",
                "ताप", "तीव्र ताप", "खूप ताप",
                "તાવ", "તીવ્ર તાવ", "વધારે તાવ",
                "ਬੁਖਾਰ", "ਤੇਜ਼ ਬੁਖਾਰ",
                "jwara", "jor", "jwaram", "kaichal", "pani", "tap", "tav", "bukhar"
            ],
            "keywords_b": [
                "stiff neck", "neck rigidity", "neck pain", "altered consciousness", "confusion",
                "गर्दन में अकड़न", "गर्दन में दर्द", "गर्दन",
                "ବେକରେ ଯନ୍ତ୍ରଣା", "ବେକ ଅକ୍ଷମ", "ବେକ",
                "ঘাড় শক্ত", "ঘাড়ে ব্যথা", "ঘাড়",
                "మెడ నొప్పి", "మెడ పట్టేయడం", "మెడ",
                "கழுத்து வலி", "கழுத்து விறைப்பு", "கழுத்து",
                "ಕುತ್ತಿಗೆ ನೋವು", "ಕುತ್ತಿಗೆ",
                "കഴുത്തു വേദന", "കഴുത്ത്",
                "मानेत ताठरता", "मान दुखणे", "मान",
                "ગરદન જકડાઈ જવી", "ગરદનમાં દુખાવો", "ગરદન",
                "ਧੌਣ ਵਿੱਚ ਆਕੜਨ", "ਧੌਣ ਦਰਦ", "ਧੌਣ"
            ],
            "level": "immediate_attention",
            "signal": "High Febrile State with Neurological Signs",
            "reason": "Deterministic rule match: High fever accompanied by neck stiffness or altered mental state requires urgent clinical triage."
        },
        {
            "id": "RULE-003",
            "name": "Obstetric Emergency Bleeding",
            "keywords_a": [
                "pregnant", "pregnancy", "trimester", "गर्भवती", "गर्भ",
                "ଗର୍ଭବତୀ", "ଗର୍ଭ", "গর্ভবতী", "গর্ভ", "గర్భవతి", "గర్భం",
                "கர்ப்பிணி", "கர்ப்பம்", "ಗರ್ಭಿಣಿ", "ಗರ್ಭ", "ഗർഭിണി", "ഗർഭം",
                "गरोदर", "ગર્ભવતી", "ગર્ભાવસ્થા", "ਗਰਭਵਤੀ"
            ],
            "keywords_b": [
                "bleeding", "heavy bleeding", "hemorrhage", "रक्तस्राव", "खून बहना", "खून",
                "ରକ୍ତସ୍ରାବ", "ରକ୍ତ ପଡ଼ିବା", "রক্তপাত", "রক্তক্ষরণ", "రక్తస్రావం", "రక్తం",
                "இரத்தப்போக்கு", "ரத்தம்", "ರಕ್ತಸ್ರಾವ", "ರಕ್ತ", "രക്തസ്രാവം", "ചോര",
                "रक्तस्त्राव", "रक्त", "લોહી નીકળવું", "લોહી", "ਖੂਨ ਵਗਣਾ", "ਖੂਨ"
            ],
            "level": "immediate_attention",
            "signal": "Obstetric Vaginal Bleeding Alert",
            "reason": "Deterministic rule match: Active bleeding during pregnancy requires immediate emergency physician review."
        },
        {
            "id": "RULE-004",
            "name": "Severe Isolated Respiratory Failure",
            "keywords_a": [
                "severe shortness of breath", "gasping for air", "unable to breathe", "severe breathing difficulty",
                "सांस लेने में बहुत ज्यादा तकलीफ", "दम घुट रहा है",
                "ନିଶ୍ୱାସ ନେଇପାରୁନାହିଁ", "ଶ୍ୱାସକଷ୍ଟ ବହୁତ ବେଶୀ",
                "শ্বাস নিতে পারছি না", "মারাত্মক শ্বাসকষ্ট",
                "శ్వాస అసలు ఆడటం లేదు", "తీవ్రమైన శ్వాస ఇబ్బంది",
                "மூச்சு விடவே முடியவில்லை", "கடுமையான மூச்சு திணறல்",
                "ಉಸಿರಾಡಲು ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ", "ತೀವ್ರ ಉಸಿರಾಟದ ತೊಂದರೆ",
                "ശ്വാസമെടുക്കാൻ ഒട്ടും സാധിക്കുന്നില്ല",
                "श्वास घेणे अशक्य होत आहे",
                "શ્વાસ લેવો ખૂબ મુશ્કેલ છે",
                "ਸਾਹ ਲੈਣਾ ਬਹੁਤ ਔਖਾ ਹੈ"
            ],
            "keywords_b": None,
            "level": "immediate_attention",
            "signal": "Severe Acute Respiratory Impairment Signal",
            "reason": "Deterministic rule match: Marked respiratory distress identified."
        },
        {
            "id": "RULE-005",
            "name": "Acute Abdominal Guarding / Rigidity",
            "keywords_a": [
                "severe abdominal pain", "stomach pain", "acute abdomen",
                "पेट में तेज दर्द", "पेट में दर्द", "पेट दर्द",
                "ପେଟରେ ପ୍ରବଳ ଯନ୍ତ୍ରଣା", "ପେଟ ବ୍ୟଥା", "ପେଟ ଦରଜ",
                "পেটে তীব্র ব্যথা", "পেট ব্যথা",
                "కడుపులో తీవ్రమైన నొప్పి", "కడుపు నొప్పి",
                "வயிற்றில் கடுமையான வலி", "வயிற்று வலி",
                "ಹೊಟ್ಟೆಯಲ್ಲಿ ತೀವ್ರ ನೋವು", "ಹೊಟ್ಟೆ ನೋವು",
                "വയറ്റിൽ കഠിനമായ വേദന", "വയറുവേദന",
                "पोटात तीव्र वेदना", "पोटदुखी",
                "પેટમાં તીવ્ર દુખાવો", "પેટનો દુખાવો",
                "ਢਿੱਡ ਵਿੱਚ ਤੇਜ਼ ਦਰਦ", "ਢਿੱਡ ਦਰਦ", "ਪੇਟ ਦਰਦ",
                "pet dard", "petare byatha", "pet betha", "kadupu noppi", "vayiṟu vali", "hotte novu", "vayaruvethana", "pot dukhne"
            ],
            "keywords_b": [
                "vomiting", "rigid", "guarding", "उल्टी", "चक्कर", "दौरा",
                "ବାନ୍ତି", "ଝାଡ଼ା", "বমি", "வாంతులు", "வாந்தி", "ವಾಂತಿ", "ഛർദ്ദി", "उलटी", "ઉલટી", "ਉਲਟੀ",
                "vomit", "dizzy", "guarding"
            ],
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
