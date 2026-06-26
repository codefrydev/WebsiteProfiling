"""FastAPI HTTP integration tests — exercises real routes against PostgreSQL.

These catch response-shape regressions and dict_row bugs that unit tests miss.
Requires DATABASE_URL (same as other @pytest.mark.integration tests).

Report read routes (/api/report/meta, /api/report/payload, …) are served by the
Data service — see services/Data/tests/Data.Tests/ApiIntegrationTests.cs.
"""
from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from website_profiling.db.pool import db_session


pytestmark = pytest.mark.integration


def test_health(api_client: TestClient) -> None:
    res = api_client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["database"] == "up"


def test_properties_crud_and_ops(api_client: TestClient) -> None:
    domain = f"api-prop-{uuid.uuid4().hex[:10]}.example"
    create = api_client.post(
        "/api/properties",
        json={"name": "Props API", "canonical_domain": domain, "site_url": f"https://{domain}"},
    )
    assert create.status_code == 201
    created = create.json()
    property_id = int(created["id"])
    assert created["canonical_domain"] == domain

    try:
        listing = api_client.get("/api/properties")
        assert listing.status_code == 200
        ids = {p["id"] for p in listing.json()["properties"]}
        assert property_id in ids

        detail = api_client.get(f"/api/properties/{property_id}")
        assert detail.status_code == 200
        assert detail.json()["canonical_domain"] == domain

        ops_put = api_client.put(
            f"/api/properties/{property_id}/ops",
            json={
                "scheduleCron": "0 9 * * 1",
                "alertWebhookUrl": "https://hooks.example/alert",
                "alertEmail": "ops@example.com",
            },
        )
        assert ops_put.status_code == 200
        assert ops_put.json()["ok"] is True

        ops_get = api_client.get(f"/api/properties/{property_id}/ops")
        assert ops_get.status_code == 200
        ops = ops_get.json()
        assert ops["schedule_cron"] == "0 9 * * 1"
        assert ops["alert_webhook_url"] == "https://hooks.example/alert"
        assert ops["alert_email"] == "ops@example.com"

        preset_put = api_client.put(
            f"/api/properties/{property_id}/preset",
            json={"preset": "quick"},
        )
        assert preset_put.status_code == 200
        assert preset_put.json()["default_crawl_preset"] == "quick"
    finally:
        deleted = api_client.delete(f"/api/properties/{property_id}")
        assert deleted.status_code == 200


def test_properties_resolve_does_not_create_partial_domains(api_client: TestClient) -> None:
    before = api_client.get("/api/properties")
    assert before.status_code == 200
    count_before = len(before.json()["properties"])

    partial = api_client.get("/api/properties/resolve", params={"startUrl": "https://code"})
    assert partial.status_code == 200
    assert partial.json().get("id") is None

    after = api_client.get("/api/properties")
    assert after.status_code == 200
    assert len(after.json()["properties"]) == count_before


def test_properties_ensure_creates_valid_domain(api_client: TestClient) -> None:
    domain = f"ensure-{uuid.uuid4().hex[:8]}.example"
    url = f"https://{domain}/"
    created = api_client.post("/api/properties/ensure", json={"startUrl": url})
    assert created.status_code == 200
    property_id = int(created.json()["id"])
    try:
        assert created.json()["canonical_domain"] == domain
        again = api_client.get("/api/properties/resolve", params={"startUrl": url})
        assert again.status_code == 200
        assert int(again.json()["id"]) == property_id
    finally:
        deleted = api_client.delete(f"/api/properties/{property_id}")
        assert deleted.json()["ok"] is True


def test_property_google_status_shape(api_client: TestClient, test_property: dict[str, Any]) -> None:
    property_id = int(test_property["id"])
    res = api_client.get(f"/api/properties/{property_id}/google/status")
    assert res.status_code == 200
    body = res.json()
    for key in (
        "connected",
        "authMode",
        "gscSiteUrl",
        "ga4PropertyId",
        "dateRangeDays",
        "hasClientId",
        "lastFetchedAt",
        "propertyId",
    ):
        assert key in body
    assert body["propertyId"] == property_id


def test_integrations_google_status(api_client: TestClient) -> None:
    res = api_client.get("/api/integrations/google/status")
    assert res.status_code == 200
    body = res.json()
    assert "hasClientId" in body
    assert "lastFetchedAt" in body


def test_pipeline_config_wrapper(api_client: TestClient) -> None:
    pipe = api_client.get("/api/pipeline-settings")
    assert pipe.status_code == 200
    pipe_body = pipe.json()
    assert "state" in pipe_body
    assert isinstance(pipe_body["state"], dict)


def test_content_drafts_full_crud(api_client: TestClient, test_property: dict[str, Any]) -> None:
    property_id = int(test_property["id"])

    empty = api_client.get("/api/content-drafts", params={"propertyId": property_id})
    assert empty.status_code == 200
    assert isinstance(empty.json()["drafts"], list)

    create = api_client.post(
        "/api/content-drafts",
        json={
            "propertyId": property_id,
            "title": "Integration draft",
            "target_keyword": "seo audit",
        },
    )
    assert create.status_code == 200
    draft_id = int(create.json()["id"])

    listed = api_client.get("/api/content-drafts", params={"propertyId": property_id})
    assert listed.status_code == 200
    drafts = listed.json()["drafts"]
    match = next((d for d in drafts if d["id"] == draft_id), None)
    assert match is not None
    assert match["property_id"] == property_id
    assert match["target_keyword"] == "seo audit"

    detail = api_client.get(f"/api/content-drafts/{draft_id}")
    assert detail.status_code == 200
    assert detail.json()["draft"]["title"] == "Integration draft"

    patched = api_client.patch(
        f"/api/content-drafts/{draft_id}",
        json={"title": "Updated draft", "body_html": "<p>Hello</p>"},
    )
    assert patched.status_code == 200
    assert patched.json()["draft"]["title"] == "Updated draft"

    removed = api_client.delete(f"/api/content-drafts/{draft_id}")
    assert removed.status_code == 200
    assert removed.json()["ok"] is True


def test_dashboards_crud(api_client: TestClient, test_property: dict[str, Any]) -> None:
    property_id = int(test_property["id"])

    create = api_client.post(
        "/api/dashboards",
        json={
            "propertyId": property_id,
            "name": "Integration dashboard",
            "layoutJson": {"version": 2, "widgets": [], "slicers": []},
        },
    )
    assert create.status_code == 201
    dashboard = create.json()["dashboard"]
    dashboard_id = int(dashboard["id"])
    assert dashboard["propertyId"] == property_id
    assert dashboard["name"] == "Integration dashboard"

    listed = api_client.get("/api/dashboards", params={"propertyId": property_id})
    assert listed.status_code == 200
    ids = {d["id"] for d in listed.json()["dashboards"]}
    assert dashboard_id in ids

    updated = api_client.put(
        f"/api/dashboards/{dashboard_id}",
        json={"propertyId": property_id, "name": "Renamed dashboard"},
    )
    assert updated.status_code == 200
    assert updated.json()["dashboard"]["name"] == "Renamed dashboard"

    deleted = api_client.delete(
        f"/api/dashboards/{dashboard_id}",
        params={"propertyId": property_id},
    )
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True


def test_properties_resolve(api_client: TestClient, test_property: dict[str, Any]) -> None:
    res = api_client.get(
        "/api/properties/resolve",
        params={"startUrl": f"https://{test_property['domain']}/"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == test_property["id"]
    assert body["canonical_domain"] == test_property["domain"]


def test_ollama_status_response_shape(api_client: TestClient) -> None:
    pytest.skip("Ollama status is served by AiService via BFF")


def test_backlinks_velocity_empty(api_client: TestClient, test_property: dict[str, Any]) -> None:
    res = api_client.get(
        "/api/backlinks/velocity",
        params={"propertyId": test_property["id"]},
    )
    assert res.status_code == 200
    assert isinstance(res.json()["snapshots"], list)
