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
from httpx import Headers


class TestPostBlocks:
    @pytest.mark.asyncio
    async def test_post_block_succeeds(self, client, verified_user):
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        resp = await client.post(
            "/blocks",
            json={
                "id": block_id,
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
                "status": "completed",
                "label": "debug JWT refresh",
                "tag_id": None,
            },
            headers=Headers(headers),
        )
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_rejects_missing_started_at(self, client, verified_user):
        headers, _ = await verified_user()

        resp = await client.post(
            "/blocks",
            json={"id": str(uuid.uuid4()), "status": "completed"},
            headers=Headers(headers),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_same_uuid_is_idempotent(self, client, verified_user):
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        payload = {
            "id": block_id,
            "started_at": "2026-08-05T12:00:00+00:00",
            "ended_at": "2026-08-05T12:25:00+00:00",
            "status": "completed",
            "label": "test idempotent",
            "tag_id": None,
        }
        r1 = await client.post("/blocks", json=payload, headers=Headers(headers))
        r2 = await client.post("/blocks", json=payload, headers=Headers(headers))
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json() == r2.json()

    @pytest.mark.asyncio
    async def test_cannot_write_another_users_block(self, client, verified_user):
        headers1, _ = await verified_user()
        headers2, _ = await verified_user()

        block_id = str(uuid.uuid4())
        # Create block as user 1
        await client.post(
            "/blocks",
            json={
                "id": block_id,
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
                "status": "completed",
                "label": "u1 block",
                "tag_id": None,
            },
            headers=Headers(headers1),
        )
        # Try to overwrite as user 2 → should be rejected
        resp = await client.post(
            "/blocks",
            json={
                "id": block_id,
                "started_at": "2026-08-05T13:00:00+00:00",
                "ended_at": "2026-08-05T13:25:00+00:00",
                "status": "completed",
                "label": "u2 override attempt",
                "tag_id": None,
            },
            headers=Headers(headers2),
        )
        assert resp.status_code == 403


class TestPatchBlocks:
    @pytest.mark.asyncio
    async def test_patch_can_clear_tag_and_label(self, client, verified_user):
        """An explicit null clears the field — exclude_unset semantics."""
        headers, _ = await verified_user()

        tag_resp = await client.post(
            "/tags",
            json={"name": "Work", "color": "#0000FF"},
            headers=Headers(headers),
        )
        tag_id = tag_resp.json()["id"]

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json={
                "id": block_id,
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
                "status": "completed",
                "label": "debug JWT refresh",
                "tag_id": tag_id,
            },
            headers=Headers(headers),
        )

        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"tag_id": None, "label": None},
            headers=Headers(headers),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["tag_id"] is None
        assert body["label"] is None

    @pytest.mark.asyncio
    async def test_patch_absent_fields_untouched(self, client, verified_user):
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json={
                "id": block_id,
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
                "status": "completed",
                "label": "keep me",
                "tag_id": None,
            },
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"label": "renamed"},
            headers=Headers(headers),
        )
        assert resp.status_code == 200
        assert resp.json()["label"] == "renamed"
        assert resp.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_patch_status(self, client, verified_user):
        """SCR-21 edits status in the block inspector."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json={
                "id": block_id,
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
                "status": "completed",
                "label": "late stop",
                "tag_id": None,
            },
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"status": "aborted"},
            headers=Headers(headers),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "aborted"

    @pytest.mark.asyncio
    async def test_patch_cannot_clear_started_at(self, client, verified_user):
        """started_at: null is rejected — a block always has a start
        (invariant 7). ended_at: null is the only clearable time."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json={
                "id": block_id,
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
                "status": "completed",
                "label": "anchored",
                "tag_id": None,
            },
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"started_at": None},
            headers=Headers(headers),
        )
        after = await client.get(
            "/blocks?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        blocks = {b["id"]: b for b in after.json()}
        assert blocks[block_id]["started_at"] == "2026-08-05T12:00:00Z"

    @pytest.mark.asyncio
    async def test_patch_can_clear_ended_at(self, client, verified_user):
        """Pins the asymmetry: ended_at: null clears the end (200)."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json={
                "id": block_id,
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
                "status": "completed",
                "label": "reopen me",
                "tag_id": None,
            },
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"ended_at": None},
            headers=Headers(headers),
        )
        assert resp.status_code == 200
        assert resp.json()["intervals"][0]["ended_at"] is None

    @pytest.mark.asyncio
    async def test_patch_rejects_unknown_field(self, client, verified_user):
        """extra='forbid': an unknown key is a client bug, and the patch
        body must not double as a mass-assignment vector."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json={
                "id": block_id,
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
                "status": "completed",
                "label": "mine",
                "tag_id": None,
            },
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"user_id": str(uuid.uuid4())},
            headers=Headers(headers),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_patch_cannot_clear_status(self, client, verified_user):
        """status backs a NOT NULL column — an explicit null must 422 in the
        schema, not 500 on commit. The re-read proves nothing was written."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json={
                "id": block_id,
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
                "status": "completed",
                "label": "status anchor",
                "tag_id": None,
            },
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"status": None},
            headers=Headers(headers),
        )
        after = await client.get(
            "/blocks?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        blocks = {b["id"]: b for b in after.json()}
        assert blocks[block_id]["status"] == "completed"

    @pytest.mark.asyncio
    async def test_patch_rejects_naive_datetime(self, client, verified_user):
        """The tz guards deleted from update_block live on in BlockUpdate's
        field validator (invariant 5)."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json={
                "id": block_id,
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
                "status": "completed",
                "label": "tz anchor",
                "tag_id": None,
            },
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"started_at": "2026-08-05T13:00:00"},
            headers=Headers(headers),
        )
        assert resp.status_code == 422


class TestPathIdValidation:
    @pytest.mark.asyncio
    async def test_malformed_block_id_is_422_not_500(self, client, verified_user):
        headers, _ = await verified_user()

        resp = await client.patch(
            "/blocks/not-a-uuid", json={"label": "x"}, headers=Headers(headers)
        )
        gone = await client.delete("/blocks/not-a-uuid", headers=Headers(headers))
        assert resp.status_code == 422
        assert gone.status_code == 422

    @pytest.mark.asyncio
    async def test_unknown_block_id_is_still_404(self, client, verified_user):
        headers, _ = await verified_user()

        fake_id = str(uuid.uuid4())
        resp = await client.patch(
            f"/blocks/{fake_id}", json={"label": "x"}, headers=Headers(headers)
        )
        gone = await client.delete(f"/blocks/{fake_id}", headers=Headers(headers))
        assert resp.status_code == 404
        assert resp.json()["code"] == "BLOCK_NOT_FOUND"
        assert gone.status_code == 404


class TestHistoryQueryValidation:
    @pytest.mark.asyncio
    async def test_garbage_from_is_422_not_500(self, client, verified_user):
        headers, _ = await verified_user()

        resp = await client.get(
            "/blocks?from=nonsense&to=2026-08-06T00:00:00Z",
            headers=Headers(headers),
        )
        summary = await client.get(
            "/blocks/summary?from=nonsense&to=2026-08-06T00:00:00Z",
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert summary.status_code == 422

    @pytest.mark.asyncio
    async def test_naive_datetime_is_422(self, client, verified_user):
        headers, _ = await verified_user()

        resp = await client.get(
            "/blocks?from=2026-08-05T00:00:00&to=2026-08-06T00:00:00Z",
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        # The app-level handler flattens detail into the body: {"code", ...}
        assert resp.json()["code"] == "NAIVE_DATETIME"

    @pytest.mark.asyncio
    async def test_from_after_to_is_422(self, client, verified_user):
        headers, _ = await verified_user()

        resp = await client.get(
            "/blocks?from=2026-08-06T00:00:00Z&to=2026-08-05T00:00:00Z",
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_RANGE"

    @pytest.mark.asyncio
    async def test_valid_range_still_works(self, client, verified_user):
        headers, _ = await verified_user()

        resp = await client.get(
            "/blocks?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
            headers=Headers(headers),
        )
        assert resp.status_code == 200
