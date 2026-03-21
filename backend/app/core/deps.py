from typing import AsyncGenerator
from fastapi import Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import async_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


class PaginationParams:
    def __init__(
        self,
        skip: int = Query(default=0, ge=0),
        limit: int = Query(default=50, ge=1, le=500),
    ):
        self.skip = skip
        self.limit = limit
