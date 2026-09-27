from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .models.database import init_db
from .api.routes import api_router
from .middleware.safety import SafetyComplianceMiddleware

import logging

logger = logging.getLogger("uvicorn.info")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables
    await init_db()
    
    # Validate SMTP Email Service Configuration safely (Never print secrets)
    smtp_ok = bool(settings.SMTP_HOST and settings.SMTP_PORT)
    if smtp_ok:
        logger.info(f"SMTP email service configured: YES (Host: {settings.SMTP_HOST}:{settings.SMTP_PORT}, From: {settings.SMTP_FROM_NAME})")
    else:
        logger.warning("SMTP email service configured: NO. Real Gmail email delivery is unavailable. Please set SMTP_HOST, SMTP_PORT, SMTP_USERNAME, and SMTP_PASSWORD in .env.")
    
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Safety-First Clinical Decision Support API Layer for Swasthya Triage",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

@app.get("/docs", include_in_schema=False)
async def redirect_docs():
    return RedirectResponse(url="/api/docs")

@app.get("/redoc", include_in_schema=False)
async def redirect_redoc():
    return RedirectResponse(url="/api/redoc")

# 1. Safety Compliance Middleware (sanitizes outbound diagnostic / prescription claims)
app.add_middleware(SafetyComplianceMiddleware)

# 2. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Mount Modular API Routes
app.include_router(api_router, prefix=settings.API_PREFIX)

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "Swasthya Triage Backend",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "ai_provider_configured": bool(settings.GEMINI_API_KEY)
    }

# Safe Global Exception Handler to avoid stack trace leaks
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": "An internal server error occurred while processing the clinical request.",
            "error_type": type(exc).__name__
        }
    )
