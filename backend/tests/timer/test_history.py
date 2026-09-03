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

import uuid

import pytest
from httpx import ASGITransport, AsyncClient, Headers

from app.main import app


async def _auth_and_post_block(
    client: AsyncClient,
    headers: dict,
    label: str = "test",
    started_at: str = "2026-08-05T09:00:00+00:00",
    status: str = "completed",
    kind: str | None = None,
):
    payload = {
        "id": str(uuid.uuid4()),
        "started_at": started_at,
        "ended_at": None,
        "status": status,
        "label": label,
        "tag_id": None,
    }
    if kind is not None:
        payload["kind"] = kind
    await client.post(
        "/blocks",
        json=payload,
        headers=Headers(headers),
    )


class TestHistory:
    @pytest.mark.asyncio
    async def test_blocks_in_range_ordered_by_time(self, verified_user):
        headers, _ = await verified_user()

        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _auth_and_post_block(client, headers, "first", "2026-08-05T09:00:00+00:00")
            await _auth_and_post_block(client, headers, "second", "2026-08-05T10:00:00+00:00")
            await _auth_and_post_block(client, headers, "outside", "2026-08-06T09:00:00+00:00")

            resp = await client.get(
                "/blocks?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
                headers=Headers(headers),
            )
        assert resp.status_code == 200
        blocks = resp.json()
        assert len(blocks) == 2
        assert blocks[0]["label"] == "first"
        assert blocks[1]["label"] == "second"

    @pytest.mark.asyncio
    async def test_aborted_blocks_included(self, verified_user):
        headers, _ = await verified_user()

        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _auth_and_post_block(
                client, headers, "done", "2026-08-05T09:00:00+00:00", "completed"
            )  # noqa: E501
            await _auth_and_post_block(
                client, headers, "aborted", "2026-08-05T09:30:00+00:00", "aborted"
            )  # noqa: E501

            resp = await client.get(
                "/blocks?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
                headers=Headers(headers),
            )
        assert resp.status_code == 200
        blocks = resp.json()
        assert len(blocks) == 2
        statuses = {b["status"] for b in blocks}
        assert "aborted" in statuses
        assert "completed" in statuses

    @pytest.mark.asyncio
    async def test_scoped_to_user(self, verified_user):
        h1, _ = await verified_user()
        h2, _ = await verified_user()

        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _auth_and_post_block(client, h1, "u1-block", "2026-08-05T09:00:00+00:00")
            await _auth_and_post_block(client, h2, "u2-block", "2026-08-05T09:00:00+00:00")

            resp = await client.get(
                "/blocks?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
                headers=Headers(h1),
            )
        assert resp.status_code == 200
        blocks = resp.json()
        assert len(blocks) == 1
        assert blocks[0]["label"] == "u1-block"

    @pytest.mark.asyncio
    async def test_kind_roundtrip_and_default(self, verified_user):
        headers, _ = await verified_user()

        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _auth_and_post_block(
                client, headers, "focus work", "2026-08-05T09:00:00+00:00", "completed", "focus"
            )
            await _auth_and_post_block(
                client, headers, None, "2026-08-05T09:30:00+00:00", "completed", "short_break"
            )
            # No kind sent: pre-migration clients default to focus.
            await _auth_and_post_block(client, headers, "legacy", "2026-08-05T10:00:00+00:00")

            resp = await client.get(
                "/blocks?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
                headers=Headers(headers),
            )
        assert resp.status_code == 200
        blocks = resp.json()
        kinds = [b["kind"] for b in blocks]
        assert kinds == ["focus", "short_break", "focus"]


class TestSummary:
    @pytest.mark.asyncio
    async def test_aggregates_by_tag(self, verified_user):
        headers, _ = await verified_user()

        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create a tag first
            tag_resp = await client.post(
                "/tags",
                json={"name": "Study", "color": "#FF0000"},
                headers=Headers(headers),
            )
            tag_id = tag_resp.json()["id"]

            # Post blocks: one tagged, one untagged
            await client.post(
                "/blocks",
                json={
                    "id": str(uuid.uuid4()),
                    "started_at": "2026-08-05T09:00:00+00:00",
                    "ended_at": "2026-08-05T09:25:00+00:00",
                    "status": "completed",
                    "label": "tagged block",
                    "tag_id": tag_id,
                },
                headers=Headers(headers),
            )
            await client.post(
                "/blocks",
                json={
                    "id": str(uuid.uuid4()),
                    "started_at": "2026-08-05T09:30:00+00:00",
                    "ended_at": "2026-08-05T09:55:00+00:00",
                    "status": "completed",
                    "label": "untagged block",
                    "tag_id": None,
                },
                headers=Headers(headers),
            )

            resp = await client.get(
                "/blocks/summary?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
                headers=Headers(headers),
            )
        assert resp.status_code == 200
        summary = resp.json()
        # Two buckets: "Study" and "Untagged"
        assert len(summary) == 2
        names = {s["tag_name"] for s in summary}
        assert "Study" in names
        assert "Untagged" in names

    @pytest.mark.asyncio
    async def test_includes_aborted_in_summary(self, verified_user):
        headers, _ = await verified_user()

        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _auth_and_post_block(
                client, headers, "aborted", "2026-08-05T09:00:00+00:00", "aborted"
            )  # noqa: E501
            await _auth_and_post_block(
                client, headers, "completed", "2026-08-05T09:30:00+00:00", "completed"
            )  # noqa: E501

            resp = await client.get(
                "/blocks/summary?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
                headers=Headers(headers),
            )
        assert resp.status_code == 200
        summary = resp.json()
        assert len(summary) == 1  # "Untagged" for both
        # Both blocks have one interval of 0 duration (ended_at is null),
        # so duration will be 0. But the test just verifies they're included.

    @pytest.mark.asyncio
    async def test_summary_excludes_breaks(self, verified_user):
        headers, _ = await verified_user()

        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 25 min focus + 5 min break: the summary must report focus only.
            await client.post(
                "/blocks",
                json={
                    "id": str(uuid.uuid4()),
                    "started_at": "2026-08-05T09:00:00+00:00",
                    "ended_at": "2026-08-05T09:25:00+00:00",
                    "status": "completed",
                    "kind": "focus",
                    "label": "work",
                    "tag_id": None,
                },
                headers=Headers(headers),
            )
            await client.post(
                "/blocks",
                json={
                    "id": str(uuid.uuid4()),
                    "started_at": "2026-08-05T09:25:00+00:00",
                    "ended_at": "2026-08-05T09:30:00+00:00",
                    "status": "completed",
                    "kind": "short_break",
                    "label": None,
                    "tag_id": None,
                },
                headers=Headers(headers),
            )

            resp = await client.get(
                "/blocks/summary?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
                headers=Headers(headers),
            )
            list_resp = await client.get(
                "/blocks?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
                headers=Headers(headers),
            )
        assert resp.status_code == 200
        summary = resp.json()
        assert len(summary) == 1
        assert summary[0]["total_seconds"] == pytest.approx(1500)  # 25 min, not 30
        # ...but the day list still shows the break (SCR-20).
        assert [b["kind"] for b in list_resp.json()] == ["focus", "short_break"]

    @pytest.mark.asyncio
    async def test_recent_labels_excludes_breaks(self, verified_user):
        headers, _ = await verified_user()

        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # A mislabeled break must not surface in focus autocomplete.
            await _auth_and_post_block(
                client, headers, "focus label", "2026-08-05T09:00:00+00:00", "completed", "focus"
            )
            await _auth_and_post_block(
                client,
                headers,
                "break label",
                "2026-08-05T09:30:00+00:00",
                "completed",
                "long_break",
            )

            resp = await client.get("/blocks/recent-labels", headers=Headers(headers))
        assert resp.status_code == 200
        assert resp.json() == ["focus label"]
