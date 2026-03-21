import os
import tempfile

# Must run before importing app (engine binds to DATABASE_URL at import time).
_tmp = tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False)
_tmp.close()
TEST_DB_PATH = _tmp.name
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB_PATH}"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def project_id(client):
    r = client.post("/api/v1/projects", json={"name": "Test Project", "domain": "example.com"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def pytest_sessionfinish(session, exitstatus):
    try:
        os.unlink(TEST_DB_PATH)
    except OSError:
        pass
