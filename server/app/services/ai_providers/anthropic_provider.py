import time
import json
from typing import List, Optional, AsyncIterator, Dict, Any, Union
import httpx
from .base import BaseAIProvider, AIProviderMessage, AIProviderResponse, normalize_messages

class AnthropicProvider(BaseAIProvider):
    @property
    def provider_name(self) -> str:
        return "anthropic"

    def _build_anthropic_messages(
        self,
        messages: Union[List[AIProviderMessage], List[Any], Any]
    ) -> List[Dict[str, str]]:
        normalized = normalize_messages(messages)
        formatted = []
        for m in normalized:
            if m.role == "system":
                continue
            role = "user" if m.role in ["user", "patient"] else "assistant"
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
            raise ValueError("ANTHROPIC_API_KEY is not configured on the server.")

        # If system messages exist in messages, append them
        normalized = normalize_messages(messages)
        system_parts = []
        if system_instruction:
            system_parts.append(system_instruction)
        for m in normalized:
            if m.role == "system" and m.content:
                system_parts.append(m.content)

        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }
        payload: Dict[str, Any] = {
            "model": self.model_name or "claude-3-5-sonnet-20241022",
            "messages": self._build_anthropic_messages(messages),
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)

        start_time = time.time()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"Anthropic API error (HTTP {resp.status_code}): {resp.text[:300]}")
            data = resp.json()

        latency_ms = int((time.time() - start_time) * 1000)

        content_blocks = data.get("content", [])
        content_text = "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text")

        usage = data.get("usage", {})
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)

        return AIProviderResponse(
            content=content_text,
            provider=self.provider_name,
            model=self.model_name or "claude-3-5-sonnet-20241022",
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
            raise ValueError("ANTHROPIC_API_KEY is not configured on the server.")

        normalized = normalize_messages(messages)
        system_parts = []
        if system_instruction:
            system_parts.append(system_instruction)
        for m in normalized:
            if m.role == "system" and m.content:
                system_parts.append(m.content)

        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }
        payload: Dict[str, Any] = {
            "model": self.model_name or "claude-3-5-sonnet-20241022",
            "messages": self._build_anthropic_messages(messages),
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    raise RuntimeError(f"Anthropic Streaming error (HTTP {response.status_code}): {err_body.decode('utf-8', errors='ignore')[:300]}")
                
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        try:
                            event = json.loads(data_str)
                            event_type = event.get("type")
                            if event_type == "content_block_delta":
                                delta = event.get("delta", {})
                                if delta.get("type") == "text_delta":
                                    text_piece = delta.get("text", "")
                                    if text_piece:
                                        yield text_piece
                            elif event_type == "message_stop":
                                break
                        except Exception:
                            continue
