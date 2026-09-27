# Vercel Environment Variables Specification: Swasthya Triage

This document specifies all environment variables required for deploying **Swasthya Triage** (Unified Vite Frontend + FastAPI Backend) to production on Vercel.

---

## 1. Classification Summary

| Variable Name | Scope / Target | Security Classification | Default / Required in Production |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Vercel Backend / Server | **SERVER ONLY / SECRET** | **REQUIRED** (PostgreSQL connection string) |
| `JWT_SECRET_KEY` | Vercel Backend / Server | **SERVER ONLY / SECRET** | **REQUIRED** (Strong random 256-bit key) |
| `GEMINI_API_KEY` | Vercel Backend / Server | **SERVER ONLY / SECRET** | **REQUIRED** (Google AI Studio / Vertex API Key) |
| `AI_MODEL_NAME` | Vercel Backend / Server | SERVER ONLY / CONFIG | Optional (Default: `gemini-1.5-flash`) |
| `STT_PROVIDER` | Vercel Backend / Server | SERVER ONLY / CONFIG | Optional (Default: `gemini`) |
| `STT_API_KEY` | Vercel Backend / Server | **SERVER ONLY / SECRET** | Optional (Uses `GEMINI_API_KEY` if blank) |
| `STT_MODEL` | Vercel Backend / Server | SERVER ONLY / CONFIG | Optional (Default: `gemini-1.5-flash`) |
| `ENVIRONMENT` | Vercel Backend / Server | SERVER ONLY / CONFIG | Recommended: `production` |
| `DEBUG` | Vercel Backend / Server | SERVER ONLY / CONFIG | Recommended: `False` |
| `CORS_ORIGINS` | Vercel Backend / Server | SERVER ONLY / CONFIG | Optional (Defaults cover local & same-origin) |
| `SMTP_HOST` | Vercel Backend / Server | SERVER ONLY / CONFIG | Optional (e.g., `smtp.gmail.com` for live OTPs) |
| `SMTP_PORT` | Vercel Backend / Server | SERVER ONLY / CONFIG | Optional (Default: `587`) |
| `SMTP_USERNAME` | Vercel Backend / Server | SERVER ONLY / SECRET | Optional (SMTP account email) |
| `SMTP_PASSWORD` | Vercel Backend / Server | **SERVER ONLY / SECRET** | Optional (SMTP app password) |
| `SMTP_FROM_EMAIL` | Vercel Backend / Server | SERVER ONLY / CONFIG | Optional (Default: `no-reply@swasthyatriage.gov.in`) |
| `SMTP_FROM_NAME` | Vercel Backend / Server | SERVER ONLY / CONFIG | Optional (Default: `Swasthya Triage`) |
| `SMTP_USE_TLS` | Vercel Backend / Server | SERVER ONLY / CONFIG | Optional (Default: `True`) |
| `VITE_API_BASE_URL` | Frontend (Build-time) | **PUBLIC / FRONTEND SAFE** | **Leave Empty** (Enables same-origin `/api/...`) |

---

## 2. Server-Only Environment Variables Detail

### Core Database
- **`DATABASE_URL`**
  - **Type**: `string`
  - **Classification**: **SERVER ONLY / SECRET**
  - **Format**: `postgresql+asyncpg://<username>:<password>@<host>:<port>/<dbname>?sslmode=require`
  - *Note*: Standard `postgres://` or `postgresql://` URIs provided by Neon, Supabase, Vercel Postgres, or AWS RDS are automatically normalized by the application backend to asyncpg driver format.
  - *Do NOT expose this in frontend code.*

### Security & Tokens
- **`JWT_SECRET_KEY`**
  - **Type**: `string`
  - **Classification**: **SERVER ONLY / SECRET**
  - **Purpose**: Signs and verifies HMAC-SHA256 JWT access tokens for RBAC authentication (Doctor, Nurse, Patient, Admin).
  - *Generate using*: `python -c "import secrets; print(secrets.token_hex(32))"`

### AI Clinical Decision Support & Speech-to-Text
- **`GEMINI_API_KEY`**
  - **Type**: `string`
  - **Classification**: **SERVER ONLY / SECRET**
  - **Purpose**: Authenticates server-side requests to Gemini for clinical intake structuring and verbatim multi-language audio transcription.
  - *Deterministic safety rules run independently regardless of AI key presence.*

- **`AI_MODEL_NAME`**
  - **Type**: `string`
  - **Classification**: `SERVER ONLY / CONFIG`
  - **Default**: `gemini-1.5-flash`

- **`STT_PROVIDER`**
  - **Type**: `string`
  - **Options**: `gemini`, `groq`, `openai`, `mock`
  - **Default**: `gemini`

### Email Delivery (Patient OTPs & Verification)
- **`SMTP_HOST`**: e.g., `smtp.gmail.com` or `smtp.sendgrid.net`
- **`SMTP_PORT`**: `587` (TLS) or `465` (SSL)
- **`SMTP_USERNAME`**: SMTP username / email address
- **`SMTP_PASSWORD`**: SMTP application password (**SERVER ONLY / SECRET**)
- *Note*: If SMTP credentials are not configured, OTP tokens are securely logged server-side for development and demonstration verification.

---

## 3. Frontend Environment Variables Detail

- **`VITE_API_BASE_URL`**
  - **Classification**: **PUBLIC / FRONTEND SAFE**
  - **Recommended Value for Vercel**: `""` (Empty string)
  - When empty, the React single-page application issues all API requests to same-origin paths (`/api/intake`, `/api/cases`, `/api/auth/login`, `/api/health`), which Vercel routes seamlessly to `api/index.py`.

---

## 4. Security Rules & Hygiene
1. **Never** prefix backend secrets (like `JWT_SECRET_KEY`, `DATABASE_URL`, or `GEMINI_API_KEY`) with `VITE_`.
2. Any variable with `VITE_` prefix is bundled into the client-side JavaScript bundle and publicly visible in browser DevTools.
3. Configure all secrets strictly in the **Vercel Project Settings -> Environment Variables** dashboard.
