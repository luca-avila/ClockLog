# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Tempo** — two loosely coupled tools that share a vocabulary:

1. **Timer + History** — a Pomodoro timer where every block gets a label, producing a queryable history of how time was actually spent.
2. **Plan** — a dated weekly calendar of ordinary entries (gym, work, classes, meals). Independent of the timer, usable by someone who has never run a Pomodoro.

Both halves have shipped: the MVP timer+history (phase 1) and the isolated planner (phase 2). Phase 3 — timer integration with the plan — is deliberately unbuilt; see Scope boundaries.

Solo-maintained, self-hosted. Single VPS, Docker, nginx reverse proxy, certbot for TLS.

## Reference documents

Read these before proposing UI or data-model changes. They are the source of truth; this file is only the operating manual.

| File | Contents |
| --- | --- |
| `docs/wireframes.md` | Screen-by-screen layouts, one section per screen ID. **Canonical where the two docs disagree.** |
| `docs/ux-research.md` | Problem definition, UX rationale, user flows, edge cases, MVP scope |
| `DECISIONS.md` | Closed decision log — every resolved gate and its consequences |

**Precedence: `wireframes.md` wins.** It is the newer document and reflects the current direction. `ux-research.md` remains the reasoning of record for *why*, but where it describes a different product — most notably the Plan as an undated weekly template — it is stale and `wireframes.md` governs.

> The build plan (`docs/build-plan.md`) was retired once all 23 slices shipped. Its durable content lives here (invariants, conventions) and in `DECISIONS.md` (gate resolutions). History remains in git if ever needed.

Screens are referenced by stable IDs (`SCR-01`, `SCR-02`, …) defined in `docs/wireframes.md`. Issues, commits, and components should cite the screen ID they implement. If an issue names a screen ID, read that section before writing any UI.

If a request contradicts these documents, say so before implementing. Do not silently expand scope.

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, PostgreSQL 16
- **Frontend:** Next.js (App Router), TypeScript, Tailwind
- **Infra:** Docker Compose, nginx, certbot
- **Auth:** single user, email + password (hashed), JWT. Hand-rolled — do not add an auth framework.

Do not introduce new dependencies without asking. This is a small project maintained by one person; every dependency is a maintenance cost.

## Structure

The backend is organized by module, not by layer, so that the independence invariant is visible in the filesystem.

```
backend/
  app/
    core/           # config, security, db session — no business logic
    shared/         # user, tag — the ONLY things both modules may import
    timer/          # blocks, history
      api.py
      models.py
      schemas.py
      service.py
    plan/           # entries — the dated weekly calendar (phase 2, shipped)
      api.py
      models.py
      schemas.py
      service.py
  alembic/
  tests/
frontend/
  app/              # App Router
  components/
    shared/
    timer/
    plan/
  lib/              # api client, timer logic, date helpers
docs/
docker-compose.yml
```

`timer/` and `plan/` must never import from each other. If something seems to belong to both, it belongs in `shared/`.

## Commands

```bash
# dev
docker compose up -d
docker compose logs -f backend

# migrations — always via Alembic, never manual SQL against the DB
docker compose exec backend alembic revision --autogenerate -m "description"
docker compose exec backend alembic upgrade head

# tests
docker compose exec backend pytest
cd frontend && npm run test

# lint / format
docker compose exec backend ruff check --fix . && docker compose exec backend ruff format .
cd frontend && npm run lint
```

Run lint and tests before declaring a task finished.

---

## Invariants

These are non-negotiable. Violating them causes bugs that are painful to diagnose after the fact.

### Timer

1. **Never accumulate ticks.** Store `startedAt` and compute `elapsed = Date.now() - startedAt` on every render. Browsers throttle background tabs; an accumulating counter will silently under-report. `setInterval` exists only to trigger re-renders, never to measure.
2. **The timer is entirely client-side.** The server stores completed blocks. No WebSocket, no per-second requests.
3. **One POST per block**, on completion or abort — not per tick.
4. **Persist the in-progress block to `localStorage`.** A refresh mid-block must recover, not lose the block.

> **Auto-start breaks defaults to OFF**, and this is a correctness decision, not a preference. With it ON, the break clock and the label sheet both start at 00:00 — a user who walks away for ten minutes returns to a break that already "happened," and the history records a lie. With it OFF, the label sheet is dismissed and the user presses START for the break, so recorded break time is always real break time. If the setting is ever turned ON, **the break clock starts when the label sheet is dismissed**, never at 00:00.

### Time and dates

5. **All timestamps are UTC** in the database and over the wire. Convert only at render time, in the frontend. **The API speaks instants, never dates:** history endpoints take a `from`/`to` UTC range that the client computed from its own local day boundaries. The server never reasons about "days" and stores no timezone — otherwise day-bucketed aggregation would need one, and invariant 5 would be a lie.
   > The plan API is the one deliberate exception: it takes **dates**, not instants. An entry is wall-clock calendar data — a 09:00 class is 09:00 whatever the offset — so `plan` stores a naive `date` + `time`. Invariant 5 governs blocks (recorded events), not entries. See `DECISIONS.md`. Do not "fix" the plan toward instants, and do not copy its date params into any history endpoint.
6. **Store timestamps, never durations.** Duration is always derived. A stored duration cannot reconstruct a timeline.
7. A block that crosses midnight belongs to the day it **started**.

### Data

8. **Blocks are append-only from the client's perspective**, and carry a client-generated UUID so an offline queue can sync without duplicates.
9. **Aborted blocks are saved**, with `status = 'aborted'` and the real elapsed time. Time spent is time spent.
10. **Deleting a tag never deletes blocks or activities.** They become untagged.

### Module independence

11. **`timer/` and `plan/` never import each other**, in either direction, on either the backend or the frontend. Their only shared dependencies are `user` and `tag`. Either module must be deletable without breaking the other.
12. **No plan table stores anything about blocks, and no block table references the plan.** There is no `expected_blocks`, no `planned_pomodoros`, no plan-to-block foreign key.
13. **The Plan module never uses Pomodoro vocabulary** — no "block," "focus," "cycle," "pomodoro" in any string, component name, or column name under `plan/`. Its unit is an **entry**. A planner-only user must never encounter the timer's concepts.
14. **The plan is a dated weekly calendar.** An entry belongs to a **date**, not a weekday. Weekly repetition exists as a simple `repeat_weekly` flag on the entry — not a recurrence engine, and never iCal RRULE semantics. All-day entries are supported on a single date; multi-day spans are not.

> **On 11–13 and the future timer integration.** The wireframes sketch a `☑ Use focus timer for this` checkbox and a `⏱ Start a timer` action inside plan entries. That is the *ideal* end state, explicitly **not the MVP**: the planner's first version is an isolated weekly calendar with zero timer coupling. Invariants 11–13 hold in full until that integration is deliberately scheduled — at which point 12 and 13 must be renegotiated in writing first, not eroded a feature at a time. Do not add the checkbox, the launch action, or any plan→timer reference before then.

### Architecture

15. **No `is_premium` conditionals in core code.** Premium features are a separate module that imports the core, never conditionals scattered through it. The public repo is AGPL-3.0; anything sold lives in a separate private repo. This separation must hold from the first commit.
16. **Routers stay thin.** Business logic goes in `service.py`.

---

## Frontend conventions

**Mobile-first.** Every screen in `docs/wireframes.md` is drawn at phone width, and that is the primary target. Author the mobile layout first and add desktop layouts at breakpoints (`md:`/`lg:`). Desktop is a first-class second target, not an afterthought — each screen's desktop treatment is described in the `## Desktop` sections of the wireframes.

Concretely:

- **Mobile:** a bottom tab bar — `⏱ Timer · ▤ History · ▦ Plan`. Settings is reached from the header gear, not the tab bar.
- **Desktop:** a persistent left sidebar carrying the same three destinations plus tags and Settings. History gains a two-pane layout (day list + block inspector) so editing a block never navigates away.

*(This reverses an earlier desktop-first instruction. `wireframes.md` is canonical; existing prose in `ux-research.md` that says "persistent sidebar, not a bottom tab bar" is stale.)*

Other conventions:

- Server Components by default; `"use client"` only where interactivity requires it. The timer is necessarily a client component.
- Timer state lives in one place. Do not duplicate elapsed-time calculation across components.
- No `any`. If a type is hard to express, ask rather than escaping the type system.
- Tag colors are the only saturated color in the UI. Everything else stays neutral. Tags are the single visual element shared across both modules.
- The cycle indicator (`● ● ○ ○`) appears only on the timer, never in the Plan.
- Density differs by module on purpose: the timer is sparse, the plan grid is dense. They are used in different mental states.
- Empty states are honest and literal ("No blocks yet"), never fabricated encouragement. The Plan empty state must not mention the timer beyond the existing "Timers are optional." line.
- Secondary actions during a running block (Pause, Stop, Skip) are deliberately low-contrast. During focus, the correct interaction is none.

## Backend conventions

- Pydantic schemas for every request and response. No raw dicts crossing the API boundary.
- Async endpoints and async SQLAlchemy sessions throughout.
- Timezone-aware `datetime` objects only. Never naive.
- Index `blocks(user_id, started_at)` — every history query goes through it.
- Errors return structured JSON with a stable `code` field, not bare strings.

## Testing

Priority order, given limited time:

1. Elapsed-time and day-boundary calculations (the logic most likely to be subtly wrong)
2. Block creation and the aborted-block path
3. History aggregation by tag and by day
4. Auth

Skip exhaustive UI tests. Test the logic that is hard to eyeball.

---

## Scope boundaries

**Shipped (phase 1, the MVP):** timer with configurable cycle, labels with autocomplete, tags, day-view history, post-hoc editing and deletion, notifications and sound, offline queue, single-user auth, deploy.

**Shipped (phase 2):** the weekly planner as an **isolated dated calendar** — week list, day timeline, entry editor with `repeat_weekly`, planner-only empty states. Zero timer coupling.

**Phase 3+, not started:** timer integration with the plan (`Use focus timer for this`, `Start a timer` on an entry). Requires renegotiating invariants 12 and 13 **in writing, up front** — not feature by feature.

**Not built, do not build unprompted:** week/month history views, charts, manual block entry, export, projects or subtasks, todo integration, theme toggle, onboarding, any premium feature.

**Never:**
- This app records time and describes weeks. It is not a task manager. Reject scope drift in that direction.
- Any feature that only makes sense if the user uses both modules. If a proposed feature would break when one module is deleted, it is out of scope until the phase-3 integration is explicitly scheduled. Even then, the planner must stay fully usable with the timer deleted.

## Decisions

All gates are closed — resolutions and consequences live in `DECISIONS.md`. The one standing decision point: **phase 3 (timer↔plan integration) requires renegotiating invariants 12 and 13 in writing before any code.** Do not resolve unilaterally; ask.

## Working style

- Ask before large refactors or new dependencies.
- Prefer the boring solution. This is maintained by one self-taught developer in limited time; clever code is a liability.
- When you make a non-obvious choice, leave a one-line comment explaining *why*, not what.
- Small, focused commits. Conventional Commits format (`feat:`, `fix:`, `chore:`). Scope commits by module where it applies: `feat(timer):`, `feat(plan):`.
- If something in this file is wrong or has drifted from the code, say so.

## License

AGPL-3.0. Every new source file gets the standard copyright header. Contributions require a signed CLA — the dual-licensing option depends on it, so do not merge external PRs without one.