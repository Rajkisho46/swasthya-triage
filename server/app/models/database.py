import os
import ssl
from typing import Dict, Any, Tuple
from sqlalchemy.engine import make_url, URL
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from ..config import settings

def configure_database() -> Tuple[URL, Dict[str, Any], bool]:
    raw_url = (settings.DATABASE_URL or "sqlite+aiosqlite:///./swasthya_triage.db").strip()
    
    # Normalize postgres:// and postgresql:// to async driver postgresql+asyncpg://
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif raw_url.startswith("postgresql://") and not any(driver in raw_url for driver in ["+asyncpg", "+aiopg", "+psycopg"]):
        raw_url = raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    is_sqlite = "sqlite" in raw_url

    if is_sqlite:
        return make_url(raw_url), {"check_same_thread": False}, True

    # For PostgreSQL / asyncpg:
    # asyncpg does not accept query kwargs like sslmode, channel_binding, etc.
    parsed_url = make_url(raw_url)
    query_params = dict(parsed_url.query)

    sslmode = query_params.pop("sslmode", None)
    query_params.pop("channel_binding", None)
    ssl_param = query_params.pop("ssl", None)

    connect_args: Dict[str, Any] = {}

    # Configure SSL for Neon, Supabase, AWS RDS, or when sslmode/ssl is requested
    ssl_requested = bool(
        (sslmode and sslmode.lower() in ["require", "verify-ca", "verify-full", "prefer", "allow"])
        or (ssl_param and ssl_param.lower() in ["true", "require", "1", "verify-full"])
        or (parsed_url.host and ("neon.tech" in parsed_url.host or "supabase.co" in parsed_url.host))
    )

    if ssl_requested:
        connect_args["ssl"] = "require"

    clean_url = parsed_url._replace(query=query_params)
    return clean_url, connect_args, False

db_url, connect_args, is_sqlite = configure_database()

# Engine configuration
engine = create_async_engine(
    db_url,
    echo=settings.DEBUG,
    connect_args=connect_args,
    poolclass=NullPool if not is_sqlite else None,
)

# Async Session Factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Base class for SQLAlchemy ORM models
Base = declarative_base()

async def get_db():
    """Dependency for obtaining async DB session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


