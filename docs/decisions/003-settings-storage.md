# ADR-003: Settings stored server-side, per user

- Status: Accepted
- Date: 2026-08-05
- Supersedes: G-3 in docs/DECISIONS.md

## Context

Timer settings (cycle length, auto-start default, sound) could live in
`localStorage` (zero backend work, per browser) or on the server (per
account, travels across devices).

## Decision

Server-side. One `user_setting` row per user; settings travel with the
account. Endpoints: `GET` / `PUT /settings`.

## Alternatives considered

- **`localStorage`.** Rejected: settings would fork per browser and leak
  across accounts on a shared browser — the session fence (see ADR-006)
  would have to clear them on every sign-in, and a phone and a laptop would
  disagree.

## Consequences

- Settings are scoped by authenticated `user_id` like every other row.
- Auto-start default stays OFF (correctness decision recorded in
  `AGENTS.md` § Timer); the storage choice does not change that default.
