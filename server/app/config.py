import os
from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

class Settings(BaseSettings):
    PROJECT_NAME: str = "Swasthya Triage Backend"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "True").lower() == "true"
    
    # Security
    SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "swasthya-triage-hackathon-demo-secret-key-change-in-prod")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours for demo ease
    
    # AI Integration (Multi-Provider: gemini, openai, anthropic)
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "gemini")
    AI_MODEL: str = os.getenv("AI_MODEL", os.getenv("AI_MODEL_NAME", "gemini-3.1-flash-lite"))
    AI_MODEL_NAME: str = os.getenv("AI_MODEL_NAME", "gemini-3.1-flash-lite")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    AI_RATE_LIMIT: int = int(os.getenv("AI_RATE_LIMIT", "300"))
    FILE_UPLOAD_MAX_MB: int = int(os.getenv("FILE_UPLOAD_MAX_MB", "25"))
    AI_MAX_CONTEXT_MESSAGES: int = int(os.getenv("AI_MAX_CONTEXT_MESSAGES", "20"))

    # Speech-to-Text (STT) Configuration
    STT_PROVIDER: str = os.getenv("STT_PROVIDER", "gemini")  # "gemini", "groq", "openai", "mock"
    STT_API_KEY: str = os.getenv("STT_API_KEY", "")
    STT_MODEL: str = os.getenv("STT_MODEL", "gemini-3.1-flash-lite")

    MAX_AUDIO_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB max audio upload size
    
    # Database (SQLite default for demo, PostgreSQL ready)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./swasthya_triage.db")
    
    # SMTP / Email Service Configuration (Server-Side Secrets)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "no-reply@swasthyatriage.gov.in"
    SMTP_FROM_NAME: str = "Swasthya Triage"
    SMTP_USE_TLS: bool = True
    
    # OTP Security Parameters
    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RESEND_COOLDOWN_SECONDS: int = 60
    
    # CORS Configuration
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v_clean = v.strip()
            if not v_clean:
                return []
            if v_clean.startswith("[") and v_clean.endswith("]"):
                import json
                try:
                    return json.loads(v_clean)
                except Exception:
                    pass
            return [origin.strip() for origin in v_clean.split(",") if origin.strip()]
        return list(v) if v else []

    model_config = SettingsConfigDict(
        case_sensitive=False, 
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
        extra="ignore"
    )

settings = Settings()

