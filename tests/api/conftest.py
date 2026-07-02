"""Shared fixtures for FastAPI integration tests (requires PostgreSQL)."""
from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from website_profiling.api.deps import get_db
from website_profiling.api.main import app
from website_profiling.db.pool import db_session


def _database_url_configured() -> bool:
    return bool((os.environ.get("DATABASE_URL") or "").strip())


@pytest.fixture(scope="session")
def require_database_url() -> None:
    if not _database_url_configured():
        pytest.skip("DATABASE_URL not set — start Postgres and run the EF Core migrator")


def _override_get_db() -> Iterator[Any]:
    with db_session() as conn:
        yield conn


@pytest.fixture
def api_client(require_database_url: None) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def test_property(require_database_url: None) -> Iterator[dict[str, Any]]:
    """Ephemeral property row; deleted after the test module using it finishes."""
    domain = f"api-int-{uuid.uuid4().hex[:12]}.example"
    with db_session() as conn:
        from website_profiling.db.property_store import delete_property, upsert_property_by_domain

        property_id = upsert_property_by_domain(
            conn,
            "API Integration Test",
            domain,
            f"https://{domain}",
        )
    payload = {"id": property_id, "domain": domain, "name": "API Integration Test"}
    yield payload
    with db_session() as conn:
        delete_property(conn, property_id)
