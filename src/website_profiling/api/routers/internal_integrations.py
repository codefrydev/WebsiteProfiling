"""Internal-only bridges for IntegrationsService when it has no Python runtime (Docker)."""
from __future__ import annotations

import os
import subprocess
import sys
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException
from psycopg import Connection

from ..deps import get_db

router = APIRouter(prefix="/internal/integrations", tags=["internal-integrations"])

DbDep = Annotated[Connection, Depends(get_db)]


@router.post("/keywords/enrich")
def internal_keyword_enrich(body: dict[str, Any]) -> dict[str, Any]:
    property_id = body.get("propertyId")
    try:
        pid = int(property_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="propertyId is required") from None
    if pid <= 0:
        raise HTTPException(status_code=400, detail="propertyId is required")

    env = os.environ.copy()
    env["WP_PROPERTY_ID"] = str(pid)
    try:
        result = subprocess.run(
            [sys.executable, "-m", "src", "keywords", "--enrich-google"],
            capture_output=True,
            text=True,
            timeout=120,
            env=env,
            cwd=os.environ.get("WEBSITE_PROFILING_ROOT") or None,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "exitCode": -1, "log": "Keyword enrich timed out after 120s", "propertyId": pid}

    combined = result.stdout + result.stderr
    log = combined[-28_000:]
    return {
        "ok": result.returncode == 0,
        "exitCode": result.returncode,
        "log": log,
        "propertyId": pid,
    }


@router.post("/gsc-links/import")
def internal_gsc_links_import(body: dict[str, Any] = Body(...), conn: DbDep = ...) -> dict[str, Any]:
    property_id = body.get("propertyId")
    file_content = str(body.get("fileContent") or "").strip()
    file_name = str(body.get("fileName") or "")
    try:
        pid = int(property_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="propertyId is required") from None
    if pid <= 0:
        raise HTTPException(status_code=400, detail="propertyId is required")
    if not file_content:
        raise HTTPException(status_code=400, detail="fileContent is required")

    from website_profiling.db import get_latest_crawl_run_id, read_crawl
    from website_profiling.db.property_store import get_property_by_id
    from website_profiling.integrations.google.gsc_links_store import import_gsc_links_csv

    if not get_property_by_id(conn, pid):
        raise HTTPException(status_code=404, detail="Property not found")

    crawl_urls: list[str] = []
    try:
        run_id = get_latest_crawl_run_id(conn)
        if run_id is not None:
            df = read_crawl(conn, run_id)
            if "url" in df.columns:
                crawl_urls = df["url"].dropna().astype(str).str.strip().tolist()
    except Exception:
        pass

    try:
        return import_gsc_links_csv(
            conn,
            pid,
            file_content,
            crawl_urls=crawl_urls,
            file_name=file_name,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
