"""FastAPI HTTP integration tests — slim Python bridge only.

After the C# migration, browser-facing routes live on Data (including the former
ConfigService's typed config — pipeline settings, UI/client preferences),
ReportService, and IntegrationsService. The FastAPI app only exposes health,
audit-tool dispatch, and internal CLI bridges.

PostgreSQL integration coverage for migrated routes:
- services/CoreService/tests/CoreService.Tests/PropertiesIntegrationTests.cs
- services/CoreService/tests/CoreService.Tests/DataServiceRegistrationValidationTests.cs (typed config)
- services/CoreService/tests/CoreService.Tests/DashboardsIntegrationTests.cs
"""
from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient


pytestmark = pytest.mark.integration

_SKIP_DATA = pytest.mark.skip(
    reason="Route moved to Data service — see PropertiesIntegrationTests.cs",
)
_SKIP_REPORT = pytest.mark.skip(
    reason="Route moved to ReportService — see DashboardsIntegrationTests.cs",
)
_SKIP_CONFIG = pytest.mark.skip(
    reason="Route moved to Data service (typed config) — see ServiceRegistrationValidationTests.cs",
)
_SKIP_INTEGRATIONS = pytest.mark.skip(
    reason="Route moved to IntegrationsService — see IntegrationsService.Tests",
)


def test_health(api_client: TestClient) -> None:
    res = api_client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["database"] == "up"


@_SKIP_DATA
def test_properties_crud_and_ops(api_client: TestClient) -> None:
    ...


@_SKIP_DATA
def test_properties_resolve_does_not_create_partial_domains(api_client: TestClient) -> None:
    ...


@_SKIP_DATA
def test_properties_ensure_creates_valid_domain(api_client: TestClient) -> None:
    ...


@_SKIP_INTEGRATIONS
def test_property_google_status_shape(api_client: TestClient, test_property: dict[str, Any]) -> None:
    ...


@_SKIP_INTEGRATIONS
def test_integrations_google_status(api_client: TestClient) -> None:
    ...


@_SKIP_CONFIG
def test_pipeline_config_wrapper(api_client: TestClient) -> None:
    ...


@_SKIP_DATA
def test_content_drafts_full_crud(api_client: TestClient, test_property: dict[str, Any]) -> None:
    ...


@_SKIP_REPORT
def test_dashboards_crud(api_client: TestClient, test_property: dict[str, Any]) -> None:
    ...


@_SKIP_DATA
def test_properties_resolve(api_client: TestClient, test_property: dict[str, Any]) -> None:
    ...


def test_ollama_status_response_shape(api_client: TestClient) -> None:
    pytest.skip("Ollama status is served by AiService via BFF")


@_SKIP_DATA
def test_backlinks_velocity_empty(api_client: TestClient, test_property: dict[str, Any]) -> None:
    ...
