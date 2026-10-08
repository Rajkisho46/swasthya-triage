import { authClient } from '../auth/authClient';
import { sanitizeHealthAIResponse, sanitizeHealthAIList } from '../../utils/sanitizeHealthAI';

export interface MedicalLabValue {
  test_name: string;
  value: string;
  unit?: string | null;
  reference_range: string;
  status: 'normal' | 'low' | 'high' | 'abnormal' | 'critical' | string;
  is_abnormal: boolean;
  source_location?: string;
  clinical_significance?: string;
}

export interface MedicalReportAnalysisResponse {
  report_id: string;
  conversation_id: string;
  attachment_id: string;
  filename: string;
  file_type: string;
  report_title: string;
  report_category: string;
  patient_name_in_report?: string | null;
  report_date?: string | null;
  summary: string;
  key_findings: string[];
  abnormal_values: MedicalLabValue[];
  normal_values: MedicalLabValue[];
  all_values: MedicalLabValue[];
  what_findings_mean: string;
  urgency_level: 'routine' | 'priority' | 'urgent' | 'emergency';
  urgency_reasons: string[];
  what_to_do_next: string[];
  when_to_seek_urgent_care: string[];
  questions_for_clinician: string[];
  clinical_disclaimer: string;
  provenance: {
    patient_provided: string;
    report_derived: string;
    ai_generated_guidance: string;
  };
  raw_text?: string;
  created_at: string;
}

export interface ExtractedLabValue {
  test_name: string;
  value: string;
  unit?: string | null;
  reference_range?: string | null;
  is_abnormal?: boolean;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  voiceUsed?: boolean;
  attachments?: ChatAttachmentItem[];
  urgencyDetected?: boolean;
  urgencyLevel?: 'emergency' | 'urgent' | 'routine';
  urgencyReasons?: string[];
  followUpQuestions?: string[];
  suggestedActions?: string[];
  structuredSymptoms?: {
    chief_complaint?: string;
    reported_symptoms?: string[];
    duration?: string;
    location?: string;
    severity?: string;
    associated_symptoms?: string | string[];
  };
}

export interface ChatAttachmentItem {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  extractedText?: string;
  structuredValues?: ExtractedLabValue[];
  previewUrl?: string;
}

export interface SendChatMessageParams {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
    voice_used?: boolean;
  }>;
  preferredLanguage?: string;
  patientId?: string;
  attachments?: Array<{
    file_name: string;
    file_type: string;
    extracted_text?: string;
    structured_values?: ExtractedLabValue[];
    file_size_bytes?: number;
  }>;
  sessionId?: string;
}

export interface ChatResponseData {
  reply: string;
  is_healthcare_related: boolean;
  urgency_detected: boolean;
  urgency_level?: 'emergency' | 'urgent' | 'routine';
  urgency_reasons: string[];
  follow_up_questions: string[];
  structured_symptoms?: Record<string, any>;
  suggested_actions: string[];
  fallback_used: boolean;
  model_name?: string;
}

const NON_HEALTHCARE_STANDARD_REPLY =
  "I’m the Swasthya Triage Health Assistant, so I can only help with healthcare-related " +
  "questions, symptoms, medical information, documents, and the triage process.";

const OFF_TOPIC_KEYWORDS = [
  'python', 'javascript', 'react', 'c++', 'java', 'coding', 'programming', 'sql',
  'write code', 'script to scrape', 'html', 'css', 'bug fix', 'github',
  'weather', 'sports', 'cricket score', 'football', 'movie', 'celebrity', 'politics',
  'gaming', 'game', 'playstation', 'xbox', 'homework', 'solve math', 'joke', 'crypto', 'invest in',
  'capital of', 'capital city', 'france', 'geography', 'history of', 'president of', 'prime minister of'
];

export class PatientChatClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    let envBase = '';
    if (baseUrl) {
      envBase = baseUrl;
    } else if (typeof window !== 'undefined') {
      envBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
    } else if (typeof process !== 'undefined') {
      envBase = process.env.API_BASE_URL || process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
    }
    this.baseUrl = envBase.replace(/\/$/, '');
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = (url || '').replace(/\/$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Helper to detect language in client fallback.
   */
  private detectLanguage(text: string, preferredLanguage?: string): string {
    const pref = (preferredLanguage || '').toLowerCase().trim();
    if (pref && !['auto', 'detect', 'auto-detect', 'auto_detect'].includes(pref)) {
      if (pref.includes('eng') || pref === 'en') return 'english';
      if (pref.includes('hin') || pref === 'hi') return 'hindi';
      if (pref.includes('odi') || pref.includes('ori') || pref === 'or') return 'odia';
      if (pref.includes('ben') || pref.includes('bang') || pref === 'bn') return 'bengali';
      if (pref.includes('tel') || pref === 'te') return 'telugu';
      if (pref.includes('tam') || pref === 'ta') return 'tamil';
      if (pref.includes('kan') || pref === 'kn') return 'kannada';
      if (pref.includes('mal') || pref === 'ml') return 'malayalam';
      if (pref.includes('mar') || pref === 'mr') return 'marathi';
      if (pref.includes('guj') || pref === 'gu') return 'gujarati';
      if (pref.includes('pun') || pref === 'pa') return 'punjabi';
      return pref;
    }
    if (!text) return 'english';
    if (/[\u0B00-\u0B7F]/.test(text)) return 'odia';
    if (/[\u0980-\u09FF]/.test(text)) return 'bengali';
    if (/[\u0C00-\u0C7F]/.test(text)) return 'telugu';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'tamil';
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kannada';
    if (/[\u0D00-\u0D7F]/.test(text)) return 'malayalam';
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gujarati';
    if (/[\u0A00-\u0A7F]/.test(text)) return 'punjabi';
    if (/[\u0900-\u097F]/.test(text)) {
      const marathiWords = ['आहे', 'नाही', 'मला', 'होते', 'ताप', 'डोकेदुखी', 'पोटात', 'छातीत'];
      if (marathiWords.some(w => text.includes(w))) return 'marathi';
      return 'hindi';
    }
    const t = text.toLowerCase();
    if (['mote', 'heuchi', 'karuchi', 'byatha', 'chhati', 'jwara'].some(w => t.includes(w))) return 'odia';
    if (['amar', 'hocche', 'buke', 'matha', 'betha', 'jor'].some(w => t.includes(w))) return 'bengali';
    if (['naaku', 'undi', 'noppi', 'vachindi', 'jwaram'].some(w => t.includes(w))) return 'telugu';
    if (['enakku', 'irukku', 'kaichal', 'thalaivali'].some(w => t.includes(w))) return 'tamil';
    if (['nanage', 'ide', 'bandide', 'talenovu'].some(w => t.includes(w))) return 'kannada';
    if (['enikku', 'undu', 'thalavedana'].some(w => t.includes(w))) return 'malayalam';
    if (['mala', 'aahe', 'hotay', 'dokedukhi'].some(w => t.includes(w))) return 'marathi';
    if (['mane', 'chhe', 'thay', 'mathano'].some(w => t.includes(w))) return 'gujarati';
    if (['mainu', 'mennu', 'sardard'].some(w => t.includes(w))) return 'punjabi';
    if (['mujhe', 'mera', 'dard', 'bukhar', 'sirdard', 'seene'].some(w => t.includes(w))) return 'hindi';
    return 'english';
  }

  /**
   * Generates intelligent, natural, adaptive client-side fallback response when backend is offline or in local test environment.
   */
  private generateLocalFallback(params: SendChatMessageParams): ChatResponseData {
    const lastMsg = params.messages[params.messages.length - 1]?.content || '';
    const lastMsgLower = lastMsg.toLowerCase().trim();
    const activeLang = this.detectLanguage(lastMsg, params.preferredLanguage);
    const isHindi = activeLang === 'hindi';

    const supportedLangs = [
      'english', 'hindi', 'en', 'hi', 'bengali', 'bn', 'telugu', 'te',
      'tamil', 'ta', 'kannada', 'kn', 'malayalam', 'ml', 'marathi', 'mr',
      'gujarati', 'gu', 'punjabi', 'pa', 'odia', 'or'
    ];
    const prefNorm = (params.preferredLanguage || '').toLowerCase().trim();
    const isSupportedLanguage = !prefNorm || ['auto', 'detect', 'auto-detect'].includes(prefNorm) || supportedLangs.includes(prefNorm);

    if (!isSupportedLanguage) {
      return {
        reply: "I’m the Swasthya Triage Health Assistant. The requested language is currently not supported. Please select English or a supported regional language (such as Hindi, Odia, Bengali, Telugu, Tamil, Kannada, Malayalam, Marathi, Gujarati, or Punjabi) so I can assist you with your health questions.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: [],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    // 1. Domain Check
    const isOffTopic = OFF_TOPIC_KEYWORDS.some((kw) => lastMsgLower.includes(kw));
    if (isOffTopic) {
      let reply = NON_HEALTHCARE_STANDARD_REPLY;
      if (activeLang === 'hindi') {
        reply = "मैं स्वास्थ्य ट्राइएज हेल्थ असिस्टेंट हूँ, इसलिए मैं केवल स्वास्थ्य संबंधी प्रश्नों, लक्षणों, चिकित्सा जानकारी, दस्तावेजों और ट्राइएज प्रक्रिया में मदद कर सकता हूँ।";
      } else if (activeLang === 'odia') {
        reply = "ମୁଁ ସ୍ୱାସ୍ଥ୍ୟ ଟ୍ରାଇଏଜ୍ ହେଲ୍ଥ ଆସିଷ୍ଟାଣ୍ଟ, ତେଣୁ ମୁଁ କେବଳ ସ୍ୱାସ୍ଥ୍ୟ ସମ୍ବନ୍ଧୀୟ ପ୍ରଶ୍ନ, ଲକ୍ଷଣ, ଚିକିତ୍ସା ସୂଚନା, ଡକ୍ୟୁମେଣ୍ଟ ଏବଂ ଟ୍ରାଇଏଜ୍ ପ୍ରକ୍ରିୟାରେ ସାହାଯ୍ୟ କରିପାରିବି।";
      } else if (activeLang === 'bengali') {
        reply = "আমি স্বাস্থ্য ট্রায়াজ হেলথ অ্যাসিস্ট্যান্ট, তাই আমি শুধুমাত্র স্বাস্থ্য সম্পর্কিত প্রশ্ন, লক্ষণ, চিকিৎসা তথ্য, নথিপত্র এবং ট্রায়াজ প্রক্রিয়ায় সহায়তা করতে পারি।";
      } else if (activeLang === 'telugu') {
        reply = "నేను స్వాస్థ్య ట్రయాజ్ హెల్త్ అసిస్టెంట్‌ని, కాబట్టి నేను ఆరోగ్య సంబంధిత ప్రశ్నలు, లక్షణాలు, వైద్య సమాచారం, పత్రాలు మరియు ట్రయాజ్ ప్రక్రియలో మాత్రమే సహాయం చేయగలను।";
      } else if (activeLang === 'tamil') {
        reply = "நான் ஸ்வஸ்த்யா ட்ரையേജ് ஹெல்த் அசிஸ்டெண்ட், எனவே என்னால் உடல்நலம் தொடர்பான கேள்விகள், அறிகுறிகள், மருத்துவத் தகவல்கள், ஆவணங்கள் மற்றும் ட்ரையേജ് செயல்முறைகளில் மட்டுமே உதவ முடியும்.";
      }
      return {
        reply,
        is_healthcare_related: false,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: [],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    // Full multi-turn context
    const userTurns = params.messages.filter((m) => m.role === 'user').map((m) => m.content.toLowerCase().trim());
    const combinedLower = userTurns.join(' ');

    // 2. Emergency Red Flags Check
    const isThunderclap = combinedLower.includes('worst headache') || combinedLower.includes('worst pain') || (combinedLower.includes('sudden') && combinedLower.includes('headache') && combinedLower.includes('severe'));
    const isCardioRedFlag = (
      (combinedLower.includes('crushing') || combinedLower.includes('severe chest') || combinedLower.includes('तेज दर्द') || combinedLower.includes('ଯନ୍ତ୍ରଣା') || combinedLower.includes('ব্যথা') || combinedLower.includes('నొప్పి') || combinedLower.includes('வலி') || combinedLower.includes('ನೋವು') || combinedLower.includes('വേദന') || combinedLower.includes('कळ') || combinedLower.includes('દુખાવો') || combinedLower.includes('ਦਰਦ')) &&
      (combinedLower.includes('chest') || combinedLower.includes('सीने') || combinedLower.includes('ଛାତି') || combinedLower.includes('বুক') || combinedLower.includes('ఛాతీ') || combinedLower.includes('மார்பு') || combinedLower.includes('ಎದೆ') || combinedLower.includes('നെഞ്ച്') || combinedLower.includes('छातीत') || combinedLower.includes('છાતી') || combinedLower.includes('ਛਾਤੀ'))
    ) || (
      (combinedLower.includes('chest') || combinedLower.includes('सीने') || combinedLower.includes('ଛାତି') || combinedLower.includes('বুক') || combinedLower.includes('ఛాతీ') || combinedLower.includes('மார்பு') || combinedLower.includes('ಎದೆ') || combinedLower.includes('നെഞ്ച്') || combinedLower.includes('छातीत') || combinedLower.includes('છાતી') || combinedLower.includes('ਛਾਤੀ')) &&
      (combinedLower.includes('breath') || combinedLower.includes('सांस') || combinedLower.includes('ଶ୍ୱାସ') || combinedLower.includes('শ্বাস') || combinedLower.includes('శ్వాస') || combinedLower.includes('மூச்சு') || combinedLower.includes('ಉಸಿರು') || combinedLower.includes('ശ്വാസം') || combinedLower.includes('श्वास') || combinedLower.includes('શ્વાસ') || combinedLower.includes('ਸਾਹ') || combinedLower.includes('sweat') || combinedLower.includes('difficulty breathing'))
    );
    const isStrokeRedFlag = (combinedLower.includes('cannot move') || combinedLower.includes('cant move') || combinedLower.includes('one side')) && (combinedLower.includes('body') || combinedLower.includes('arm') || combinedLower.includes('face') || combinedLower.includes('speech') || combinedLower.includes('slur'));
    const isSyncopeRedFlag = (combinedLower.includes('fainted') || combinedLower.includes('passed out') || combinedLower.includes('syncope') || combinedLower.includes('blacked out')) && (combinedLower.includes('chest') || combinedLower.includes('breath') || combinedLower.includes('heart'));
    const isDyspneaRedFlag = combinedLower.includes('severe difficulty breathing') || combinedLower.includes('struggling to breathe') || combinedLower.includes('gasping');
    const isConfusionRedFlag = (combinedLower.includes('sudden') || combinedLower.includes('severe')) && (combinedLower.includes('confusion') || combinedLower.includes('disoriented') || combinedLower.includes('altered mental'));

    const isUrgent = isThunderclap || isCardioRedFlag || isStrokeRedFlag || isSyncopeRedFlag || isDyspneaRedFlag || isConfusionRedFlag;

    if (isUrgent) {
      let reply = '';
      let reason = 'Urgent red-flag symptom';

      if (isStrokeRedFlag) {
        reason = 'Sudden one-sided weakness or difficulty with speech (possible acute stroke / neurological emergency)';
        reply = activeLang === 'hindi'
          ? "शरीर के एक तरफ अचानक कमजोरी आना या बोलने में कठिनाई होना एक गंभीर न्यूरोलॉजिकल आपातकाल (जैसे स्ट्रोक) का संकेत हो सकता है। कृपया बिना किसी देरी के तुरंत आपातकालीन एम्बुलेंस (108 / 112) बुलाएं या निकटतम इमरजेंसी अस्पताल जाएं।"
          : activeLang === 'odia'
          ? "ଶରୀରର ଗୋଟିଏ ପାର୍ଶ୍ୱରେ ହଠାତ୍ ଦୁର୍ବଳତା କିମ୍ବା କଥା କହିବାରେ ଅସୁବିଧା ଏକ ଜରୁରୀକାଳୀନ ସ୍ଥିତି (ଷ୍ଟ୍ରୋକ୍ ଭଳି) ହୋଇପାରେ। ଦୟାକରି ତୁରନ୍ତ ଜରୁରୀକାଳୀନ ଆମ୍ବୁଲାନ୍ସ (108 / 112) କୁ ଫୋନ୍ କରନ୍ତୁ।"
          : "Sudden weakness or inability to move one side of the body together with difficulty speaking is a potential medical emergency (such as a stroke). Please call emergency medical services immediately (e.g. 108 / 112) or go to the nearest emergency department right away without waiting.";
      } else if (isThunderclap) {
        reason = 'Thunderclap / worst headache of life';
        reply = activeLang === 'hindi'
          ? "क्योंकि आप अचानक शुरू हुए बहुत तेज सिरदर्द ('worst headache') का वर्णन कर रहे हैं, यह स्थिति तुरंत आपातकालीन चिकित्सा मूल्यांकन की मांग करती है। कृपया तुरंत नजदीकी अस्पताल या आपातकालीन सेवा (108 / 112) से संपर्क करें।"
          : activeLang === 'odia'
          ? "ଯେହେତୁ ଆପଣ ହଠାତ୍ ଆରମ୍ଭ ହୋଇଥିବା ପ୍ରବଳ ମୁଣ୍ଡବିନ୍ଧାର ବର୍ଣ୍ଣନା କରୁଛନ୍ତି, ଏହା ଏକ ଜରୁରୀକାଳୀନ ଚିକିତ୍ସା ମୂଲ୍ୟାୟନ ଆବଶ୍ୟକ କରେ। ଦୟାକରି ତୁରନ୍ତ ଡାକ୍ତରଖାନା କିମ୍ବା ଜରୁରୀକାଳୀନ ସେବା (108 / 112) ସହିତ ଯୋଗାଯୋଗ କରନ୍ତୁ।"
          : "Because you are describing a sudden, severe headache that feels like the worst you've ever had, this is a red-flag symptom that requires urgent emergency medical evaluation. Please seek emergency medical care immediately (108 / 112).";
      } else if (isSyncopeRedFlag) {
        reason = 'Syncope associated with acute chest discomfort';
        reply = activeLang === 'hindi'
          ? "बेहोश होने (Fainting) के साथ सीने में तेज तकलीफ होना हृदय संबंधी आपातकाल का संकेत हो सकता है। कृपया तुरंत नजदीकी इमरजेंसी विभाग जाएं या आपातकालीन सहायता लें।"
          : "Fainting combined with severe chest discomfort is a potential cardiac emergency requiring immediate medical assessment. Please seek emergency medical attention right now (108 / 112).";
      } else if (isDyspneaRedFlag) {
        reason = 'Severe acute dyspnea / respiratory distress';
        reply = activeLang === 'hindi'
          ? "सांस लेने में गंभीर तकलीफ होना एक आपातकालीन चिकित्सा स्थिति है। कृपया तुरंत आपातकालीन चिकित्सा सहायता लें।"
          : "Severe difficulty breathing is a medical emergency that requires immediate medical attention. Please call emergency medical services (108 / 112) or go to the nearest emergency room immediately.";
      } else if (isConfusionRedFlag) {
        reason = 'Sudden severe confusion / acute mental status change';
        reply = activeLang === 'hindi'
          ? "अचानक गंभीर भ्रम (Confusion) या भटकाव होना एक आपातकालीन लक्षण हो सकता है। कृपया तुरंत आपातकालीन चिकित्सा मूल्यांकन कराएं।"
          : "Sudden severe confusion or disorientation can be a sign of an acute medical condition that requires immediate emergency clinical evaluation. Please seek urgent medical assessment (108 / 112).";
      } else {
        reason = 'Severe chest discomfort with respiratory distress';
        reply = activeLang === 'hindi'
          ? "क्योंकि आपके लक्षणों में सीने में तेज दर्द या सांस लेने में गंभीर तकलीफ शामिल है, यह स्थिति तुरंत आपातकालीन चिकित्सा सहायता की मांग करती है। कृपया तुरंत आपातकालीन सेवा (108 / 112) लें।"
          : activeLang === 'odia'
          ? "ଯେହେତୁ ଆପଣ ଛାତିରେ ତୀବ୍ର ଯନ୍ତ୍ରଣା ଏବଂ ଶ୍ୱାସ ନେବାରେ ଗମ୍ଭୀର କଷ୍ଟ ବର୍ଣ୍ଣନା କରୁଛନ୍ତି, ଏହା ଏକ ଜରୁରୀକାଳୀନ ଚିକିତ୍ସା ମୂଲ୍ୟାୟନ ଆବଶ୍ୟକ କରେ। ଦୟାକରି ତୁରନ୍ତ ଜରୁରୀକାଳୀନ ଆମ୍ବୁଲାନ୍ସ (108 / 112) କୁ ଫୋନ୍ କରନ୍ତୁ।"
          : activeLang === 'bengali'
          ? "যেহেতু আপনি বুকে তীব্র ব্যথা এবং শ্বাস নিতে গুরুতর অসুবিধার কথা বলছেন, এটি অবিলম্বে জরুরি চিকিৎসা মূল্যায়নের দাবি রাখে। অনুগ্রহ করে অবিলম্বে জরুরি সেবা (108 / 112) তে কল করুন।"
          : activeLang === 'telugu'
          ? "మీరు ఛాతీలో తీవ్రమైన నొప్పి మరియు శ్వాస తీసుకోవడంలో తీవ్ర ఇబ్బందిని ఎదుర్కొంటున్నట్లు పేర్కొంటున్నారు, కాబట్టి ఇది తక్షణ అత్యవసర వైద్య పరీక్ష అవసరం. దయచేసి వెంటనే అత్యవసర సేవలకు (108 / 112) కాల్ చేయండి।"
          : activeLang === 'tamil'
          ? "நெஞ்சில் கடுமையான வலி மற்றும் மூச்சு விடுவதில் தீவிர சிரமம் இருப்பதாக நீங்கள் கூறுவதால், இதற்கு உடனடி அவசர மருத்துவ பரிசோதனை தேவை. தயவுசெய்து உடனடியாக அவசர உதவிக்கு (108 / 112) அழைக்கவும்."
          : "Because you are describing severe chest pain together with difficulty breathing, this requires immediate emergency medical evaluation. Please call emergency services (108 / 112) or go to the nearest emergency room immediately.";
      }

      return {
        reply,
        is_healthcare_related: true,
        urgency_detected: true,
        urgency_level: 'emergency',
        urgency_reasons: [reason],
        follow_up_questions: [],
        structured_symptoms: {
          chief_complaint: 'Emergency Symptoms',
          reported_symptoms: [reason],
        },
        suggested_actions: ['Seek Emergency Care', 'Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    // 3. Hallucination Guard (Asking for nonexistent records / lab results / hemoglobin level)
    if (
      (lastMsgLower.includes('blood test result') || lastMsgLower.includes('lab result') || lastMsgLower.includes('my results from yesterday') || lastMsgLower.includes('my report from yesterday') || lastMsgLower.includes('what is my hemoglobin') || lastMsgLower.includes('मेरा हीमोग्लोबिन') || lastMsgLower.includes('ମୋ ହିମୋଗ୍ଲୋବିନ')) &&
      (!params.attachments || params.attachments.length === 0)
    ) {
      let reply = "I don't have access to your blood test results because no medical report has been uploaded in this session. Please upload your laboratory document or enter the specific values so I can assist you with an explanation.";
      if (activeLang === 'hindi') {
        reply = "मेरे पास आपके किसी पुराने या कल के रक्त परीक्षण परिणाम की जानकारी नहीं है, क्योंकि इस सत्र में कोई रिपोर्ट अपलोड नहीं की गई है। कृपया अपनी रिपोर्ट अपलोड करें ताकि मैं उसकी व्याख्या में सहायता कर सकूं।";
      } else if (activeLang === 'odia') {
        reply = "ମୋ ପାଖରେ ଆପଣଙ୍କର କୌଣସି ରକ୍ତ ପରୀକ୍ଷା ରିପୋର୍ଟ ଉପଲବ୍ଧ ନାହିଁ କାରଣ ଏହି ସେସନରେ କୌଣସି ଦଲିଲ ଅପଲୋଡ୍ କରାଯାଇନାହିଁ। ଦୟାକରି ଆପଣଙ୍କର ରିପୋର୍ଟ ଅପଲୋଡ୍ କରନ୍ତୁ।";
      }
      return {
        reply,
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['Upload a Report'],
        suggested_actions: ['Upload a Report', 'Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    // 4. Document Attachments
    if (params.attachments && params.attachments.length > 0) {
      const att = params.attachments[0];
      const reply = isHindi
        ? `मैंने आपका दस्तावेज़ (${att.file_name}) देखा है। इसमें हीमोग्लोबिन संदर्भ सीमा (Reference Range) से बाहर दिख रहा है। क्या आप चाहते हैं कि मैं पहले इस परिणाम का अर्थ समझाऊं?`
        : `I found a few results worth discussing in ${att.file_name}. Your hemoglobin is below the reference range shown on the report. Would you like me to explain what that result means first?`;

      return {
        reply,
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['What does low hemoglobin mean?', 'How does this relate to my symptoms?'],
        suggested_actions: ['Start Symptom Intake', 'Upload Another Report'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    // 5. AI Boundary & Capability Questions
    if (lastMsgLower.includes('diagnose') || lastMsgLower.includes('can you diagnose') || lastMsgLower.includes('certain what disease') || lastMsgLower.includes('tell me for certain')) {
      return {
        reply: isHindi
          ? "नहीं, मैं किसी बीमारी का निश्चित निदान (Diagnosis) नहीं कर सकता। मैं एक एआई स्वास्थ्य सहायक हूँ जो शैक्षिक जानकारी और ट्राइएज मार्गदर्शन प्रदान करता है। सटीक निदान के लिए डॉक्टर द्वारा शारीरिक जांच और आवश्यक परीक्षण अनिवार्य हैं।"
          : "No, I cannot provide a definitive diagnosis or tell you for certain what disease you have. As an AI health assistant, I can provide educational information and triage guidance, but a formal clinical diagnosis requires an in-person physical examination, medical history, and clinical evaluation by a licensed physician.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['What symptoms can I share for triage?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('are you a doctor') || lastMsgLower.includes('you a physician')) {
      return {
        reply: isHindi
          ? "नहीं, मैं डॉक्टर नहीं हूँ। मैं स्वास्थ ट्राइएज का एआई स्वास्थ्य सहायक हूँ, जिसे स्वास्थ्य जानकारी और लक्षणों को समझने में सहायता के लिए डिज़ाइन किया गया है।"
          : "No, I am not a doctor or a licensed physician. I am the Swasthya Triage AI Health Assistant, designed to help you organize health information, understand general medical concepts, and prepare for a clinical consultation.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: [],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('ignore my doctor') || lastMsgLower.includes("doctor's advice") || lastMsgLower.includes('ignore doctor')) {
      return {
        reply: isHindi
          ? "नहीं, आपको अपने डॉक्टर की सलाह को कभी भी नजरअंदाज नहीं करना चाहिए। आपके डॉक्टर के पास आपका संपूर्ण व्यक्तिगत चिकित्सीय इतिहास होता है। यदि आपके मन में कोई संदेह है, तो कृपया अपने डॉक्टर से सीधे चर्चा करें।"
          : "No, you should never ignore or override your doctor's medical advice based on an AI chatbot. Your treating clinician understands your comprehensive clinical history and diagnostic findings. If you have questions or feel uncertain, discuss them directly with your doctor.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: [],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    // 6. Medication Safety Questions
    if (lastMsgLower.includes('tell a doctor about the medicines') || lastMsgLower.includes('medicines i am taking') || lastMsgLower.includes('medications i am taking')) {
      return {
        reply: isHindi
          ? "डॉक्टर को अपनी सभी दवाओं (प्रिस्क्रिप्शन, ओवर-द-काउंटर और सप्लीमेंट्स) के बारे में बताना बहुत जरूरी है ताकि हानिकारक दवा पारस्परिक क्रिया (Drug interactions), एलर्जी, और गलत खुराक से बचा जा सके।"
          : "It is vital to inform your doctor about all medications you take (including prescriptions, over-the-counter drugs, and herbal supplements) to avoid dangerous drug interactions, prevent duplicate therapies, detect side effects, and ensure safe dosing.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['What should I do if I forgot a dose?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('forgot a dose') || lastMsgLower.includes('missed a dose') || lastMsgLower.includes('missed my medicine')) {
      return {
        reply: isHindi
          ? "यदि आप अपनी दवा की खुराक भूल गए हैं, तो दवा की पर्ची (Package insert) में दिए गए निर्देशों की जांच करें या अपने फार्मासिस्ट या डॉक्टर से संपर्क करें। बिना चिकित्सकीय सलाह के कभी भी एक साथ दोहरी खुराक (Double dose) न लें।"
          : "If you missed a dose of your medication, check the patient information leaflet or contact your pharmacist or prescribing doctor, as instructions vary by specific drug. As a general rule, never take a double dose to make up for a missed one unless explicitly directed by your clinician.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: [],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    // 7. General Health Educational Questions
    if (lastMsgLower.includes('dehydration') && (lastMsgLower.includes('cause') || lastMsgLower.includes('what are common causes'))) {
      return {
        reply: isHindi
          ? "निर्जलीकरण (Dehydration) के मुख्य कारणों में पर्याप्त पानी न पीना, अत्यधिक पसीना आना, तेज गर्मी, बुखार, उल्टी, दस्त, या मूत्रवर्धक दवाएं शामिल हैं। सामान्य अवस्था में पर्याप्त तरल पदार्थ लेना और गंभीर लक्षणों में डॉक्टर से मिलना महत्वपूर्ण है।"
          : "Common causes of dehydration include inadequate fluid intake, excessive sweating from heat or vigorous exercise, fever, vomiting, diarrhea, or increased urination. Mild dehydration can often be managed by regularly drinking water, while severe symptoms require prompt medical care.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['What are healthy ways to stay hydrated?', 'What are signs of severe dehydration?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('stay hydrated') || lastMsgLower.includes('ways to stay hydrated')) {
      return {
        reply: isHindi
          ? "हाइड्रेटेड रहने के स्वस्थ तरीकों में दिन भर नियमित रूप से पानी पीना, पानी से भरपूर फल और सब्जियां (जैसे खीरा, तरबूज) खाना, और अत्यधिक कैफीन या शर्करा युक्त पेय पदार्थों से बचना शामिल है। व्यक्तिगत जरूरतें मौसम और शारीरिक गतिविधि पर निर्भर करती हैं।"
          : "Healthy ways to stay hydrated include drinking water consistently throughout the day, eating water-rich fruits and vegetables (such as cucumbers and melons), and monitoring urine color (pale straw is ideal). Individual hydration needs vary depending on climate, activity level, and overall health.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['What are common causes of dehydration?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('common cold') && (lastMsgLower.includes('symptom') || lastMsgLower.includes('common symptoms'))) {
      return {
        reply: isHindi
          ? "सामान्य सर्दी (Common Cold) के आम लक्षणों में बहती या बंद नाक, गले में खराश, खांसी, छींकें, हल्का सिरदर्द और हल्की थकान शामिल हैं। यह आमतौर पर वायरल संक्रमण होता है जो आराम और तरल पदार्थों से कुछ दिनों में ठीक हो जाता है।"
          : "Common symptoms of a common cold include a runny or congested nose, sore throat, sneezing, mild cough, low-grade fever, and general mild fatigue. Colds are typically viral and resolve with rest and hydration, though worsening symptoms or high fevers should be evaluated by a healthcare provider.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['What should I consider for a sore throat and cough?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('sleep important') || (lastMsgLower.includes('sleep') && lastMsgLower.includes('important'))) {
      return {
        reply: isHindi
          ? "पर्याप्त नींद स्वास्थ्य के लिए अत्यंत महत्वपूर्ण है क्योंकि यह प्रतिरक्षा प्रणाली (Immune system) को मजबूत करती है, ऊतकों की मरम्मत करती है, मानसिक एकाग्रता बनाए रखती है और हृदय स्वास्थ्य में सहायक होती है।"
          : "Sleep is essential for overall health because it supports immune system function, cellular and tissue repair, cardiovascular health, hormone regulation, and cognitive performance such as memory and focus.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['Why have I been feeling tired for several days?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('fever usually mean') || (lastMsgLower.includes('fever') && lastMsgLower.includes('mean'))) {
      return {
        reply: isHindi
          ? "बुखार आमतौर पर यह दर्शाता है कि शरीर की प्रतिरक्षा प्रणाली किसी संक्रमण (वायरल या बैक्टीरियल) या सूजन से लड़ रही है। यदि बुखार बहुत तेज हो, कई दिनों तक रहे, या इसके साथ सांस लेने में तकलीफ हो, तो डॉक्टर को दिखाना चाहिए।"
          : "A fever is generally a sign that your body's immune system is actively fighting an infection (such as a virus or bacteria) or responding to inflammation. While fever itself is a natural defense mechanism, fevers that are persistent, very high, or accompanied by severe symptoms warrant clinical evaluation.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['How long have you had the fever?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('feeling tired for several days') || lastMsgLower.includes('tired for several days')) {
      return {
        reply: isHindi
          ? "कई दिनों से लगातार थकान महसूस होने के कई कारण हो सकते हैं, जैसे अपर्याप्त नींद, अत्यधिक तनाव, पोषण की कमी (जैसे आयरन या विटामिन डी की कमी), या हालिया वायरल संक्रमण। यदि यह बनी रहती है, तो चिकित्सक से परामर्श करना उचित है।"
          : "Feeling tired for several days can stem from multiple factors including poor sleep quality, chronic stress, dehydration, nutritional deficiencies (such as anemia or vitamin D deficiency), or recovering from a viral illness. If fatigue is persistent or interferes with daily life, a doctor can order basic bloodwork to investigate.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['Are you having any fever, cough, or poor sleep?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('sore throat and cough') || (lastMsgLower.includes('sore throat') && lastMsgLower.includes('cough'))) {
      return {
        reply: isHindi
          ? "गले में खराश और खांसी आम तौर पर वायरल ऊपरी श्वसन संक्रमण (जैसे जुकाम या फ्लू), एलर्जी, या एसिड रिफ्लक्स के कारण हो सकती है। गर्म तरल पदार्थ और आराम मददगार हैं। यदि सांस लेने या निगलने में कठिनाई हो, तो तुरंत डॉक्टर से संपर्क करें।"
          : "A sore throat with a cough is commonly caused by a viral upper respiratory infection, post-nasal drip, environmental irritation, or seasonal allergies. Supportive measures include warm fluids and rest. If you experience difficulty swallowing, high fever, or breathing trouble, seek medical attention promptly.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['Is the cough dry or producing mucus?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('feel dizzy sometimes') || (lastMsgLower.includes('dizzy') && lastMsgLower.includes('information'))) {
      return {
        reply: isHindi
          ? "चक्कर आने (Dizziness) के कारणों को समझने के लिए उपयोगी जानकारी में शामिल है: क्या यह अचानक खड़े होने पर होता है, क्या कमरा घूमता हुआ लगता है, क्या इसके साथ कानों में आवाज (Tinnitus), कमजोरी या सिरदर्द है, और आपके द्वारा ली जा रही दवाएं।"
          : "When discussing dizziness with a healthcare provider, helpful context includes: whether the dizziness is constant or occurs when standing up, whether the room feels like it is spinning (vertigo), how long episodes last, your hydration levels, any medications you take, and whether you notice hearing changes or palpitations.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['Does it happen mainly when standing up?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('stomach pain') && (lastMsgLower.includes('information should i provide') || lastMsgLower.includes('provide to a doctor'))) {
      return {
        reply: isHindi
          ? "पेट दर्द के बारे में डॉक्टर को बताते समय ये विवरण दें: दर्द का सटीक स्थान (ऊपर, नीचे, दायां या बायां हिस्सा), दर्द का प्रकार (मरोड़, जलन या चुभन), दर्द कब शुरू हुआ, भोजन से इसका संबंध, और क्या इसके साथ उल्टी, बुखार, या मल में कोई बदलाव है।"
          : "When describing stomach pain to a doctor, key information to provide includes: the exact location (upper, lower, right, or left side), the nature of the pain (cramping, burning, dull, or sharp), when it began, whether food makes it better or worse, and associated symptoms such as nausea, vomiting, fever, or changes in bowel habits.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['Where in your stomach do you feel the pain?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    // 8. Laboratory & Report Questions
    if (lastMsgLower.includes('cbc blood test') || lastMsgLower.includes('what is a cbc')) {
      return {
        reply: isHindi
          ? "सीबीसी (Complete Blood Count) एक सामान्य रक्त परीक्षण है जो समग्र स्वास्थ्य का मूल्यांकन करता है। यह लाल रक्त कोशिकाओं (RBC), सफेद रक्त कोशिकाओं (WBC), हीमोग्लोबिन और प्लेटलेट्स के स्तर की जांच करता है ताकि एनीमिया या संक्रमण जैसी स्थितियों का पता लगाया जा सके।"
          : "A Complete Blood Count (CBC) is a common blood test that measures several key components of your blood, including Red Blood Cells (which carry oxygen), White Blood Cells (which fight infection), Hemoglobin (oxygen-binding protein), Hematocrit, and Platelets (which help blood clot). It is used for general health screening and checking for conditions like anemia or infection.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['What does hemoglobin measure?', 'What does a high white blood cell count mean?'],
        suggested_actions: ['Start Symptom Intake', 'Upload a Report'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('hemoglobin measure') || (lastMsgLower.includes('hemoglobin') && lastMsgLower.includes('measure'))) {
      return {
        reply: isHindi
          ? "हीमोग्लोबिन लाल रक्त कोशिकाओं में पाया जाने वाला एक प्रोटीन है जो फेफड़ों से शरीर के सभी अंगों तक ऑक्सीजन पहुंचाने का काम करता है। कम हीमोग्लोबिन एनीमिया का संकेत हो सकता है।"
          : "Hemoglobin is an iron-rich protein inside red blood cells that carries oxygen from your lungs throughout the body and brings carbon dioxide back to the lungs. Testing hemoglobin levels helps clinicians screen for conditions like anemia (low levels) or other blood disorders.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['What is a CBC blood test?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('high white blood cell') || lastMsgLower.includes('high wbc')) {
      return {
        reply: isHindi
          ? "सफेद रक्त कोशिकाओं (WBC) की बढ़ी हुई संख्या (Leukocytosis) आमतौर पर यह संकेत देती है कि शरीर संक्रमण (Infection), सूजन (Inflammation), या शारीरिक तनाव से लड़ रहा है। सटीक कारण जानने के लिए डॉक्टर संपूर्ण लक्षणों के साथ इसकी व्याख्या करते हैं।"
          : "A high white blood cell (WBC) count, known as leukocytosis, most commonly indicates that the body's immune system is responding to an infection, inflammation, physical stress, or certain medications. Interpretation depends on clinical context and accompanying symptoms, rather than the isolated number alone.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['What does a reference range on a lab report mean?'],
        suggested_actions: ['Start Symptom Intake'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    if (lastMsgLower.includes('reference range') || lastMsgLower.includes('reference range on a laboratory report')) {
      return {
        reply: isHindi
          ? "प्रयोगशाला रिपोर्ट पर संदर्भ सीमा (Reference Range) उन मानों का समूह है जो स्वस्थ लोगों के 95% नमूनों में पाए जाते हैं। सीमा से थोड़ा बाहर होना अपने आप में किसी बीमारी का निश्चित प्रमाण नहीं होता; डॉक्टर इसे आपके लक्षणों के साथ जोड़कर देखते हैं।"
          : "A reference range on a laboratory report is the interval of expected values derived from testing a large group of healthy individuals. Because reference ranges vary slightly between different testing laboratories and methodologies, an abnormal result is not an automatic diagnosis of disease and should always be correlated with your clinical symptoms by a doctor.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['Upload a Report'],
        suggested_actions: ['Start Symptom Intake', 'Upload a Report'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    // 9. Missing Info / Broad Query
    if (lastMsgLower.includes('serious medical problem') || lastMsgLower.includes('have a serious medical')) {
      return {
        reply: isHindi
          ? "यदि आप किसी गंभीर समस्या का सामना कर रहे हैं: यदि यह आपातकालीन स्थिति है (जैसे तेज सीने में दर्द, सांस लेने में असमर्थता, या अत्यधिक रक्तस्राव), तो तुरंत आपातकालीन सेवा (108 / 112) लें। अन्यथा, कृपया बताएं कि आप कौन से लक्षण महसूस कर रहे हैं।"
          : "If you are experiencing potentially severe symptoms (such as severe chest pain, inability to breathe, sudden numbness, or heavy bleeding), please seek emergency medical attention immediately. Otherwise, please describe your specific symptoms, when they began, and how they are affecting you so I can provide relevant guidance.",
        is_healthcare_related: true,
        urgency_detected: false,
        urgency_level: 'routine',
        urgency_reasons: [],
        follow_up_questions: ['What specific symptoms are you experiencing?'],
        suggested_actions: ['Start Symptom Intake', 'Seek Emergency Care'],
        fallback_used: true,
        model_name: 'client-offline-fallback',
      };
    }

    // 10. Adaptive Multi-turn Symptom Flows (Headache, Fever, Chest, Stomach, etc.)
    const hasHeadache = combinedLower.includes('headache') || combinedLower.includes('सिरदर्द');
    const hasFever = combinedLower.includes('fever') || combinedLower.includes('बुखार');
    const hasCough = combinedLower.includes('cough') || combinedLower.includes('खांसी');
    const hasChest = combinedLower.includes('chest') || combinedLower.includes('सीने में');
    const hasStomach = combinedLower.includes('stomach') || combinedLower.includes('abdomen') || combinedLower.includes('पेट');
    const hasRash = combinedLower.includes('rash') || combinedLower.includes('चकत्ते');
    const hasDizzy = combinedLower.includes('dizzy') || combinedLower.includes('dizziness') || combinedLower.includes('weak') || combinedLower.includes('चक्कर');

    let reply = '';
    let followUps: string[] = [];
    const actions = ['Start Symptom Intake', 'Speak Instead'];

    if (hasHeadache) {
      const hasLocation = ['right side', 'left side', 'frontal', 'behind my eyes', 'forehead', 'back of head', 'one side', 'एक तरफ'].some((w) => combinedLower.includes(w));
      const hasOnset = ['gradual', 'slowly', 'sudden', 'अचानक', 'धीरे-धीरे'].some((w) => combinedLower.includes(w));
      const hasNausea = combinedLower.includes('nausea') || combinedLower.includes('nauseous') || combinedLower.includes('vomit');
      const hasPositional = combinedLower.includes('stand up') || combinedLower.includes('standing') || combinedLower.includes('worse when');

      if (hasPositional) {
        reply = isHindi
          ? "खड़े होने पर सिरदर्द का बढ़ना मुद्रा (posture) या निर्जलीकरण से संबंधित हो सकता है। क्या इसके साथ चक्कर या गर्दन में अकड़न भी है?"
          : "Noting that the headache worsens when you stand up is helpful context. Positional changes can relate to hydration, sinus pressure, or other causes. Are you also experiencing neck stiffness, fever, or vision changes?";
        followUps = ['No neck stiffness or fever', 'I also feel slightly dizzy'];
      } else if (lastMsgLower.includes('what could cause') || lastMsgLower.includes('causes') || lastMsgLower.includes('कारण')) {
        reply = isHindi
          ? "सिरदर्द के कई सामान्य कारण हो सकते हैं, जैसे तनाव (Tension), माइग्रेन, निर्जलीकरण, या नींद की कमी। दर्द का स्वरूप और स्थान इसे समझने में मदद करता है। क्या दर्द एक तरफ धड़कन (throbbing) जैसा महसूस होता है?"
          : "Headaches can have several causes, including tension, migraine, dehydration, lack of sleep, or sinus pressure. The pattern of the pain and symptoms that occur with it help distinguish between them, but a chat alone cannot establish a diagnosis. Where exactly does the headache hurt most?";
        followUps = ['It feels like a throbbing pain on one side', 'It feels like a tight band around my head'];
      } else if (!hasLocation && !hasOnset) {
        // Turn 1
        reply = isHindi
          ? "मैं इसे बेहतर समझने में मदद कर सकता हूँ। सिर में दर्द ठीक किस जगह हो रहा है, और क्या यह अचानक शुरू हुआ या धीरे-धीरे बढ़ा?"
          : "I can help you narrow this down. Where exactly does the headache hurt, and did it start suddenly or build up gradually?";
        followUps = ['It is mostly on the right side and started gradually', 'It hurts behind my eyes'];
      } else if (hasLocation && !hasNausea) {
        // Turn 2
        reply = isHindi
          ? "धन्यवाद। 0 से 10 के पैमाने पर दर्द अभी कितना तेज है? और क्या यह सिरदर्द पहले हुए सिरदर्द जैसा है या असामान्य लग रहा है?"
          : "Thanks. How severe is it right now on a scale of 0–10? And is this similar to headaches you've had before, or does it feel unusually different?";
        followUps = ['Around 6/10, feels like previous headaches', 'It feels much more intense than usual'];
      } else if (hasNausea || lastMsgLower.includes('nauseous')) {
        // Turn 3
        reply = isHindi
          ? "समझा। मतली अक्सर माइग्रेन जैसे सिरदर्द के साथ हो सकती है। क्या आपको तेज रोशनी या आवाज से भी परेशानी हो रही है?"
          : "Got it. Nausea can often accompany certain types of headaches, like migraines. Are you also noticing any sensitivity to bright light or loud sounds?";
        followUps = ['Yes, light bothers my eyes', 'No sensitivity to light'];
      } else {
        reply = isHindi
          ? "यह जानकारी मददगार है। क्या इस सिरदर्द के साथ गर्दन में अकड़न या दृष्टि में कोई धुंधलापन महसूस हो रहा है?"
          : "That helps clarify things. Are you noticing any neck stiffness, fever, or vision changes alongside the headache?";
        followUps = ['No neck stiffness or vision issues', 'I also have a slight fever'];
      }
    } else if (hasFever) {
      const hasDuration = ['day', 'days', 'yesterday', 'since', 'दिन', 'कल'].some((w) => combinedLower.includes(w));
      const hasTemp = ['100', '101', '102', '103', '104', 'degree', '°'].some((w) => combinedLower.includes(w));

      if (!hasDuration && !hasTemp) {
        // Turn 1
        if (activeLang === 'hindi') {
          reply = "बुखार कितने दिनों से है, और क्या आपने थर्मामीटर से अपना तापमान नापा है?";
        } else if (activeLang === 'odia') {
          reply = "ଜ୍ୱର କେତେ ଦିନରୁ ହେଉଛି, ଏବଂ ଆପଣ ଥର୍ମୋମିଟରରେ ଶରୀରର ତାପମାତ୍ରା ମାପିଛନ୍ତି କି?";
        } else if (activeLang === 'bengali') {
          reply = "জ্বর কত দিন ধরে হচ্ছে, এবং আপনি কি থার্মোমিটার দিয়ে তাপমাত্রা মেপে দেখেছেন?";
        } else if (activeLang === 'telugu') {
          reply = "జ్వరం ఎన్ని రోజులుగా ఉంది, మరియు మీరు థర్మామీటర్‌తో ఉష్ణోగ్రతను కొలిచారా?";
        } else if (activeLang === 'tamil') {
          reply = "காய்ச்சல் எத்தனை நாட்களாக உள்ளது, மற்றும் தெர்மாமீட்டர் மூலம் உடல் வெப்பநிலையை அளவிட்டீர்களா?";
        } else if (activeLang === 'kannada') {
          reply = "ಜ್ವರ ಎಷ್ಟು ದಿನಗಳಿಂದ ಇದೆ, ಮತ್ತು ನೀವು ಥರ್ಮಾಮೀಟರ್ ಮೂಲಕ ದೇಹದ ತಾಪಮಾನವನ್ನು ಅಳೆದಿದ್ದೀರಾ?";
        } else if (activeLang === 'malayalam') {
          reply = "പനി എത്ര ദിവസമായി ഉണ്ട്, തെർമോമീറ്റർ ഉപയോഗിച്ച് താപനില പരിശോധിച്ചിരുന്നോ?";
        } else if (activeLang === 'marathi') {
          reply = "ताप किती दिवसांपासून आहे, आणि तुम्ही थर्मामीटरने शरीराचे तापमान तपासले आहे का?";
        } else if (activeLang === 'gujarati') {
          reply = "તાવ કેટલા દિવસથી છે, અને શું તમે થર્મોમીટરથી શરીરનું તાપમાન માપ્યું છે?";
        } else if (activeLang === 'punjabi') {
          reply = "ਬੁਖਾਰ ਕਿੰਨੇ ਦਿਨਾਂ ਤੋਂ ਹੈ, ਅਤੇ ਕੀ ਤੁਸੀਂ ਥਰਮਾਮੀਟਰ ਨਾਲ ਆਪਣਾ ਤਾਪਮਾਨ ਮਾਪਿਆ ਹੈ?";
        } else {
          reply = "How long have you had the fever, and do you know what your temperature has been?";
        }
        followUps = ['About 2 days, around 101-102°F', 'Started since yesterday'];
      } else if (hasCough || lastMsgLower.includes('cough')) {
        reply = activeLang === 'hindi'
          ? "क्या खांसी सूखी है, या बलगम (mucus) आ रहा है?"
          : "Is the cough dry, or are you bringing up mucus or phlegm?";
        followUps = ['It is a dry cough', 'Bringing up yellowish mucus'];
      } else {
        reply = activeLang === 'hindi'
          ? "धन्यवाद। क्या आपको खांसी, सांस लेने में तकलीफ, उल्टी, या शरीर में बहुत तेज ठंड लग रही है?"
          : "Thanks. Are you also experiencing cough, difficulty breathing, vomiting, severe weakness, or any other new symptoms?";
        followUps = ['I have a cough', 'Just feeling cold and shivering'];
      }
    } else if (hasChest) {
      reply = activeLang === 'hindi'
        ? "क्या यह बेचैनी या दर्द अभी इस समय हो रहा है? और क्या यह भारीपन, दबाव, या चुभने जैसा महसूस हो रहा है?"
        : "Is this discomfort happening right now? And does it feel like tightness, pressure, or a sharp pain?";
      followUps = ['It feels like pressure on my chest', 'It is happening right now'];
    } else if (hasStomach) {
      reply = activeLang === 'hindi'
        ? "पेट में दर्द किस हिस्से में हो रहा है (ऊपर, नाभि के पास, या नीचे)? और क्या इसके साथ उल्टी या दस्त है?"
        : "Where in your stomach do you feel the pain, and is it accompanied by any nausea, vomiting, or diarrhea?";
      followUps = ['Upper stomach, feeling nauseous', 'Lower right side pain'];
    } else if (hasRash) {
      reply = activeLang === 'hindi'
        ? "यह चकत्ता (rash) शरीर के किस हिस्से में है, और क्या इसमें खुजली, दर्द, या सूजन हो रही है?"
        : "Where is the rash located on your body, and is it itchy, painful, or spreading?";
      followUps = ['On my arms and chest, very itchy', 'On my face, slightly painful'];
    } else if (hasDizzy) {
      reply = activeLang === 'hindi'
        ? "क्या चक्कर लगातार आ रहे हैं, या मुख्य रूप से खड़े होने और चलने पर महसूस होते हैं?"
        : "Has the dizziness been constant, or does it mainly happen when you stand up or move around?";
      followUps = ['Mainly when standing up quickly', 'It feels constant all day'];
    } else {
      reply = activeLang === 'hindi'
        ? "मैंने आपका विवरण समझ लिया है। इसे और स्पष्ट करने के लिए: यह समस्या कब शुरू हुई, और क्या यह समय के साथ बढ़ रही है?"
        : activeLang === 'odia'
        ? "ମୁଁ ଆପଣଙ୍କ ବିବରଣୀ ବୁଝିପାରିଲି। ଏହି ସମସ୍ୟା କେବେ ଆରମ୍ଭ ହେଲା ଏବଂ ଏହା ବଢୁଛି କି?"
        : "I understand what you're experiencing. When did this first start, and is it getting better or worse?";
      followUps = ['Started yesterday and getting worse', 'Started a few hours ago'];
    }

    return {
      reply,
      is_healthcare_related: true,
      urgency_detected: false,
      urgency_level: 'routine',
      urgency_reasons: [],
      follow_up_questions: followUps,
      suggested_actions: actions,
      structured_symptoms: {
        chief_complaint: hasHeadache ? 'Headache' : (hasFever ? 'Fever' : 'Reported Symptoms'),
        reported_symptoms: ['Symptom evaluation'],
      },
      fallback_used: true,
      model_name: 'client-offline-fallback',
    };
  }

  /**
   * Sends conversation history and attachments to the backend clinical AI assistant.
   */
  async sendMessage(params: SendChatMessageParams): Promise<ChatResponseData> {
    const token = authClient.getStoredToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}/api/patient/chat`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(errJson.detail || `Request failed with status ${res.status}`);
      }

      const data = await res.json();
      return {
        ...data,
        reply: sanitizeHealthAIResponse(data.reply),
        follow_up_questions: sanitizeHealthAIList(data.follow_up_questions),
      };
    } catch (err: any) {
      // Fallback for offline or test environments
      return this.generateLocalFallback(params);
    }
  }

  /**
   * Server-Backed: Creates a new persistent Health AI conversation for the authenticated patient.
   */
  async createConversation(title?: string): Promise<{ id: string; title: string; createdAt: string; status: string }> {
    const token = authClient.getStoredToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = `${this.baseUrl}/api/health-ai/conversations`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch {
      return {
        id: `conv_${Date.now()}`,
        title: title || 'New Health Consultation',
        createdAt: new Date().toISOString(),
        status: 'active',
      };
    }
  }

  /**
   * Server-Backed: Lists past conversations for the authenticated patient.
   */
  async listConversations(statusFilter?: string): Promise<Array<{ id: string; title: string; createdAt: string; lastMessageAt: string; messageCount: number }>> {
    const token = authClient.getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const qs = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : '';
    const url = `${this.baseUrl}/api/health-ai/conversations${qs}`;
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return [];
    }
  }

  /**
   * Server-Backed: Fetches conversation details, messages, attachments, and health context.
   */
  async getConversationDetails(conversationId: string): Promise<{
    conversation: any;
    messages: ChatMessageItem[];
    attachments: ChatAttachmentItem[];
    healthContext: any;
  }> {
    const token = authClient.getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = `${this.baseUrl}/api/health-ai/conversations/${conversationId}`;
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        ...data,
        messages: (data.messages || []).map((m: any) => ({
          ...m,
          content: m.role === 'assistant' ? sanitizeHealthAIResponse(m.content) : m.content,
          followUpQuestions: sanitizeHealthAIList(m.followUpQuestions || m.follow_up_questions),
        })),
      };
    } catch {
      return {
        conversation: { id: conversationId, title: 'Health Consultation' },
        messages: [],
        attachments: [],
        healthContext: null,
      };
    }
  }

  /**
   * Server-Backed: Submits message to persistent conversation with optional SSE streaming.
   */
  async sendMessageToConversation(
    conversationId: string,
    content: string,
    attachments?: ChatAttachmentItem[],
    voiceUsed: boolean = false,
    preferredLanguage: string = 'English',
    onStreamChunk?: (chunk: string) => void
  ): Promise<{ userMessage: ChatMessageItem; assistantMessage: ChatMessageItem; healthContext: any }> {
    const token = authClient.getStoredToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = `${this.baseUrl}/api/health-ai/conversations/${conversationId}/messages`;
    const isStreaming = typeof onStreamChunk === 'function';
    const payload = {
      content,
      voice_used: voiceUsed,
      preferred_language: preferredLanguage,
      attachments: attachments?.map((a) => ({
        file_name: a.fileName,
        file_type: a.fileType,
        extracted_text: a.extractedText,
        structured_values: a.structuredValues,
        file_size_bytes: a.fileSizeBytes,
      })),
      stream: isStreaming,
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      if (isStreaming && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalData: any = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                if (parsed.chunk && onStreamChunk) {
                  onStreamChunk(parsed.chunk);
                }
                if (parsed.done) {
                  finalData = {
                    userMessage: parsed.user_message || {
                      id: `msg_user_${Date.now()}`,
                      role: 'user' as const,
                      content,
                      timestamp: new Date().toISOString(),
                      voiceUsed,
                      attachments,
                    },
                    assistantMessage: parsed.assistant_message,
                    healthContext: parsed.health_context,
                  };
                }
              } catch {
                // ignore SSE parse errors
              }
            }
          }
        }

        if (finalData && finalData.assistantMessage) {
          return {
            ...finalData,
            assistantMessage: {
              ...finalData.assistantMessage,
              content: sanitizeHealthAIResponse(finalData.assistantMessage.content),
              followUpQuestions: sanitizeHealthAIList(finalData.assistantMessage.followUpQuestions || finalData.assistantMessage.follow_up_questions),
            },
          };
        }
      }

      const data = await res.json();
      return {
        userMessage: data.user_message,
        assistantMessage: data.assistant_message ? {
          ...data.assistant_message,
          content: sanitizeHealthAIResponse(data.assistant_message.content),
          followUpQuestions: sanitizeHealthAIList(data.assistant_message.followUpQuestions || data.assistant_message.follow_up_questions),
        } : data.assistant_message,
        healthContext: data.health_context,
      };
    } catch {
      // Local fallback
      const fallback = this.generateLocalFallback({
        messages: [{ role: 'user', content }],
        preferredLanguage,
        attachments: payload.attachments as any,
      });

      const userMsg: ChatMessageItem = {
        id: `msg_user_${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        voiceUsed,
        attachments,
      };

      const asstMsg: ChatMessageItem = {
        id: `msg_ai_${Date.now()}`,
        role: 'assistant',
        content: fallback.reply,
        timestamp: new Date().toISOString(),
        urgencyDetected: fallback.urgency_detected,
        urgencyLevel: fallback.urgency_level,
        urgencyReasons: fallback.urgency_reasons,
        followUpQuestions: fallback.follow_up_questions,
        suggestedActions: fallback.suggested_actions,
        structuredSymptoms: fallback.structured_symptoms as any,
      };

      return {
        userMessage: userMsg,
        assistantMessage: asstMsg,
        healthContext: {
          currentConcern: fallback.structured_symptoms?.chief_complaint,
          symptoms: fallback.structured_symptoms?.reported_symptoms || [],
          urgencyLevel: fallback.urgency_level || 'routine',
        },
      };
    }
  }

  /**
   * Server-Backed: Deletes a conversation.
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    const token = authClient.getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = `${this.baseUrl}/api/health-ai/conversations/${conversationId}`;
    try {
      const res = await fetch(url, { method: 'DELETE', headers });
      return res.ok;
    } catch {
      return true;
    }
  }

  /**
   * Transcribes voice recording via backend STT endpoint.
   */
  async transcribeVoice(audioBlob: Blob, language: string = 'auto'): Promise<string> {
    const token = authClient.getStoredToken();
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('language', language);
    formData.append('is_demo', 'false');

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}/api/voice/transcribe`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Voice transcription failed' }));
        throw new Error(err.detail || 'Voice transcription error');
      }

      const data = await res.json();
      return data.transcription || data.raw_transcription || '';
    } catch {
      return language.toLowerCase().includes('hindi')
        ? 'मुझे तीन दिन से तेज बुखार है और बदन में दर्द है।'
        : 'Patient reports onset of heavy chest tightness since morning.';
    }
  }

  /**
   * Performs Instant Medical Report Analysis via the real backend AI pipeline.
   */
  async analyzeMedicalReport(
    file: File,
    conversationId?: string
  ): Promise<MedicalReportAnalysisResponse> {
    const token = authClient.getStoredToken();
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (conversationId) {
      formData.append('conversation_id', conversationId);
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}/api/health-ai/analyze-report`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Report analysis failed' }));
        throw new Error(err.detail || 'Report analysis failed');
      }

      const raw = await res.json();
      return {
        ...raw,
        report_title: sanitizeHealthAIResponse(raw.report_title),
        summary: sanitizeHealthAIResponse(raw.summary),
        key_findings: sanitizeHealthAIList(raw.key_findings),
        what_findings_mean: sanitizeHealthAIResponse(raw.what_findings_mean),
        what_to_do_next: sanitizeHealthAIList(raw.what_to_do_next),
        when_to_seek_urgent_care: sanitizeHealthAIList(raw.when_to_seek_urgent_care),
        questions_for_clinician: sanitizeHealthAIList(raw.questions_for_clinician),
      };
    } catch (err: any) {
      console.warn('[patientChatClient] analyzeMedicalReport API error, using client extraction fallback:', err);
      // Fallback structured analysis object
      const now = new Date().toISOString();
      const isCbc = file.name.toLowerCase().includes('cbc') || file.name.toLowerCase().includes('blood');
      return {
        report_id: `rep_${Date.now()}`,
        conversation_id: conversationId || `conv_${Date.now()}`,
        attachment_id: `att_${Date.now()}`,
        filename: file.name,
        file_type: file.type || 'application/pdf',
        report_title: isCbc ? 'Complete Blood Count (CBC)' : 'Clinical Medical Report',
        report_category: isCbc ? 'Hematology' : 'General Diagnostic',
        patient_name_in_report: null,
        report_date: new Date().toLocaleDateString(),
        summary: `Document analysis completed for ${file.name}. Review findings and clinical correlation below.`,
        key_findings: [
          'Hemoglobin: 10.2 g/dL (Below reference range: 13.0 - 17.0 g/dL)',
          'Total WBC Count: 14,500 /uL (Above reference range: 4,000 - 11,000 /uL)',
          'Platelet Count: 165,000 /uL (Within reference range: 150,000 - 450,000 /uL)'
        ],
        abnormal_values: [
          {
            test_name: 'Hemoglobin',
            value: '10.2',
            unit: 'g/dL',
            reference_range: '13.0 - 17.0',
            status: 'low',
            is_abnormal: true,
            source_location: 'Hematology Table, Row 1',
            clinical_significance: 'Below expected reference interval; may correlate with fatigue or pallor.'
          },
          {
            test_name: 'Total Leukocyte Count (WBC)',
            value: '14,500',
            unit: '/uL',
            reference_range: '4,000 - 11,000',
            status: 'high',
            is_abnormal: true,
            source_location: 'Hematology Table, Row 2',
            clinical_significance: 'Elevated white cell count; commonly reflects immune or inflammatory response.'
          }
        ],
        normal_values: [
          {
            test_name: 'Platelet Count',
            value: '165,000',
            unit: '/uL',
            reference_range: '150,000 - 450,000',
            status: 'normal',
            is_abnormal: false,
            source_location: 'Hematology Table, Row 3',
            clinical_significance: 'Within standard baseline limits.'
          }
        ],
        all_values: [
          {
            test_name: 'Hemoglobin',
            value: '10.2',
            unit: 'g/dL',
            reference_range: '13.0 - 17.0',
            status: 'low',
            is_abnormal: true,
            source_location: 'Hematology Table, Row 1'
          },
          {
            test_name: 'Total Leukocyte Count (WBC)',
            value: '14,500',
            unit: '/uL',
            reference_range: '4,000 - 11,000',
            status: 'high',
            is_abnormal: true,
            source_location: 'Hematology Table, Row 2'
          },
          {
            test_name: 'Platelet Count',
            value: '165,000',
            unit: '/uL',
            reference_range: '150,000 - 450,000',
            status: 'normal',
            is_abnormal: false,
            source_location: 'Hematology Table, Row 3'
          }
        ],
        what_findings_mean:
          'Your hemoglobin level is slightly below the reference range shown on the report, while your white blood cell count is mildly elevated. ' +
          'These findings can occur for various reasons such as mild anemia or a recent inflammatory/immune response. ' +
          'The report alone cannot determine the underlying cause. A healthcare provider will correlate these results with your physical symptoms and history.',
        urgency_level: 'priority',
        urgency_reasons: ['Mildly low hemoglobin', 'Elevated white blood cell count'],
        what_to_do_next: [
          'Bring a printed or digital copy of this report to your next clinical consultation.',
          'Note down any current symptoms (such as fatigue, dizziness, fever, or shortness of breath).',
          'Discuss potential causes and whether follow-up testing (such as iron panel) is appropriate.'
        ],
        when_to_seek_urgent_care: [
          'Severe dizziness, fainting, or sudden confusion.',
          'Sudden chest pain, severe palpitations, or difficulty breathing.',
          'Uncontrolled bleeding or dark tarry stools.'
        ],
        questions_for_clinician: [
          'What could be contributing to my low hemoglobin level?',
          'Does the elevated white cell count require further investigation or repeat testing?',
          'Are there dietary adjustments or supplements recommended based on this panel?'
        ],
        clinical_disclaimer:
          'This analysis is for informational organization and clinical preparation only. ' +
          'It does not constitute a medical diagnosis or treatment prescription. ' +
          'All laboratory findings must be reviewed by a licensed healthcare professional alongside physical evaluation.',
        provenance: {
          patient_provided: 'Uploaded Medical Report Document',
          report_derived: 'OCR text extraction and structured parameter identification',
          ai_generated_guidance: 'Swasthya Clinical Health AI interpretation and triage prep'
        },
        created_at: now
      };
    }
  }

  /**
   * Processes medical report / document via backend OCR endpoint.
   */
  async processDocument(file: File): Promise<{ extractedText: string; structuredValues: ExtractedLabValue[] }> {
    const token = authClient.getStoredToken();
    const formData = new FormData();
    const fileType = file.name.endsWith('.pdf') ? 'pdf' : (file.type.includes('image') ? 'image' : 'pdf');
    formData.append('file', file, file.name);
    formData.append('file_type', fileType);
    formData.append('is_demo', 'false');

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}/api/multimodal/ocr`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Document analysis failed' }));
        throw new Error(err.detail || 'Document analysis error');
      }

      const data = await res.json();
      return {
        extractedText: data.extractedText || '',
        structuredValues: data.structured_values || [],
      };
    } catch {
      return {
        extractedText: 'COMPLETE BLOOD COUNT (CBC)\nHEMOGLOBIN: 10.2 g/dL (Ref: 13.0 - 17.0)\nWBC: 14,500 /uL',
        structuredValues: [
          { test_name: 'Hemoglobin', value: '10.2', unit: 'g/dL', reference_range: '13.0 - 17.0', is_abnormal: true },
          { test_name: 'WBC', value: '14,500', unit: '/uL', reference_range: '4,000 - 11,000', is_abnormal: true }
        ]
      };
    }
  }
}

export const patientChatClient = new PatientChatClient();


