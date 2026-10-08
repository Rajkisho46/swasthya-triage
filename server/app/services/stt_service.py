import base64
import os
import re
from abc import ABC, abstractmethod
from typing import Optional, Tuple, Set
import httpx

from ..config import settings
from ..schemas.voice import VoiceTranscriptionResponse
from ..schemas.multimodal import STTResponse

# Supported browser-recorded MIME types
SUPPORTED_MIME_TYPES: Set[str] = {
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/ogg",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/aac",
    "audio/flac",
    "application/octet-stream"
}

def normalize_mime_type(mime_type: Optional[str], filename: Optional[str] = None) -> str:
    """Safely normalizes MIME type from header or file extension."""
    if mime_type:
        clean_mime = mime_type.lower().split(";")[0].strip()
        if clean_mime in ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/aac", "audio/flac"]:
            return clean_mime
    
    if filename:
        ext = os.path.splitext(filename.lower())[1]
        ext_map = {
            ".webm": "audio/webm",
            ".ogg": "audio/ogg",
            ".mp4": "audio/mp4",
            ".m4a": "audio/mp4",
            ".wav": "audio/wav",
            ".mp3": "audio/mpeg",
            ".aac": "audio/aac",
            ".flac": "audio/flac"
        }
        if ext in ext_map:
            return ext_map[ext]

    return "audio/webm"


class ISpeechToTextService(ABC):
    """
    Abstract Speech-to-Text Provider Interface.
    Must output raw verbatim spoken transcription without summarization or diagnostic changes.
    """

    @abstractmethod
    async def transcribe(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/webm",
        language: str = "auto",
        filename: str = "recording.webm"
    ) -> VoiceTranscriptionResponse:
        pass


class MockSpeechToTextService(ISpeechToTextService):
    """
    Deterministic Demo Speech-to-Text Provider.
    Used when live STT credentials are unset or for pre-loaded scenarios.
    """
    DEMO_TRANSCRIPTS = {
        "hindi_cardio": "मुझे पिछले तीन दिनों से सीने में भारीपन और सांस लेने में बहुत तकलीफ हो रही है।",
        "hindi_fever": "मुझे तीन दिन से बहुत तेज बुखार आ रहा है और कमजोरी लग रही है। कल से सांस लेने में भी थोड़ी तकलीफ हो रही है।",
        "english_cardio": "Patient reports onset of heavy chest tightness since morning radiating slightly to the left shoulder, with breathlessness while walking up stairs.",
        "english_child": "My 5-year-old child has had continuous barking cough and high body temperature for the past 2 days. Not eating properly."
    }

    async def transcribe(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/webm",
        language: str = "auto",
        filename: str = "recording.webm"
    ) -> VoiceTranscriptionResponse:
        lang_lower = (language or "").lower()
        if "hin" in lang_lower:
            chosen = self.DEMO_TRANSCRIPTS["hindi_fever"]
            detected_lang = "Hindi"
        elif "child" in filename.lower() or "pediatric" in filename.lower():
            chosen = self.DEMO_TRANSCRIPTS["english_child"]
            detected_lang = "English"
        elif "eng" in lang_lower:
            chosen = self.DEMO_TRANSCRIPTS["english_cardio"]
            detected_lang = "English"
        else:
            chosen = self.DEMO_TRANSCRIPTS["english_cardio"]
            detected_lang = "English" if language == "auto" else language

        return VoiceTranscriptionResponse(
            success=True,
            transcription=chosen,
            raw_transcription=chosen,
            language=detected_lang,
            provider="Demo Voice Recognition Provider (Simulated)",
            is_demo_transcription=True,
            provenance="Patient-Provided",
            confidence=0.96,
            duration_seconds=5.0,
            status="completed"
        )


def detect_transcription_language(text: str, default_lang: str = "auto") -> str:
    if default_lang and default_lang.lower() not in ["auto", "none"]:
        return default_lang
    if not text:
        return "English"
    if re.search(r"[\u0B00-\u0B7F]", text):
        return "Odia"
    if re.search(r"[\u0980-\u09FF]", text):
        return "Bengali"
    if re.search(r"[\u0C00-\u0C7F]", text):
        return "Telugu"
    if re.search(r"[\u0B80-\u0BFF]", text):
        return "Tamil"
    if re.search(r"[\u0C80-\u0CFF]", text):
        return "Kannada"
    if re.search(r"[\u0D00-\u0D7F]", text):
        return "Malayalam"
    if re.search(r"[\u0A80-\u0AFF]", text):
        return "Gujarati"
    if re.search(r"[\u0A00-\u0A7F]", text):
        return "Punjabi"
    if re.search(r"[\u0900-\u097F]", text):
        marathi_markers = ["आहे", "नाही", "मला", "होते", "ताप", "डोकेदुखी", "पोटात", "छातीत"]
        if any(m in text for m in marathi_markers):
            return "Marathi"
        return "Hindi"
    return "English"


class GeminiSpeechToTextService(ISpeechToTextService):
    """
    Real Google Gemini Multimodal Audio Speech-to-Text Provider.
    Transcribes audio verbatim preserving spoken language and vocabulary.
    """

    SYSTEM_STT_PROMPT = (
        "You are a verbatim speech-to-text transcription engine for patient intake.\n"
        "TASK:\n"
        "Transcribe the spoken audio recording EXACTLY as spoken by the patient or speaker.\n\n"
        "MANDATORY CONSTRAINTS:\n"
        "1. Transcribe strictly verbatim. Preserve exact words, hesitations, and language (e.g. Hindi, Odia, Bengali, Telugu, Tamil, Kannada, Malayalam, Marathi, Gujarati, Punjabi, English, Hinglish, regional terms).\n"
        "2. DO NOT summarize.\n"
        "3. DO NOT diagnose or infer medical conditions.\n"
        "4. DO NOT rewrite, correct, or normalize the patient's complaint into clinical medical terminology.\n"
        "5. DO NOT convert it into medical advice.\n"
        "6. DO NOT add symptoms that were not spoken.\n"
        "7. DO NOT translate the speech unless it is spoken in that language.\n"
        "8. Output ONLY the raw transcription text without quotes, markdown headers, or explanations."
    )

    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash"):
        self.api_key = api_key
        self.model_name = model_name or "gemini-2.5-flash"

    async def transcribe(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/webm",
        language: str = "auto",
        filename: str = "recording.webm"
    ) -> VoiceTranscriptionResponse:
        normalized_mime = normalize_mime_type(mime_type, filename)
        b64_audio = base64.b64encode(audio_bytes).decode("utf-8")

        lang_hint = f" Language hint: {language}." if language and language.lower() not in ["auto", "none"] else ""
        user_prompt = f"{self.SYSTEM_STT_PROMPT}{lang_hint}\n\nTranscribe the attached audio recording accurately:"

        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": normalized_mime,
                                "data": b64_audio
                            }
                        },
                        {
                            "text": user_prompt
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.0
            }
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(endpoint, json=payload)
            if response.status_code != 200:
                raise RuntimeError(f"Gemini API returned HTTP {response.status_code}: {response.text[:200]}")

            data = response.json()
            raw_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            
            cleaned = raw_text.strip()
            # Remove enclosing quotes if model wrapped text in quotes
            if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
                cleaned = cleaned[1:-1].strip()

            if not cleaned:
                raise RuntimeError("Empty transcription returned from Gemini STT provider")

            detected_lang = detect_transcription_language(cleaned, language)

            return VoiceTranscriptionResponse(
                success=True,
                transcription=cleaned,
                raw_transcription=cleaned,
                language=detected_lang,
                provider=f"Gemini Speech-to-Text ({self.model_name})",
                is_demo_transcription=False,
                provenance="Patient-Provided",
                confidence=0.98,
                status="completed"
            )


class WhisperSpeechToTextService(ISpeechToTextService):
    """
    OpenAI / Groq Whisper Speech-to-Text Provider.
    """
    def __init__(self, api_key: str, endpoint_url: str, model_name: str = "whisper-large-v3-turbo"):
        self.api_key = api_key
        self.endpoint_url = endpoint_url
        self.model_name = model_name

    async def transcribe(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/webm",
        language: str = "auto",
        filename: str = "recording.webm"
    ) -> VoiceTranscriptionResponse:
        normalized_mime = normalize_mime_type(mime_type, filename)
        files = {"file": (filename or "recording.webm", audio_bytes, normalized_mime)}
        data = {"model": self.model_name}
        if language and language.lower() not in ["auto", "none"]:
            data["language"] = "hi" if "hin" in language.lower() else "en"

        headers = {"Authorization": f"Bearer {self.api_key}"}

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(self.endpoint_url, files=files, data=data, headers=headers)
            if response.status_code != 200:
                raise RuntimeError(f"Whisper API returned HTTP {response.status_code}: {response.text[:200]}")

            res_data = response.json()
            raw_text = res_data.get("text", "").strip()

            if not raw_text:
                raise RuntimeError("Empty transcription returned from Whisper STT provider")

            detected_lang = detect_transcription_language(raw_text, language)

            return VoiceTranscriptionResponse(
                success=True,
                transcription=raw_text,
                raw_transcription=raw_text,
                language=detected_lang,
                provider=f"Whisper STT ({self.model_name})",
                is_demo_transcription=False,
                provenance="Patient-Provided",
                confidence=0.96,
                status="completed"
            )


class SpeechToTextService:
    """
    Main Speech-to-Text Service Coordinator and Factory.
    Validates audio metadata, selects provider, and executes robust fallback.
    """

    @classmethod
    def get_provider(cls) -> Tuple[ISpeechToTextService, bool]:
        """
        Instantiates configured STT provider. Returns (provider, is_live).
        """
        provider_type = (settings.STT_PROVIDER or "gemini").lower()
        api_key = settings.STT_API_KEY or settings.GEMINI_API_KEY

        if not api_key or len(api_key.strip()) < 5:
            return MockSpeechToTextService(), False

        if provider_type == "groq":
            return WhisperSpeechToTextService(
                api_key=api_key,
                endpoint_url="https://api.groq.com/openai/v1/audio/transcriptions",
                model_name=settings.STT_MODEL or "whisper-large-v3-turbo"
            ), True
        elif provider_type == "openai":
            return WhisperSpeechToTextService(
                api_key=api_key,
                endpoint_url="https://api.openai.com/v1/audio/transcriptions",
                model_name=settings.STT_MODEL or "whisper-1"
            ), True
        else:
            # Default to Google Gemini multimodal STT
            return GeminiSpeechToTextService(
                api_key=api_key,
                model_name=settings.STT_MODEL or settings.AI_MODEL_NAME or "gemini-2.5-flash"
            ), True

    @classmethod
    def validate_audio(cls, audio_bytes: Optional[bytes], mime_type: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """
        Validates audio file existence, size, and MIME type.
        """
        if not audio_bytes or len(audio_bytes) == 0:
            return False, "Audio file is empty. Please record audio or provide a valid audio sample."

        if len(audio_bytes) > settings.MAX_AUDIO_SIZE_BYTES:
            return False, f"Audio file exceeds maximum size limit of {settings.MAX_AUDIO_SIZE_BYTES // (1024 * 1024)}MB."

        if mime_type:
            clean_mime = mime_type.lower().split(";")[0].strip()
            if clean_mime not in SUPPORTED_MIME_TYPES and not clean_mime.startswith("audio/"):
                return False, f"Unsupported audio format '{mime_type}'. Supported formats: audio/webm, audio/ogg, audio/mp4, audio/wav, audio/mpeg."

        return True, None

    @classmethod
    async def transcribe(
        cls,
        audio_bytes: Optional[bytes],
        mime_type: str = "audio/webm",
        language: str = "auto",
        filename: str = "recording.webm",
        is_demo: bool = False
    ) -> VoiceTranscriptionResponse:
        """
        Public transcription pipeline.
        Enforces non-diagnostic verbatim extraction and fallback handling.
        """
        if is_demo or not audio_bytes:
            mock = MockSpeechToTextService()
            return await mock.transcribe(
                audio_bytes=audio_bytes or b"",
                mime_type=mime_type,
                language=language,
                filename=filename
            )

        # Validate
        is_valid, err_msg = cls.validate_audio(audio_bytes, mime_type)
        if not is_valid:
            return VoiceTranscriptionResponse(
                success=False,
                transcription="",
                raw_transcription="",
                language=language,
                provider="Audio Validation",
                is_demo_transcription=False,
                provenance="Patient-Provided",
                status="failed",
                error=err_msg
            )

        provider, is_live = cls.get_provider()
        if not is_live:
            # Fallback to demo
            mock = MockSpeechToTextService()
            return await mock.transcribe(
                audio_bytes=audio_bytes,
                mime_type=mime_type,
                language=language,
                filename=filename
            )

        try:
            return await provider.transcribe(
                audio_bytes=audio_bytes,
                mime_type=mime_type,
                language=language,
                filename=filename
            )
        except Exception as exc:
            # Graceful fallback to demo provider with explicit indicator
            mock = MockSpeechToTextService()
            fallback_res = await mock.transcribe(
                audio_bytes=audio_bytes,
                mime_type=mime_type,
                language=language,
                filename=filename
            )
            fallback_res.error = f"Real STT provider failed ({type(exc).__name__}). Demo transcription fallback engaged."
            return fallback_res

    @classmethod
    async def transcribe_audio(
        cls,
        audio_bytes: Optional[bytes] = None,
        language: str = "Hindi",
        is_demo: bool = True
    ) -> STTResponse:
        """
        Legacy wrapper preserving backward compatibility with existing multimodal tests.
        """
        res = await cls.transcribe(
            audio_bytes=audio_bytes,
            mime_type="audio/webm",
            language=language,
            filename="audio.webm",
            is_demo=is_demo
        )
        return STTResponse(
            success=res.success,
            transcript=res.transcription or res.raw_transcription or "",
            language=res.language,
            durationSeconds=res.duration_seconds or 4.5,
            source=res.provider,
            isDemoTranscription=res.is_demo_transcription,
            confidence=res.confidence or 0.95,
            status=res.status
        )
