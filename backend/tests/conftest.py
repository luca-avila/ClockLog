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

import pytest
import pytest_asyncio
from sqlalchemy import NullPool, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

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


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(_test_database_url(), poolclass=NullPool)
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
