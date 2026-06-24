"""Unit tests for db store modules that lost coverage after legacy-path removal."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from tests.db_test_fakes import FakeConn, FakeCursor


def _dt() -> datetime:
    return datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)


def test_config_store_llm_full_and_app_settings() -> None:
    from website_profiling.db.config_store import (
        read_app_setting,
        read_llm_config_full,
        write_app_setting,
    )

    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                {"key": "model", "value": "gpt", "is_secret": True},
            ]
        )
    )
    rows = read_llm_config_full(conn)
    assert rows == [{"key": "model", "value": "gpt", "is_secret": True}]

    assert read_llm_config_full(FakeConn()) == []  # type: ignore[arg-type]

    class BoomConn(FakeConn):
        def execute(self, sql, params=None):
            raise RuntimeError("db down")

    assert read_llm_config_full(BoomConn()) == []  # type: ignore[arg-type]

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchone_value={"value": "on"}))
    assert read_app_setting(conn2, "feature") == "on"

    conn3 = FakeConn()
    conn3.set_next_cursor(FakeCursor(fetchone_value=None))
    assert read_app_setting(conn3, "missing") is None

    class BoomConn(FakeConn):
        def execute(self, sql, params=None):
            raise RuntimeError("db down")

    assert read_app_setting(BoomConn(), "x") is None  # type: ignore[arg-type]

    wconn = FakeConn()
    write_app_setting(wconn, "k", "v")
    assert wconn.commits == 1
    assert "app_settings" in wconn.executed[0][0]


def test_portfolio_store_deletes() -> None:
    from website_profiling.db.portfolio_store import (
        delete_portfolio_crawl_run,
        delete_portfolio_item,
        delete_portfolio_report,
    )

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"id": 1}))
    assert delete_portfolio_report(conn, 1) is True

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchone_value=None))
    assert delete_portfolio_crawl_run(conn2, 9) is False

    conn3 = FakeConn()
    conn3.set_next_cursor(FakeCursor(fetchone_value={"id": 2}))
    conn3.set_next_cursor(FakeCursor(fetchone_value={"id": 3}))
    assert delete_portfolio_item(conn3, report_id=2, crawl_run_id=3) is True


def test_dashboard_store_crud() -> None:
    from website_profiling.db.dashboard_store import (
        create_dashboard,
        delete_dashboard,
        get_dashboard,
        list_dashboards,
        update_dashboard,
    )

    created = datetime(2024, 1, 1, tzinfo=timezone.utc)
    row = {
        "id": 1,
        "property_id": 5,
        "name": "Dash",
        "layout_json": {"widgets": []},
        "is_default": False,
        "created_at": created,
        "updated_at": created,
    }

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchall_value=[row]))
    listed = list_dashboards(conn, 5)
    assert listed[0]["name"] == "Dash"

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchone_value=row))
    assert get_dashboard(conn2, 1, 5)["id"] == 1

    conn3 = FakeConn()
    conn3.set_next_cursor(FakeCursor(fetchone_value=None))
    assert get_dashboard(conn3, 99, 5) is None

    conn4 = FakeConn()
    conn4.set_next_cursor(FakeCursor(fetchone_value=row))
    out = create_dashboard(conn4, 5, "New", {"a": 1})
    assert out["propertyId"] == 5
    assert conn4.commits == 1

    conn5 = FakeConn()
    conn5.set_next_cursor(FakeCursor())  # clear defaults
    conn5.set_next_cursor(FakeCursor(fetchone_value={**row, "is_default": True}))
    updated = update_dashboard(
        conn5,
        1,
        5,
        name="Renamed",
        layout_json={"b": 2},
        is_default=True,
    )
    assert updated and updated["isDefault"] is True

    conn6 = FakeConn()
    conn6.set_next_cursor(FakeCursor(fetchone_value={"id": 1}))
    assert delete_dashboard(conn6, 1, 5) is True


def test_issue_status_store() -> None:
    from website_profiling.db.issue_status_store import (
        issue_fingerprint,
        list_issue_status,
        upsert_issue_status,
    )

    fp = issue_fingerprint("msg", "https://ex.com", "cat")
    assert len(fp) == 32

    row = {
        "id": 1,
        "property_id": 2,
        "report_id": 3,
        "issue_fingerprint": fp,
        "category_id": "cat",
        "message": "msg",
        "url": "https://ex.com",
        "priority": "High",
        "status": "open",
        "assignee": None,
        "note": None,
        "updated_at": _dt(),
    }

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchall_value=[row]))
    assert list_issue_status(conn, 2)[0]["status"] == "open"

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchone_value=row))
    out = upsert_issue_status(
        conn2,
        property_id=2,
        message="msg",
        status="fixed",
        url="https://ex.com",
        category_id="cat",
    )
    assert out["status"] == "open"

    with pytest.raises(ValueError, match="invalid status"):
        upsert_issue_status(
            FakeConn(),
            property_id=1,
            message="x",
            status="bogus",
        )

    conn3 = FakeConn()
    conn3.set_next_cursor(FakeCursor(fetchone_value=None))
    with pytest.raises(RuntimeError, match="upsert failed"):
        upsert_issue_status(conn3, property_id=1, message="x", status="open")


def test_saved_filter_store() -> None:
    from website_profiling.db.saved_filter_store import (
        delete_saved_filter,
        list_saved_filters,
        upsert_saved_filter,
    )

    row = {
        "id": 1,
        "property_id": 2,
        "name": "status-200",
        "filter_json": {"status": ["200"]},
        "created_at": _dt(),
    }

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchall_value=[row]))
    listed = list_saved_filters(conn, 2)
    assert listed[0]["name"] == "status-200"
    assert listed[0]["filterJson"] == {"status": ["200"]}

    conn2 = FakeConn()
    upsert_saved_filter(conn2, 2, "status-200", {"status": ["301"]})
    assert conn2.commits == 1

    conn3 = FakeConn()
    conn3.set_next_cursor(FakeCursor(rowcount=1))
    assert delete_saved_filter(conn3, 2, "status-200") is True

    conn4 = FakeConn()
    conn4.set_next_cursor(FakeCursor(rowcount=0))
    assert delete_saved_filter(conn4, 2, "missing") is False


def test_content_draft_store_paths() -> None:
    from website_profiling.db.content_draft_store import (
        create_content_draft,
        delete_content_draft,
        get_content_draft,
        list_content_drafts,
        update_content_draft,
    )

    list_row = {
        "id": 1,
        "property_id": 2,
        "title": "T",
        "target_keyword": "kw",
        "landing_url": None,
        "status": "draft",
        "grade_score": 88.5,
        "created_at": "2024-01-01",
        "updated_at": "2024-01-01",
    }
    detail_row = {
        **list_row,
        "body_html": "<p>x</p>",
        "title_tag": "tag",
        "meta_description": "desc",
        "grade_snapshot": {"score": 80},
    }

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchall_value=[list_row]))
    drafts = list_content_drafts(conn, 2)
    assert drafts[0]["grade_score"] == 88.5

    none_grade_row = {**list_row, "grade_score": None}
    conn_none = FakeConn()
    conn_none.set_next_cursor(FakeCursor(fetchall_value=[none_grade_row]))
    assert list_content_drafts(conn_none, 2)[0]["grade_score"] is None

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchone_value=detail_row))
    assert get_content_draft(conn2, 1)["title"] == "T"

    conn3 = FakeConn()
    conn3.set_next_cursor(FakeCursor(fetchone_value={"id": 10}))
    assert create_content_draft(conn3, 2, title="New") == 10

    conn4 = FakeConn()
    conn4.set_next_cursor(FakeCursor(fetchone_value=detail_row))
    patched = update_content_draft(
        conn4,
        1,
        {
            "title": "Updated",
            "target_keyword": "new-kw",
            "landing_url": "https://ex.com",
            "status": "published",
            "body_html": "<b>",
            "title_tag": "t",
            "meta_description": "m",
            "grade_score": 90.0,
            "grade_snapshot": {"a": 1},
        },
    )
    assert patched and patched["title"] == "T"

    conn5 = FakeConn()
    conn5.set_next_cursor(FakeCursor(fetchone_value=detail_row))
    assert update_content_draft(conn5, 1, {})["id"] == 1

    conn6 = FakeConn()
    conn6.set_next_cursor(FakeCursor(fetchone_value={"id": 1}))
    assert delete_content_draft(conn6, 1) is True


def test_markdown_store_list_crawl_runs() -> None:
    from website_profiling.db.markdown_store import list_markdown_crawl_runs

    created = _dt()
    row = {
        "id": 7,
        "created_at": created,
        "start_url": "https://ex.com",
        "html_page_count": 3,
        "markdown_page_count": 2,
    }

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchall_value=[row]))
    runs = list_markdown_crawl_runs(conn, property_id=1)
    assert runs[0]["html_page_count"] == 3
    assert runs[0]["created_at"] == created.isoformat()

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchall_value=[row]))
    all_runs = list_markdown_crawl_runs(conn2)
    assert len(all_runs) == 1


def test_property_store_ops_and_google() -> None:
    from website_profiling.db.property_store import (
        authorize_property_crawl,
        apply_property_google_credentials_patch,
        delete_property,
        disconnect_property_google,
        get_property_google_public_status,
        get_property_google_status,
        get_property_id_by_domain,
        get_property_ops,
        resolve_property_id_for_page,
        update_property_crawl_preset,
        update_property_ops,
    )

    prop_row = {
        "id": 1,
        "name": "ex.com",
        "canonical_domain": "ex.com",
        "site_url": "https://ex.com",
        "gsc_site_url": "https://ex.com/",
        "ga4_property_id": "123",
        "google_auth_mode": "oauth",
        "google_refresh_token": "tok",
        "google_connected_at": _dt(),
        "google_connected_email": "a@ex.com",
        "google_date_range_days": 28,
        "default_crawl_preset": None,
        "crawl_authorized_at": None,
    }

    assert get_property_id_by_domain(FakeConn(), "") is None

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value=prop_row))
    assert get_property_id_by_domain(conn, "EX.COM") == 1

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchone_value=prop_row))
    assert resolve_property_id_for_page(conn2, "https://ex.com/page", property_id_str="1") == 1

    conn3 = FakeConn()
    conn3.set_next_cursor(FakeCursor(fetchone_value=prop_row))
    assert resolve_property_id_for_page(conn3, "https://ex.com", domain_str="ex.com") == 1

    conn4 = FakeConn()
    conn4.set_next_cursor(FakeCursor(fetchone_value=prop_row))
    assert resolve_property_id_for_page(conn4, "https://ex.com/path") == 1

    assert resolve_property_id_for_page(FakeConn(), "https://ex.com", property_id_str="not-int") is None

    conn4b = FakeConn()
    conn4b.set_next_cursor(FakeCursor(fetchone_value=None))
    assert resolve_property_id_for_page(conn4b, "https://unknown.com/page") is None

    conn4c = FakeConn()
    conn4c.set_next_cursor(FakeCursor(fetchone_value=None))
    conn4c.set_next_cursor(FakeCursor(fetchone_value=prop_row))
    assert resolve_property_id_for_page(
        conn4c,
        "https://ex.com/page",
        domain_str="missing.com",
    ) == 1

    conn5 = FakeConn()
    conn5.set_next_cursor(FakeCursor(fetchone_value=None))
    assert get_property_ops(conn5, 99) is None

    conn6 = FakeConn()
    conn6.set_next_cursor(FakeCursor(fetchone_value=("cron", "hook", "email")))
    ops = get_property_ops(conn6, 1)
    assert ops["schedule_cron"] == "cron"

    uconn = FakeConn()
    update_property_ops(uconn, 1, schedule_cron="0 0 * * *", alert_webhook_url=None, alert_email="a@ex.com")
    assert uconn.commits == 1

    dconn = FakeConn()
    dconn.set_next_cursor(FakeCursor(fetchone_value={"id": 1}))
    assert delete_property(dconn, 1) is True

    pconn = FakeConn()
    update_property_crawl_preset(pconn, 1, "starter")
    authorize_property_crawl(pconn, 1)
    assert pconn.commits == 2

    conn7 = FakeConn()
    conn7.set_next_cursor(FakeCursor(fetchone_value=None))
    missing = get_property_google_public_status(conn7, 404)
    assert missing["connected"] is False

    gconn = FakeConn()
    apply_property_google_credentials_patch(
        gconn,
        1,
        gsc_site_url="https://ex.com/",
        ga4_property_id="999",
        date_range_days=14,
        auth_mode="oauth",
        connected_email="user@ex.com",
        refresh_token="new-token",
    )
    assert gconn.commits == 1

    with pytest.raises(ValueError, match="Analytics property ID"):
        apply_property_google_credentials_patch(
            FakeConn(),
            1,
            ga4_property_id="G-ABC123",
        )

    with pytest.raises(ValueError, match="No valid fields"):
        apply_property_google_credentials_patch(FakeConn(), 1)

    dconn2 = FakeConn()
    disconnect_property_google(dconn2, 1)
    assert dconn2.commits == 1

    conn8 = FakeConn()
    conn8.set_next_cursor(FakeCursor(fetchone_value=prop_row))
    with patch(
        "website_profiling.db.google_app_store.read_google_app_settings",
        return_value={"client_id": "cid"},
    ), patch(
        "website_profiling.integrations.google.store.read_last_google_fetched_at_for_property",
        return_value="2024-01-01",
    ):
        status = get_property_google_status(conn8, 1)
    assert status and status["hasClientId"] is True
    assert status["lastFetchedAt"] == "2024-01-01"

    conn9 = FakeConn()
    conn9.set_next_cursor(FakeCursor(fetchone_value=None))
    assert get_property_google_status(conn9, 1) is None
