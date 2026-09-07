# ClockLog — a Pomodoro timer and weekly planner
# Copyright (C) 2024  Luca
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import os
import shutil
import subprocess
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import NullPool, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core import ratelimit
from app.core.config import settings
from app.core.db import get_db
from app.main import app


def _test_database_url() -> str:
    """The test DB defaults to a 'clocklog_test' database next to the dev one.

    The '_test' suffix assertion is the actual safety mechanism: these
    tests DELETE from every table, so pointing them at the dev or prod
    database must be impossible by accident.
    """
    url = settings.resolved_test_database_url
    if not url.rstrip("/").endswith("_test"):
        raise RuntimeError(f"TEST_DATABASE_URL must point at a *_test database, got {url!r}")
    return url


if settings.resend_api_key:
    # The suite asserts the no-network email path; a real key would make
    # tests send mail.
    raise RuntimeError("RESEND_API_KEY must be empty when running tests")


BACKEND_DIR = Path(__file__).resolve().parent.parent


async def _ensure_test_database(test_url: str) -> None:
    """Create the test database on first use, so a fresh clone — or CI's
    ephemeral postgres, which starts with only the dev database — can run
    pytest with no manual setup.

    Only ever creates a *_test database: _test_database_url() asserted the
    suffix before this runs, so the dev and prod databases are unreachable.
    """
    base, _, name = test_url.rstrip("/").rpartition("/")
    if not base or not name:
        raise RuntimeError(f"Cannot parse a database name from {test_url!r}")
    quoted = '"' + name.replace('"', '""') + '"'
    eng = create_async_engine(f"{base}/postgres", poolclass=NullPool, isolation_level="AUTOCOMMIT")
    try:
        async with eng.connect() as conn:
            exists = await conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": name}
            )
            if exists.first() is None:
                await conn.execute(text(f"CREATE DATABASE {quoted}"))
    finally:
        await eng.dispose()


def _upgrade_test_database(test_url: str) -> None:
    """Migrate the test database through the real chain (`alembic upgrade
    head`), in a subprocess with DATABASE_URL pointed at it — the same
    command deploy runs, so the suite always matches the checked-out
    migrations.

    Skipped when there is no alembic project next to the tests: the
    deletability proof runs a pruned copy without one, and reuses the
    database the full tree already migrated.
    """
    if not (BACKEND_DIR / "alembic.ini").exists():
        return
    alembic_bin = shutil.which("alembic")
    if alembic_bin is None:
        raise RuntimeError("alembic not found on PATH — cannot migrate the test database")
    env = dict(os.environ)
    env["DATABASE_URL"] = test_url
    res = subprocess.run(
        [alembic_bin, "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        raise RuntimeError(f"alembic upgrade head failed:\n{res.stdout}\n{res.stderr}")


@pytest_asyncio.fixture(scope="session")
async def engine():
    url = _test_database_url()
    await _ensure_test_database(url)
    _upgrade_test_database(url)
    eng = create_async_engine(url, poolclass=NullPool)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_db(engine: AsyncEngine):
    """Ensure clean state before tests run."""
    async with engine.begin() as conn:
        for table in (
            "block_interval",
            "block",
            "entry",
            "tag",
            "user_setting",
            "email_token",
            '"user"',
        ):
            await conn.execute(text(f"DELETE FROM {table}"))
    yield


@pytest_asyncio.fixture(autouse=True)
async def _override_db(engine: AsyncEngine):
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def db_session(engine: AsyncEngine):
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def _fresh_rate_limiter():
    # Registering through the real endpoints accumulates against the per-IP
    # window; every test starts (and leaves) an empty limiter.
    ratelimit.reset()
    yield
    ratelimit.reset()


@pytest.fixture
def auth_headers():
    """Bearer header for a token the test obtained some other way (login,
    a revocation flow) — never for minting one."""

    def _make(token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    return _make


@pytest_asyncio.fixture
async def verified_user(client, mail_outbox):
    """A verified account's (headers, email), through the real endpoints.

    Register → verify is the only way in: minting a session token directly
    would fake auth below the EMAIL_NOT_VERIFIED gate (403). Call once per
    account — again when a test needs a second user.
    """

    async def _verified_user(password: str = "secret12") -> tuple[dict[str, str], str]:
        email = f"verified-{uuid.uuid4()}@example.com"
        reg = await client.post("/auth/register", json={"email": email, "password": password})
        assert reg.status_code == 201, reg.text
        _, _, raw = mail_outbox[-1]
        verified = await client.post("/auth/verify-email", json={"token": raw})
        assert verified.status_code == 200, verified.text
        token = verified.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}, email

    return _verified_user


@pytest.fixture(autouse=True)
def mail_outbox(monkeypatch):
    """Capture emails instead of sending them.

    Works only because user/service.py imports the mailer as a module
    (`from app.core import email as email_sender`) and calls
    `email_sender.send_*` — patching the module attribute. Rebinding the
    functions with a from-import would freeze them and silently defeat this.
    """
    sent: list[tuple[str, str, str]] = []  # (to, purpose, raw_token)

    async def _verify(to: str, token: str) -> None:
        sent.append((to, "verify", token))

    async def _reset(to: str, token: str) -> None:
        sent.append((to, "reset", token))

    monkeypatch.setattr("app.core.email.send_verification_email", _verify)
    monkeypatch.setattr("app.core.email.send_reset_email", _reset)
    return sent
