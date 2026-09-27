import pytest

@pytest.mark.asyncio
async def test_auth_login_success(client):
    res = await client.post("/api/auth/login", json={
        "username": "dr_sharma",
        "password": "doctorpassword123"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["role"] == "DOCTOR"
    assert data["username"] == "dr_sharma"

@pytest.mark.asyncio
async def test_auth_login_invalid_password(client):
    res = await client.post("/api/auth/login", json={
        "username": "dr_sharma",
        "password": "wrongpassword"
    })
    assert res.status_code == 401

@pytest.mark.asyncio
async def test_auth_me_endpoint(client, doctor_auth_header):
    res = await client.get("/api/auth/me", headers=doctor_auth_header)
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == "DOCTOR"
    assert data["username"] == "dr_sharma"

@pytest.mark.asyncio
async def test_auth_me_unauthorized(client):
    res = await client.get("/api/auth/me")
    assert res.status_code == 401
