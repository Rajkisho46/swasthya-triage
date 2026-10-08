import time
import json
from typing import List, Optional, AsyncIterator, Dict, Any, Union
import httpx
from .base import BaseAIProvider, AIProviderMessage, AIProviderResponse, normalize_messages

class GeminiProvider(BaseAIProvider):
    @property
    def provider_name(self) -> str:
        return "gemini"

    def _build_gemini_payload(
        self,
        messages: Union[List[AIProviderMessage], List[Any], Any],
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> Dict[str, Any]:
        normalized = normalize_messages(messages)
        
        # Separate system messages from conversation messages
        system_parts = []
        if system_instruction and system_instruction.strip():
            system_parts.append(system_instruction.strip())

        conv_messages: List[AIProviderMessage] = []
        for m in normalized:
            if m.role == "system":
                if m.content and m.content.strip():
                    system_parts.append(m.content.strip())
            else:
                conv_messages.append(m)

        # Build contents with valid Gemini roles: 'user' and 'model'
        contents: List[Dict[str, Any]] = []
        for m in conv_messages:
            gemini_role = "user" if m.role in ["user", "patient"] else "model"
            text_content = m.content or ""
            
            # If the last item in contents already has this role, merge into parts
            if contents and contents[-1]["role"] == gemini_role:
                contents[-1]["parts"].append({"text": text_content})
            else:
                contents.append({
                    "role": gemini_role,
                    "parts": [{"text": text_content}]
                })

        # Gemini requires at least one user content
        if not contents:
            contents.append({
                "role": "user",
                "parts": [{"text": "Hello"}]
            })

        gen_config: Dict[str, Any] = {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }
        if json_mode:
            gen_config["responseMimeType"] = "application/json"

        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": gen_config
        }

        if system_parts:
            payload["systemInstruction"] = {
                "parts": [{"text": "\n\n".join(system_parts)}]
            }

        return payload

    async def generate_response(
        self,
        messages: Union[List[AIProviderMessage], List[Any], Any],
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> AIProviderResponse:
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not configured on the server.")

        models_to_try = [self.model_name]
        for fallback in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"]:
            if fallback not in models_to_try:
                models_to_try.append(fallback)

        payload = self._build_gemini_payload(messages, system_instruction, temperature, max_tokens, json_mode)
        last_error = None

        start_time = time.time()
        for candidate_model in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{candidate_model}:generateContent?key={self.api_key}"
            try:
                async with httpx.AsyncClient(timeout=12.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        latency_ms = int((time.time() - start_time) * 1000)

                        # Extract text response and token usage
                        candidates = data.get("candidates", [])
                        content_text = ""
                        if candidates and "content" in candidates[0] and "parts" in candidates[0]["content"]:
                            content_text = "".join(part.get("text", "") for part in candidates[0]["content"]["parts"])

                        usage = data.get("usageMetadata", {})
                        input_tokens = usage.get("promptTokenCount", 0)
                        output_tokens = usage.get("candidatesTokenCount", 0)

                        return AIProviderResponse(
                            content=content_text,
                            provider=self.provider_name,
                            model=candidate_model,
                            input_tokens=input_tokens,
                            output_tokens=output_tokens,
                            latency_ms=latency_ms,
                            raw_response=data
                        )
                    elif resp.status_code in [400, 401, 403]:
                        # Key unauthorized / invalid - do not repeat for other models
                        last_error = f"Gemini API authentication error (HTTP {resp.status_code}): {resp.text[:200]}"
                        break
                    else:
                        last_error = f"Gemini API error (HTTP {resp.status_code}) on {candidate_model}: {resp.text[:200]}"
            except Exception as exc:
                last_error = f"Gemini network error on {candidate_model}: {str(exc)}"

        raise RuntimeError(last_error or "Gemini API failed on all candidate models")

    async def generate_stream(
        self,
        messages: Union[List[AIProviderMessage], List[Any], Any],
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> AsyncIterator[str]:
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not configured on the server.")

        models_to_try = [self.model_name]
        for fallback in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"]:
            if fallback not in models_to_try:
                models_to_try.append(fallback)

        payload = self._build_gemini_payload(messages, system_instruction, temperature, max_tokens, json_mode)

        for candidate_model in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{candidate_model}:streamGenerateContent?alt=sse&key={self.api_key}"
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    async with client.stream("POST", url, json=payload) as response:
                        if response.status_code == 200:
                            async for line in response.aiter_lines():
                                if not line:
                                    continue
                                if line.startswith("data: "):
                                    json_str = line[6:].strip()
                                    if json_str == "[DONE]":
                                        break
                                    try:
                                        chunk_data = json.loads(json_str)
                                        candidates = chunk_data.get("candidates", [])
                                        if candidates and "content" in candidates[0] and "parts" in candidates[0]["content"]:
                                            text_piece = "".join(part.get("text", "") for part in candidates[0]["content"]["parts"])
                                            if text_piece:
                                                yield text_piece
                                    except Exception:
                                        continue
                            return
                        elif response.status_code in [400, 401, 403]:
                            break
            except Exception:
                continue
