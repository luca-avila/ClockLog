# API reference

Base URL: `http://localhost:8000` in development. Interactive docs at `/docs`
(OpenAPI JSON at `/openapi.json`) — this page is the prose version, with the parts the
schema cannot tell you.

**Every endpoint requires `Authorization: Bearer <token>`** except `/health` and the
unauthenticated half of `/auth`: `register`, `verify-email`, `resend-verification`,
`login`, `forgot-password`, `reset-password`.

All routers mount at the app root:

| Prefix | Module |
| --- | --- |
| `/auth` | `app/shared/user` |
| `/tags` | `app/shared/tag` |
| `/settings` | `app/shared/setting` |
| `/blocks` | `app/timer` |
| `/plan/entries` | `app/plan` |

---

## Conventions

**Casing.** Blocks, tags, and entries use `snake_case` field names. **Settings are the
one exception** and use `camelCase` (`focusDuration`, `autoStartBreaks`, …) on both
request and response.

**Time.** `/blocks` speaks **UTC instants**; naive datetimes are rejected. `/plan/entries`
speaks **dates** (`YYYY-MM-DD`) and wall-clock times (`HH:MM:SS`) — deliberately, because
an entry is calendar data, not a recorded event. Do not copy plan-style date parameters
into a history endpoint. See [architecture.md § 4](architecture.md#4-time-the-one-rule-with-two-halves).

**PATCH semantics.** An omitted key is left untouched; an explicit `null` clears a
nullable field. Unknown keys are rejected (`extra="forbid"`) on `PATCH /blocks/{id}` and
on the plan endpoints — an unknown key is a client bug, not something to drop silently.
Fields backing NOT NULL columns (`started_at`, `status`) cannot be set to `null`.

**Errors.** Every error is JSON with a stable `code`. Branch on `code`, never on the
message text:

```json
{ "code": "TAG_NOT_FOUND", "message": "Tag not found" }
```

Unhandled server errors add a `request_id`, and every response carries `X-Request-ID`.

---

## Health

### `GET /health`

No auth. → `200 {"status": "ok"}`

---

## Auth

Registration is open. The flow is: register → receive a link by email → verify → sign
in. **No token is issued before the address is verified.**

### `POST /auth/register` → `201`

```json
{ "email": "you@example.com", "password": "at-least-8-chars" }
```

Response: `{ "id", "email", "created_at", "email_verified": false }`. Creates the
account and mails a verification link; it does **not** return a token, because the
account cannot sign in yet.

- `409 EMAIL_EXISTS` — the address is already registered. Deliberately not disguised:
  the sign-up form has to be able to say so. The rate limit is what keeps it from being
  a bulk enumeration oracle.
- `429 RATE_LIMITED` — limited per IP **and** per email address, under the tighter
  `AUTH_EMAIL_RATE_LIMIT` window. `422` on a bad email, a password under 8 characters,
  or one over 72 bytes (bcrypt truncates past that, so it is rejected rather than
  silently cut).

### `POST /auth/verify-email` → `200`

```json
{ "token": "<from the emailed link>" }
```

→ `{ "access_token": "<jwt>", "token_type": "bearer" }`. Verifying signs you in, so the
link lands the user in the app rather than back at a form. The token is single-use and
expires 24 hours after it was issued.

- `400 INVALID_VERIFICATION_TOKEN` — unknown, already used, or expired. One code for
  all three: which one it was is not the client's business, and the recovery is the same
  (request a new link).

### `POST /auth/resend-verification` → `204`

```json
{ "email": "you@example.com" }
```

Always `204`, whether or not the address exists or is already verified — the endpoint
reveals nothing. Any previously issued verification token for that account stops
working.

- `429 RATE_LIMITED` — limited per IP **and** per email address, under the tighter
  `AUTH_EMAIL_RATE_LIMIT` window.

### `POST /auth/login` → `200`

```json
{ "email": "you@example.com", "password": "…" }
```

→ `{ "access_token": "<jwt>", "token_type": "bearer" }`. HS256, valid 7 days. The
subject is the **user id**, and a `pwd` claim pins the token to the account's current
password generation.

- `401 INVALID_CREDENTIALS` — same response whether the email is unknown or the
  password is wrong, and it takes the same time either way: an unknown email is still
  checked against a dummy hash so the response cannot be used to probe for accounts.
- `403 EMAIL_NOT_VERIFIED` — the credentials are correct but the address is
  unconfirmed. Branch on this to offer "resend the link"; the body carries no token.
- `429 RATE_LIMITED` — per-IP sliding window (`LOGIN_RATE_LIMIT` per
  `LOGIN_RATE_WINDOW_SECONDS`), with a `Retry-After` header. Every auth endpoint is
  limited under its own key, so failed registrations cannot lock you out of login.

### `POST /auth/forgot-password` → `204`

```json
{ "email": "you@example.com" }
```

Always `204`. If the address has an account, a reset link valid for **1 hour** is
mailed and any earlier reset link for that account stops working.

- `429 RATE_LIMITED` — per IP and per email, tighter window.

### `POST /auth/reset-password` → `204`

```json
{ "token": "<from the emailed link>", "password": "the-new-one" }
```

Sets the password, consumes the token, and **revokes every session on the account** —
including whoever prompted the reset. The client must send the user back to sign in.
An unverified address is marked verified here, since receiving the mail proves the same
thing.

- `400 INVALID_RESET_TOKEN` — unknown, already used, or expired.
- `422` on a password failing the same rules as registration.

### `GET /auth/me` → `200`

`{ "id", "email", "created_at", "email_verified" }`. `401 INVALID_TOKEN` if the token is
bad, expired, or malformed; `401 USER_NOT_FOUND` if it names a user that no longer
exists; `401 TOKEN_REVOKED` if the password changed after the token was issued.

---

## Tags

Shared by both modules — the timer and the plan use the same tag table (decision G-4).
Tags are per-account. A `tag_id` written onto a block or an entry must belong to the
caller; one that does not is `404 TAG_NOT_FOUND`, the same answer as a tag that does not
exist, so the endpoint cannot be used to probe another account's ids.

### `GET /tags` → `200`

```json
[{ "id": "…", "user_id": "…", "name": "Deep work", "color": "#3B82F6", "created_at": "…" }]
```

### `POST /tags` → `201`

`{ "name": "Deep work", "color": "#3B82F6" }` — `color` must match `^#[0-9A-Fa-f]{6}$`,
`name` is 1–100 characters and unique per user.
`409 TAG_EXISTS`.

### `PATCH /tags/{tag_id}` → `200`

`{ "name"?, "color"? }`. `404 TAG_NOT_FOUND`.

### `DELETE /tags/{tag_id}` → `200`

```json
{ "affected": 12 }
```

**Deleting a tag never deletes blocks or entries** — they become untagged. `affected` is
how many rows across *all* tag-carrying tables just lost their tag, so the UI can warn
before the click. `404 TAG_NOT_FOUND`.

---

## Settings

One row per user, created on first read. `camelCase`, as noted above.

### `GET /settings` → `200`

```json
{
  "focusDuration": 25,
  "shortBreakDuration": 5,
  "longBreakDuration": 15,
  "blocksPerCycle": 4,
  "autoStartBreaks": false,
  "autoStartNext": false,
  "sound": true,
  "notifications": true
}
```

Durations are **minutes** and must be ≥ 1.

### `PUT /settings` → `200`

Partial body; omitted and `null` fields are left alone. Returns the full settings object.

> `autoStartBreaks` defaults to `false` for a correctness reason, not a taste one — see
> [architecture.md § 5](architecture.md#5-the-timer).

---

## Blocks (timer)

A block is one recorded timer run. It carries a **client-generated UUID**, so POSTing the
same block twice is idempotent — that is what makes the offline queue safe.

Duration is never stored: it is the sum of each interval's closed span, so paused time is
excluded.

### `GET /blocks?from=<instant>&to=<instant>` → `200`

`from` inclusive, `to` exclusive, matched against `started_at`, ordered ascending.
Both must be **timezone-aware** — the client computes them from its own local day
boundaries.

```json
[{
  "id": "…", "user_id": "…",
  "status": "completed",
  "kind": "focus",
  "label": "Write the API docs",
  "tag_id": "…",
  "started_at": "2026-08-20T09:00:00Z",
  "intervals": [
    { "id": "…", "started_at": "2026-08-20T09:00:00Z", "ended_at": "2026-08-20T09:12:00Z" },
    { "id": "…", "started_at": "2026-08-20T09:15:00Z", "ended_at": "2026-08-20T09:28:00Z" }
  ]
}]
```

- `422 NAIVE_DATETIME` — `from`/`to` lacked an offset.
- `422 INVALID_RANGE` — `from` after `to`.

### `GET /blocks/summary?from=&to=` → `200`

Per-tag totals for the range. **Focus blocks only** — "4h 10m focus" must not include
break time.

```json
[{ "tag_id": null, "tag_name": "Untagged", "tag_color": null,
   "total_seconds": 5400.0, "block_count": 3 }]
```

Untagged blocks aggregate into one row named `"Untagged"`.

### `GET /blocks/recent-labels` → `200`

`["Write the API docs", "Inbox"]` — up to 5 distinct recent focus-block labels, newest
first, for the label sheet's autocomplete. Breaks and empty labels are excluded.

### `POST /blocks` → `201`

One POST per block, on completion or abort — never per tick. The request carries the
block's **segments**, not a wall-to-wall envelope: a paused gap is simply absent from
`intervals`, so the server derives duration without ever being told a duration.

```json
{
  "id": "<uuid generated by the client>",
  "status": "completed",
  "kind": "focus",
  "label": "Write the API docs",
  "tag_id": null,
  "intervals": [
    { "started_at": "2026-08-20T09:00:00Z", "ended_at": "2026-08-20T09:12:00Z" },
    { "started_at": "2026-08-20T09:22:00Z", "ended_at": "2026-08-20T09:28:00Z" }
  ]
}
```

- `intervals` is required and non-empty; every interval is closed (`ended_at` present)
  and timezone-aware. The ten-minute gap above (09:12 → 09:22) is a pause, so this
  block records 16 minutes of work, not 28.
- No top-level `started_at`/`ended_at` on the wire. The server derives the block's
  `started_at` from `intervals[0]` — the instant history filters and day-buckets on
  (invariant 7). Legacy envelope-only payloads are rejected, never silently collapsed
  into one wall-to-wall interval.
- `kind` defaults to `"focus"`.
- **Idempotent:** an id that already exists returns the stored block unchanged (still
  `201`), even when the retried body's intervals differ — the first write wins, which
  is what makes the offline queue safe.
- `422 INVALID_INTERVAL` — the whole interval contract: `intervals` missing or empty,
  an open (`ended_at: null`) or naive interval, a zero-length or inverted interval, or
  intervals that overlap or arrive out of order. Form errors on those fields are
  re-labelled from FastAPI's generic `422` (see § Error codes), so a client can always
  branch on `code`.
- `403 BLOCK_OWNED_BY_OTHER` — that id belongs to another user.
- **Aborted blocks are saved too**, with `status: "aborted"` and their real elapsed
  time (invariant 9).

### `PATCH /blocks/{block_id}` → `200`

Post-hoc editing (SCR-21): `label`, `tag_id`, `status`, `started_at`, `ended_at`.
Interval lists are **not** editable — `intervals` is rejected like any unknown key
(`422`).

- `label`, `tag_id`, `ended_at` accept `null` to clear.
- `started_at` and `status` cannot be cleared (`422`).
- Times are envelope edits: `started_at` moves the first interval's start **and**
  `block.started_at` (so day bucketing stays correct); `ended_at` moves the last
  interval's end. Pause gaps inside are never rewritten.
- `422 INVALID_INTERVAL` — the edit collapses a segment to zero length
  (`end == start`), inverts one (its end would precede its start), or makes intervals
  overlap. Editing applies the same `end > start` rule as POST, so a PATCH can never
  persist a block that create would reject. `intervals` in the body, a naive time, or
  `started_at: null` hit the same code.
- `400 NO_INTERVALS`, `404 BLOCK_NOT_FOUND`.

### `DELETE /blocks/{block_id}` → `204`

Intervals cascade. `404 BLOCK_NOT_FOUND`.

---

## Plan entries

An entry belongs to a **date**, never a weekday. All-day entries live on a single date;
multi-day spans cannot be expressed.

### `POST /plan/entries` → `201`

```json
{
  "name": "Gym",
  "date": "2026-08-20",
  "all_day": false,
  "start_time": "18:00:00",
  "end_time": "19:30:00",
  "tag_id": null,
  "repeat_weekly": true
}
```

- `422 ALL_DAY_HAS_TIMES` — an all-day entry may not carry times.
- `422 TIMES_REQUIRED` — a timed entry needs **both** times.
- An `end_time` earlier than `start_time` spans midnight and stays on the starting date.
- Unknown keys are rejected.

### `GET /plan/entries?from=<date>&to=<date>` → `200`

Both bounds **inclusive**. Returns **occurrences**, not stored rows: each stored entry in
range, plus a copy on every `+7 day` step of each `repeat_weekly` entry whose anchor is on
or before `to`. Sorted by `(date, start_time)`, all-day first.

```json
[{
  "entry_id": "…", "name": "Gym", "date": "2026-08-27",
  "all_day": false, "start_time": "18:00:00", "end_time": "19:30:00",
  "tag_id": "…", "tag_color": "#10B981", "repeat_weekly": true
}]
```

`entry_id` — not `id` — because several occurrences share one stored entry; edit it by
that id. `tag_color` rides along so views need no second request.

- `422 INVALID_RANGE` — `from` after `to`.
- `422 RANGE_TOO_LARGE` — more than 366 days. Repeats expand at read time, so the range
  is capped.

### `GET /plan/entries/{entry_id}` → `200`

The **stored row** (what the editor edits), not an occurrence: adds `id`, `user_id`, and
`created_at`, and its `date` is the anchor date. `404 ENTRY_NOT_FOUND`.

### `PATCH /plan/entries/{entry_id}` → `200`

Any subset of the create fields. The timed/all-day rules are re-validated against the
merged result, so clearing times and setting `all_day: true` in one request is fine.
Editing the entry changes **every** occurrence — there is no per-occurrence override, by
design.

### `DELETE /plan/entries/{entry_id}` → `204`

Deletes the entry and therefore all its occurrences. `404 ENTRY_NOT_FOUND`.

---

## Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `EMAIL_EXISTS` | 409 | Email already registered |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `EMAIL_NOT_VERIFIED` | 403 | Correct credentials, unconfirmed address |
| `INVALID_VERIFICATION_TOKEN` | 400 | Verification link unknown, used, or expired |
| `INVALID_RESET_TOKEN` | 400 | Reset link unknown, used, or expired |
| `INVALID_TOKEN` | 401 | Missing, malformed, expired, or subject-less token |
| `TOKEN_REVOKED` | 401 | Password changed after this token was issued |
| `USER_NOT_FOUND` | 401 | Token names a user that no longer exists |
| `RATE_LIMITED` | 429 | Too many auth attempts; see `Retry-After` |
| `TAG_EXISTS` | 409 | Duplicate tag name for this user |
| `TAG_NOT_FOUND` | 404 | Also returned when a block or entry is written with a `tag_id` that is not the caller's |
| `BLOCK_NOT_FOUND` | 404 | |
| `BLOCK_OWNED_BY_OTHER` | 403 | Client-generated id collides with another user's block |
| `NO_INTERVALS` | 400 | Time edit on a block with no interval rows |
| `INVALID_INTERVAL` | 422 | The interval contract on `/blocks`: missing/empty/open/naive/zero-length/inverted/overlapping intervals on create, or a time edit that zero-lengths, inverts or overlaps a segment |
| `NAIVE_DATETIME` | 422 | `from`/`to` not timezone-aware |
| `INVALID_RANGE` | 422 | `from` after `to` |
| `RANGE_TOO_LARGE` | 422 | Plan range over 366 days |
| `ENTRY_NOT_FOUND` | 404 | |
| `ALL_DAY_HAS_TIMES` | 422 | All-day entry carrying times |
| `TIMES_REQUIRED` | 422 | Timed entry missing a time |
| `ERROR` | any | Fallback for an exception raised without a structured detail |
| `INTERNAL_ERROR` | 500 | Unhandled exception; carries `request_id` |

Pydantic validation failures return FastAPI's own `422` body, which has no `code` field.
One exception: on `/blocks` a body error naming `intervals`, `started_at` or `ended_at`
is normalized to `422 INVALID_INTERVAL`, so that contract is branchable end to end.

---

## Quick session

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"…"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/tags
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/blocks?from=2026-08-20T00:00:00Z&to=2026-08-21T00:00:00Z"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/plan/entries?from=2026-08-17&to=2026-08-23"
```
