"""MCP HTTP server auth, startup validation, and app wiring."""
from __future__ import annotations

import asyncio
import json
import os
import runpy
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.testclient import TestClient

from website_profiling.mcp import http_server
from website_profiling.mcp import server as mcp_server
from website_profiling.mcp.settings import McpHttpSettings, load_mcp_http_settings


def test_validate_startup_public_bind_requires_token() -> None:
    with patch.dict(os.environ, {"WP_MCP_HTTP_HOST": "0.0.0.0"}, clear=False):
        with patch(
            "website_profiling.mcp.http_server.load_mcp_http_settings",
            return_value=McpHttpSettings(token="", allowed_hosts=["audit.example.com"], allowed_origins=[]),
        ):
            with pytest.raises(SystemExit, match="Remote MCP token"):
                http_server._validate_startup_config()


def test_validate_startup_public_bind_requires_allowed_hosts() -> None:
    with patch.dict(os.environ, {"WP_MCP_HTTP_HOST": "0.0.0.0"}, clear=False):
        with patch(
            "website_profiling.mcp.http_server.load_mcp_http_settings",
            return_value=McpHttpSettings(token="secret", allowed_hosts=[], allowed_origins=[]),
        ):
            with pytest.raises(SystemExit, match="Allowed MCP hosts"):
                http_server._validate_startup_config()


def test_validate_startup_localhost_without_token_ok() -> None:
    with patch.dict(os.environ, {"WP_MCP_HTTP_HOST": "127.0.0.1"}, clear=False):
        http_server._validate_startup_config()


def test_transport_security_disables_sdk_checks_when_ui_configured() -> None:
    with patch(
        "website_profiling.mcp.http_server.load_mcp_http_settings",
        return_value=McpHttpSettings(token="secret", allowed_hosts=["audit.example.com"], allowed_origins=[]),
    ):
        settings = http_server._transport_security_settings("0.0.0.0")
    assert settings.enable_dns_rebinding_protection is False


def test_transport_security_localhost_without_ui_config() -> None:
    with patch(
        "website_profiling.mcp.http_server.load_mcp_http_settings",
        return_value=McpHttpSettings(token="", allowed_hosts=[], allowed_origins=[]),
    ):
        settings = http_server._transport_security_settings("127.0.0.1")
    assert settings.enable_dns_rebinding_protection is False


def test_host_and_origin_allowed_helpers() -> None:
    assert http_server._host_allowed("audit.example.com", ["audit.example.com"])
    assert http_server._host_allowed("sub.example.com", ["*.example.com"])
    assert not http_server._host_allowed("evil.example.net", ["audit.example.com"])
    assert http_server._origin_allowed("https://audit.example.com", ["https://audit.example.com"])
    assert http_server._origin_allowed("", ["https://audit.example.com"])


def test_remote_access_middleware_rejects_missing_token() -> None:
    app = AsyncMock()

    async def run() -> None:
        middleware = http_server.RemoteAccessMiddleware(app)
        sent: list[dict] = []

        async def capture_send(message: dict) -> None:
            sent.append(message)

        with patch(
            "website_profiling.mcp.http_server.load_mcp_http_settings",
            return_value=McpHttpSettings(token="secret-token", allowed_hosts=[], allowed_origins=[]),
        ):
            await middleware(
                {"type": "http", "headers": []},
                AsyncMock(),
                capture_send,
            )

        assert app.await_count == 0
        assert sent[0]["status"] == 401

    asyncio.run(run())


def test_remote_access_middleware_rejects_wrong_token_with_json_body() -> None:
    app = AsyncMock()

    async def run() -> None:
        middleware = http_server.RemoteAccessMiddleware(app)
        sent: list[dict] = []

        async def capture_send(message: dict) -> None:
            sent.append(message)

        with patch(
            "website_profiling.mcp.http_server.load_mcp_http_settings",
            return_value=McpHttpSettings(token="secret-token", allowed_hosts=[], allowed_origins=[]),
        ):
            await middleware(
                {"type": "http", "headers": [(b"authorization", b"Bearer wrong-token")]},
                AsyncMock(),
                capture_send,
            )

        assert app.await_count == 0
        assert sent[0]["status"] == 401
        # Regression: repr() produced single-quoted, non-parseable JSON.
        assert json.loads(sent[1]["body"]) == {"error": "Unauthorized"}

    asyncio.run(run())


def test_remote_access_middleware_non_ascii_auth_header_does_not_crash() -> None:
    app = AsyncMock()

    async def run() -> None:
        middleware = http_server.RemoteAccessMiddleware(app)
        sent: list[dict] = []

        async def capture_send(message: dict) -> None:
            sent.append(message)

        with patch(
            "website_profiling.mcp.http_server.load_mcp_http_settings",
            return_value=McpHttpSettings(token="secret-token", allowed_hosts=[], allowed_origins=[]),
        ):
            # A non-ASCII Authorization header must not raise (hmac on str would).
            await middleware(
                {"type": "http", "headers": [(b"authorization", "Bearer \xe9".encode("latin-1"))]},
                AsyncMock(),
                capture_send,
            )

        assert app.await_count == 0
        assert sent[0]["status"] == 401

    asyncio.run(run())


def test_remote_access_middleware_accepts_valid_request() -> None:
    app = AsyncMock()
    middleware = http_server.RemoteAccessMiddleware(app)
    settings = McpHttpSettings(
        token="secret-token",
        allowed_hosts=["audit.example.com"],
        allowed_origins=[],
    )

    async def run() -> None:
        with patch("website_profiling.mcp.http_server.load_mcp_http_settings", return_value=settings):
            await middleware(
                {
                    "type": "http",
                    "headers": [
                        (b"authorization", b"Bearer secret-token"),
                        (b"host", b"audit.example.com"),
                    ],
                },
                AsyncMock(),
                AsyncMock(),
            )

    asyncio.run(run())
    assert app.await_count == 1


def test_remote_access_middleware_rejects_bad_host() -> None:
    app = AsyncMock()

    async def run() -> None:
        middleware = http_server.RemoteAccessMiddleware(app)
        sent: list[dict] = []

        async def capture_send(message: dict) -> None:
            sent.append(message)

        with patch(
            "website_profiling.mcp.http_server.load_mcp_http_settings",
            return_value=McpHttpSettings(
                token="secret-token",
                allowed_hosts=["audit.example.com"],
                allowed_origins=[],
            ),
        ):
            await middleware(
                {
                    "type": "http",
                    "headers": [
                        (b"authorization", b"Bearer secret-token"),
                        (b"host", b"evil.example.net"),
                    ],
                },
                AsyncMock(),
                capture_send,
            )

        assert app.await_count == 0
        assert sent[0]["status"] == 403

    asyncio.run(run())


def test_with_remote_access_wraps_app() -> None:
    inner = MagicMock()
    wrapped = http_server._with_remote_access(inner)
    assert isinstance(wrapped, http_server.RemoteAccessMiddleware)


def test_load_mcp_http_settings_env_overrides_db() -> None:
    with patch.dict(
        os.environ,
        {
            "WP_MCP_TOKEN": "env-token",
            "WP_MCP_ALLOWED_HOSTS": "host.example",
            "WP_MCP_ALLOWED_ORIGINS": "https://host.example",
        },
        clear=False,
    ):
        with patch(
            "website_profiling.mcp.settings._load_pipeline_mcp_settings",
            return_value={
                "mcp_token": "db-token",
                "mcp_allowed_hosts": "db.example",
                "mcp_allowed_origins": "https://db.example",
            },
        ):
            settings = load_mcp_http_settings()
    assert settings.token == "env-token"
    assert settings.allowed_hosts == ["host.example"]
    assert settings.allowed_origins == ["https://host.example"]


def test_load_mcp_http_settings_from_db_when_env_empty() -> None:
    with patch.dict(os.environ, {}, clear=True):
        with patch(
            "website_profiling.mcp.settings._load_pipeline_mcp_settings",
            return_value={
                "mcp_token": "db-token",
                "mcp_allowed_hosts": "one.example,two.example",
            },
        ):
            settings = load_mcp_http_settings()
    assert settings.token == "db-token"
    assert settings.allowed_hosts == ["one.example", "two.example"]


def test_build_app_smoke(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeServer:
        def __init__(self, name: str) -> None:
            captured["name"] = name

        def list_tools(self):
            def decorator(fn):
                captured["list_tools"] = fn
                return fn
            return decorator

        def call_tool(self):
            def decorator(fn):
                captured["call_tool"] = fn
                return fn
            return decorator

        def list_resources(self):
            def decorator(fn):
                captured["list_resources"] = fn
                return fn
            return decorator

        def read_resource(self):
            def decorator(fn):
                captured["read_resource"] = fn
                return fn
            return decorator

        def create_initialization_options(self):
            return {}

        async def run(self, *_args, **_kwargs) -> None:
            return None

    class FakeManager:
        def __init__(self, **_kwargs) -> None:
            captured["manager_kwargs"] = _kwargs

        async def handle_request(self, *_args, **_kwargs) -> None:
            captured["handled"] = True

        def run(self):
            from contextlib import asynccontextmanager

            @asynccontextmanager
            async def _cm():
                yield

            return _cm()

    fake_server_mod = MagicMock()
    fake_server_mod.Server = FakeServer
    fake_types_mod = MagicMock()
    fake_types_mod.Tool = lambda **kwargs: kwargs
    fake_types_mod.TextContent = lambda **kwargs: kwargs
    fake_types_mod.Resource = lambda **kwargs: kwargs
    fake_manager_mod = MagicMock()
    fake_manager_mod.StreamableHTTPSessionManager = FakeManager
    fake_security_mod = MagicMock()
    fake_security_mod.TransportSecuritySettings = lambda **kwargs: kwargs

    monkeypatch.setitem(sys.modules, "mcp", MagicMock())
    monkeypatch.setitem(sys.modules, "mcp.server", fake_server_mod)
    monkeypatch.setitem(sys.modules, "mcp.types", fake_types_mod)
    monkeypatch.setitem(sys.modules, "mcp.server.streamable_http_manager", fake_manager_mod)
    monkeypatch.setitem(sys.modules, "mcp.server.transport_security", fake_security_mod)

    with patch.dict(
        os.environ,
        {
            "WP_MCP_HTTP_HOST": "127.0.0.1",
            "WP_MCP_HTTP_PATH": "/mcp",
            "WP_MCP_DOMAIN": "core",
        },
        clear=False,
    ):
        app = http_server.build_app()

    assert captured["name"] == "site-audit-core"
    tools = asyncio.run(captured["list_tools"]())  # type: ignore[arg-type]
    assert isinstance(tools, list)
    manager_kwargs = captured["manager_kwargs"]  # type: ignore[assignment]
    assert manager_kwargs["stateless"] is True
    assert manager_kwargs["json_response"] is False


def test_create_server_registers_handlers(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeServer:
        def __init__(self, name: str) -> None:
            captured["name"] = name

        def list_tools(self):
            def decorator(fn):
                captured["list_tools"] = fn
                return fn
            return decorator

        def call_tool(self):
            def decorator(fn):
                captured["call_tool"] = fn
                return fn
            return decorator

        def list_resources(self):
            def decorator(fn):
                captured["list_resources"] = fn
                return fn
            return decorator

        def read_resource(self):
            def decorator(fn):
                captured["read_resource"] = fn
                return fn
            return decorator

        def create_initialization_options(self):
            return {}

    fake_server_mod = MagicMock()
    fake_server_mod.Server = FakeServer
    fake_types_mod = MagicMock()
    fake_types_mod.Tool = lambda **kwargs: kwargs
    fake_types_mod.TextContent = lambda **kwargs: kwargs
    fake_types_mod.Resource = lambda **kwargs: kwargs

    monkeypatch.setitem(sys.modules, "mcp", MagicMock())
    monkeypatch.setitem(sys.modules, "mcp.server", fake_server_mod)
    monkeypatch.setitem(sys.modules, "mcp.types", fake_types_mod)

    with patch.dict(os.environ, {"WP_PROPERTY_ID": "7", "WP_MCP_DOMAIN": "full"}, clear=False):
        mcp_server.create_server()

    assert captured["name"] == "site-audit-full"
    tools = asyncio.run(captured["list_tools"]())  # type: ignore[arg-type]
    assert len(tools) >= 338


def test_bool_env_helper() -> None:
    with patch.dict(os.environ, {"WP_MCP_JSON_RESPONSE": "true"}, clear=False):
        assert http_server._bool_env("WP_MCP_JSON_RESPONSE") is True
    assert http_server._bool_env("WP_MCP_JSON_RESPONSE", default=False) is False


def test_http_port_invalid() -> None:
    with patch.dict(os.environ, {"WP_MCP_HTTP_PORT": "bad"}, clear=False):
        with pytest.raises(SystemExit, match="Invalid WP_MCP_HTTP_PORT"):
            http_server._http_port()


def test_http_path_normalizes() -> None:
    with patch.dict(os.environ, {"WP_MCP_HTTP_PATH": "mcp"}, clear=False):
        assert http_server._http_path() == "/mcp"


def test_remote_access_passthrough_non_http() -> None:
    app = AsyncMock()
    middleware = http_server.RemoteAccessMiddleware(app)

    async def run() -> None:
        await middleware({"type": "lifespan"}, AsyncMock(), AsyncMock())

    asyncio.run(run())
    app.assert_awaited_once()


def test_http_main_runs_uvicorn(monkeypatch) -> None:
    mock_uvicorn = MagicMock()
    monkeypatch.setitem(sys.modules, "uvicorn", mock_uvicorn)
    with patch.object(http_server, "build_app", return_value=MagicMock()):
        with patch.dict(
            os.environ,
            {"WP_MCP_HTTP_HOST": "127.0.0.1", "WP_MCP_HTTP_PORT": "9001"},
            clear=False,
        ):
            http_server.main()
    mock_uvicorn.run.assert_called_once()
    assert mock_uvicorn.run.call_args.kwargs["port"] == 9001


def test_http_main_missing_uvicorn() -> None:
    with patch.dict(sys.modules, {"uvicorn": None}):
        with patch.object(http_server, "_validate_startup_config"):
            with pytest.raises(SystemExit, match="uvicorn"):
                http_server.main()


def test_http_module_main() -> None:
    with patch("website_profiling.mcp.http_server.main") as mock_main:
        runpy.run_module("website_profiling.mcp.http", run_name="__main__")
    mock_main.assert_called_once()


def test_http_port_out_of_range() -> None:
    with patch.dict(os.environ, {"WP_MCP_HTTP_PORT": "70000"}, clear=False):
        with pytest.raises(SystemExit, match="Invalid WP_MCP_HTTP_PORT"):
            http_server._http_port()


def test_build_app_handle_and_lifespan() -> None:
    empty_settings = McpHttpSettings(token="", allowed_hosts=[], allowed_origins=[], domain="core")
    with patch.dict(
        os.environ,
        {
            "WP_MCP_HTTP_HOST": "127.0.0.1",
            "WP_MCP_HTTP_PATH": "/mcp",
            "WP_MCP_DOMAIN": "core",
        },
        clear=False,
    ):
        with patch(
            "website_profiling.mcp.http_server.load_mcp_http_settings",
            return_value=empty_settings,
        ):
            app = http_server.build_app()

            with TestClient(app) as client:
                response = client.post(
                    "/mcp",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "initialize",
                        "params": {
                            "protocolVersion": "2024-11-05",
                            "capabilities": {},
                            "clientInfo": {"name": "test", "version": "1.0"},
                        },
                    },
                    headers={"Accept": "application/json, text/event-stream"},
                )
    assert response.status_code in {200, 202, 406}


def test_create_server_missing_sdk() -> None:
    with patch.dict(sys.modules, {"mcp.types": None}):
        with pytest.raises(SystemExit, match="MCP SDK"):
            mcp_server.create_server()


def test_run_stdio_missing_sdk() -> None:
    with patch.dict(sys.modules, {"mcp.server.stdio": None}):
        with pytest.raises(SystemExit, match="MCP SDK"):
            mcp_server.run_stdio()


def test_build_app_import_error(monkeypatch) -> None:
    monkeypatch.setitem(sys.modules, "mcp.server.streamable_http_manager", None)
    with patch.dict(os.environ, {"WP_MCP_HTTP_HOST": "127.0.0.1"}, clear=False):
        with pytest.raises(SystemExit, match="MCP HTTP dependencies"):
            http_server.build_app()


def test_load_pipeline_mcp_settings_db_error() -> None:
    with patch("website_profiling.mcp.settings.db_session", side_effect=RuntimeError("no db")):
        assert load_mcp_http_settings().token == ""


def test_load_pipeline_mcp_settings_success() -> None:
    with patch(
        "website_profiling.mcp.settings.read_pipeline_config",
        return_value=({"mcp_token": "db"}, []),
    ):
        with patch("website_profiling.mcp.settings.db_session") as mock_db:
            mock_db.return_value.__enter__.return_value = object()
            from website_profiling.mcp.settings import _load_pipeline_mcp_settings

            assert _load_pipeline_mcp_settings()["mcp_token"] == "db"


def test_host_from_header_ipv6() -> None:
    assert http_server._host_from_header("[::1]:8000") == "::1"


def test_host_allowed_port_suffix_pattern() -> None:
    assert http_server._host_allowed("audit.example.com", ["audit.example.com:*"])


def test_origin_allowed_url_and_hostname_patterns() -> None:
    assert http_server._origin_allowed(
        "https://audit.example.com",
        ["https://audit.example.com"],
    )
    # A bare hostname pattern matches the exact host only...
    assert http_server._origin_allowed(
        "https://example.com",
        ["example.com"],
    )
    # ...and must NOT be widened into a subdomain wildcard.
    assert not http_server._origin_allowed(
        "https://evil.example.com",
        ["example.com"],
    )
    # Explicit wildcard patterns match the apex and any subdomain.
    assert http_server._origin_allowed("https://app.example.com", ["*.example.com"])
    assert http_server._origin_allowed("https://example.com", ["*.example.com"])
    assert not http_server._origin_allowed("https://app.other.com", ["*.example.com"])
    assert not http_server._origin_allowed(
        "https://evil.example.net",
        ["https://audit.example.com"],
    )


def test_remote_access_middleware_rejects_bad_origin() -> None:
    app = AsyncMock()
    middleware = http_server.RemoteAccessMiddleware(app)

    async def run() -> None:
        sent: list[dict] = []

        async def capture_send(message: dict) -> None:
            sent.append(message)

        with patch(
            "website_profiling.mcp.http_server.load_mcp_http_settings",
            return_value=McpHttpSettings(
                token="secret-token",
                allowed_hosts=[],
                allowed_origins=["https://audit.example.com"],
            ),
        ):
            await middleware(
                {
                    "type": "http",
                    "headers": [
                        (b"authorization", b"Bearer secret-token"),
                        (b"origin", b"https://evil.example.net"),
                    ],
                },
                AsyncMock(),
                capture_send,
            )

        assert sent[0]["status"] == 403

    asyncio.run(run())


def test_remote_access_middleware_origin_fallback_rejects_cross_host() -> None:
    # No explicit allowed_origins: a browser Origin from a host that is not an
    # allowed host must still be rejected (transport-level Origin protection is
    # delegated to the middleware).
    app = AsyncMock()
    middleware = http_server.RemoteAccessMiddleware(app)

    async def run() -> None:
        sent: list[dict] = []

        async def capture_send(message: dict) -> None:
            sent.append(message)

        with patch(
            "website_profiling.mcp.http_server.load_mcp_http_settings",
            return_value=McpHttpSettings(
                token="secret-token",
                allowed_hosts=["audit.example.com"],
                allowed_origins=[],
            ),
        ):
            await middleware(
                {
                    "type": "http",
                    "headers": [
                        (b"host", b"audit.example.com"),
                        (b"authorization", b"Bearer secret-token"),
                        (b"origin", b"https://evil.example.net"),
                    ],
                },
                AsyncMock(),
                capture_send,
            )

        assert sent[0]["status"] == 403
        app.assert_not_called()

    asyncio.run(run())


def test_remote_access_middleware_origin_fallback_allows_same_host() -> None:
    # Same-host browser Origin is allowed even without explicit allowed_origins.
    app = AsyncMock()
    middleware = http_server.RemoteAccessMiddleware(app)

    async def run() -> None:
        with patch(
            "website_profiling.mcp.http_server.load_mcp_http_settings",
            return_value=McpHttpSettings(
                token="secret-token",
                allowed_hosts=["audit.example.com"],
                allowed_origins=[],
            ),
        ):
            await middleware(
                {
                    "type": "http",
                    "headers": [
                        (b"host", b"audit.example.com"),
                        (b"authorization", b"Bearer secret-token"),
                        (b"origin", b"https://audit.example.com"),
                    ],
                },
                AsyncMock(),
                AsyncMock(),
            )

        app.assert_called_once()

    asyncio.run(run())


def test_transport_security_public_env_only() -> None:
    with patch(
        "website_profiling.mcp.http_server.load_mcp_http_settings",
        return_value=McpHttpSettings(token="", allowed_hosts=["audit.example.com"], allowed_origins=[]),
    ):
        settings = http_server._transport_security_settings("0.0.0.0")
    assert settings.enable_dns_rebinding_protection is True

def test_host_allowed_wildcard_nomatch_then_exact() -> None:
    assert http_server._host_allowed("allowed.example", ["*.other.example", "allowed.example"])


def test_origin_allowed_http_nomatch_then_hostname() -> None:
    assert http_server._origin_allowed(
        "https://example.com",
        ["https://other.example.com", "example.com"],
    )


def test_host_allowed_empty_list_and_blank_entries() -> None:
    assert http_server._host_allowed("anything.example", [])
    assert not http_server._host_allowed("anything.example", ["", "other.example"])


def test_origin_allowed_multiple_https_patterns_miss() -> None:
    assert not http_server._origin_allowed(
        "https://app.example.com",
        ["https://other.example.com", "https://third.example.com"],
    )


def test_origin_allowed_empty_and_blank_entries() -> None:
    assert http_server._origin_allowed("https://x.example", [])
    assert not http_server._origin_allowed("https://x.example", ["https://other.example"])
    assert http_server._origin_allowed("", ["https://other.example"])
    assert not http_server._origin_allowed("https://x.example", [""])


def test_mcp_http_settings_domain_defaults_to_core() -> None:
    settings = McpHttpSettings(token="t", allowed_hosts=[], allowed_origins=[])
    assert settings.domain == "core"


def test_load_mcp_http_settings_domain_env_wins() -> None:
    with patch.dict(os.environ, {"WP_MCP_DOMAIN": "google"}, clear=False):
        with patch(
            "website_profiling.mcp.settings._load_pipeline_mcp_settings",
            return_value={"mcp_domain": "full"},
        ):
            settings = load_mcp_http_settings()
    assert settings.domain == "google"


def test_load_mcp_http_settings_domain_from_db_when_env_unset() -> None:
    with patch.dict(os.environ, {}, clear=True):
        with patch(
            "website_profiling.mcp.settings._load_pipeline_mcp_settings",
            return_value={"mcp_domain": "links"},
        ):
            settings = load_mcp_http_settings()
    assert settings.domain == "links"


def test_load_mcp_http_settings_domain_defaults_core_when_absent() -> None:
    with patch.dict(os.environ, {}, clear=True):
        with patch(
            "website_profiling.mcp.settings._load_pipeline_mcp_settings",
            return_value={},
        ):
            settings = load_mcp_http_settings()
    assert settings.domain == "core"


def test_create_server_domain_param_overrides_env(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeServer:
        def __init__(self, name: str) -> None:
            captured["name"] = name

        def list_tools(self):
            return lambda fn: fn

        def call_tool(self):
            return lambda fn: fn

        def list_resources(self):
            return lambda fn: fn

        def read_resource(self):
            return lambda fn: fn

    fake_server_mod = MagicMock()
    fake_server_mod.Server = FakeServer
    monkeypatch.setitem(sys.modules, "mcp", MagicMock())
    monkeypatch.setitem(sys.modules, "mcp.server", fake_server_mod)
    monkeypatch.setitem(sys.modules, "mcp.types", MagicMock())

    # Env says "core" but the explicit domain= arg should win.
    with patch.dict(os.environ, {"WP_MCP_DOMAIN": "core"}, clear=False):
        mcp_server.create_server(domain="google")

    assert captured["name"] == "site-audit-google"


def test_build_app_passes_db_domain_to_create_server(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeServer:
        def __init__(self, name: str) -> None:
            captured["name"] = name

        def list_tools(self):
            return lambda fn: fn

        def call_tool(self):
            return lambda fn: fn

        def list_resources(self):
            return lambda fn: fn

        def read_resource(self):
            return lambda fn: fn

        def create_initialization_options(self):
            return {}

        async def run(self, *_args, **_kwargs) -> None:
            return None

    class FakeManager:
        def __init__(self, **_kwargs) -> None:
            pass

        async def handle_request(self, *_args, **_kwargs) -> None:
            pass

        def run(self):
            from contextlib import asynccontextmanager

            @asynccontextmanager
            async def _cm():
                yield

            return _cm()

    fake_server_mod = MagicMock()
    fake_server_mod.Server = FakeServer
    monkeypatch.setitem(sys.modules, "mcp", MagicMock())
    monkeypatch.setitem(sys.modules, "mcp.server", fake_server_mod)
    monkeypatch.setitem(sys.modules, "mcp.types", MagicMock())
    monkeypatch.setitem(sys.modules, "mcp.server.streamable_http_manager", MagicMock(StreamableHTTPSessionManager=FakeManager))
    monkeypatch.setitem(sys.modules, "mcp.server.transport_security", MagicMock(TransportSecuritySettings=lambda **kw: kw))

    # No WP_MCP_DOMAIN env var; DB returns "crawl" → build_app should use "crawl".
    with patch.dict(os.environ, {"WP_MCP_HTTP_HOST": "127.0.0.1"}, clear=True):
        with patch(
            "website_profiling.mcp.settings._load_pipeline_mcp_settings",
            return_value={"mcp_domain": "crawl"},
        ):
            http_server.build_app()

    assert captured["name"] == "site-audit-crawl"
