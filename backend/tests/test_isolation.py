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

"""Cross-account isolation: the multi-user boundary, proven.

Under a single account every user_id-scoped query was unobservable from
the outside. These tests are the proof that the boundary holds now that
a second account can look.
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient, Headers

from app.main import app

pytestmark = pytest.mark.asyncio


async def _make_verified_user(client: AsyncClient, email: str, mail_outbox) -> str:
    """Register, take the token from the captured mail, verify, sign in."""
    reg = await client.post("/auth/register", json={"email": email, "password": "secret12"})
    assert reg.status_code == 201
    _, _, raw = mail_outbox[-1]
    verified = await client.post("/auth/verify-email", json={"token": raw})
    assert verified.status_code == 200
    login = await client.post("/auth/login", json={"email": email, "password": "secret12"})
    assert login.status_code == 200
    return login.json()["access_token"]


@pytest.fixture
async def two_users(mail_outbox):
    """A and B, both verified, sharing one AsyncClient."""
    from app.core import ratelimit

    # Each test registers two accounts; without this the per-IP window
    # accumulates across tests and register starts answering 429.
    ratelimit.reset()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        a = await _make_verified_user(client, f"a-{uuid.uuid4().hex[:8]}@example.com", mail_outbox)
        b = await _make_verified_user(client, f"b-{uuid.uuid4().hex[:8]}@example.com", mail_outbox)
        yield (
            client,
            Headers({"Authorization": f"Bearer {a}"}),
            Headers({"Authorization": f"Bearer {b}"}),
        )
    ratelimit.reset()


async def _make_tag(client: AsyncClient, headers: Headers) -> str:
    res = await client.post(
        "/tags",
        json={"name": f"tag-{uuid.uuid4().hex[:6]}", "color": "#3B82F6"},
        headers=headers,
    )
    assert res.status_code == 201
    return res.json()["id"]


async def _make_block(client: AsyncClient, headers: Headers, tag_id: str | None = None) -> dict:
    body = {
        "id": str(uuid.uuid4()),
        "started_at": "2026-08-05T09:00:00+00:00",
        "ended_at": "2026-08-05T09:25:00+00:00",
        "status": "completed",
        "kind": "focus",
        "label": "b-block",
        "tag_id": tag_id,
    }
    res = await client.post("/blocks", json=body, headers=headers)
    assert res.status_code == 201
    return body


async def _make_entry(client: AsyncClient, headers: Headers, tag_id: str | None = None) -> str:
    body = {
        "name": "b-entry",
        "date": "2026-08-05",
        "all_day": True,
        "tag_id": tag_id,
    }
    res = await client.post("/plan/entries", json=body, headers=headers)
    assert res.status_code == 201
    return res.json()["id"]


class TestCrossAccountIsolation:
    async def test_a_cannot_read_b_block(self, two_users):
        # No GET /blocks/{id} exists — the list endpoint is the read surface.
        client, ha, hb = two_users
        await _make_block(client, hb)
        res = await client.get(
            "/blocks",
            params={"from": "2026-08-01T00:00:00Z", "to": "2026-08-30T00:00:00Z"},
            headers=ha,
        )
        assert res.status_code == 200
        assert res.json() == []
        block = await _make_block(client, hb)
        for method in ("patch", "delete"):
            kwargs = {"json": {"label": "stolen"}} if method == "patch" else {}
            res = await getattr(client, method)(f"/blocks/{block['id']}", headers=ha, **kwargs)
            assert res.status_code == 404, f"{method} leaked block data: {res.text}"
            assert "b-block" not in res.text

    async def test_a_cannot_read_b_entry(self, two_users):
        client, ha, hb = two_users
        entry_id = await _make_entry(client, hb)
        for method in ("get", "patch", "delete"):
            kwargs = {"json": {"name": "stolen"}} if method == "patch" else {}
            res = await getattr(client, method)(f"/plan/entries/{entry_id}", headers=ha, **kwargs)
            assert res.status_code == 404, f"{method} leaked entry data: {res.text}"
            assert "b-entry" not in res.text

    async def test_a_cannot_read_b_tag(self, two_users):
        client, ha, hb = two_users
        tag_id = await _make_tag(client, hb)
        res = await client.delete(f"/tags/{tag_id}", headers=ha)
        assert res.status_code == 404

    async def test_a_settings_put_does_not_touch_b(self, two_users):
        client, ha, hb = two_users
        res = await client.put(
            "/settings",
            json={
                "focusDuration": 50,
                "shortBreakDuration": 5,
                "longBreakDuration": 10,
                "blocksPerCycle": 4,
                "autoStartBreaks": True,
                "autoStartNext": True,
                "sound": True,
                "notifications": True,
            },
            headers=ha,
        )
        assert res.status_code == 200
        b_settings = await client.get("/settings", headers=hb)
        assert b_settings.status_code == 200
        assert b_settings.json()["focusDuration"] != 50

    async def test_a_cannot_create_block_with_b_tag(self, two_users):
        client, ha, hb = two_users
        tag_id = await _make_tag(client, hb)
        res = await client.post(
            "/blocks",
            json={
                "id": str(uuid.uuid4()),
                "started_at": "2026-08-05T09:00:00+00:00",
                "ended_at": "2026-08-05T09:25:00+00:00",
                "status": "completed",
                "kind": "focus",
                "label": "a-block",
                "tag_id": tag_id,
            },
            headers=ha,
        )
        assert res.status_code == 404
        assert res.json()["code"] == "TAG_NOT_FOUND"

    async def test_a_cannot_patch_block_with_b_tag(self, two_users):
        client, ha, hb = two_users
        tag_id = await _make_tag(client, hb)
        block = await _make_block(client, ha)
        res = await client.patch(f"/blocks/{block['id']}", json={"tag_id": tag_id}, headers=ha)
        assert res.status_code == 404
        assert res.json()["code"] == "TAG_NOT_FOUND"

    async def test_a_cannot_create_entry_with_b_tag(self, two_users):
        client, ha, hb = two_users
        tag_id = await _make_tag(client, hb)
        res = await client.post(
            "/plan/entries",
            json={"name": "a-entry", "date": "2026-08-05", "all_day": True, "tag_id": tag_id},
            headers=ha,
        )
        assert res.status_code == 404
        assert res.json()["code"] == "TAG_NOT_FOUND"

    async def test_a_cannot_patch_entry_with_b_tag(self, two_users):
        client, ha, hb = two_users
        tag_id = await _make_tag(client, hb)
        entry_id = await _make_entry(client, ha)
        res = await client.patch(f"/plan/entries/{entry_id}", json={"tag_id": tag_id}, headers=ha)
        assert res.status_code == 404
        assert res.json()["code"] == "TAG_NOT_FOUND"

    async def test_summary_never_names_b_tag(self, two_users, db_session):
        """The write-path check is not enough on its own: B's tag_id is
        written straight into the DB on one of A's blocks, so the summary's
        tag resolution must scope by owner too."""
        from sqlalchemy import select

        from app.shared.tag.models import Tag
        from app.timer.models import Block

        client, ha, hb = two_users
        block = await _make_block(client, ha)

        # B's tag, attached to A's block behind the API's back.
        b_tag_id = await _make_tag(client, hb)
        tag = (
            await db_session.execute(select(Tag).where(Tag.id == uuid.UUID(b_tag_id)))
        ).scalar_one()
        b_row = (
            await db_session.execute(select(Block).where(Block.id == uuid.UUID(block["id"])))
        ).scalar_one()
        b_row.tag_id = tag.id
        await db_session.commit()

        summary = await client.get(
            "/blocks/summary",
            params={"from": "2026-08-01T00:00:00Z", "to": "2026-08-30T00:00:00Z"},
            headers=ha,
        )
        assert summary.status_code == 200
        assert len(summary.json()) == 1
        row = summary.json()[0]
        # The stored tag_id column is echoed as-is (it sits on A's own block
        # row), but the tag must not be RESOLVED: no name, no color — the
        # row reads as untagged.
        assert row["tag_name"] != tag.name
        assert row["tag_name"] == "Untagged"
        assert row["tag_color"] is None
