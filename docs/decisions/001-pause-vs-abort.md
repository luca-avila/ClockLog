# ADR-001: Pause is a first-class state; abort preserves elapsed time

- Status: Accepted
- Date: 2026-08-05
- Supersedes: G-1 in docs/DECISIONS.md

## Context

A running timer block can be interrupted two ways: the user steps away and
resumes (pause), or the user gives up on the block (abort). Abort had to
exist — stopping a block must never silently discard it — but pause was the
open gate: is resume worth a data model, or is abort enough?

## Decision

Pause is in. Aborted blocks are saved with `status = 'aborted'` and the
real elapsed time (invariant 9: time spent is time spent).

## Alternatives considered

- **Abort only.** Simpler schema (no intervals), but every interruption
  becomes a dead block and the history over-counts abandoned time as focus
  time or loses it. Rejected: pausing is the common case, abort the rare one.
- **Pause as client-only state.** Rejected: duration must be derivable from
  stored timestamps (invariant 6), so pauses have to survive reload and sync.

## Consequences

- `block` gains a child `block_interval` table (`started_at`, `ended_at`);
  duration is derived from the interval sum, never stored.
- Paused time is excluded from elapsed time.
- Block creation and the aborted-block path are priority test targets
  (see `AGENTS.md` § Testing instructions).
