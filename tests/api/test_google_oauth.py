"""Google OAuth state signing (Python).

HTTP routes (/api/integrations/google/auth, /callback) are served by IntegrationsService
via the BFF; slim FastAPI no longer mounts the integrations router.
"""
from __future__ import annotations

from website_profiling.integrations.google import oauth as oauth_mod


def test_oauth_state_roundtrip_tamper_and_expiry() -> None:
    state = oauth_mod.sign_state(42, "/integrations", now=1000)
    payload = oauth_mod.verify_state(state, now=1001)
    assert payload is not None
    assert payload["p"] == 42
    assert payload["r"] == "/integrations"
    # Tampered signature → rejected.
    assert oauth_mod.verify_state(state + "x", now=1001) is None
    # Expired → rejected.
    assert oauth_mod.verify_state(state, now=10_000) is None
    # Missing/garbage → rejected.
    assert oauth_mod.verify_state(None) is None
    assert oauth_mod.verify_state("no-dot") is None
