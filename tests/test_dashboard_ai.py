"""Unit tests for dashboard AI generation (no LLM API key needed)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.llm.dashboard_ai import generate_dashboard_ai


DISABLED_CFG: dict = {"llm_enabled": "false", "llm_provider": "none"}
ENABLED_CFG: dict = {"llm_enabled": "true", "llm_provider": "openai", "llm_model": "gpt-4o-mini"}
DISABLED_DASHBOARD_CFG: dict = {**ENABLED_CFG, "llm_enable_dashboards": "false"}


def make_payload(mode: str = "widget", prompt: str = "Show health score") -> dict:
    return {
        "mode": mode,
        "prompt": prompt,
        "catalog": [
            {
                "toolName": "get_report_summary",
                "label": "Audit summary",
                "fields": ["health_score", "total_issues"],
                "compatibleViz": ["kpi", "stat-card"],
                "defaultValueField": "health_score",
            }
        ],
        "viz_types": {"kpi": "KPI (number)", "stat-card": "Stat card"},
        "dashscript_help": "field('key') — read a value",
    }


class TestDisabledGuard:
    def test_returns_error_when_llm_disabled(self):
        result = generate_dashboard_ai(make_payload(), cfg=DISABLED_CFG)
        assert result["ok"] is False
        assert result.get("missing") is True
        assert "disabled" in result["error"].lower()

    def test_returns_error_when_dashboards_task_disabled(self):
        result = generate_dashboard_ai(make_payload(), cfg=DISABLED_DASHBOARD_CFG)
        assert result["ok"] is False
        assert result.get("missing") is True

    def test_returns_error_for_empty_prompt(self):
        payload = make_payload(prompt="")
        mock_cfg = {**ENABLED_CFG}
        # Even without mocking the LLM, prompt validation fires first
        result = generate_dashboard_ai(payload, cfg=mock_cfg)
        assert result["ok"] is False
        assert "prompt" in result["error"].lower()

    def test_returns_error_for_invalid_mode(self):
        payload = make_payload()
        payload["mode"] = "invalid_mode"
        result = generate_dashboard_ai(payload, cfg=ENABLED_CFG)
        assert result["ok"] is False
        assert "mode" in result["error"].lower()


class TestModePassthrough:
    """Verify generate_dashboard_ai returns LLM output unchanged for each mode."""

    @pytest.fixture(autouse=True)
    def mock_llm(self):
        fake_client = MagicMock()
        with patch(
            "website_profiling.llm.dashboard_ai.get_llm_client",
            return_value=fake_client,
        ) as mock_get:
            self.fake_client = fake_client
            self.mock_get = mock_get
            yield

    def _set_response(self, data: dict) -> None:
        self.fake_client.complete_json.return_value = data

    def test_script_mode_passthrough(self):
        expected = {"measure": 'field("health_score")', "explanation": "Read the health score."}
        self._set_response(expected)
        result = generate_dashboard_ai(make_payload(mode="script"), cfg=ENABLED_CFG)
        assert result["ok"] is True
        assert result["measure"] == expected["measure"]
        assert result["explanation"] == expected["explanation"]

    def test_widget_mode_passthrough(self):
        expected = {
            "widget": {
                "title": "Health Score",
                "toolName": "get_report_summary",
                "viz": "kpi",
                "binding": {"source": "audit-tool", "toolName": "get_report_summary", "valueField": "health_score"},
                "options": {},
            },
            "explanation": "KPI for overall health.",
        }
        self._set_response(expected)
        result = generate_dashboard_ai(make_payload(mode="widget"), cfg=ENABLED_CFG)
        assert result["ok"] is True
        assert result["widget"]["viz"] == "kpi"

    def test_dashboard_mode_passthrough(self):
        expected = {
            "name": "My Dashboard",
            "widgets": [
                {
                    "title": "Health Score",
                    "toolName": "get_report_summary",
                    "viz": "kpi",
                    "binding": {"source": "audit-tool", "toolName": "get_report_summary", "valueField": "health_score"},
                    "options": {},
                }
            ],
            "explanation": "One widget dashboard.",
        }
        self._set_response(expected)
        result = generate_dashboard_ai(make_payload(mode="dashboard"), cfg=ENABLED_CFG)
        assert result["ok"] is True
        assert result["name"] == "My Dashboard"
        assert len(result["widgets"]) == 1

    def test_llm_exception_returns_error(self):
        self.fake_client.complete_json.side_effect = RuntimeError("API timeout")
        result = generate_dashboard_ai(make_payload(), cfg=ENABLED_CFG)
        assert result["ok"] is False
        assert "API timeout" in result["error"]
