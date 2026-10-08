from abc import ABC, abstractmethod
from typing import List, Optional, AsyncIterator, Dict, Any, Union
from pydantic import BaseModel, Field

class AIProviderMessage(BaseModel):
    role: str = Field(default="user", description="'user' | 'assistant' | 'model' | 'system'")
    content: str = Field(..., description="Message text content")

    @classmethod
    def from_any(cls, obj: Any) -> "AIProviderMessage":
        if isinstance(obj, AIProviderMessage):
            return obj
        if isinstance(obj, str):
            return cls(role="user", content=obj)
        if isinstance(obj, dict):
            raw_role = obj.get("role") or obj.get("sender_type") or "user"
            raw_content = obj.get("content") or obj.get("text") or ""
            role = "user" if raw_role in ["user", "patient"] else ("system" if raw_role == "system" else "assistant")
            return cls(role=role, content=str(raw_content))
        if hasattr(obj, "role") and hasattr(obj, "content"):
            return cls(role=str(getattr(obj, "role")), content=str(getattr(obj, "content")))
        if hasattr(obj, "sender_type") and hasattr(obj, "content"):
            raw_sender = getattr(obj, "sender_type")
            role = "user" if raw_sender == "patient" else "assistant"
            return cls(role=role, content=str(getattr(obj, "content")))
        if hasattr(obj, "content"):
            return cls(role="user", content=str(getattr(obj, "content")))
        return cls(role="user", content=str(obj))

def normalize_messages(messages: Union[List[Any], Any]) -> List[AIProviderMessage]:
    """Normalizes any sequence of strings, dicts, model objects, or AIProviderMessage into List[AIProviderMessage]."""
    if not messages:
        return []
    if isinstance(messages, (str, dict, AIProviderMessage)) or not isinstance(messages, (list, tuple)):
        return [AIProviderMessage.from_any(messages)]
    return [AIProviderMessage.from_any(m) for m in messages]

class AIProviderResponse(BaseModel):
    content: str
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    raw_response: Optional[Dict[str, Any]] = None

class BaseAIProvider(ABC):
    def __init__(self, api_key: str, model_name: str):
        self.api_key = api_key.strip()
        self.model_name = model_name.strip()

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Returns the canonical provider identifier ('gemini', 'openai', 'anthropic')."""
        pass

    @abstractmethod
    async def generate_response(
        self,
        messages: Union[List[AIProviderMessage], List[Any], Any],
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> AIProviderResponse:
        """Generates a complete response from the AI model."""
        pass

    @abstractmethod
    async def generate_stream(
        self,
        messages: Union[List[AIProviderMessage], List[Any], Any],
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> AsyncIterator[str]:
        """Yields streaming chunks/tokens progressively as they arrive from the AI provider."""
        pass
