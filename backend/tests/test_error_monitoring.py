# Tempo — a Pomodoro timer and weekly planner
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

import json
import logging
import uuid

import pytest
from fastapi import APIRouter
from httpx import ASGITransport, AsyncClient

from app.main import app

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def boom_route():
    """Register a route that raises, and remove it afterwards."""
    router = APIRouter()

    @router.get("/_boom")
    async def _boom():
        raise RuntimeError("sentinel explosion")

    app.include_router(router)
    yield "/_boom"
    app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) != "/_boom"]


async def test_unhandled_error_returns_structured_json(client, boom_route):
    res = await client.get(boom_route)
    assert res.status_code == 500
    body = res.json()
    assert body["code"] == "INTERNAL_ERROR"
    assert body["request_id"]
    # uuid-shaped so it can be grepped in logs
    uuid.UUID(body["request_id"])


async def test_unhandled_error_is_logged_with_request_id(client, boom_route, caplog):
    with caplog.at_level(logging.ERROR, logger="tempo.errors"):
        res = await client.get(boom_route)
    request_id = res.json()["request_id"]

    records = [r for r in caplog.records if r.name == "tempo.errors"]
    assert records, "expected an error log record"
    entry = json.loads(records[0].getMessage())
    assert entry["request_id"] == request_id
    assert entry["path"] == boom_route
    assert "sentinel explosion" in entry["error"]


async def test_request_id_echoed_when_client_supplies_one(client, boom_route):
    res = await client.get(boom_route, headers={"X-Request-ID": "abc123"})
    assert res.json()["request_id"] == "abc123"
    assert res.headers["X-Request-ID"] == "abc123"
