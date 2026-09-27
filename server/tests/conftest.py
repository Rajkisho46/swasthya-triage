import pytest
import pytest_asyncio
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from server.app.models.database import Base, get_db
from server.app.main import app
from server.app.utils.security import create_access_token

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def test_db_session():
    test_engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    async_session = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async with async_session() as session:
        yield session
        
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()

@pytest_asyncio.fixture
async def client(test_db_session):
    async def override_get_db():
        yield test_db_session

    app.dependency_overrides[get_db] = override_get_db
    
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
        
    app.dependency_overrides.clear()

@pytest.fixture
def doctor_auth_header():
    token = create_access_token({
        "sub": "dr_sharma",
        "user_id": "usr_doc_01",
        "role": "DOCTOR",
        "display_name": "Dr. Ananya Sharma, MD"
    })
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def nurse_auth_header():
    token = create_access_token({
        "sub": "nurse_priya",
        "user_id": "usr_nur_01",
        "role": "NURSE",
        "display_name": "Nurse Priya Nair, RN"
    })
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def patient_auth_header():
    token = create_access_token({
        "sub": "patient_demo",
        "user_id": "usr_pat_01",
        "role": "PATIENT",
        "display_name": "Rajesh Kumar (Patient)"
    })
    return {"Authorization": f"Bearer {token}"}
