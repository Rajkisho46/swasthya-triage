import time
import json
from typing import List, Optional, AsyncIterator, Dict, Any, Union
import httpx
from .base import BaseAIProvider, AIProviderMessage, AIProviderResponse, normalize_messages

class OpenAIProvider(BaseAIProvider):
    @property
    def provider_name(self) -> str:
        return "openai"

    def _build_openai_messages(
        self,
        messages: Union[List[AIProviderMessage], List[Any], Any],
        system_instruction: Optional[str] = None
    ) -> List[Dict[str, str]]:
        normalized = normalize_messages(messages)
        formatted = []
        if system_instruction:
            formatted.append({"role": "system", "content": system_instruction})
        for m in normalized:
            role = "user" if m.role in ["user", "patient"] else ("assistant" if m.role in ["assistant", "model"] else "system")
            formatted.append({"role": role, "content": m.content})
        return formatted

    async def generate_response(
        self,
        messages: Union[List[AIProviderMessage], List[Any], Any],
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> AIProviderResponse:
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is not configured on the server.")

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload: Dict[str, Any] = {
            "model": self.model_name or "gpt-4o-mini",
            "messages": self._build_openai_messages(messages, system_instruction),
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        start_time = time.time()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"OpenAI API error (HTTP {resp.status_code}): {resp.text[:300]}")
            data = resp.json()

        latency_ms = int((time.time() - start_time) * 1000)

        choices = data.get("choices", [])
        content_text = ""
        if choices and "message" in choices[0]:
            content_text = choices[0]["message"].get("content", "")

        usage = data.get("usage", {})
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)

        return AIProviderResponse(
            content=content_text,
            provider=self.provider_name,
            model=self.model_name or "gpt-4o-mini",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            raw_response=data
        )

    async def generate_stream(
        self,
        messages: Union[List[AIProviderMessage], List[Any], Any],
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> AsyncIterator[str]:
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is not configured on the server.")

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model_name or "gpt-4o-mini",
            "messages": self._build_openai_messages(messages, system_instruction),
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    raise RuntimeError(f"OpenAI Streaming error (HTTP {response.status_code}): {err_body.decode('utf-8', errors='ignore')[:300]}")
                
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices", [])
                            if choices and "delta" in choices[0] and "content" in choices[0]["delta"]:
                                text_piece = choices[0]["delta"]["content"]
                                if text_piece:
                                    yield text_piece
                        except Exception:
                            continue
