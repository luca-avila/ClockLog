# Architecture

How Tempo is put together, and why. For the rules a contributor must follow see
[`../AGENTS.md`](../AGENTS.md); for closed design questions see
[`DECISIONS.md`](DECISIONS.md).

---

## 1. Shape of the system

```
browser (Next.js 16, React 19)
  │  Authorization: Bearer <JWT>          fetch, JSON
  ▼
FastAPI (uvicorn, async)  ──────────────►  PostgreSQL 16
  │                            asyncpg
  ├─ shared/   user · tag · setting        (mandatory)
  ├─ timer/    block · block_interval      (deletable)
  └─ plan/     entry                       (deletable)
```

Everything is a single VPS running Docker Compose: `backend`, `db`, `frontend`, and a
`backup` sidecar. nginx and certbot run on the host, outside Compose, and proxy to
services bound on `127.0.0.1`.

There is exactly one user. There is no admin path, no multi-tenancy, and no
cross-user access — every query is scoped by the authenticated `user_id`.

### Two products, one app

The timer and the plan share a vocabulary (tags) but not a codepath. A user who only
plans their week never encounters a Pomodoro concept; a user who only runs the timer
never sees a calendar. Phase 3 — starting a timer from a plan entry — is deliberately
unbuilt.

---

## 2. Module independence, and how it is enforced

`timer/` and `plan/` never import each other, in either direction, on either side of
the stack. Their only shared dependencies are `user`, `tag`, and `setting`. This is not
a style preference; it is what keeps each half deletable.

Three mechanisms hold the line:

| Mechanism | Where | What it proves |
| --- | --- | --- |
| Tolerant router mounting | `backend/app/main.py` | A missing feature module is skipped, not fatal — `ModuleNotFoundError` is caught for `app.timer.api` and `app.plan.api` only. Shared routers stay mandatory. |
| Import scan | `backend/tests/test_independence.py` | No file under `timer/` mentions `plan/` or vice versa, and no Pomodoro vocabulary appears anywhere under `plan/` — comments and license headers included. |
| Physical deletion test | `backend/tests/test_deletability.py` | The app boots and its remaining suite passes with either module removed from a pruned copy of the tree, run in a subprocess. |
| `no-restricted-imports` | `frontend/eslint.config.mjs` | Blocks timer↔plan imports, and blocks `components/shared/**` from importing either feature module. |

Two consequences worth knowing before you touch shared code:

- **Tag deletion counts affected rows via table metadata**, not by importing `Block` or
  `Entry` (`shared/tag/service.py` walks `Base.metadata.tables` for any `tag_id`
  column). That is the only way `shared/` can report the blast radius while staying
  loadable with either feature gone.
- **The Plan module never uses Pomodoro words.** Its unit is an *entry*. Files under
  `backend/app/plan/`, `frontend/components/plan/`, and `frontend/lib/plan/` open with
  the header line `Tempo — a timer and weekly planner`, because the standard header
  contains the word "Pomodoro" and the scan reads whole files.

**Known, deliberate gap:** frontend *routes* still hard-import timer components, so
frontend deletability is not proven the way the backend's is. Recorded in
`DECISIONS.md`; closing it would be its own change.

---

## 3. Data model

> **Ahead of the code.** `email_verified_at`, `password_changed_at`, and `email_token`
> are part of the open-registration change (DECISIONS.md § G-6), not yet implemented.

Every table is owned by a `user` row and cascades on user delete. There is no table
without a `user_id`, and no query anywhere reads across users.

```
user ──┬── tag ──┬── block.tag_id      (SET NULL)
       │         └── entry.tag_id      (SET NULL)
       ├── user_setting  (1:1)
       ├── block ── block_interval     (CASCADE)
       ├── entry
       └── email_token                 (CASCADE)
```

### `user`
`id` (UUID pk) · `email` (unique, indexed) · `hashed_password` (bcrypt) ·
`email_verified_at` (tz-aware, nullable — `NULL` means the account cannot sign in) ·
`password_changed_at` (tz-aware, NOT NULL) · `created_at` (tz-aware).

`password_changed_at` is the session-revocation mechanism, not bookkeeping: every issued
token carries it, and moving it invalidates all of them at once.

### `email_token`
`id` · `user_id` · `token_hash` (SHA-256 hex, unique, indexed) · `purpose`
(`verify` | `reset`) · `expires_at` · `used_at` (nullable) · `created_at`.

The raw token exists only in the email. What is stored is its digest, so a leaked
backup is not a set of working account-takeover links — the same reasoning that keeps
passwords hashed. Tokens are single-use (`used_at`) and short-lived: 24 h to verify,
1 h to reset. Issuing a new token of a purpose invalidates the account's outstanding
ones of that purpose, so a resent link cannot be raced by an older one.

### `tag`
`id` · `user_id` · `name` (≤100) · `color` (`#RRGGBB`) · `created_at`.
Unique on `(user_id, name)`. Tags are the only saturated color in the UI and the only
thing both modules share.

**Deleting a tag never deletes what carried it.** Both foreign keys are `SET NULL`; the
delete response returns `affected`, the number of rows that just became untagged.

### `user_setting` (one row per user)
`focus_duration` 25 · `short_break_duration` 5 · `long_break_duration` 15 ·
`blocks_per_cycle` 4 · `auto_start_breaks` false · `auto_start_next` false ·
`sound` true · `notifications` true. Server-side by decision G-3, so settings travel
with the account. Created lazily on first `GET /settings`.

### `block` + `block_interval` (timer)
`block`: `id` (**client-generated** UUID) · `user_id` · `tag_id?` · `status`
(`completed` | `aborted`) · `kind` (`focus` | `short_break` | `long_break`) · `label?`
(≤500) · `started_at` (tz-aware, indexed).
Composite index `ix_block_user_id_started_at` — every history query goes through it.

`block_interval`: `id` · `block_id` · `started_at` · `ended_at?`. One row per
run segment; pausing closes a row and resuming opens a new one.

**Duration is never stored.** It is the sum of closed intervals
(`timer/service.py::compute_duration`), so paused time is excluded and a timeline can
always be reconstructed. An open interval contributes zero.

### `entry` (plan)
`id` · `user_id` · `tag_id?` · `name` (≤200) · `date` (**naive `Date`**) · `all_day` ·
`start_time?` / `end_time?` (**naive `Time`**) · `repeat_weekly` · `created_at`.
Index `ix_entry_user_id_date`.

An entry belongs to a *date*, not a weekday. An end time before its start time spans
midnight and stays on the starting date. Multi-day spans cannot even be expressed —
`EntryCreate` is `extra="forbid"` over a single `date`.

---

## 4. Time: the one rule with two halves

**Blocks are instants. Entries are wall-clock.** This split is deliberate and is the
single most important thing to understand before touching date code.

| | `block` (recorded event) | `entry` (calendar data) |
| --- | --- | --- |
| Stored as | tz-aware UTC `datetime` | naive `date` + `time` |
| API takes | `from`/`to` **UTC instants** | `from`/`to` **dates** |
| Who computes day boundaries | the **client**, from its local day | nobody — a date has no boundary |
| Frontend helpers | `lib/date/instant.ts` | `lib/date/week.ts` |

A block records *when something happened*; a 09:00 class is 09:00 whatever the offset.
The server therefore stores no timezone and never reasons about "days" — the client
converts its local midnight into the `from`/`to` range history queries use, so
day-bucketed aggregation stays correct without the server knowing where the user is.

Consequences that keep biting if forgotten:

- A block that crosses midnight belongs to the day it **started**.
- Editing a block's start updates **both** `block.started_at` (the indexed, day-bucketed
  column) and its first interval — otherwise the block silently stays on its old day.
- The two `formatDuration` helpers (seconds-based in `instant.ts`, minutes-based in
  `week.ts`) are deliberately *not* shared.
- `GET /blocks` and `GET /blocks/summary` reject naive datetimes with `NAIVE_DATETIME`.

---

## 5. The timer

The timer is **entirely client-side**. The server stores completed blocks and nothing
else: no WebSocket, no per-second requests, one POST per block on completion or abort.

### The engine is a pure state machine

`frontend/lib/timer/engine.ts` holds all timer logic and touches nothing outside itself.
`transition(state, event, clock, settings, cycleCompleted, cyclePendingBreak)` returns
the next state plus a list of **effects** the caller executes:

| Effect | Executed by `TimerScreen` as |
| --- | --- |
| `save` | `saveBlock()` → offline queue |
| `alert` | sound / notification / visual, per settings |
| `showLabelSheet` | SCR-14 |
| `setCycle` | persisted cycle counter |

The clock and UUID generator arrive through a `ClockDeps` seam (`browserClock` in the
browser, a fake in tests), so the engine is deterministic and directly testable.
`TimerScreen` owns a `useReducer` around it, drains the effect queue in an effect, and
renders — it contains no elapsed-time math of its own.

### Never accumulate ticks

Elapsed time is always **derived**: `elapsed(startedAt, now, intervals)`. `setInterval`
(200 ms) exists only to trigger re-renders and a `tick` event. Browsers throttle
background tabs, so an accumulating counter would silently under-report — this is the
single most likely place for a subtle bug, and the reason invariant 1 exists.

Phase gates (`running` | `paused` | `ended`) make double-fire suppression explicit:
ticking an already-`ended` state twice produces effects only once.

### Cycle position and breaks

`focusBlocksCompleted % blocksPerCycle` derives the cycle position and which break comes
next. Never stored as "which break am I on".

### Auto-start breaks defaults OFF — a correctness decision

With it ON, the break clock and the label sheet both start at 00:00; a user who walks
away for ten minutes returns to a break that already "happened" and history records a
lie. With it OFF, the user dismisses the label sheet and presses START, so recorded
break time is always real break time. If the setting is ever turned ON, **the break
clock must start when the label sheet is dismissed**, never at 00:00.

### What is and is not recorded

- **Aborted blocks are saved**, with `status = "aborted"` and the real elapsed time.
  Time spent is time spent.
- **Breaks carry no label** (decision G-2) — the label sheet follows focus blocks only.
- **A skipped break is not recorded at all** — the state is discarded, not saved.

### Browser state

| `localStorage` key | Holds |
| --- | --- |
| `token` | JWT bearer token |
| `tempo_clock` | the in-progress `TimerState` — a refresh mid-block recovers it |
| `tempo_cycle` | `{ completed, pendingBreak }` cycle position |
| `tempo_block_queue` | blocks waiting to sync |
| `tempo_has_completed_block` | first-block flag, used by the alert logic |
| `tempo_last_user` | id of the account that last signed in on this browser |

`deserializeState` validates the persisted shape field by field and returns `null` on
anything corrupt or stale, so a bad value can never produce a `TimerState` whose
`elapsed()` is `NaN`. The caller clears the key.

**One browser, several accounts.** `localStorage` belongs to the origin, not to the
session, so everything above outlives a sign-out. Signing out clears `token` and every
`tempo_*` key — by prefix, so no shared code needs to know the timer's key names and the
sweep survives either module being deleted. Signing **in** repeats the sweep whenever
the new user id differs from `tempo_last_user`, which is the guard that actually holds:
an expired session leaves state behind without anyone pressing sign out. If the offline
queue is non-empty, both paths are data loss, so the user is warned and offered a sync
first rather than having blocks vanish.

### The offline queue

`lib/api/queue.ts` is write-behind and always queues first, so a save never rejects into
the timer's path and never interrupts a running block.

- Blocks carry a **client-generated UUID**, so re-POSTing a queued block is idempotent:
  `create_block` returns the existing row (and 403 `BLOCK_OWNED_BY_OTHER` if it belongs
  to someone else). Same id enqueued twice replaces its copy — last write wins.
- Flush triggers: mount (`QueueSync`), the `online` event, and a 30 s interval while
  anything is pending.
- 401/403 stops the flush and fires `onReauthNeeded`; other 4xx is permanent rejection,
  so the payload is **dropped** rather than poisoning the queue forever; 5xx and
  offline keep the remainder queued.
- A drop is data loss, so it is surfaced in the UI ("N blocks could not be saved") via
  `onBlocksDropped` — never silent.

---

## 6. The plan

A dated weekly calendar, and nothing more.

**Repeats are a flag, not a recurrence engine.** `repeat_weekly` is a boolean on the
entry; occurrences are expanded **at read time** in
`plan/service.py::list_occurrences` by stepping `+7 days` from the anchor date, which
preserves the weekday without any DST reasoning. Nothing is materialized, so there is no
second source of truth to keep consistent. RRULE semantics are explicitly never coming.

The occurrence query pushes its filter into SQL — entries dated within range, plus
earlier repeaters — so `ix_entry_user_id_date` does its job instead of the service
reading the whole table. Tag colors ride along on each occurrence so views never need a
second round trip. Ranges are capped at 366 days (`RANGE_TOO_LARGE`), because repeats
expand with the range.

Timed vs all-day is server-enforced on write: an all-day entry may carry no times
(`ALL_DAY_HAS_TIMES`), and a timed entry needs both (`TIMES_REQUIRED`). The frontend
mirrors that as a discriminated union (`TimedOccurrence | AllDayOccurrence`), so views
never assert around the invariant.

`lib/plan/layout.ts` does the day-timeline geometry: the rail defaults to 07:00–22:00
but **expands** to include any entry outside it rather than clamping — clamping would
render a time the user never entered. Overlapping entries get side-by-side lanes.

---

## 7. Request lifecycle

1. **CORS** — an explicit origin allowlist. `allow_credentials=False`, which is safe
   precisely because the token is an `Authorization` header, never a cookie. Do not move
   the token into a cookie.
2. **Error monitoring middleware** — takes or generates a `request_id`, echoes it as
   `X-Request-ID` on every response, and logs one JSON line per unhandled exception with
   the traceback. The client gets `{"code": "INTERNAL_ERROR", ...}` and never a
   traceback.
3. **Auth dependency** — `HTTPBearer` → `decode_access_token` → user lookup by id →
   password-generation check. Bad or expired token yields 401 `INVALID_TOKEN`; a token
   whose `pwd` claim no longer matches the account's `password_changed_at` yields 401
   `TOKEN_REVOKED`. Tokens are HS256 and last 7 days. The subject is the user id, not
   the email, so identity does not ride on a mutable field.
4. **Router** stays thin: parse, delegate to `service.py`, commit, serialize.
5. **HTTPException handler** normalizes everything to
   `{"code": ..., "message": ...}` — a `detail` dict with its own `code` passes through,
   anything else becomes `{"code": "ERROR"}`.

Rate limiting (`core/ratelimit.py`) is an in-memory sliding window keyed by
`path:client_ip`, applied to every `/auth` endpoint. Keyed per endpoint so register
attempts cannot lock out login; `X-Forwarded-For` is trusted because nginx is always the
socket peer. In-memory by design — one VPS, one process; Redis would be a dependency for
no benefit. The three endpoints that send mail (`register`, `resend-verification`,
`forgot-password`) carry a second, tighter key on the **email address**, because an
attacker rotating IPs to mailbomb one victim is the abuse that per-IP limiting does not
see.

Authentication is hand-rolled on purpose: bcrypt + python-jose, no auth framework.

**Outbound email** (`core/email.py`) is one authenticated `httpx` POST to Resend, fired
from a FastAPI `BackgroundTask` so a slow provider never delays a response. A send
failure is logged and swallowed — registration has already succeeded, and the recovery
path is the resend endpoint, not a 500. With `RESEND_API_KEY` empty the sender logs the
link instead of transmitting it, which is how development and CI run: no test may reach
the network, and `conftest.py` asserts the key is unset.

**Tenancy.** Two rules keep accounts apart beyond the per-user `WHERE` clause on every
query. A `tag_id` supplied by a client is verified to belong to the caller before it is
stored on a block or an entry, and any query that resolves tags for display filters by
`user_id` — otherwise a foreign id, once stored, would surface another account's tag
name and color in a summary.

---

## 8. Frontend structure

```
app/
  (app)/                 authenticated shell (AppShell: sidebar, tab bar, QueueSync)
    page.tsx             SCR-11  timer
    history/             SCR-20  history
    (plan)/plan/         SCR-31  week
    (plan)/plan/day/     SCR-31  day timeline
    settings/            SCR-40
  login/                 renders bare — outside the shell
components/
  shared/  timer/  plan/
lib/
  api/     client, queue, per-resource modules
  timer/   engine.ts — the state machine
  plan/    view.ts (URL → view), hooks.ts, layout.ts
  date/    instant.ts (blocks), week.ts (entries)
  alerts/  plan.ts (pure) + runtime.ts (browser effects)
```

Conventions that carry design intent:

- **Server Components by default**; `"use client"` only where interactivity demands it.
- **Mobile-first.** Bottom tab bar (`Timer · History · Plan`) on phones, with Settings
  behind the header gear; a persistent sidebar plus a two-pane history on desktop.
- **The shell knows no feature module.** It navigates by `href`, which is what lets
  either module be deleted.
- **Plan view state lives in the URL** (`?week=`, `?date=`, `?sheet=`, `?tick=`), parsed
  by the pure `readPlanView` — so the sheet is linkable and the parser is testable
  without `next/navigation`.
- **Alerts split pure from impure**: `planAlert()` decides which channels fire; only
  `fireAlert()` touches the browser, and each channel fails independently without
  throwing.
- Tag colors are the only saturated color. Secondary actions during a running block
  (Pause, Stop, Skip) are deliberately low-contrast — during focus, the correct
  interaction is none.

---

## 9. What is deliberately absent

No task manager features. No recurrence engine. No week/month history views, charts,
manual block entry, or export. No `is_premium` conditionals — anything sold would be a
separate module in a separate private repo, never a flag threaded through core. No auth
framework, and no dependency added without asking.

Multi-user does not mean multi-tenant features: no sharing, no teams, no visibility of
one account from another, no admin surface, and no per-user quotas (an accepted risk,
decision G-6). There is no instance switch to close registration either — a private
deployment is fenced at nginx, not with a flag in application code.

Phase 3 (timer↔plan integration) requires renegotiating invariants 12 and 13 **in
writing, up front** — not one feature at a time.
