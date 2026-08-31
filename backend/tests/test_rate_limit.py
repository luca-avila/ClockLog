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
from httpx import ASGITransport, AsyncClient

from app.main import app

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def client():
    from app.core import ratelimit

    ratelimit.reset()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    ratelimit.reset()


@pytest.fixture
def login_payload():
    return {"email": "rate@example.com", "password": "wrong-password"}


async def test_login_rate_limited_after_threshold(client, login_payload):
    limit = 10
    codes = []
    for _ in range(limit + 1):
        res = await client.post("/auth/login", json=login_payload)
        codes.append(res.status_code)

    assert codes[:limit] == [401] * limit
    assert codes[limit] == 429

    blocked = await client.post("/auth/login", json=login_payload)
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "RATE_LIMITED"
    assert "Retry-After" in blocked.headers


async def test_rate_limit_scopes_by_ip(client, login_payload):
    for _ in range(10):
        await client.post("/auth/login", json=login_payload, headers={"X-Forwarded-For": "1.1.1.1"})
    blocked = await client.post(
        "/auth/login", json=login_payload, headers={"X-Forwarded-For": "1.1.1.1"}
    )
    other = await client.post(
        "/auth/login", json=login_payload, headers={"X-Forwarded-For": "2.2.2.2"}
    )
    assert blocked.status_code == 429
    assert other.status_code == 401  # wrong password, not blocked


async def test_rate_limit_window_expires(client, login_payload, monkeypatch):
    from app.core import ratelimit

    real_now = ratelimit._now
    for _ in range(10):
        await client.post("/auth/login", json=login_payload)
    blocked = await client.post("/auth/login", json=login_payload)
    assert blocked.status_code == 429

    # Fast-forward the limiter's clock past the 60s window — injected,
    # not faked by production machinery.
    monkeypatch.setattr(ratelimit, "_now", lambda: real_now() + 61)
    allowed = await client.post("/auth/login", json=login_payload)
    assert allowed.status_code == 401


async def test_successful_login_still_counts_toward_limit(client, mail_outbox):
    from app.core import ratelimit

    ratelimit.reset()
    res = await client.post(
        "/auth/register",
        json={"email": "ok@example.com", "password": "correct-horse"},
    )
    assert res.status_code == 201

    # Login requires a verified address — burn the token from the mail first.
    _, _, raw = mail_outbox[-1]
    verified = await client.post("/auth/verify-email", json={"token": raw})
    assert verified.status_code == 200

    good = {"email": "ok@example.com", "password": "correct-horse"}
    for _ in range(10):
        res = await client.post("/auth/login", json=good)
        assert res.status_code == 200
    blocked = await client.post("/auth/login", json=good)
    assert blocked.status_code == 429


async def test_spoofed_xff_prefix_cannot_rotate_the_bucket(client, login_payload):
    # nginx appends the socket peer, so the first entries are attacker
    # controlled; only the last one is real.
    for i in range(10):
        await client.post(
            "/auth/login",
            json=login_payload,
            headers={"X-Forwarded-For": f"9.9.9.{i}, 1.1.1.1"},
        )
    blocked = await client.post(
        "/auth/login",
        json=login_payload,
        headers={"X-Forwarded-For": "9.9.9.99, 1.1.1.1"},
    )
    assert blocked.status_code == 429


async def test_client_ip_takes_the_last_hop():
    from starlette.requests import Request

    from app.core.ratelimit import client_ip

    def req(xff):
        headers = [(b"x-forwarded-for", xff.encode())] if xff else []
        return Request({"type": "http", "headers": headers, "client": ("127.0.0.1", 1234)})

    assert client_ip(req("9.9.9.9, 1.1.1.1")) == "1.1.1.1"
    assert client_ip(req(" 5.5.5.5 ")) == "5.5.5.5"
    assert client_ip(req(None)) == "127.0.0.1"
