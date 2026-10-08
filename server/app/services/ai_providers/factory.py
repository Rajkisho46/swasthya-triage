from typing import Optional
from ...config import settings
from .base import BaseAIProvider, AIProviderMessage, AIProviderResponse
from .gemini_provider import GeminiProvider
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider

def get_ai_provider(provider_name: Optional[str] = None, model_name: Optional[str] = None) -> BaseAIProvider:
    selected = (provider_name or settings.AI_PROVIDER or "gemini").strip().lower()
    
    if selected == "openai":
        return OpenAIProvider(
            api_key=settings.OPENAI_API_KEY,
            model_name=model_name or settings.AI_MODEL or "gpt-4o-mini"
        )
    elif selected == "anthropic":
        return AnthropicProvider(
            api_key=settings.ANTHROPIC_API_KEY,
            model_name=model_name or settings.AI_MODEL or "claude-3-5-sonnet-20241022"
        )
    else:  # Default to gemini
        return GeminiProvider(
            api_key=settings.GEMINI_API_KEY,
            model_name=model_name or settings.AI_MODEL or settings.AI_MODEL_NAME or "gemini-1.5-flash"
        )
