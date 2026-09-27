import uuid
import re
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from server.app.config import settings
from server.app.main import app
from server.app.models.database import init_db
from server.app.services.email_service import clear_dev_outbox, get_dev_outbox
from server.app.utils.security import verify_password, hash_password, verify_otp, hash_otp

@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    settings.ENVIRONMENT = "test"
    await init_db()
    clear_dev_outbox()

@pytest.mark.asyncio
async def test_patient_registration_flow_with_email_otp():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unique_email = f"patient_{uuid.uuid4().hex[:6]}@gmail.com"

        # 1. Register with invalid password -> 400 or 422
        bad_pw_resp = await client.post(
            "/api/patient/auth/register",
            json={
                "full_name": "Test Patient",
                "email": f"bad_{unique_email}",
                "password": "short"
            }
        )
        assert bad_pw_resp.status_code in [400, 422]

        # 2. Register with valid details
        reg_resp = await client.post(
            "/api/patient/auth/register",
            json={
                "full_name": "Rajesh Kumar",
                "email": unique_email,
                "password": "SecurePassword123"
            }
        )
        assert reg_resp.status_code == 200
        data = reg_resp.json()
        assert data["status"] == "success"
        assert "otp" not in str(data).lower()  # OTP NEVER returned in API response

        # 3. Check outbox for OTP email dispatch
        outbox = get_dev_outbox()
        assert len(outbox) >= 1
        last_email = outbox[-1]
        assert unique_email in last_email["to"]
        assert "Verify Your Email" in last_email["subject"]

        match = re.search(r"\b\d{6}\b", last_email["text"])
        assert match is not None
        otp = match.group(0)

        # 4. Attempt login before email verification -> 403 Forbidden
        pre_login = await client.post(
            "/api/patient/auth/login",
            json={
                "email": unique_email,
                "password": "SecurePassword123"
            }
        )
        assert pre_login.status_code == 403

        # 5. Verify email with wrong OTP -> 400
        bad_otp_resp = await client.post(
            "/api/patient/auth/verify-email",
            json={
                "email": unique_email,
                "otp": "000000"
            }
        )
        assert bad_otp_resp.status_code == 400

        # 6. Verify email with correct OTP -> 200 & JWT issued
        verify_resp = await client.post(
            "/api/patient/auth/verify-email",
            json={
                "email": unique_email,
                "otp": otp
            }
        )
        assert verify_resp.status_code == 200
        auth_data = verify_resp.json()
        assert auth_data["role"] == "PATIENT"
        assert auth_data["access_token"]
        assert auth_data["user"]["emailVerified"] == True
        assert auth_data["user"]["fullName"] == "Rajesh Kumar"

        # 7. Attempt OTP replay (single-use check) -> 400
        replay_resp = await client.post(
            "/api/patient/auth/verify-email",
            json={
                "email": unique_email,
                "otp": otp
            }
        )
        assert replay_resp.status_code == 400

        # 8. Subsequent login with email and password without OTP -> 200
        login_resp = await client.post(
            "/api/patient/auth/login",
            json={
                "email": unique_email.upper(),  # Case-insensitive
                "password": "SecurePassword123"
            }
        )
        assert login_resp.status_code == 200
        login_data = login_resp.json()
        assert login_data["role"] == "PATIENT"
        assert login_data["access_token"]

        # 9. Duplicate registration for verified account -> 400
        dup_resp = await client.post(
            "/api/patient/auth/register",
            json={
                "full_name": "Another User",
                "email": unique_email,
                "password": "SecurePassword123"
            }
        )
        assert dup_resp.status_code == 400

        # 10. Wrong password fails with 401
        wrong_pw = await client.post(
            "/api/patient/auth/login",
            json={
                "email": unique_email,
                "password": "WrongPassword999"
            }
        )
        assert wrong_pw.status_code == 401

@pytest.mark.asyncio
async def test_patient_password_reset_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = f"reset_{uuid.uuid4().hex[:6]}@gmail.com"

        # Create and verify patient
        await client.post(
            "/api/patient/auth/register",
            json={
                "full_name": "Priya Sharma",
                "email": email,
                "password": "OldPassword123"
            }
        )
        outbox = get_dev_outbox()
        otp = re.search(r"\b\d{6}\b", outbox[-1]["text"]).group(0)
        await client.post(
            "/api/patient/auth/verify-email",
            json={"email": email, "otp": otp}
        )

        # Request password reset
        reset_req = await client.post(
            "/api/patient/auth/request-password-reset",
            json={"email": email}
        )
        assert reset_req.status_code == 200

        # Extract reset OTP
        reset_outbox = get_dev_outbox()
        reset_otp = re.search(r"\b\d{6}\b", reset_outbox[-1]["text"]).group(0)

        # Reset password
        reset_ver = await client.post(
            "/api/patient/auth/verify-password-reset",
            json={
                "email": email,
                "otp": reset_otp,
                "new_password": "NewSecurePassword456"
            }
        )
        assert reset_ver.status_code == 200

        # Old password fails
        old_login = await client.post(
            "/api/patient/auth/login",
            json={"email": email, "password": "OldPassword123"}
        )
        assert old_login.status_code == 401

        # New password succeeds
        new_login = await client.post(
            "/api/patient/auth/login",
            json={"email": email, "password": "NewSecurePassword456"}
        )
        assert new_login.status_code == 200

@pytest.mark.asyncio
async def test_staff_demo_logins_remain_functional():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Doctor demo login
        doc_resp = await client.post(
            "/api/auth/login",
            json={"username": "dr_sharma", "password": "doctorpassword123"}
        )
        assert doc_resp.status_code == 200
        assert doc_resp.json()["role"] == "DOCTOR"

        # Nurse demo login
        nur_resp = await client.post(
            "/api/auth/login",
            json={"username": "nurse_priya", "password": "nursepassword123"}
        )
        assert nur_resp.status_code == 200
        assert nur_resp.json()["role"] == "NURSE"

        # Health Worker demo login is completely removed and fails with 401
        hw_resp = await client.post(
            "/api/auth/login",
            json={"username": "asha_worker", "password": "ashapassword123"}
        )
        assert hw_resp.status_code == 401

        # Admin demo login
        adm_resp = await client.post(
            "/api/auth/login",
            json={"username": "admin_user", "password": "adminpassword123"}
        )
        assert adm_resp.status_code == 200
        assert adm_resp.json()["role"] == "ADMIN"

@pytest.mark.asyncio
async def test_patient_verify_otp_alias_and_me_profile():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unique_email = f"patient_alias_{uuid.uuid4().hex[:6]}@gmail.com"

        # 1. Register
        await client.post(
            "/api/patient/auth/register",
            json={
                "full_name": "Meera Patel",
                "email": unique_email,
                "password": "SecurePassword123",
                "preferred_language": "Gujarati"
            }
        )

        outbox = get_dev_outbox()
        otp = re.search(r"\b\d{6}\b", outbox[-1]["text"]).group(0)

        # 2. Verify via /api/patient/auth/verify-otp alias
        verify_resp = await client.post(
            "/api/patient/auth/verify-otp",
            json={"email": unique_email, "otp": otp}
        )
        assert verify_resp.status_code == 200
        auth_data = verify_resp.json()
        assert auth_data["role"] == "PATIENT"
        token = auth_data["access_token"]

        # 3. Call GET /api/patient/auth/me with Bearer token
        me_resp = await client.get(
            "/api/patient/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        assert me_data["email"] == unique_email
        assert me_data["fullName"] == "Meera Patel"
        assert me_data["role"] == "PATIENT"
        assert me_data["emailVerified"] == True
        assert me_data["preferredLanguage"] == "Gujarati"

@pytest.mark.asyncio
async def test_docs_endpoints_accessible():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=True) as client:
        # Check /api/docs
        api_docs_resp = await client.get("/api/docs")
        assert api_docs_resp.status_code == 200

        # Check /docs redirect
        docs_resp = await client.get("/docs")
        assert docs_resp.status_code == 200

@pytest.mark.asyncio
async def test_smtp_failure_handling():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Temporarily set environment to production without SMTP
        settings.ENVIRONMENT = "production"
        settings.SMTP_HOST = ""
        
        fail_email = f"smtp_fail_{uuid.uuid4().hex[:6]}@gmail.com"
        reg_resp = await client.post(
            "/api/patient/auth/register",
            json={
                "full_name": "Test Fail",
                "email": fail_email,
                "password": "SecurePassword123"
            }
        )
        assert reg_resp.status_code == 503
        data = reg_resp.json()
        assert "could not be sent" in data["detail"].lower()
        
        # Restore test environment
        settings.ENVIRONMENT = "test"

