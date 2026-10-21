import os
import sys
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="zsp-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TMP, 'test.db').as_posix()}"
os.environ["JWT_SECRET"] = "test-secret-test-secret-test-secret-32"
os.environ.pop("ANTHROPIC_API_KEY", None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import drop_db, init_db, new_session  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed_base, seed_users  # noqa: E402

REPO = Path(__file__).resolve().parent.parent.parent


@pytest.fixture()
def db():
    drop_db()
    init_db()
    with new_session() as s:
        seed_base(s)
        seed_users(s)
    yield


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def login():
    """login(email, password) -> TestClient with its own cookie jar."""
    clients = []

    def _login(email: str, password: str) -> TestClient:
        c = TestClient(app)
        r = c.post("/api/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        clients.append(c)
        return c

    yield _login
    for c in clients:
        c.close()
