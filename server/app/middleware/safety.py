import json
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
from ..utils.validation import check_ai_safety_compliance

class SafetyComplianceMiddleware(BaseHTTPMiddleware):
    """
    Outbound Response Safety Middleware.
    Inspects responses from triage and AI structuring endpoints.
    If diagnostic claims, prescriptions, or autonomous dispositions are detected,
    it sanitizes the response or triggers safety alerts.
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Only inspect JSON responses on /api/ routes
        if request.url.path.startswith("/api/triage") and response.headers.get("content-type") == "application/json":
            # Read response body
            body_chunks = [chunk async for chunk in response.body_iterator]
            body_bytes = b"".join(body_chunks)
            
            try:
                data = json.loads(body_bytes.decode("utf-8"))
                
                # Check for prohibited medical advice in text fields
                summary_text = ""
                if isinstance(data, dict):
                    if "ai_advisory" in data and isinstance(data["ai_advisory"], dict):
                        summary_text = data["ai_advisory"].get("ai_summary", "")
                    elif "data" in data and isinstance(data["data"], dict):
                        summary_text = data["data"].get("aiSummary", "")

                if summary_text:
                    is_safe, reason = check_ai_safety_compliance(summary_text)
                    if not is_safe:
                        # Sanitize / Replace with safe advisory statement
                        sanitized_msg = "Informational advisory summary generated. Clinician review is required for medical evaluation."
                        if "ai_advisory" in data and isinstance(data["ai_advisory"], dict):
                            data["ai_advisory"]["ai_summary"] = sanitized_msg
                        if "data" in data and isinstance(data["data"], dict):
                            data["data"]["aiSummary"] = sanitized_msg
                        
                        return JSONResponse(content=data, status_code=response.status_code)

                return Response(
                    content=body_bytes,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type="application/json"
                )
            except Exception:
                return Response(
                    content=body_bytes,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type
                )

        return response
