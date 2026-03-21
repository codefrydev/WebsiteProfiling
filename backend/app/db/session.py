from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings

_engine_kwargs = dict(
    echo=False,
    pool_pre_ping=True,
)
if settings.DATABASE_URL.startswith("sqlite"):
    _engine_kwargs.update(
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    _engine_kwargs.update(pool_size=20, max_overflow=40)

engine = create_async_engine(
    settings.DATABASE_URL,
    **_engine_kwargs,
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Alias for backward compatibility
AsyncSessionLocal = async_session_factory
