"""Minimal FastAPI app — audit-tool bridge and internal Python CLI bridges only.

All browser-facing routes are served by C# services via the BFF.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import health, internal_integrations, report_audit_tool


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    try:
        from website_profiling.db.pool import close_db_pool

        close_db_pool()
    except Exception as exc:
        import logging

        logging.getLogger(__name__).warning("Error closing DB pool on shutdown: %s", exc)


app = FastAPI(
    title="Website Profiling Python Bridge",
    version="2.0.0",
    lifespan=_lifespan,
)

_origins_raw = os.getenv("FASTAPI_ALLOWED_ORIGINS", "").strip()
if _origins_raw:
    _origins = [o.strip() for o in _origins_raw.split(",") if o.strip()]
    if "*" in _origins:
        raise RuntimeError(
            "FASTAPI_ALLOWED_ORIGINS cannot contain '*' when allow_credentials=True. "
            "List explicit origins (e.g. http://localhost:3000) instead."
        )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(health.router, prefix="/api")
app.include_router(internal_integrations.router)
app.include_router(report_audit_tool.router, prefix="/api")
