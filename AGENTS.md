# AGENTS.md

Operating manual for coding agents working in the ClockLog repository.

> `CLAUDE.md` imports this file. This is the canonical instruction set — edit it here, not in a copy.
> Nested `AGENTS.md` files exist (`frontend/AGENTS.md`); the closest one to the file you are editing wins.

---

## Project overview

**ClockLog** is a multi-user Pomodoro timer and weekly planner: two loosely coupled tools that share a vocabulary but not a codepath.

1. **Timer + History** — a Pomodoro timer where every block gets a label, producing a queryable history of how time was actually spent.
2. **Plan** — a dated weekly calendar of ordinary entries (gym, work, classes, meals). Independent of the timer, and fully usable by someone who has never run a Pomodoro.

Both halves have shipped: the MVP timer + history (phase 1) and the isolated planner (phase 2). Phase 3 — timer integration with the plan — is deliberately unbuilt. See [Scope boundaries](#scope-boundaries).

Solo-maintained. Single VPS, Docker Compose, nginx reverse proxy, certbot for TLS.

### Stack

| Layer | Technology |
| --- | --- |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.x (async), Alembic, Pydantic v2, asyncpg |
| Database | PostgreSQL 16 |
| Frontend | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind v4 |
| Tests | pytest + pytest-asyncio (backend), Vitest + happy-dom (frontend) |
| Lint/format | ruff (backend), ESLint + `tsc --noEmit` (frontend) |
| Infra | Docker Compose, nginx, certbot |
| Auth | Open registration, email + password (bcrypt), verified addresses, JWT bearer tokens. Hand-rolled — **do not add an auth framework.** |
| Email | Resend, called as a plain `httpx` POST. **No SDK** — see G-6 |

**Do not introduce new dependencies without asking.** This is a small project maintained by one person; every dependency is a maintenance cost. Transactional email is the one recent addition, and it deliberately added no package: Resend is reached with `httpx`, which the runtime already carries.

### Reference documents

These describe the shipped system. The code is the source of truth for *what the app does*; this file is the operating manual for *how to build on it*.

| File | Contents |
| --- | --- |
| `docs/architecture.md` | How the shipped system works: module boundaries and their enforcement, data model, the instants-vs-dates split, the timer engine and offline queue |
| `docs/api.md` | Endpoint reference with examples, PATCH semantics, and the full error-code table |
| `docs/operations.md` | Runbook: dev setup, first run, migrations, deploy, backup/restore, troubleshooting |
| `docs/DECISIONS.md` | Closed decision log — every resolved gate and its consequences |
| `docs/README.md` | Index of the above, with each document's status. **Check it before trusting a page**: sections written ahead of the code are flagged there and inline |

Screens keep stable IDs — the table below is their definition. Cite the screen ID in issues, commits, and component docstrings. `SCR-02`…`SCR-05` are the unauthenticated screens.

| ID | Screen |
| --- | --- |
| `SCR-01` | Shell / navigation |
| `SCR-02` | Sign in |
| `SCR-03` | Sign up |
| `SCR-04` | Verify email |
| `SCR-05` | Password recovery — request and reset |
| `SCR-11` | Timer — Idle and Running |
| `SCR-13` | Timer — Paused and Break |
| `SCR-14` | Label sheet (on block completion) |
| `SCR-20` | History — Day |
| `SCR-21` | History — Block edit |
| `SCR-31` | Plan — Week (list) and Day (timeline) |
| `SCR-33` | Plan — New entry sheet and Empty week |
| `SCR-40` | Settings |

**If a request contradicts an invariant or the scope boundaries below, say so before implementing. Do not silently expand scope.**

---

## Setup commands

Requirements: Docker + Docker Compose, Node 20+, and (for editor tooling only) Python 3.12.

```bash
# 1. Backend + database. Runs `alembic upgrade head` on start.
docker compose up -d

# 2. Frontend dependencies (installed on the host, not in Docker, for dev)
cd frontend && npm install
```

Development also needs an env file: `docker-compose.yml` is prod-safe and
interpolates its required variables from `.env` / the shell, so a missing value
fails at `docker compose config` instead of degrading at runtime. `cp .env.example
.env` works as-is for dev — `docker-compose.override.yml` (auto-loaded when no `-f`
is passed) replaces the runtime values with local credentials, so the placeholders
only need to exist for interpolation. `.env` is gitignored; for production, fill in
every value.

### Ports and endpoints

| URL | What |
| --- | --- |
| `http://localhost:3000` | Frontend (`npm run dev`) |
| `http://localhost:8000` | API |
| `http://localhost:8000/docs` | OpenAPI / Swagger UI |
| `http://localhost:8000/health` | Liveness probe → `{"status": "ok"}` |

Postgres is **not** published to the host by default. Uncomment the `ports` block under `db` in `docker-compose.yml` if you need a direct client.

---

## Development workflow

```bash
docker compose up -d              # backend + db
docker compose logs -f backend    # follow backend logs
cd frontend && npm run dev        # frontend with hot reload on :3000
```

`./backend` is bind-mounted into the container, so backend edits reload without a rebuild. Rebuild only when `pyproject.toml` or the `Dockerfile` changes:

```bash
docker compose up -d --build backend
```

### Migrations

**Always via Alembic. Never hand-written SQL against the database.**

```bash
docker compose exec backend alembic revision --autogenerate -m "add entry table"
docker compose exec backend alembic upgrade head
docker compose exec backend alembic downgrade -1     # roll back one
docker compose exec backend alembic current          # what is applied
```

Review every autogenerated migration before committing it — autogenerate misses server defaults, index renames, and column type changes with data implications.

### API surface

All routers mount at the app root. Every endpoint requires an `Authorization: Bearer <jwt>` header except `/health` and the unauthenticated half of `/auth` — `register`, `login`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`.

| Prefix | Module | Notes |
| --- | --- | --- |
| `/auth` | `app/shared/user` | Registration is **open**. `POST /register`, `/verify-email`, `/resend-verification`, `/login`, `/forgot-password`, `/reset-password` (all rate-limited per IP; the mail-sending ones also per email), `GET /me` |
| `/tags` | `app/shared/tag` | CRUD; deleting a tag never deletes blocks or entries |
| `/settings` | `app/shared/setting` | `GET`, `PUT` |
| `/blocks` | `app/timer` | List/create/patch/delete, plus `GET /summary` and `GET /recent-labels`. Takes `from`/`to` **UTC instants** |
| `/plan/entries` | `app/plan` | CRUD, plus a range list returning occurrences. Takes **dates**, deliberately (see invariant 5) |

`app/main.py` imports the `timer` and `plan` routers defensively — a `ModuleNotFoundError` is tolerated so either module stays deletable (invariant 11). Shared routers are mandatory.

---

## Repository layout

The backend is organized **by module, not by layer**, so the independence invariant is visible in the filesystem.

```
backend/
  app/
    core/            # config, security, db session, rate limiting — no business logic
    shared/          # user, tag, setting — the ONLY things both modules may import
      user/  tag/  setting/
    timer/           # blocks, history      (phase 1, shipped)
      api.py  models.py  schemas.py  service.py
    plan/            # entries — the dated weekly calendar (phase 2, shipped)
      api.py  models.py  schemas.py  service.py
  alembic/versions/  # migrations
  tests/
frontend/
  app/               # App Router: (app)/ authenticated shell, login/
  components/
    shared/          # AppShell, Sidebar, TabBar, TagPicker, TagManager, QueueSync
    timer/           # TimerScreen, LabelSheet, CycleIndicator, HistoryPage, BlockEditor
    plan/            # PlanWeekScreen, PlanDayScreen, WeekView, DayView, EntrySheet, EmptyWeek
  lib/               # api client, timer engine, date helpers, alerts
  __tests__/
docs/                # architecture.md, api.md, operations.md, DECISIONS.md
  plans/             # in-flight change plans; deleted once the change lands
infra/backup/        # nightly pg_dump container
scripts/ci.sh        # run the full CI suite locally
.github/workflows/   # CI
```

`timer/` and `plan/` must never import each other. If something seems to belong to both, it belongs in `shared/`.

`@/*` is the frontend path alias for the `frontend/` root (configured in both `tsconfig.json` and `vitest.config.mjs`).

---

## Testing instructions

```bash
# Backend — full suite (includes the mechanical invariant proofs)
docker compose exec backend pytest

# Backend — one file / one test
docker compose exec backend pytest tests/timer/test_history.py
docker compose exec backend pytest -k "aborted"

# Frontend — full suite
cd frontend && npm run test          # vitest run
cd frontend && npm run test:watch
npx vitest run -t "recovers an in-progress block"   # one test by name

# Everything CI runs, in one command (requires `docker compose up -d` first)
./scripts/ci.sh
```

### Test database safety

Backend tests `DELETE FROM` every table. They run against a **separate `clocklog_test` database**, never the dev one.

- `TEST_DATABASE_URL` is set in `docker-compose.yml`; if unset it is derived from `DATABASE_URL` by swapping the database name for `clocklog_test`.
- `tests/conftest.py` **raises** unless the resolved URL ends in `_test`. Do not weaken that assertion — it is the actual safety mechanism, not a formality.

### Test layout and naming

| | Location | Pattern |
| --- | --- | --- |
| Backend | `backend/tests/`, mirroring `app/` (`tests/timer/`, `tests/plan/`; shared and core tests sit at the top level) | `test_*.py`, `test_*` functions |
| Frontend | `frontend/__tests__/<area>/` | `*.test.ts`, or `*.test.tsx` when a component is rendered |

`asyncio_mode = "auto"` is set, so async backend tests need no decorator. The event loop is session-scoped on purpose: an asyncpg connection is bound to the loop that created it.

### Invariant enforcement tests — do not delete or skip

| Test | Proves |
| --- | --- |
| `backend/tests/test_independence.py` | No file under `timer/` imports `plan/` or vice versa; no Pomodoro vocabulary under `plan/` (invariants 11, 13) |
| `backend/tests/test_deletability.py` | The app still boots and its remaining suite still passes with either feature module physically removed — run in a subprocess against a pruned copy of the tree (invariant 11) |
| `frontend/eslint.config.mjs` | `no-restricted-imports` blocks timer↔plan imports, and blocks `components/shared/**` from importing either feature module |

These are how invariant 11 stays true. If one fails, the invariant broke — fix the code, not the test.

### What to test, in priority order

Time is limited, so spend it where bugs hide:

1. Elapsed-time and day-boundary calculations — the logic most likely to be subtly wrong
2. Block creation and the aborted-block path
3. History aggregation by tag and by day
4. Auth

Skip exhaustive UI tests. Test the logic that is hard to eyeball.

---

## Invariants

Non-negotiable. Violating these causes bugs that are painful to diagnose after the fact.

### Timer

1. **Never accumulate ticks.** Store `startedAt` and compute `elapsed = Date.now() - startedAt` on every render. Browsers throttle background tabs; an accumulating counter will silently under-report. `setInterval` exists only to trigger re-renders, never to measure.
2. **The timer is entirely client-side.** The server stores completed blocks. No WebSocket, no per-second requests.
3. **One POST per block**, on completion or abort — not per tick.
4. **Persist the in-progress block to `localStorage`.** A refresh mid-block must recover, not lose the block.

> **Auto-start breaks defaults to OFF**, and this is a correctness decision, not a preference. With it ON, the break clock and the label sheet both start at 00:00 — a user who walks away for ten minutes returns to a break that already "happened," and the history records a lie. With it OFF, the label sheet is dismissed and the user presses START for the break, so recorded break time is always real break time. If the setting is ever turned ON, **the break clock starts when the label sheet is dismissed**, never at 00:00.

### Time and dates

5. **All timestamps are UTC** in the database and over the wire. Convert only at render time, in the frontend. **The API speaks instants, never dates:** history endpoints take a `from`/`to` UTC range that the client computed from its own local day boundaries. The server never reasons about "days" and stores no timezone — otherwise day-bucketed aggregation would need one, and this invariant would be a lie.
   > The plan API is the one deliberate exception: it takes **dates**, not instants. An entry is wall-clock calendar data — a 09:00 class is 09:00 whatever the offset — so `plan` stores a naive `date` + `time`. Invariant 5 governs blocks (recorded events), not entries. See `docs/DECISIONS.md`. Do not "fix" the plan toward instants, and do not copy its date params into any history endpoint.
6. **Store timestamps, never durations.** Duration is always derived. A stored duration cannot reconstruct a timeline.
7. A block that crosses midnight belongs to the day it **started**.

### Data

8. **Blocks are append-only from the client's perspective**, and carry a client-generated UUID so the offline queue can sync without duplicates.
9. **Aborted blocks are saved**, with `status = 'aborted'` and the real elapsed time. Time spent is time spent.
10. **Deleting a tag never deletes blocks or activities.** They become untagged.

### Module independence

11. **`timer/` and `plan/` never import each other**, in either direction, on either the backend or the frontend. Their only shared dependencies are `user`, `tag`, and `setting`. Either module must be deletable without breaking the other.
12. **No plan table stores anything about blocks, and no block table references the plan.** There is no `expected_blocks`, no `planned_pomodoros`, no plan-to-block foreign key.
13. **The Plan module never uses Pomodoro vocabulary** — no "block," "focus," "cycle," or "pomodoro" in any string, component name, or column name under `plan/`. Its unit is an **entry**. A planner-only user must never encounter the timer's concepts.
14. **The plan is a dated weekly calendar.** An entry belongs to a **date**, not a weekday. Weekly repetition exists as a simple `repeat_weekly` flag on the entry — not a recurrence engine, and never iCal RRULE semantics. All-day entries are supported on a single date; multi-day spans are not.

> **On 11–13 and the future timer integration.** The original design sketched a `☑ Use focus timer for this` checkbox and a `⏱ Start a timer` action inside plan entries. That is the *ideal* end state, explicitly **not the MVP**: the planner's first version is an isolated weekly calendar with zero timer coupling. Invariants 11–13 hold in full until that integration is deliberately scheduled — at which point 12 and 13 must be renegotiated **in writing first**, not eroded a feature at a time. Do not add the checkbox, the launch action, or any plan→timer reference before then.

### Architecture

15. **No `is_premium` conditionals in core code.** Premium features are a separate module that imports the core, never conditionals scattered through it. The public repo is AGPL-3.0; anything sold lives in a separate private repo. This separation must hold from the first commit.
16. **Routers stay thin.** Business logic goes in `service.py`.

---

## Code style

### Backend

- **Pydantic schemas for every request and response.** No raw dicts crossing the API boundary.
- **Async endpoints and async SQLAlchemy sessions throughout.**
- **Timezone-aware `datetime` objects only.** Never naive. (The `plan` module's `date`/`time` columns are the documented exception — they are wall-clock data, not instants.)
- **Index `blocks(user_id, started_at)`** — every history query goes through it.
- **Errors return structured JSON with a stable `code` field**, not bare strings. `app/main.py` normalizes any `HTTPException` into `{"code": ..., "message": ...}`; raise with a `detail` dict carrying your own `code` when the client needs to branch on it.
- Routers stay thin; business logic lives in `service.py` (invariant 16).
- Formatting is ruff's: 100-column lines, double quotes, space indent. Lint rules: `E`, `F`, `I`, `B`, `UP`.

```bash
docker compose exec backend ruff check --fix .
docker compose exec backend ruff format .
```

CI runs `ruff check .` and `ruff format --check app tests` — both must be clean.

### Frontend

**Mobile-first.** Phone width is the primary target: author the mobile layout first and add desktop layouts at breakpoints (`md:`/`lg:`). Desktop is a first-class second target, not an afterthought — match the desktop treatment the shipped screens already use.

- **Mobile:** a bottom tab bar — `⏱ Timer · ▤ History · ▦ Plan`. Settings is reached from the header gear, not the tab bar.
- **Desktop:** a persistent left sidebar carrying the same three destinations plus tags and Settings. History gains a two-pane layout (day list + block inspector) so editing a block never navigates away.
- **A `fixed` overlay must clear the mobile tab bar.** The tab bar is an opaque 56px band at `bottom-0`, so anything pinned to the bottom uses `bottom-16 md:bottom-4` and a `z-index` above it, or it is painted underneath on the primary target. Two slots, and they do not share: **app-wide** messages take the centered one (`QueueSync`), **page-scoped** messages the right (`/settings`). A screen shows at most one page-scoped message at a time.

Other conventions:

- **Server Components by default**; `"use client"` only where interactivity requires it. The timer is necessarily a client component.
- **Timer state lives in one place** (`lib/timer/engine.ts`). Do not duplicate elapsed-time calculation across components.
- **Geist is the app typeface** (`Geist` / `Geist_Mono`, loaded in `app/layout.tsx` and mapped to `--font-sans` / `--font-mono` in `globals.css`). Do not set `font-family` on `body` — a direct rule there overrides the token for every screen.
- **No `any`.** TypeScript runs in `strict` mode. If a type is hard to express, ask rather than escaping the type system.
- **Tag colors are the only saturated color in the UI.** Everything else stays neutral. Tags are the single visual element shared across both modules.
- **The palette lives in `app/globals.css`, and only there.** Every screen is authored in `neutral-*` plus `white`, so the app's color is set by overriding the Tailwind scale (`--color-neutral-50` … `--color-neutral-900`, `--color-white`) in one `@theme` block. The shipped palette is **sepia** — a warm cream ground with brown ink, so `bg-neutral-900` reads as espresso rather than black. Repaint by editing those tokens; never hard-code a hex or reach for another Tailwind color family in a component, or the palette stops being one revertable edit. The tint is low-chroma on purpose: it keeps tag colors the only saturated color in the app.
- The cycle indicator (`● ● ○ ○`) appears only on the timer, never in the Plan.
- Density differs by module on purpose: the timer is sparse, the plan grid is dense. They are used in different mental states.
- **Empty states are honest and literal** ("No blocks yet"), never fabricated encouragement. The Plan empty state mentions the timer not at all — gate G-5 dropped the "Timers are optional." line, and invariant 13 stands unscoped (`docs/DECISIONS.md`).
- **One filled button, one size.** `components/shared/PrimaryButton` is the only filled `bg-neutral-900` treatment in the app, and every action that commits something — START, RESUME, SAVE, SIGN IN — routes through it. It takes no `className`: a per-call-site override is how seven divergent copies of it happened the first time. It lives in `shared/` because both feature modules need it and neither may import the other (invariant 11), so its name, props, and copy stay free of Pomodoro vocabulary (invariant 13).
- Secondary actions **during a running block** (Pause, Stop, Skip) are deliberately low-contrast. During focus, the correct interaction is none. **Resume, in the paused state, is primary** — it carries the same filled treatment as START, because paused is not running and the correct interaction there is precisely to resume.

```bash
cd frontend
npm run lint          # eslint
npx tsc --noEmit      # type check — CI runs this separately from lint
```

### License headers

The project is **AGPL-3.0**. Every new source file — `.py`, `.ts`, `.tsx`, and infrastructure files — gets the standard header. Copy it verbatim from an existing file, e.g. `backend/app/main.py` or `frontend/lib/api/client.ts`:

```
ClockLog — a Pomodoro timer and weekly planner
Copyright (C) 2024  Luca

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
...
```

**Files under `plan/` use a different first line.** The standard header contains the word *Pomodoro*, which invariant 13 forbids anywhere under `plan/` — and `test_independence.py` scans the whole file, comments included. Every file in `backend/app/plan/`, `frontend/components/plan/`, and `frontend/lib/plan/` opens with:

```
ClockLog — a timer and weekly planner
```

**Exception:** `frontend/components/plan/EmptyWeek.tsx` uses `// ClockLog — a weekly planner screen` because `__tests__/plan/empty-week.test.tsx` scans that specific source file for the regex `timer|block|focus|cycle|pomodoro`, and the word "timer" in the standard header would trip it.

Everything after that first line is identical. Copy the header from `backend/app/plan/models.py` when adding a file there.

Contributions require a signed CLA — the dual-licensing option depends on it, so **do not merge external PRs without one.**

---

## Build and deployment

### Production

nginx and TLS (certbot) run on the VPS itself, outside Compose. Services bind to `127.0.0.1` only and the reverse proxy fronts them.

```bash
cp .env.example .env      # then fill in every value
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

`docker-compose.yml` is the prod-safe base (prod stage, no bind mounts, required
`${VAR:?}`, loopback ports, full healthchecks, backup sidecar) and
`docker-compose.prod.yml` is the prod layer that additionally requires
`RESEND_API_KEY` — the one variable dev/CI leave empty on purpose. Passing an
explicit `-f` means the dev override (`docker-compose.override.yml`) is never
auto-loaded. Do not deploy from the base alone: it boots without the key and email
would silently degrade to log mode.

The backend container applies migrations on boot (`alembic upgrade head && fastapi run …`), so deploys are unattended.

### Images

- `backend/Dockerfile` is multi-stage: `dev` (adds pytest, ruff, httpx) and `prod` (runtime deps only, non-root `appuser`). The base `docker-compose.yml` targets the `prod` stage; `docker-compose.override.yml` switches it to `dev` for local work.
- `frontend/Dockerfile` bakes `NEXT_PUBLIC_API_URL` at build time — **changing the API URL requires a frontend rebuild**, not just a restart.

### Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `DATABASE_URL` | backend | `postgresql+asyncpg://…` |
| `SECRET_KEY` | backend | Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `TEST_DATABASE_URL` | backend (dev/CI) | Must end in `_test` |
| `CORS_ORIGINS` | backend | Comma-separated allowlist. Credentials are off, so the list is an explicit allow |
| `LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_SECONDS` | backend | Per-IP sliding window on the credential endpoints |
| `AUTH_EMAIL_RATE_LIMIT`, `AUTH_EMAIL_RATE_WINDOW_SECONDS` | backend | Tighter window on the endpoints that send mail |
| `RESEND_API_KEY` | backend | Resend key. **Empty in dev and CI**, which logs the link instead of sending |
| `EMAIL_FROM` | backend | Verified sender, e.g. `ClockLog <no-reply@example.com>` |
| `APP_BASE_URL` | backend | Origin the emailed links point at — the frontend, not the API |
| `NEXT_PUBLIC_API_URL` | frontend | Build-time |
| `POSTGRES_*` | db | |
| `BACKUP_INTERVAL_SECONDS`, `BACKUP_KEEP`, `BACKUP_RCLONE_REMOTE` | backup | Nightly `pg_dump` with local rotation; optional off-site copy via rclone |

### CI

`.github/workflows/ci.yml` runs on pushes and PRs to `main`: brings up Compose, waits for the backend, then runs pytest, `ruff check`, `ruff format --check`, vitest, eslint, and `tsc --noEmit`. `scripts/ci.sh` runs the same sequence locally.

---

## Security

- **Multi-user auth, hand-rolled.** Passwords are bcrypt-hashed; sessions are JWT bearer tokens in the `Authorization` header. Do not add an auth framework, and do not move the token into a cookie — CORS is configured with `allow_credentials=False` precisely because the token is a header.
- **Registration is open, and stays open.** There is no flag to close it. A private deployment is restricted at nginx, not in application code.
- **An unverified address cannot sign in.** `POST /auth/login` returns `403 EMAIL_NOT_VERIFIED` until the address is confirmed. Verification is a gate, not a reminder — a reset flow is only as trustworthy as the address it mails (decision G-6).
- **A password change revokes every live session.** The JWT's `sub` is the user id and its `pwd` claim is pinned to the account's `password_changed_at`; moving that timestamp invalidates outstanding tokens. Never issue a token without the claim, and never skip the check on decode.
- **Email-bearing tokens are stored hashed and never reused.** Verification and reset tokens live in the database as a SHA-256 digest with an expiry and a single-use marker — a leaked backup must not be a pile of working account-takeover links.
- **Auth responses must not reveal whether an address is registered.** Login always runs bcrypt, even for an unknown email, so failure timing is flat; `forgot-password` and `resend-verification` answer `204` either way.
- Every `/auth` endpoint is rate-limited per IP (`app/core/ratelimit.py`); the three that send mail are additionally limited per email address, under separate keys.
- **Never commit secrets.** `.env` is gitignored; `.env.example` carries placeholders only.
- Unhandled exceptions are logged as one JSON line with a correlating `request_id`, and the response carries `X-Request-ID`. Never leak a traceback to the client.
- Every endpoint scopes its queries by the authenticated `user_id`. There is no admin path and no cross-user access.
- **A `tag_id` arriving from a client is not trusted.** Blocks and entries must verify the tag belongs to the caller before storing it, and any query that resolves tags for display must filter by `user_id`. Under a single account these checks were unobservable; they are now the boundary between tenants.
- **The browser is shared, so signing in is a fence.** Every persisted key is namespaced `clocklog_*` (plus `token`), and signing in as a different account clears them all before the session starts — otherwise one account's in-progress block and unsynced offline queue follow the next one into the app.

---

## Nested AGENTS.md files

| Path | Purpose |
| --- | --- |
| `AGENTS.md` (root) | This file. Applies everywhere. |
| `frontend/AGENTS.md` | Next.js version warning, auto-generated by `next dev` between `<!-- BEGIN:nextjs-agent-rules -->` / `<!-- END:nextjs-agent-rules -->` markers, plus frontend-specific notes kept **outside** those markers. |

**Do not edit inside the `nextjs-agent-rules` markers** — `next dev` rewrites that block, so your change reappears as an uncommitted diff. Add frontend guidance below the `END` marker instead.

`CLAUDE.md` at the root and in `frontend/` are one-line `@AGENTS.md` imports. Keep them that way; put content in `AGENTS.md`.

---

## Pull request guidelines

- **Commit format:** Conventional Commits, scoped by module where it applies — `feat(timer):`, `fix(plan):`, `fix(auth):`, `refactor(backend):`, `docs:`, `chore:`.
- **Small, focused commits.** One concern per commit.
- **Cite the screen ID** (`SCR-31`) in commits and PRs that touch UI.
- **Before declaring anything finished, run lint and tests.** `./scripts/ci.sh` is the single command that covers both halves.
- A PR that changes a model must include its Alembic migration.
- A PR that touches `timer/` or `plan/` must keep `test_independence.py` and `test_deletability.py` green.
- External PRs require a signed CLA.

---

## Scope boundaries

**Shipped (phase 1, the MVP):** timer with configurable cycle, labels with autocomplete, tags, day-view history, post-hoc editing and deletion, notifications and sound, offline queue, auth, deploy.

**Shipped (phase 2):** the weekly planner as an **isolated dated calendar** — week list, day timeline, entry editor with `repeat_weekly`, planner-only empty states. Zero timer coupling.

**Shipped (G-6):** open registration — multi-user sign-up with verified email addresses and password recovery, replacing the single-account model. Decided in `docs/DECISIONS.md` § G-6. Registration is open unconditionally; a private deployment is restricted at nginx, not in application code.

**Phase 3+, not started:** timer integration with the plan (`Use focus timer for this`, `Start a timer` on an entry). Requires renegotiating invariants 12 and 13 **in writing, up front** — not feature by feature. **Do not resolve this unilaterally; ask.**

**Not built, do not build unprompted:** week/month history views, charts, manual block entry, export, projects or subtasks, todo integration, theme toggle, onboarding, any premium feature.

**Never:**

- This app records time and describes weeks. **It is not a task manager.** Reject scope drift in that direction.
- Any feature that only makes sense if the user uses both modules. If a proposed feature would break when one module is deleted, it is out of scope until the phase-3 integration is explicitly scheduled. Even then, the planner must stay fully usable with the timer deleted.

All decision gates are closed; resolutions and consequences live in `docs/DECISIONS.md`.

---

## Debugging and troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `pytest` errors with `TEST_DATABASE_URL must point at a *_test database` | The resolved test URL does not end in `_test`. Fix the env var — do not weaken the assertion in `conftest.py`. |
| Backend won't start; Alembic errors on boot | A migration failed. `docker compose logs backend`, then `docker compose exec backend alembic current` / `history`. |
| Frontend fetches fail with a CORS error | `CORS_ORIGINS` does not include the origin the browser is on. Dev default is `http://localhost:3000`. |
| Frontend still calls the old API host after changing `NEXT_PUBLIC_API_URL` | It is baked in at build time — rebuild the frontend image. |
| Backend code changes have no effect | The container bind-mounts `./backend`, so this usually means a dependency or Dockerfile change. `docker compose up -d --build backend`. |
| Async test hangs or raises "attached to a different loop" | An asyncpg connection is bound to its creating loop. Keep the session-scoped loop settings in `pyproject.toml`. |
| A 500 with no detail | Grep the logs for the `request_id` from the `X-Request-ID` response header: `docker compose logs backend \| grep <id>`. |
| Timer under-reports elapsed time in a background tab | Invariant 1 was violated somewhere — a counter is accumulating instead of deriving from `startedAt`. |
| ESLint fails with `no-restricted-imports` | Invariant 11: a timer↔plan (or shared→feature) import crept in. Move the shared piece into `shared/`. |
| `test_plan_contains_no_timer_vocabulary` fails on a file you only added a header to | The standard license header contains "Pomodoro". Use the `plan/` variant — see [License headers](#license-headers). |

---

## Working style

- **Ask before large refactors or new dependencies.**
- **Prefer the boring solution.** This is maintained by one self-taught developer in limited time; clever code is a liability.
- When you make a non-obvious choice, leave a one-line comment explaining *why*, not what. The existing codebase does this consistently — match it.
- If something in this file is wrong or has drifted from the code, **say so** rather than working around it.
- Do not silently expand scope. If the request contradicts the reference documents or an invariant, raise it first.

## License

AGPL-3.0. See `LICENSE`.
