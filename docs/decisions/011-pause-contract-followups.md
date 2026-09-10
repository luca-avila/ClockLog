# ADR-011: Pause-contract follow-ups — queue discard, PATCH day moves, envelope rejection

- Status: Accepted
- Date: 2026-09-09

## Context

The N-interval pause-duration contract (plan `loop/runs/20260909-212726/plan.md`,
shipped as `793e5b1` / `60634d2` / `f7300ce`) left three owner questions open:
(a) what happens to pre-interval payloads still sitting in the offline queue,
(b) whether a PATCH time edit may move a block across a day boundary, and
(c) whether a POST carrying a top-level `started_at`/`ended_at` envelope
alongside `intervals` should be reconciled or rejected. The owner decided all
three on 2026-09-09; this ADR records the answers so they are not reopened
by accident.

## Decision

- **(a) Legacy queued payloads are discarded, without migration or notice.**
  `isBlockPayload()` is strict and `readQueue()` filters the old
  single-interval shape at read time (silent at read; the 4xx-on-flush path
  stays counted via `onBlocksDropped`). Single-user pre-launch: losing one
  stale queued block beats carrying two wire shapes forever.
- **(b) PATCH time edits may move the block across midnight.** The day bucket
  always follows `intervals[0].started_at` (invariant 7: a block belongs to
  the day it started). No 422 for crossing the boundary.
- **(c) A top-level envelope on POST is rejected.** `BlockCreate` sets
  `extra="forbid"`, so any `started_at`/`ended_at` beside `intervals` is a
  `422`; the server derives `block.started_at`/`block.ended_at` from
  `intervals[0]`/`intervals[-1]`. No equality-validation second path.

## Alternatives considered

- **Migrate the old queue shape or toast on discard.** Rejected: one-time
  pre-launch case, permanent legacy code (and a toast for a shape no new
  client produces).
- **422 on PATCH edits that cross midnight.** Rejected: breaks normal
  History editing (SCR-21); invariant 7 already defines the bucket as
  the day the block starts.
- **Accept the envelope and validate it equals the derived one.** Rejected:
  a second error path for a condition the new sender never produces.

## Consequences

- Carriers: `frontend/lib/api/queue.ts` (`isBlockPayload`, `readQueue`,
  `flushQueue → drop`), `backend/app/timer/service.py` (`update_block`,
  `_validate_stored_intervals` with `end > start`), `backend/app/timer/schemas.py`
  (`BlockCreate` with `extra="forbid"`), `docs/api.md` (§ interval contract,
  PATCH envelope-only, `INVALID_INTERVAL` table).
- Tests pinning this: `test_rejects_legacy_envelope_payload`,
  `test_idempotent_retry_with_different_intervals_returns_original`,
  `test_zero_length_time_edit_is_rejected`, the midnight-crossing fixture
  using a non-degenerate range, and the queue visible-drop test
  (`dropped: 1`, `onBlocksDropped`, `console.warn`).
- Zero-length segments stay rejected on both POST and PATCH (`end > start`);
  a resume+stop in the same millisecond is a visible drop, not a silent one
  (invariant 9).

## What this does NOT license

Phase-3 timer↔plan integration (`Use focus timer`, `Start a timer` on an
entry). Invariants 11–13 still hold in full; renegotiating 12 and 13 in
writing comes first, not feature by feature.
