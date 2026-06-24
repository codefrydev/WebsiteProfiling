"""FastAPI application entry point."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import (
    alerts,
    chat,
    compare,
    config,
    content,
    crawl,
    dashboards,
    health,
    integrations,
    issues,
    keywords,
    logs,
    mcp_tools,
    ollama,
    page_coach,
    page_markdown,
    pipeline,
    properties,
    report,
    report_audit_tool,
    report_export,
    schedule,
)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    # Close the psycopg connection pool on shutdown.
    try:
        from website_profiling.db.pool import close_db_pool

        close_db_pool()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Error closing DB pool on shutdown: %s", exc)


app = FastAPI(
    title="Website Profiling API",
    version="1.0.0",
    lifespan=_lifespan,
)

# CORS — only added when FASTAPI_ALLOWED_ORIGINS is set (local Swagger in dev).
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

# ── Core routes ───────────────────────────────────────────────────────────────
app.include_router(health.router, prefix="/api")
app.include_router(report.router, prefix="/api")

# ── Batch B: Pipeline jobs ────────────────────────────────────────────────────
app.include_router(pipeline.router, prefix="/api")

# ── Batch C: Chat (SSE + sessions) ───────────────────────────────────────────
app.include_router(chat.router, prefix="/api")

# ── Batch D: Crawl ───────────────────────────────────────────────────────────
app.include_router(crawl.router, prefix="/api")

# ── Batch E: Config (pipeline, LLM, secrets, app-settings) ───────────────────
app.include_router(config.router, prefix="/api")

# ── Batch F: Properties ──────────────────────────────────────────────────────
app.include_router(properties.router, prefix="/api")

# ── Batch G: Dashboards ──────────────────────────────────────────────────────
app.include_router(dashboards.router, prefix="/api")

# ── Batch H: Google + Bing integrations ──────────────────────────────────────
app.include_router(integrations.router, prefix="/api")

# ── Batch I: Issues, keywords, content, page markdown, long-tail ─────────────
app.include_router(issues.router, prefix="/api")
app.include_router(keywords.router, prefix="/api")
app.include_router(content.router, prefix="/api")
app.include_router(page_markdown.router, prefix="/api")
app.include_router(ollama.router, prefix="/api")
app.include_router(mcp_tools.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(logs.router, prefix="/api")
app.include_router(compare.router, prefix="/api")
app.include_router(page_coach.router, prefix="/api")
app.include_router(report_audit_tool.router, prefix="/api")
app.include_router(report_export.router, prefix="/api")
