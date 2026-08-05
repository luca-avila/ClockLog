# Build Plan

How Tempo gets built, in order, as a series of **vertical slices** driven **test-first**.

This document is the *operating plan*. It does not restate product decisions — `CLAUDE.md`
holds the invariants, `docs/wireframes.md` holds the screens (canonical), `docs/ux-research.md`
holds the reasoning. This file only answers: *what do I build next, what do I read to build it,
and how do I know it is done.*

> **§ 4 is the decision register.** The open questions in `CLAUDE.md` § Open decisions live
> there as gates, each pinned to the slice it blocks. When one is settled, record the answer in
> § 4 and move on — there is no separate decisions document.

---

## 1. How an agent uses this file

Each slice below is written to be executed **with only the files it names in context**. That is
the point of the whole structure: a model working on `S-07` should not need to read the timer
frontend, and a model working on `S-11` should not need to read the history aggregation SQL.

The loop for any slice:

1. Read `CLAUDE.md` (always) + the slice's **Read** list. Nothing else.
2. Read the wireframe section for the cited `SCR-NN` if the slice has one.
3. Check the slice's **Gate**. If a gate is unresolved, stop and ask — do not pick a default.
4. Write the tests in **Tests first**. Run them. They must fail for the right reason.
5. Implement inside the slice's **Touch** list. If you need to modify a file outside it, that is
   a signal the slice boundary is wrong — say so before widening it.
6. Run lint + the full backend/frontend test suite (`CLAUDE.md` § Commands).
7. Commit with the slice ID and screen ID in the body, Conventional Commits in the subject.

**Do not batch slices.** One slice, one green suite, one commit. A slice that turns out to be
too big should be split and this file updated, not silently expanded.

---

## 2. Architecture: deep modules, narrow interfaces

The structure in `CLAUDE.md` § Structure is organized by module so the independence invariant
(11–13) is visible. This section adds the rule that makes that structure *agent-friendly*:

> **Every module exposes one narrow interface and hides everything behind it. The interface is
> the only thing another part of the system — or another agent — needs to read.**

Concretely, per backend module:

| File | Depth | Who may import it |
| --- | --- | --- |
| `service.py` | **deep** — all business logic, all invariant enforcement | `api.py` of the same module, tests |
| `models.py` | deep — SQLAlchemy tables | `service.py` of the same module, Alembic |
| `schemas.py` | **the interface** — Pydantic in/out types | `api.py`, tests, and (as generated TS types) the frontend |
| `api.py` | **shallow** — routing, auth dependency, status codes, nothing else | app wiring only |

The practical consequences:

- **`service.py` functions take and return schema objects or primitives, never ORM rows across
  the boundary.** A caller must never need to know a table exists.
- **A module's public surface is `schemas.py` + the function signatures in `service.py`.** If a
  slice says "read `timer/schemas.py`", that must be *sufficient* to call the timer. If it is
  not, the interface is leaking and that is a bug to fix before continuing.
- **No cross-module imports except `shared/`** (invariant 11). Enforced by a test, not by
  discipline — see `S-02`.
- **Routers stay thin** (invariant 16). A router with an `if` in it that is not an auth check or
  a 404 is a smell.

Frontend mirrors this:

| Location | Depth | Rule |
| --- | --- | --- |
| `lib/timer/` | **deep** — pure elapsed/cycle logic, zero React | pure functions, exhaustively tested, no DOM, no `Date.now()` passed implicitly — the clock is an argument |
| `lib/api/` | interface — one typed client function per endpoint | components never call `fetch` directly |
| `components/timer/`, `components/plan/` | shallow — rendering and event wiring | no time arithmetic, no business rules |
| `components/shared/` | the only components both modules may import | |

**Why the clock is an argument:** invariant 1 says elapsed time is always
`now - startedAt`. If `now` is injected, that rule is testable without faking timers, and the
most bug-prone logic in the product becomes ordinary pure-function testing. This is the single
highest-value structural decision in the frontend.

---

## 3. TDD contract

- **Test first, always, for logic.** Elapsed time, day boundaries, cycle progression, block
  status transitions, aggregation, auth. These are the four priorities in `CLAUDE.md` § Testing
  and they are non-negotiable.
- **Do not test-first the pixels.** Wireframe fidelity is checked by eye. Component tests exist
  only where a component encodes a *rule* (e.g. "Pause and Stop are low-contrast", "the cycle
  indicator never renders in Plan").
- **Every edge case in `docs/wireframes.md` § Edge cases and `ux-research.md` § Edge cases is a
  test case.** They are listed against their owning slice below. An edge case without a test is
  an unbuilt feature.
- **Each slice ends with the suite green and lint clean.** No slice lands red.

---

## 4. Decision gates

These block specific slices. `CLAUDE.md` § Open decisions says do not resolve them unilaterally.

| Gate | Blocks | Why it blocks |
| --- | --- | --- |
| **G-1 — pause vs. abort** | `S-05` (first `block` migration) | If pause is in, `block` needs a child `block_interval` table (`started_at`, `ended_at`); an accumulated `paused_ms` violates invariant 6. This changes the schema, so it must be settled *before* the first migration, not after. |
| **G-2 — do breaks carry labels?** | `S-08` (label sheet) | Determines whether the label sheet is shown after a break, and whether `label` is nullable-by-design or break-blocks are labelless by type. |
| **G-3 — settings storage** | `S-12` | Are durations/behavior server-side (sync across devices) or `localStorage` only? MVP is single-user; local is the boring answer, but it is a decision, not a default. |
| **G-4 — planner tags** | `S-14` | Does the plan share the timer's tags, or get its own categories? Determines whether `tag` stays in `shared/` or is duplicated. Settle before the first `plan` migration. |
| **G-5 — SCR-33 empty-state copy** | `S-17` | "Timers are optional." is timer vocabulary on a Plan screen and contradicts invariant 13. Either change the copy or narrow the invariant in writing. |

---

## 5. Phase 0 — foundation

No product behavior. The goal is that every later slice starts from a working test command.

### S-01 — Repo skeleton and running test commands
**Read:** `CLAUDE.md` (Structure, Commands, Stack, License).
**Touch:** `docker-compose.yml`, `backend/` skeleton, `frontend/` skeleton, `pyproject.toml`,
`ruff` config, `pytest` config, frontend test runner config, AGPL headers.
**Tests first:** one backend test asserting `GET /health` returns 200; one frontend test
asserting the test runner runs. Both must fail before the skeleton exists.
**Done when:** `docker compose up -d`, `docker compose exec backend pytest`, and
`cd frontend && npm run test` all succeed, and lint is clean.

### S-02 — Module independence, enforced
**Read:** `CLAUDE.md` (Invariants 11–13).
**Touch:** `backend/tests/test_independence.py`, `frontend/` equivalent lint rule.
**Tests first:**
- No file under `backend/app/timer/` imports `app.plan`, and vice versa.
- No file under `backend/app/plan/` contains the strings `block`, `focus`, `cycle`, `pomodoro`
  (case-insensitive) — invariant 13, checked mechanically.
- Frontend: an ESLint `no-restricted-imports` rule for the same two directions.
**Done when:** the tests pass trivially (both modules empty) and would fail if a cross-import
were added. Verify by adding one temporarily and watching it go red.

> This slice is early on purpose. The invariant is cheap to hold from commit one and expensive
> to restore later.

### S-03 — Core: config, DB session, Alembic baseline
**Read:** `CLAUDE.md` (Stack, Backend conventions), `S-01` output.
**Touch:** `backend/app/core/config.py`, `core/db.py`, `alembic/`.
**Tests first:** config loads from env and fails loudly on a missing required var; an async
session opens, round-trips a trivial query, and closes.
**Done when:** `alembic upgrade head` runs against an empty DB. No tables yet.

### S-04 — Auth (`shared/user`) — vertical slice
**Read:** `CLAUDE.md` (Auth line, Backend conventions), `ux-research.md` § Edge cases →
"Session expired".
**Touch:** `core/security.py`, `shared/user/{models,schemas,service,api}.py`, migration.
**Tests first:**
- Password hashes verify; a wrong password fails.
- JWT round-trips; an expired token is rejected; a tampered token is rejected.
- A protected route returns 401 without a token, 200 with one.
- Errors carry a stable `code` field, not a bare string.
**Done when:** login works end to end against the real DB. Hand-rolled — no auth framework.

---

## 6. Phase 1 — MVP (timer + history)

Slices are ordered so that every one of them is independently demoable. Backend-first within a
slice where the frontend needs a real endpoint; otherwise frontend and backend of the same slice
land together.

### S-05 — `shared/tag` — vertical slice
**Gate:** none. **Read:** `CLAUDE.md` (invariant 10), `wireframes.md` SCR-40 (Data → Tags).
**Touch:** `shared/tag/*`, migration, `lib/api/tags.ts`, `components/shared/TagPicker.tsx`.
**Tests first:**
- Create / rename / recolor / delete a tag.
- **Deleting a tag leaves blocks and activities intact, untagged** (invariant 10). Since no
  block table exists yet, write the test now against the FK/ondelete behavior and extend it in
  `S-06`.
- Delete returns the count of affected rows so the UI can warn ("Borrar un tag con 14 blocks").
**Done when:** tags are CRUD-able and the delete semantics are proven by test.

### S-06 — `timer` domain core: the block model — vertical slice
**Gate:** **G-1 must be resolved first.** This is the first migration touching `block`.
**Read:** `CLAUDE.md` (invariants 5–9, Backend conventions), `wireframes.md` SCR-11/SCR-12.
**Touch:** `timer/{models,schemas,service}.py`, migration, `tests/timer/`.
**Tests first:**
- A block stores `started_at` / `ended_at` as timezone-aware UTC. A naive datetime is rejected.
- **Duration is derived, never stored** (invariant 6) — assert no duration column exists.
- `status = 'aborted'` blocks keep their real elapsed time (invariant 9).
- Client-supplied UUID: posting the same block twice creates one row (invariant 8).
- If G-1 lands as "pause is in": intervals sum correctly; paused time is excluded; a block with
  three intervals reports the right total.
- Index `blocks(user_id, started_at)` exists.
**Done when:** the service layer can create and read blocks. No HTTP yet.

### S-07 — `POST /blocks` — vertical slice
**Read:** `timer/schemas.py`, `timer/service.py` signatures, `CLAUDE.md` (invariants 2, 3).
**Touch:** `timer/api.py`, `lib/api/blocks.ts`.
**Tests first:** one POST per block; the endpoint rejects a payload lacking `started_at`; a
second POST of the same client UUID is idempotent; another user's block is not writable.
**Done when:** a block can be recorded over HTTP. Router stays thin.

### S-08 — Frontend timer engine (`lib/timer/`) — pure logic, no UI
**Read:** `CLAUDE.md` (invariants 1, 4), `wireframes.md` SCR-10/11/12/13 and § Storyboard.
**Touch:** `frontend/lib/timer/*`, its tests. **No components in this slice.**
**Tests first** — this is the highest-value test file in the repo:
- `elapsed(startedAt, now)` is a pure function of two instants. **Never an accumulator.**
- Simulating a 10-minute gap in `now` (backgrounded tab) yields exactly 10 minutes. Drift is
  structurally impossible.
- Cycle progression: 4 focus blocks → long break; the `● ● ○ ○` state is derived, not stored.
- Break duration selection (short vs. long) from cycle position.
- Reopened after the block should have ended → the engine reports "ended at T", and the caller
  chooses save / adjust / discard. The engine does not decide.
- `localStorage` round-trip: an in-progress block survives a simulated refresh (invariant 4).
- A DST boundary inside a block does not change its real duration.
**Done when:** every timer rule is proven without rendering anything.

### S-09 — Timer UI: idle → running → stop (SCR-10, SCR-11, SCR-12)
**Gate:** SCR-12 exists only if G-1 resolved as "pause is in".
**Read:** `wireframes.md` SCR-10/11/12 + § Desktop, `lib/timer/` interface, `lib/api/blocks.ts`.
**Touch:** `components/timer/*`, `app/(timer)/*`.
**Tests first:** only rule-encoding tests — Pause/Stop are low-contrast and revealed on tap
(`CLAUDE.md` § Frontend conventions); elapsed time is read from `lib/timer` and computed in
exactly one place.
**Done when:** a full block can be run and lands in the DB. Mobile layout first, `md:`/`lg:`
after, per the § Desktop notes.

### S-10 — Label sheet (SCR-14) + recent-label autocomplete
**Gate:** **G-2** (do breaks carry labels?).
**Read:** `wireframes.md` SCR-14 + § Storyboard branches, `timer/schemas.py`.
**Touch:** `components/timer/LabelSheet.tsx`, `timer/service.py` (recent labels query),
`timer/api.py` (`GET /blocks/recent-labels`).
**Tests first:**
- Empty label is allowed → saved as "Unlabeled", rendered muted. Never blocks the flow.
- Duplicate labels are allowed and encouraged.
- `Skip` is always available and still saves the block.
- Recent labels are deduped, most-recent-first, scoped to the user.
**Done when:** the sheet saves in one tap from a recent chip.

### S-11 — Breaks (SCR-13)
**Read:** `wireframes.md` SCR-13 + its callout, `CLAUDE.md` (the auto-start callout under
Invariants → Timer).
**Touch:** `components/timer/Break.tsx`, `lib/timer/`.
**Tests first:**
- With `auto-start breaks = OFF` (the default), the break clock starts on START, not on sheet
  dismissal, and not at 00:00.
- **If the setting is ON, the break clock starts when the label sheet is dismissed** — assert
  this explicitly. This is the invariant most likely to be silently broken later.
- `Skip break` records nothing and goes straight to the next focus.
**Done when:** both branches of the storyboard step 4 are covered.

### S-12 — Settings (SCR-40)
**Gate:** **G-3** (server vs. local storage).
**Read:** `wireframes.md` SCR-40.
**Touch:** per G-3.
**Tests first:** durations and cycle length are configurable and feed `lib/timer`; auto-start
defaults are OFF and persist as OFF across reloads.
**Done when:** changing focus duration to 50 changes the next block.

### S-13 — History: range query and aggregation — backend
**Read:** `CLAUDE.md` (invariants 5, 7, Backend conventions), `wireframes.md` SCR-20.
**Touch:** `timer/service.py`, `timer/api.py` (`GET /blocks?from=&to=`).
**Tests first:**
- **The endpoint takes a `from`/`to` UTC instant range. It never takes a date** (invariant 5).
  Assert a date-shaped param is rejected.
- The server does no day bucketing and stores no timezone.
- Aggregation by tag over a range; untagged blocks are their own bucket.
- A block crossing midnight belongs to the day it started (invariant 7) — proven at the
  *client* boundary computation, since the server has no days.
- Aborted blocks are included in time totals.
**Done when:** a day of blocks aggregates correctly for a client in a non-UTC timezone. Test
with at least one offset that is not a whole hour.

### S-14 — History UI: day view (SCR-20)
**Read:** `wireframes.md` SCR-20 + § Desktop, `lib/api/blocks.ts`.
**Touch:** `components/timer/History*`, `lib/date/` (local day boundaries → UTC range).
**Tests first:** local-day-boundary conversion is a pure, exhaustively tested function
(DST-forward day, DST-back day, non-hour offset). Empty state renders "No blocks yet." — literal,
never fabricated encouragement.
**Done when:** SCR-20 renders real data. `+ Add block manually` is **not** built (phase 3).

### S-15 — Block edit and delete (SCR-21)
**Read:** `wireframes.md` SCR-21, `CLAUDE.md` (invariant 8 — append-only *from the client's
perspective*; edits are a separate, server-side path).
**Touch:** `timer/service.py`, `timer/api.py` (`PATCH`/`DELETE /blocks/{id}`),
`components/timer/BlockEdit.tsx`.
**Tests first:** editing start/end recomputes duration; an end before start is rejected with a
structured `code`; delete is permanent; last-write-wins on concurrent edits.
**Done when:** desktop shows the two-pane list + inspector so editing never navigates away.

### S-16 — Alerts: sound and notifications
**Read:** `wireframes.md` § Edge cases, `ux-research.md` § Edge cases (notifications denied,
device muted).
**Touch:** `lib/alerts/`, timer components.
**Tests first:** with notifications denied, the fallback is audio + a visible title change and
never a blocking prompt; permission is requested only *after* the first completed block; a
visual state change always accompanies sound.
**Done when:** all three channels degrade independently.

### S-17 — Offline queue and sync
**Read:** `ux-research.md` § Edge cases (sync conflict, session expired, two devices),
`CLAUDE.md` (invariant 8).
**Touch:** `lib/api/queue.ts`.
**Tests first:** blocks queued offline sync without duplicates (client UUID); a expired session
does **not** interrupt a running block — re-auth is prompted at sync time only; two devices →
last write wins.
**Done when:** killing the network mid-block still records the block on reconnect.

### S-18 — Deploy
**Read:** `CLAUDE.md` (Project → self-hosted), `ux-research.md` § Secondary systems.
**Touch:** `docker-compose.prod.yml`, nginx config, certbot, nightly `pg_dump` to object
storage, basic error monitoring, rate limiting on auth.
**Done when:** the MVP definition of done can begin — two weeks of real use with no lost block.

---

## 7. Phase 2 — the planner, isolated

**Do not start unprompted** (`CLAUDE.md` § Scope boundaries). Every slice here assumes zero
timer coupling. `⏱ Start a timer`, the `⏱` list markers, and `☑ Use focus timer for this` are
**phase 3** and are not drawn, not stubbed, not flagged.

### S-19 — `plan` module core — vertical slice
**Gate:** **G-4** (shared tags vs. own categories) — settle before this migration.
**Read:** `CLAUDE.md` (invariants 11–14), `wireframes.md` § Plan preamble (dated calendar,
`repeat_weekly`, no RRULE).
**Touch:** `plan/{models,schemas,service}.py`, migration.
**Tests first:**
- An entry belongs to a **date**, not a weekday (invariant 14).
- `repeat_weekly` is a boolean flag. Assert there is no recurrence engine and no RRULE parsing.
- All-day entries on a single date are supported; **a multi-day span is rejected**.
- No column, string, or symbol under `plan/` uses timer vocabulary — `S-02`'s test covers this
  and must stay green.
- No FK between plan and block tables in either direction (invariant 12).
- Overlapping entries are allowed — overlap is a fact about weeks, not a validation error.
**Done when:** the independence test suite passes with both modules populated.

### S-20 — Plan week list (SCR-30) and day timeline (SCR-31)
**Read:** `wireframes.md` SCR-30/31 + § Desktop — week, and their ⚠ callout.
**Touch:** `components/plan/*`, `app/(plan)/*`.
**Tests first:** the cycle indicator never renders under `plan/`; the `⏱` markers are absent.
**Done when:** both screens render, denser than the timer by design.

### S-21 — Entry editor (SCR-32)
**Read:** `wireframes.md` SCR-32 + its ⚠ callout.
**Touch:** `components/plan/EntrySheet.tsx`.
**Tests first:** the sheet ends at name / day / from-to / tag / `☐ Repeat weekly` / SAVE. Assert
by test that no focus-timer checkbox is rendered.
**Done when:** an entry can be created, edited, and deleted.

### S-22 — Empty week (SCR-33)
**Gate:** **G-5** (the "Timers are optional." copy).
**Read:** `wireframes.md` SCR-33 + its pending note.
**Done when:** a planner-only user sees no Pomodoro vocabulary anywhere, per the phase-2
definition of done.

### S-23 — Deletability proof
**Touch:** `backend/tests/`, CI script.
**Tests first:** with `backend/app/timer/` and `frontend/components/timer/` removed, the app
still boots and the plan suite passes — and the same with `plan/` removed. Either module must be
deletable without breaking the other (invariant 11).
**Done when:** this runs as a check, not as a manual experiment.

---

## 8. Slice map

| ID | Slice | Screens | Gate |
| --- | --- | --- | --- |
| S-01 | Repo skeleton | — | |
| S-02 | Independence enforced | — | |
| S-03 | Core: config, DB, Alembic | — | |
| S-04 | Auth | — | |
| S-05 | Tags | SCR-40 (Data) | |
| S-06 | Block model | — | **G-1** |
| S-07 | `POST /blocks` | — | |
| S-08 | Timer engine (pure) | — | |
| S-09 | Timer UI | SCR-10/11/12 | G-1 |
| S-10 | Label sheet | SCR-14 | **G-2** |
| S-11 | Breaks | SCR-13 | |
| S-12 | Settings | SCR-40 | **G-3** |
| S-13 | History backend | — | |
| S-14 | History UI | SCR-20 | |
| S-15 | Block edit | SCR-21 | |
| S-16 | Alerts | — | |
| S-17 | Offline sync | — | |
| S-18 | Deploy | — | |
| S-19 | Plan core | — | **G-4** |
| S-20 | Plan week + day | SCR-30/31 | |
| S-21 | Entry editor | SCR-32 | |
| S-22 | Empty week | SCR-33 | **G-5** |
| S-23 | Deletability proof | — | |

---

## 9. Standing rules

- A slice that needs a file outside its **Touch** list is mis-scoped. Say so; do not widen it
  silently.
- A request that contradicts `CLAUDE.md` or `wireframes.md` gets flagged before implementation,
  not worked around.
- Gates are not defaults waiting to be picked. An unresolved gate blocks its slice.
- Commit subject: `feat(timer): ...`. Commit body cites the slice ID and screen ID.
- Every new source file carries the AGPL-3.0 header.
