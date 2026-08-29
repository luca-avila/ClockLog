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

"""The no-key path: dev and CI must log the link and never touch the network."""

import logging

import httpx
import pytest

from app.core.config import settings
from app.core.email import send_reset_email, send_verification_email

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Any attempt to build an HTTP client is a bug in the no-key path."""
    monkeypatch.setattr(settings, "resend_api_key", "")
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **k: pytest.fail("send_email attempted network I/O without an API key"),
    )


async def test_verification_link_is_logged_when_no_key(caplog):
    with caplog.at_level(logging.INFO, logger="clocklog.email"):
        await send_verification_email("a@b.c", "tok-123")
    assert "tok-123" in caplog.text
    assert "/verify-email?token=tok-123" in caplog.text
    assert "a@b.c" in caplog.text


async def test_reset_link_is_logged_when_no_key(caplog):
    with caplog.at_level(logging.INFO, logger="clocklog.email"):
        await send_reset_email("a@b.c", "tok-456")
    assert "/reset-password?token=tok-456" in caplog.text


async def test_links_point_at_the_frontend_base(caplog):
    with caplog.at_level(logging.INFO, logger="clocklog.email"):
        await send_verification_email("a@b.c", "t")
    assert settings.app_base_url in caplog.text
