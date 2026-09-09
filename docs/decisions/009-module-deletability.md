# ADR-009: Module deletability is enforced by tests, not convention

- Status: Accepted
- Date: 2026-08-15

## Context

Invariant 11 (`timer/` and `plan/` never import each other; either module
deletable without breaking the other) is easy to assert and easy to erode
one import at a time. Convention alone would not hold it.

## Decision

Deletability is enforced mechanically at three levels:

- `backend/tests/test_independence.py` — no file under `timer/` imports
  `plan/` or vice versa; no timer vocabulary under `plan/`.
- `backend/tests/test_deletability.py` — the app still boots and its
  remaining suite still passes with either feature module physically
  removed (subprocess, pruned tree copy).
- `frontend/eslint.config.mjs` — `no-restricted-imports` blocks timer↔plan
  imports, and blocks `components/shared/**` from importing either feature
  module.

Supporting mechanics: `app/main.py` mounts the two feature routers
tolerantly (`ModuleNotFoundError` tolerated, shared routers mandatory), and
`shared/` counts tag usage via table metadata, never feature imports.

## Alternatives considered

- **Code review only.** Rejected: the invariant breaks silently and the
  failure is painful to diagnose after the fact.

## Consequences

- A PR touching `timer/` or `plan/` must keep both test files green; if one
  fails, the invariant broke — fix the code, not the test.
- Known gap, deliberate: frontend routes still hard-import timer
  components — full frontend deletability would need its own change if ever
  wanted.
