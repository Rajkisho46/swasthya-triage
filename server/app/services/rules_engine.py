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

    CLINICAL SAFETY DISCLAIMER:
    These deterministic safety rules serve strictly as automated screening triggers
    for prioritized human clinician triage review. Automated unit and regression test
    passage does NOT constitute clinical validation. Formal review, validation, and sign-off
    by qualified clinical specialists are mandatory prior to real-world clinical deployment.
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
                "breathlessness at rest", "breathless at rest", "shortness of breath at rest", "dyspnea at rest",
                "difficulty breathing at rest", "breathing trouble at rest", "struggling to breathe at rest",
                "breathless even at rest", "short of breath at rest", "trouble breathing at rest",
                "orthopnea", "cannot breathe lying down", "gasping at rest",
                "सांस लेने में बहुत ज्यादा तकलीफ", "दम घुट रहा है", "बैठे हुए भी सांस फूलना", "आराम करते समय सांस में तकलीफ",
                "ନିଶ୍ୱାସ ନେଇପାରୁନାହିଁ", "ଶ୍ୱାସକଷ୍ଟ ବହୁତ ବେଶୀ", "ବିଶ୍ରାମ ସମୟରେ ଶ୍ୱାସକଷ୍ଟ",
                "শ্বাস নিতে পারছি না", "মারাত্মক শ্বাসকষ্ট", "বিশ্রামের সময় শ্বাসকষ্ট",
                "శ్వాస అసలు ఆడటం లేదు", "తీవ్రమైన శ్వాస ఇబ్బంది", "విశ్రాంతి సమయంలో శ్వాస ఆడకపోవడం",
                "மூச்சு விடவே முடியவில்லை", "கடுமையான மூச்சு திணறல்", "ஓய்வில் மூச்சு திணறல்",
                "ಉಸಿರಾಡಲು ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ", "ತೀವ್ರ ಉಸಿರಾಟದ ತೊಂದರೆ", "ವಿಶ್ರಾಂತಿಯಲ್ಲಿ ಉಸಿರಾಟದ ತೊಂದರೆ",
                "ശ്വാസമെടുക്കാൻ ഒട്ടും സാധിക്കുന്നില്ല", "വിശ്രമിക്കുമ്പോഴും ശ്വാസംമുട്ടൽ",
                "श्वास घेणे अशक्य होत आहे", "विश्रांतीच्या वेळी श्वास घेण्यास त्रास",
                "શ્વાસ લેવો ખૂબ મુશ્કેલ છે", "વિશ્રામ સમયે શ્વાસ લેવામાં તકલીફ",
                "ਸਾਹ ਲੈਣਾ ਬਹੁਤ ਔਖਾ ਹੈ", "ਅਰਾਮ ਕਰਨ ਵੇਲੇ ਸਾਹ ਚੜ੍ਹਨਾ"
            ],
            "keywords_b": None,
            "level": "immediate_attention",
            "signal": "Severe Acute Respiratory Impairment Signal",
            "reason": "Deterministic rule match: Marked respiratory distress / breathlessness at rest identified."
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
                "ବାନ୍ତି", "ଝାଡ଼ା", "বমি", "வாம்తులు", "வாந்தி", "ವಾಂತಿ", "ഛർദ്ദി", "उलटी", "ઉલટી", "ਉਲਟੀ",
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
        },
        {
            "id": "RULE-007",
            "name": "Hemoptysis / Airway Hemorrhage",
            "keywords_a": [
                "hemoptysis", "blood in cough", "blood in the cough", "blood in coughing", "coughing blood", "coughing up blood",
                "cough with blood", "coughing with blood", "blood with cough", "bloody cough", "blood while coughing",
                "blood in sputum", "blood in the sputum", "blood in phlegm", "blood in the phlegm", "spitting blood", "spitting up blood",
                "cough with hemoptysis", "bloody sputum", "bloody phlegm", "blood tinged sputum", "blood-tinged sputum",
                "pink frothy sputum", "coughing pink frothy", "blood stained sputum", "blood-stained sputum",
                "खांसी में खून", "खून की खांसी", "बलगम में खून", "खूनी खांसी", "khansi me khoon", "khoon ki khansi",
                "balgam me khoon", "khansi mein khoon", "khasi me khun",
                "କାଶରେ ରକ୍ତ", "କାଶ ସହ ରକ୍ତ", "ରକ୍ତ କାଶ", "କଫରେ ରକ୍ତ", "rakta kasha",
                "কাশিতে রক্ত", "কাশির সাথে রক্ত", "রক্ত কাশি", "কফে রক্ত", "kashite rokto",
                "దగ్గులో రక్తం", "రక్తం దగ్గు", "కఫంలో రక్తం", "daggulo raktam",
                "இருமலில் இரத்தம்", "இரத்த இருமல்", "சளியில் இரத்தம்", "irumalil ratham",
                "ಕೆಮ್ಮಿನಲ್ಲಿ ರಕ್ತ", "ರಕ್ತದ ಕೆಮ್ಮು", "ಕಫದಲ್ಲಿ ರಕ್ತ", "kemminalli rakta",
                "ചുമയിൽ രക്തം", "രക്തം ചുമയ്ക്കുക", "കഫത്തിൽ രക്തം", "chumayil raktham",
                "खोकल्यातून रक्त", "रक्ताची खोकला", "थुंकीत रक्त",
                "ખાંસીમાં લોહી", "લોહીવાળી ખાંસી", "કફમાં લોહી",
                "ਖੰਘ ਵਿੱਚ ਖੂਨ", "ਖੂਨ ਦੀ ਖੰਘ", "ਬਲਗ਼ਮ ਵਿੱਚ ਖੂਨ"
            ],
            "keywords_b": None,
            "level": "immediate_attention",
            "signal": "Hemoptysis / Acute Airway Hemorrhage Signal",
            "reason": "Deterministic rule match: Blood in cough or sputum (hemoptysis) requires immediate physician assessment to rule out acute pulmonary hemorrhage or serious underlying pathology."
        },
        {
            "id": "RULE-008",
            "name": "High Grade Febrile State",
            "keywords_a": [
                "102f", "102 f", "102°f", "102 degrees", "102.", "103f", "103 f", "103°f", "104f", "104 f", "104°f", "105f", "105 f", "105°f",
                "38.9°c", "38.9 c", "39°c", "39 c", "39.5°c", "40°c", "40 c", "40.5°c", "41°c",
                "high fever", "very high fever", "severe fever", "persistent fever", "prolonged fever",
                "fever of 102", "fever 102", "fever of approximately 102", "fever around 102", "fever ~102",
                "fever of 103", "fever 103", "fever of 104", "fever 104", "102 degree fever", "102 f fever", "102°f fever",
                "tezz bukhar", "tej bukhar", "तेज बुखार", "तीव्र ज्वर", "ପ୍ରବଳ ଜ୍ୱର", "ତୀବ୍ର ଜ୍ୱର",
                "তীব্র জ্বর", "తీవ్ర జ్వరం", "அதிக காய்ச்சல்", "ತೀವ್ರ ಜ್ವರ", "കഠിനമായ പനി",
                "तीव्र ताप", "ખૂબ તાવ", "ਤੇਜ਼ ਬੁਖਾਰ"
            ],
            "keywords_b": None,
            "level": "attention_required",
            "signal": "High Grade Fever Clinical Assessment Alert",
            "reason": "Deterministic rule match: Documented high fever (>=102°F / 38.9°C or persistent high febrile trajectory) warrants priority clinical workup for severe infection."
        },
        {
            "id": "RULE-009",
            "name": "Febrile Respiratory Distress / Compromise",
            "keywords_a": [
                "fever", "bukhar", "बुखार", "ଜ୍ୱର", "জ্বর", "జ్వరం", "காய்ச்சல்", "ಜ್ವರ", "പനി", "ताप", "તાવ", "ਬੁਖਾਰ",
                "temp", "101", "102", "103", "104", "febrile", "pyrexia"
            ],
            "keywords_b": [
                "breathless", "shortness of breath", "dyspnea", "breathing difficulty", "difficulty breathing",
                "gasping", "breathlessness at rest", "breathless at rest", "shortness of breath at rest",
                "hemoptysis", "blood in cough", "blood in the cough", "coughing blood", "सांस", "दम फूलना",
                "ଶ୍ୱାସ", "শ্বাস", "శ్వାస", "மூச்சு", "ಉಸಿರು", "ശ്വാസം", "श्वास", "શ્વાસ", "ਸਾਹ"
            ],
            "level": "immediate_attention",
            "signal": "Febrile Acute Respiratory Distress Signal",
            "reason": "Deterministic rule match: Co-occurring fever and respiratory distress or airway hemorrhage indicates significant risk of acute lower respiratory infection or compromise."
        }
    ]

    @classmethod
    def evaluate(cls, combined_text: str) -> List[UrgencySignalSchema]:
        """
        Evaluate text against deterministic clinical safety rules.
        Applies phrase normalization, punctuation decoupling, and regex pattern matching.
        """
        if not combined_text:
            return []

        # 1. Normalize text: collapse whitespace, lowercase, normalize degree symbols
        raw_lower = combined_text.lower()
        norm_text = re.sub(r'[°º]', '°', raw_lower)
        norm_text_clean = re.sub(r'[\t\r\n]+', ' ', norm_text)

        matched_signals: List[UrgencySignalSchema] = []
        triggered_rule_ids = set()

        # Dynamic regex evaluation for temperature variations: e.g. "fever ... 102", "102°f ... fever"
        fever_high_temp_match = bool(
            re.search(r'\b(?:10[2-9]|11[0-5])(?:\.[0-9]+)?\s*(?:°\s*[fc]|[fc]\b|degrees?|\b)', norm_text_clean) and
            any(f in norm_text_clean for f in ["fever", "bukhar", "temp", "बुखार", "ଜ୍ୱର", "জ্বর", "జ్వరం", "காய்ச்சல்", "ಜ್ವರ", "പനി", "ताप", "તાવ", "ਬੁਖਾਰ"])
        )
        celsius_high_temp_match = bool(
            re.search(r'\b(?:38\.[9]|39|4[0-2](?:\.[0-9]+)?)\s*(?:°\s*c|c\b|degrees?|\b)', norm_text_clean) and
            any(f in norm_text_clean for f in ["fever", "bukhar", "temp", "बुखार", "ଜ୍ୱର", "জ্বর", "జ్వరం", "காய்ச்சல்", "ಜ್ವರ", "പനി", "ताप", "તાવ", "ਬੁਖਾਰ"])
        )

        for rule in cls.RULES:
            match_a = any(k in norm_text_clean for k in rule["keywords_a"])
            
            # Special check for RULE-008 high fever regex
            if rule["id"] == "RULE-008" and not match_a and (fever_high_temp_match or celsius_high_temp_match):
                match_a = True

            if rule["keywords_b"] is not None:
                match_b = any(k in norm_text_clean for k in rule["keywords_b"])
                is_triggered = match_a and match_b
            else:
                is_triggered = match_a

            if is_triggered and rule["id"] not in triggered_rule_ids:
                triggered_rule_ids.add(rule["id"])
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
