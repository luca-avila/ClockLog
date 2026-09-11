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


def _block_body(**overrides: object) -> dict[str, object]:
    """Default create body, mirroring the frontend sender's payload."""
    body: dict[str, object] = {
        "id": str(uuid.uuid4()),
        "status": "completed",
        "kind": "focus",
        "label": "test",
        "tag_id": None,
        "intervals": [
            {
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
            }
        ],
    }
    body.update(overrides)
    return body


class TestPostBlocks:
    @pytest.mark.asyncio
    async def test_post_block_succeeds(self, client, verified_user):
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        resp = await client.post(
            "/blocks",
            json=_block_body(id=block_id, label="debug JWT refresh"),
            headers=Headers(headers),
        )
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_rejects_missing_intervals(self, client, verified_user):
        """Form errors on the interval contract carry the same code as the
        semantic ones — the client branches on `code`, not on a 422 body."""
        headers, _ = await verified_user()

        resp = await client.post(
            "/blocks",
            json={"id": str(uuid.uuid4()), "status": "completed"},
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_rejects_legacy_envelope_payload(self, client, verified_user):
        """The old single-interval wire must 422, never silently one-row it."""
        headers, _ = await verified_user()

        resp = await client.post(
            "/blocks",
            json={
                "id": str(uuid.uuid4()),
                "started_at": "2026-08-05T12:00:00+00:00",
                "ended_at": "2026-08-05T12:25:00+00:00",
                "status": "completed",
                "label": "legacy",
                "tag_id": None,
            },
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_post_persists_all_intervals(self, client, verified_user):
        """N intervals round-trip: the pause gap exists only as a gap."""
        headers, _ = await verified_user()

        resp = await client.post(
            "/blocks",
            json=_block_body(
                intervals=[
                    {
                        "started_at": "2026-08-05T12:00:00+00:00",
                        "ended_at": "2026-08-05T12:12:00+00:00",
                    },
                    {
                        "started_at": "2026-08-05T12:22:00+00:00",
                        "ended_at": "2026-08-05T12:30:00+00:00",
                    },
                ]
            ),
            headers=Headers(headers),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["started_at"] == "2026-08-05T12:00:00Z"
        assert len(body["intervals"]) == 2

    @pytest.mark.asyncio
    async def test_rejects_empty_intervals(self, client, verified_user):
        headers, _ = await verified_user()

        resp = await client.post(
            "/blocks",
            json=_block_body(intervals=[]),
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_rejects_open_interval(self, client, verified_user):
        """A POSTed block is always finished; open intervals live only in
        localStorage (one POST per block, invariant 3)."""
        headers, _ = await verified_user()

        resp = await client.post(
            "/blocks",
            json=_block_body(
                intervals=[
                    {
                        "started_at": "2026-08-05T12:00:00+00:00",
                        "ended_at": None,
                    }
                ]
            ),
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_rejects_inverted_interval(self, client, verified_user):
        headers, _ = await verified_user()

        resp = await client.post(
            "/blocks",
            json=_block_body(
                intervals=[
                    {
                        "started_at": "2026-08-05T12:25:00+00:00",
                        "ended_at": "2026-08-05T12:00:00+00:00",
                    }
                ]
            ),
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_non_interval_validation_keeps_generic_422(self, client, verified_user):
        """Only the interval contract is re-labelled: a bad `status` is still
        FastAPI's own 422 body, which carries no `code`."""
        headers, _ = await verified_user()

        resp = await client.post(
            "/blocks",
            json=_block_body(status="siesta"),
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert "code" not in resp.json()

    @pytest.mark.asyncio
    async def test_rejects_zero_length_interval(self, client, verified_user):
        """POST and PATCH agree: a segment must be strictly positive. The
        contract is `end > start` on both write paths."""
        headers, _ = await verified_user()

        resp = await client.post(
            "/blocks",
            json=_block_body(
                intervals=[
                    {
                        "started_at": "2026-08-05T12:00:00+00:00",
                        "ended_at": "2026-08-05T12:00:00+00:00",
                    }
                ]
            ),
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_rejects_overlapping_intervals(self, client, verified_user):
        headers, _ = await verified_user()

        resp = await client.post(
            "/blocks",
            json=_block_body(
                intervals=[
                    {
                        "started_at": "2026-08-05T12:00:00+00:00",
                        "ended_at": "2026-08-05T12:15:00+00:00",
                    },
                    {
                        "started_at": "2026-08-05T12:10:00+00:00",
                        "ended_at": "2026-08-05T12:25:00+00:00",
                    },
                ]
            ),
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_rejects_naive_interval_datetime(self, client, verified_user):
        headers, _ = await verified_user()

        resp = await client.post(
            "/blocks",
            json=_block_body(
                intervals=[
                    {
                        "started_at": "2026-08-05T12:00:00",
                        "ended_at": "2026-08-05T12:25:00",
                    }
                ]
            ),
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_same_uuid_is_idempotent(self, client, verified_user):
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        payload = _block_body(id=block_id, label="test idempotent")
        r1 = await client.post("/blocks", json=payload, headers=Headers(headers))
        r2 = await client.post("/blocks", json=payload, headers=Headers(headers))
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json() == r2.json()

    @pytest.mark.asyncio
    async def test_idempotent_retry_with_different_intervals_returns_original(
        self, client, verified_user
    ):
        """A queue retry must never become a write, even with a drifted body."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        original = _block_body(
            id=block_id,
            label="retried",
            intervals=[
                {
                    "started_at": "2026-08-05T12:00:00+00:00",
                    "ended_at": "2026-08-05T12:12:00+00:00",
                },
                {
                    "started_at": "2026-08-05T12:22:00+00:00",
                    "ended_at": "2026-08-05T12:30:00+00:00",
                },
            ],
        )
        r1 = await client.post("/blocks", json=original, headers=Headers(headers))
        retry = _block_body(
            id=block_id,
            label="retried",
            intervals=[
                {
                    "started_at": "2026-08-05T13:00:00+00:00",
                    "ended_at": "2026-08-05T13:25:00+00:00",
                }
            ],
        )
        r2 = await client.post("/blocks", json=retry, headers=Headers(headers))

        assert r1.status_code == 201
        assert r2.status_code == 201
        assert len(r2.json()["intervals"]) == 2
        assert r2.json()["intervals"][0]["started_at"] == "2026-08-05T12:00:00Z"

    @pytest.mark.asyncio
    async def test_cannot_write_another_users_block(self, client, verified_user):
        headers1, _ = await verified_user()
        headers2, _ = await verified_user()

        block_id = str(uuid.uuid4())
        # Create block as user 1
        await client.post(
            "/blocks",
            json=_block_body(id=block_id, label="u1 block"),
            headers=Headers(headers1),
        )
        # Try to overwrite as user 2 → should be rejected
        resp = await client.post(
            "/blocks",
            json=_block_body(
                id=block_id,
                label="u2 override attempt",
                intervals=[
                    {
                        "started_at": "2026-08-05T13:00:00+00:00",
                        "ended_at": "2026-08-05T13:25:00+00:00",
                    }
                ],
            ),
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
            json=_block_body(id=block_id, label="debug JWT refresh", tag_id=tag_id),
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
            json=_block_body(id=block_id, label="keep me"),
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
            json=_block_body(id=block_id, label="late stop"),
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
        (invariant 7). No time is clearable; only label/tag_id accept null."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json=_block_body(id=block_id, label="anchored"),
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
        # The model-level "cannot be cleared" guard names the field in its
        # message, so the interval-contract handler still re-labels it.
        assert resp.json()["code"] == "INVALID_INTERVAL"
        blocks = {b["id"]: b for b in after.json()}
        assert blocks[block_id]["started_at"] == "2026-08-05T12:00:00Z"

    @pytest.mark.asyncio
    async def test_patch_cannot_clear_ended_at(self, client, verified_user):
        """ended_at: null would reopen a stored block, which create rejects —
        the edit contract must reject it too (invariants 2 and 3)."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json=_block_body(id=block_id, label="stay closed"),
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"ended_at": None},
            headers=Headers(headers),
        )
        after = await client.get(
            "/blocks?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        # The model-level "cannot be cleared" guard re-labels to the interval
        # contract, same code as started_at: null.
        assert resp.json()["code"] == "INVALID_INTERVAL"
        blocks = {b["id"]: b for b in after.json()}
        assert blocks[block_id]["intervals"][0]["ended_at"] == "2026-08-05T12:25:00Z"

    @pytest.mark.asyncio
    async def test_patch_cannot_open_last_interval_of_multi_interval_block(
        self, client, verified_user
    ):
        """The end edge lives on the last interval of an N-interval block; a
        null there must 422 exactly like the single-interval case."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json=_block_body(
                id=block_id,
                intervals=[
                    {
                        "started_at": "2026-08-05T12:00:00+00:00",
                        "ended_at": "2026-08-05T12:12:00+00:00",
                    },
                    {
                        "started_at": "2026-08-05T12:22:00+00:00",
                        "ended_at": "2026-08-05T12:30:00+00:00",
                    },
                ],
            ),
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"ended_at": None},
            headers=Headers(headers),
        )
        after = await client.get(
            "/blocks?from=2026-08-05T00:00:00Z&to=2026-08-06T00:00:00Z",
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"
        blocks = {b["id"]: b for b in after.json()}
        assert all(iv["ended_at"] is not None for iv in blocks[block_id]["intervals"])

    @pytest.mark.asyncio
    async def test_patch_ended_at_collapse_or_invert_rejected(self, client, verified_user):
        """A moved end obeys the same `end > start` rule as POST."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json=_block_body(id=block_id, label="edges"),
            headers=Headers(headers),
        )
        collapsed = await client.patch(
            f"/blocks/{block_id}",
            json={"ended_at": "2026-08-05T12:00:00+00:00"},
            headers=Headers(headers),
        )
        inverted = await client.patch(
            f"/blocks/{block_id}",
            json={"ended_at": "2026-08-05T11:30:00+00:00"},
            headers=Headers(headers),
        )
        assert collapsed.status_code == 422
        assert collapsed.json()["code"] == "INVALID_INTERVAL"
        assert inverted.status_code == 422
        assert inverted.json()["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_patch_move_ended_at_still_works(self, client, verified_user):
        """A closed block stays editable: a later, valid end moves the edge."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json=_block_body(id=block_id, label="extend me"),
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"ended_at": "2026-08-05T12:40:00+00:00"},
            headers=Headers(headers),
        )
        assert resp.status_code == 200
        assert resp.json()["intervals"][-1]["ended_at"] == "2026-08-05T12:40:00Z"

    @pytest.mark.asyncio
    async def test_patch_rejects_unknown_field(self, client, verified_user):
        """extra='forbid': an unknown key is a client bug, and the patch
        body must not double as a mass-assignment vector."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json=_block_body(id=block_id, label="mine"),
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"user_id": str(uuid.uuid4())},
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        # An unrelated unknown key stays FastAPI's own body — only the interval
        # contract is re-labelled (no `code`).
        assert "code" not in resp.json()

    @pytest.mark.asyncio
    async def test_patch_cannot_clear_status(self, client, verified_user):
        """status backs a NOT NULL column — an explicit null must 422 in the
        schema, not 500 on commit. The re-read proves nothing was written."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json=_block_body(id=block_id, label="status anchor"),
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
        # `status` is not part of the interval contract, so the relabelling
        # handler must leave its body as FastAPI's own (no `code`): the
        # message-name heuristic is not a blanket for every /blocks error.
        assert "code" not in resp.json()
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
            json=_block_body(id=block_id, label="tz anchor"),
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"started_at": "2026-08-05T13:00:00"},
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_patch_rejects_intervals(self, client, verified_user):
        """PATCH is envelope-only (label/tag/status/start/end): interval
        surgery stays out of the editor contract (SCR-21)."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json=_block_body(id=block_id, label="no interval edits"),
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={
                "intervals": [
                    {
                        "started_at": "2026-08-05T12:00:00+00:00",
                        "ended_at": "2026-08-05T12:25:00+00:00",
                    }
                ]
            },
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_patch_end_moves_the_last_interval(self, client, verified_user):
        """Envelope end = the last segment's end, never the pause edge."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json=_block_body(
                id=block_id,
                label="move end",
                intervals=[
                    {
                        "started_at": "2026-08-05T12:00:00+00:00",
                        "ended_at": "2026-08-05T12:12:00+00:00",
                    },
                    {
                        "started_at": "2026-08-05T12:22:00+00:00",
                        "ended_at": "2026-08-05T12:30:00+00:00",
                    },
                ],
            ),
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"ended_at": "2026-08-05T12:40:00+00:00"},
            headers=Headers(headers),
        )
        assert resp.status_code == 200
        intervals = resp.json()["intervals"]
        # First segment untouched; only the outer end moved.
        assert intervals[0]["ended_at"] == "2026-08-05T12:12:00Z"
        assert intervals[1]["ended_at"] == "2026-08-05T12:40:00Z"

    @pytest.mark.asyncio
    async def test_patch_start_moves_first_interval_and_block(self, client, verified_user):
        """The start edit keeps block.started_at on the first interval, so
        history day-bucketing follows (invariant 7)."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json=_block_body(
                id=block_id,
                label="move start",
                intervals=[
                    {
                        "started_at": "2026-08-05T12:00:00+00:00",
                        "ended_at": "2026-08-05T12:12:00+00:00",
                    },
                    {
                        "started_at": "2026-08-05T12:22:00+00:00",
                        "ended_at": "2026-08-05T12:30:00+00:00",
                    },
                ],
            ),
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"started_at": "2026-08-05T11:55:00+00:00"},
            headers=Headers(headers),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["started_at"] == "2026-08-05T11:55:00Z"
        assert body["intervals"][0]["started_at"] == "2026-08-05T11:55:00Z"
        assert body["intervals"][1]["started_at"] == "2026-08-05T12:22:00Z"

    @pytest.mark.asyncio
    async def test_patch_inverted_edit_is_422(self, client, verified_user):
        """Moving a start past its own segment's end must fail loudly."""
        headers, _ = await verified_user()

        block_id = str(uuid.uuid4())
        await client.post(
            "/blocks",
            json=_block_body(
                id=block_id,
                label="invert",
                intervals=[
                    {
                        "started_at": "2026-08-05T12:00:00+00:00",
                        "ended_at": "2026-08-05T12:12:00+00:00",
                    },
                    {
                        "started_at": "2026-08-05T12:22:00+00:00",
                        "ended_at": "2026-08-05T12:30:00+00:00",
                    },
                ],
            ),
            headers=Headers(headers),
        )
        resp = await client.patch(
            f"/blocks/{block_id}",
            json={"started_at": "2026-08-05T12:20:00+00:00"},
            headers=Headers(headers),
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "INVALID_INTERVAL"


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
        # Interval-contract relabelling is scoped to the body fields on
        # /blocks — a bad query parameter keeps FastAPI's own body.
        assert "code" not in resp.json()

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
