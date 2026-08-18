# Tempo — code review, 2026-08-16

Full-repo review for correctness, simplicity, and architecture. Written for an implementer
agent: every item names the file, the line, the failure, and the fix.

**Baseline at time of review:** `docker compose exec backend pytest` → 92 passed.
`cd frontend && npm run test` → 89 passed. `npx tsc --noEmit` → clean. Nothing here is a
regression from a failing build; the defects live in paths no test covers.

**Ground rules for the implementer**
- `docs/wireframes.md` is canonical; `CLAUDE.md` invariants are non-negotiable.
- Do not add dependencies. Do not build anything in "Not built, do not build unprompted".
- Nothing in this document requires touching invariants 11–13 (module independence). If an
  item seems to, stop and ask — it means I got it wrong.
- Work top-down: P0 first, each as its own conventional commit.

> **Status update, 2026-08-18:** items 1–26 are fixed and committed (backend 106 passed,
> frontend 104 passed, ruff/tsc/eslint clean). They have been removed from this file;
> history lives in git. Remaining: items 27–30 and the TimerScreen component-test gap.

---

## P3 — infrastructure, security, docs (remaining)

### 27. Dev compose can't run the app
`docker-compose.yml` has no `frontend` service and no `alembic upgrade head`, while CLAUDE.md
says `docker compose up -d` is the dev command. In practice you get a backend on an unmigrated
schema and no UI.

**Fix.** Either add a `frontend` dev service and a migrate step, or correct CLAUDE.md's Commands
section to state that the frontend runs via `npm run dev` and migrations are manual. The
prod overlay already does this correctly — copy its `command:`.

### 28. Backend production image ships dev tooling and runs as root
`backend/Dockerfile` — `pip install -e ".[dev]"` puts pytest and ruff in the production image,
and there is no `USER`. `scripts/ci.sh` runs pytest *inside* the container, which is why the dev
deps are there, so the fix is a two-stage build (or a `--target dev`) rather than just dropping
the extra. Add a non-root user in the final stage.

### 29. No CI, no root `.gitignore`
`scripts/ci.sh` exists and is the right script, but nothing runs it — no `.github/workflows`.
For a solo project the value is catching the "all green locally, broken on the VPS" case before
deploy. A single workflow running `scripts/ci.sh` against a service container is enough.

There is also no `.gitignore` at the repo root (only per-directory ones), and
`docs/UX research wireframes.zip` is sitting untracked in the working tree. Decide: commit it
or ignore it.

### 30. Doc drift to fix while you're in there
- CLAUDE.md's Commands section (see item 27).
- `frontend/README.md` is untracked and is the stock `create-next-app` boilerplate. Delete it or
  write a real one.
- `docs/wireframes.md` marks SCR-12 "*pendiente: decisión pause vs. abort*" while `DECISIONS.md`
  declares all gates closed. Reconcile.
- `frontend/__tests__/timer/timer-ui.test.ts` claims in comments to verify that `TimerScreen`
  imports `elapsed` and that no accumulator exists. It verifies neither — it calls `elapsed()`
  twice and checks arithmetic. Either delete it or replace it with a real component test.

---

## Test coverage gaps (remaining)

`TimerScreen.tsx` is the largest file in the repo, holds the most invariants, and still has
**zero** component tests. Every P0 bug that lived in it is now fixed, but nothing prevents a
regression. Per CLAUDE.md's testing priority ("elapsed-time and day-boundary calculations",
"the aborted-block path"), these are the tests that should exist:

1. A completed focus block produces exactly one POST with the right `started_at`/`ended_at`.
2. Pause → resume → stop yields two intervals and the correct aborted duration.
3. A break block is recorded with its own kind and is excluded from the focus total.
4. Refresh mid-block recovers elapsed time, including across a pause (invariant 4).
5. Corrupt `localStorage` yields the idle screen, not `NaN` (covered at the engine level by
   deserializeState tests; the component path is untested).
6. A changed focus duration is applied to the next block and not the running one (the
   `targetMs` capture is engine-level and untested end-to-end).
7. Day-boundary: a block started 23:50 belongs to the starting day (invariant 7) — the
   backend half is covered by the update-across-midnight test; the client bucketing is not.

Backend gaps (tag clearing, malformed `from`/`to`, `Block.started_at` moving with an interval
edit, break-kind exclusion) are now covered.

---

## What is genuinely good — do not "fix" these

Worth stating so the implementer doesn't refactor them out of tidiness:

- **`lib/alerts/`** — a pure `planAlert` decision function with an injected-deps runner, and 16
  tests. This is the right shape for browser-permission logic and needs no changes.
- **`lib/date/week.ts`** — calendar math on `Date.UTC` with the reasoning in a header comment.
  Correct and correctly explained.
- **The module-independence machinery** — the `importlib` loop in `main.py`, `delete_tag`
  counting via `Base.metadata` instead of importing feature models, and `test_deletability.py`
  proving it. Invariant 11 is enforced by a test rather than by discipline. Rare and right.
- **`plan/models.py`** — the naive `date`/`time` choice, with the reasoning inline. Do not
  "fix" it toward instants.
- **The offline queue's design** — client UUID idempotency, last-write-wins on re-enqueue,
  corrupt-queue reset. The edges have been fixed; the shape is right.
