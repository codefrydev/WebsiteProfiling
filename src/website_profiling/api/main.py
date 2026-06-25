"""FastAPI application entry point."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import (
    alerts,
    compare,
    config,
    content,
    crawl,
    dashboards,
    health,
    integrations,
    keywords,
    logs,
    page_markdown,
    pipeline,
    properties,
    report,
    report_audit_tool,
    schedule,
)


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
    title="Website Profiling API",
    version="1.0.0",
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

# Core + crawl/pipeline
app.include_router(health.router, prefix="/api")
app.include_router(report.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(crawl.router, prefix="/api")

# Config: pipeline-config + app-settings (llm-config/secrets served by AiService via BFF)
app.include_router(config.router, prefix="/api")

app.include_router(properties.router, prefix="/api")
app.include_router(dashboards.router, prefix="/api")
app.include_router(integrations.router, prefix="/api")
app.include_router(keywords.router, prefix="/api")
app.include_router(content.router, prefix="/api")
app.include_router(page_markdown.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(logs.router, prefix="/api")
app.include_router(compare.router, prefix="/api")

# Audit tool dispatch — internal bridge for AiService unported tools
app.include_router(report_audit_tool.router, prefix="/api")

# AI routes removed — served by services/AiService (.NET) via BFF:
# chat, issues/fix-suggestion, issues/action-plan, ai/fix-suggestion,
# dashboards/ai-generate, links/page-coach, llm-config, secrets, ollama/status, mcp-tools
