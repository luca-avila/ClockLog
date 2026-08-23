# Implementation plan — open registration (G-6)

**Transient document.** Delete it when the change lands and the *ahead of the code*
flags come out of `docs/README.md`.

The decision is closed: see `docs/DECISIONS.md` § G-6 and its detail section. Nothing
here is open for renegotiation — if a step looks wrong, say so before implementing it,
do not resolve it in the code.

---

## What is being built

Tempo stops being a single-account app. Anyone may register; an address is verified
before its account can sign in; a forgotten password is recovered by email; and a
password change revokes every live session on that account.

Three cross-tenant defects that were inert under one user are fixed in the same change,
because open registration is what makes them exploitable.

**Explicitly not in this change**

- Per-user quotas or storage limits — decided against (G-6).
- Any flag to close registration.
- Change-password-while-signed-in (`PATCH /auth/me`) and account deletion
  (`DELETE /auth/me`). Both are sensible follow-ups; neither is required for open
  registration to be correct, and account deletion in particular deserves its own think
  about backups. **Ask before adding either.**
- Anything touching `timer/` ↔ `plan/` independence. Invariants 11–14 are untouched.

---

## Ground rules

- Read `AGENTS.md` first. Every convention there still applies — thin routers, service
  layer, Pydantic schemas, structured error codes, license headers, mobile-first
  frontend, `PrimaryButton` for every committing action, neutral palette.
- **No new packages.** Resend is reached with `httpx`. See step 2.
- All auth work lands in `app/shared/user/` and `app/core/`. Neither feature module
  gains auth code.
- Run `./scripts/ci.sh` before declaring any step done.
- Commit per step, Conventional Commits, screen ID where UI is involved.

---

## Step 0 — Preconditions (outside the codebase)

Do these first; step 2 cannot be verified end to end without them, though every other
step can proceed with `RESEND_API_KEY` empty.

1. Create a Resend account and add the sending domain.
2. Publish the SPF and DKIM records Resend gives you, and wait for verification.
3. Record the API key for the production `.env` only. It never enters the repo, dev, or
   CI.

Skipping domain verification does not fail loudly — mail simply lands in spam.

---

## Step 1 — Config surface

**Files:** `backend/app/core/config.py`, `.env.example` (already updated),
`docker-compose.yml`

Add to `Settings`:

| Field | Default | Notes |
| --- | --- | --- |
| `resend_api_key` | `""` | Empty means "log the link, send nothing" |
| `email_from` | `"Tempo <no-reply@localhost>"` | |
| `app_base_url` | `"http://localhost:3000"` | Frontend origin; links are built from it |
| `auth_email_rate_limit` | `3` | |
| `auth_email_rate_window_seconds` | `3600` | |
| `verification_token_ttl_hours` | `24` | |
| `reset_token_ttl_hours` | `1` | |

`docker-compose.yml` hard-codes dev values as it does for everything else; leave
`RESEND_API_KEY` unset there on purpose.

**Done when:** the backend boots with no new env vars set.

---

## Step 2 — The email sender

**Files:** `backend/app/core/email.py` (new), `backend/pyproject.toml`

`httpx` is currently pulled in transitively by `fastapi[standard]` and named only in the
`dev` extra. Promote it to an explicit runtime dependency — relying on another package's
extra for a production code path is how it silently disappears on an upgrade. Update the
`backend/Dockerfile` comment that says the dev stage is where httpx comes from.

```python
async def send_email(to: str, subject: str, html: str) -> None
```

- POST `https://api.resend.com/emails` with `Authorization: Bearer <key>`, body
  `{from, to, subject, html}`, an explicit timeout (10 s is generous).
- **If `resend_api_key` is empty: log the subject and body at INFO and return.** This is
  the dev and CI path. It must be the first branch in the function, before any network
  object is constructed.
- Raise nothing at the call site's expense — see step 5 on background sending. Log
  failures with the message `email send failed` (the runbook greps for it) and the
  Resend response body.
- Two thin helpers on top: `send_verification_email(to, link)` and
  `send_reset_email(to, link)`, each building its link from `app_base_url` and holding
  the copy. Keep the copy plain and literal, in the app's voice — no marketing, no
  fabricated urgency.

**Done when:** with the key unset, calling the sender logs a link and performs no I/O; a
unit test asserts exactly that.

---

## Step 3 — Data model and migration

**Files:** `backend/app/shared/user/models.py`, `backend/alembic/versions/<new>.py`

`user` gains:

- `email_verified_at: datetime | None` — tz-aware, nullable.
- `password_changed_at: datetime` — tz-aware, NOT NULL, defaulted to now on insert.

New table `email_token`:

| Column | Type |
| --- | --- |
| `id` | UUID pk |
| `user_id` | FK `user.id` ON DELETE CASCADE, indexed |
| `token_hash` | String(64), unique, indexed — SHA-256 hex of the raw token |
| `purpose` | String — `verify` \| `reset` |
| `expires_at` | tz-aware, NOT NULL |
| `used_at` | tz-aware, nullable |
| `created_at` | tz-aware, NOT NULL |

The raw token is never stored. It exists in the email and nowhere else.

**The migration must backfill.** Autogenerate will not do this and getting it wrong
locks the existing owner out of their own instance:

- `password_changed_at` — `server_default=sa.func.now()` for the NOT NULL add. Decide
  deliberately whether to drop the server default afterwards; keeping it is harmless and
  simpler.
- `email_verified_at = created_at` **for every existing row.** Every account that exists
  today predates verification and must not be gated by it.

Write the `downgrade()` and check it actually reverses. Review the autogenerated file by
hand — see `AGENTS.md` § Migrations for what autogenerate misses.

**Done when:** `alembic upgrade head` then `downgrade -1` then `upgrade head` is clean
on a database with an existing user, and that user can still sign in afterwards.

---

## Step 4 — Tokens and JWT

**Files:** `backend/app/core/security.py`, `backend/app/shared/user/service.py`

**JWT changes** (`core/security.py`):

- `create_access_token` takes the user and emits `sub = str(user.id)` plus
  `pwd = int(user.password_changed_at.timestamp())`.
- Keep HS256 and the 7-day expiry. Revocation now exists, which is what the short
  expiry was standing in for.
- Nothing else about `SECRET_KEY` or the algorithm changes.

**The auth dependency** (`shared/user/api.py` → service): decode, parse `sub` as a UUID,
look the user up by id, then compare `pwd` against the stored `password_changed_at`
truncated to whole seconds. Mismatch → `401 TOKEN_REVOKED`. An unparseable `sub` →
`401 INVALID_TOKEN` (this is also what every currently issued email-subject token
becomes; that is fine, it logs the one existing user out once).

Compare truncated to seconds on both sides. A `pwd` claim built from a microsecond
timestamp will not round-trip through a JWT integer claim, and the resulting bug is a
user who is logged out on every request.

**Email tokens** (`shared/user/service.py`):

- `issue_token(db, user, purpose) -> str` — `secrets.token_urlsafe(32)`, store its
  SHA-256 hex, set `expires_at` from the purpose's TTL, and **invalidate the account's
  outstanding tokens of that purpose** first, so a resent link cannot be raced by an
  older one.
- `consume_token(db, raw, purpose) -> User` — look up by digest, reject unknown, wrong
  purpose, expired, or already used, all with the same error. Mark `used_at` on success.
  One code per flow (`INVALID_VERIFICATION_TOKEN`, `INVALID_RESET_TOKEN`); do not tell
  the client which of the four conditions it hit.

---

## Step 5 — Auth endpoints

**Files:** `backend/app/shared/user/api.py`, `schemas.py`, `service.py`

Delete the `user_count` gate and the `REGISTRATION_CLOSED` code. Delete `user_count`
itself — nothing else calls it.

| Endpoint | Behaviour |
| --- | --- |
| `POST /register` → 201 | Create unverified, issue a `verify` token, mail it in a background task. Returns the user, **no access token**. `409 EMAIL_EXISTS` stays. |
| `POST /verify-email` → 200 | Consume the token, set `email_verified_at`, return an access token — verifying signs you in. |
| `POST /resend-verification` → 204 | Always 204. Issue and mail only if the account exists and is unverified. |
| `POST /login` → 200 | `403 EMAIL_NOT_VERIFIED` when credentials are right but the address is not. |
| `POST /forgot-password` → 204 | Always 204. Issue and mail a `reset` token only if the account exists. |
| `POST /reset-password` → 204 | Consume the token, set the new hash, **move `password_changed_at`**, and set `email_verified_at` if it was null. |
| `GET /me` → 200 | Adds `email_verified: bool` to the response. |

Details that are easy to get wrong:

- **Flat login timing.** When the email is unknown, still run `verify_password` against
  a module-level dummy bcrypt hash. Skipping the hash makes response time an account
  oracle, and that is the whole reason `INVALID_CREDENTIALS` is deliberately vague.
- **Send in a `BackgroundTask`.** A slow provider must not delay the response, and a
  failed send must not fail a registration that already committed. Log and move on; the
  user's recovery is the resend endpoint.
- **Rate limiting.** Every `/auth` endpoint keeps a per-IP key. The three mail-senders
  add a second key on the **normalised email address** under
  `AUTH_EMAIL_RATE_LIMIT` — per-IP alone does not see an attacker rotating IPs to
  mailbomb one victim. `ratelimit.check` takes an arbitrary key, so this is two calls,
  not new machinery.
- **Password rules.** Keep `min_length=8`; add a max of 72 **bytes**. bcrypt silently
  truncates past that, and silently ignoring half a password is worse than rejecting it.
  Apply the same rule to `reset-password`.
- Normalise the email (strip, lowercase) at one point, and use the same normalisation
  for lookup, storage, and the rate-limit key.

---

## Step 6 — Close the cross-tenant gaps

These are the defects that only bite once there are two accounts. Do not defer them.

1. **`tag_id` is not trusted** — `backend/app/timer/service.py` (`create_block`,
   `update_block`) and `backend/app/plan/service.py` (`create_entry`, `update_entry`).
   A non-null `tag_id` must be verified to belong to `user_id` before it is stored.
   Reject with `404 TAG_NOT_FOUND` — the same answer as a nonexistent tag, so the
   endpoint cannot be used to probe another account's ids. Both modules may import
   `shared/tag` (invariant 11 permits it, and both already do).
2. **The summary leaks tags** — `backend/app/timer/service.py`, the
   `select(Tag).where(Tag.id.in_(tag_ids))` in `get_summary_by_tag` has no `user_id`
   filter. Add it. With (1) in place this is belt-and-braces; keep both.
3. **Audit for a third case.** Grep for every `select(` in the four `service.py` files
   and confirm each one is scoped by `user_id`. Two were missed the first time; assume a
   third.

---

## Step 7 — Frontend: session hygiene

**Files:** `frontend/lib/api/client.ts`, `frontend/lib/api/queue.ts`,
`frontend/app/(app)/settings/page.tsx`, `frontend/app/login/page.tsx`

`localStorage` belongs to the origin, not the session. Today sign-out removes `token`
and leaves `tempo_clock`, `tempo_cycle`, `tempo_block_queue` and
`tempo_has_completed_block` behind. The sharp edge is the offline queue: it will flush
one account's blocks under the next account's token.

- Add `clearSession()` to `frontend/lib/api/client.ts`: remove `token` and **every key
  beginning with `tempo_`**, by prefix. Do not enumerate the timer's key names —
  shared code must not know them (invariant 11) and the sweep has to survive either
  module being deleted.
- **The real guard is at sign-in, not sign-out.** Store `tempo_last_user` (the user id
  from `GET /auth/me`) on successful login. On the next successful login, if the id
  differs from the stored one, call `clearSession()` *before* writing the new token. An
  expired session leaves state behind with nobody pressing sign out, so sign-out
  clearing alone does not close the hole.
- **Warn before destroying unsynced work.** Both paths must check
  `readQueue().length > 0` and confirm with the user rather than silently dropping
  blocks. Losing recorded time is exactly the failure mode the offline queue exists to
  prevent.
- The existing 401 handler in `apiFetch` keeps doing what it does (drop the token,
  navigate to `/login`); the sign-in guard is what covers it.

---

## Step 8 — Frontend: the unauthenticated screens

All live outside the `(app)` route group and render bare, like `/login` does today.
Mobile-first, `PrimaryButton` for the committing action, neutral palette, honest copy.
Match `app/login/page.tsx` — it is the reference for every one of these.

| Route | ID | Notes |
| --- | --- | --- |
| `/login` | `SCR-02` | Add links to sign up and to recover. Handle `403 EMAIL_NOT_VERIFIED` with an inline "resend the link" action. |
| `/register` | `SCR-03` | On success, do **not** navigate into the app — show "check your inbox", with a resend action. |
| `/verify-email` | `SCR-04` | Reads `?token=`, POSTs it, stores the returned access token, lands in the app. Needs a real failure state: expired links are the common case, and the recovery from it is a resend form. |
| `/reset-password` | `SCR-05` | Reads `?token=`, takes the new password, then sends the user to `/login` — the reset revoked every session including this browser's. |
| `/forgot-password` | `SCR-05` | Always renders the same "if that address has an account, the link is on its way" confirmation. Never reveal whether it existed. |

Add the four new IDs to the screen table in `AGENTS.md` — already done; keep them
accurate if a route name changes.

`RESEND_API_KEY` is empty in dev, so the whole flow is exercised by pulling links out of
`docker compose logs backend`.

---

## Step 9 — Tests

**Delete:** `backend/tests/test_auth.py::test_registration_closes_once_a_user_exists`.
**Update:** `backend/tests/test_api_contract.py` for the new `/auth` surface and the
`email_verified` field.

New backend coverage, in rough priority order:

1. **Cross-account isolation** — the highest-value tests in this change, and they cannot
   exist today. With two users, A must get 404 (never 403-with-detail, never a body)
   for B's block, entry, tag and settings, on every verb. Include: A writing B's
   `tag_id` onto A's own block is rejected, and A's summary never names B's tag.
2. **Verification gate** — register → login is `403 EMAIL_NOT_VERIFIED` → verify →
   login works.
3. **Token lifecycle** — expired, already-used, wrong-purpose and unknown tokens all
   fail identically; issuing a new token invalidates the previous one.
4. **Session revocation** — a token minted before a reset is `401 TOKEN_REVOKED` after
   it.
5. **Non-enumeration** — `forgot-password` and `resend-verification` return 204 for
   unknown addresses.
6. **Rate limiting** — the per-email key trips independently of the per-IP one.
7. **The sender is never called for real.** Patch it in a fixture, and assert in
   `conftest.py` that `RESEND_API_KEY` is empty before the suite runs — the same
   posture as the `*_test` database assertion, and for the same reason.

Frontend (Vitest): `clearSession()` clears `token` and every `tempo_*` key and nothing
else; the differing-user sign-in path clears before storing; a non-empty queue prompts
instead of silently clearing. Skip exhaustive form tests — `AGENTS.md` § What to test
still applies.

---

## Step 10 — Land it

1. `./scripts/ci.sh` green, including `test_independence.py` and `test_deletability.py`.
2. Remove the *ahead of the code* banners from `docs/api.md`, `docs/architecture.md` and
   `docs/operations.md`, and reset the status column in `docs/README.md`.
3. Move G-6 out of "In progress" in `AGENTS.md` § Scope boundaries.
4. Delete this file.
5. Deploy: fill `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL` in `.env`, rebuild the
   frontend (`NEXT_PUBLIC_API_URL` is baked at build time and the new routes are new
   pages), and let the backend apply the migration on boot.
6. **Verify on production with a real address before announcing anything.** Register,
   receive, verify, sign in, forget, reset, sign in again. Dev never exercised the
   provider.

---

## Suggested commit sequence

```
feat(backend): add email sender and auth config              # steps 1–2
feat(backend): add verification and password-reset schema    # step 3
feat(auth): key tokens to user id and password generation    # step 4
feat(auth): open registration with verified addresses        # step 5
fix(backend): scope tag reads and writes to the caller       # step 6
fix(frontend): clear per-account browser state on sign-in    # step 7  SCR-02
feat(frontend): sign-up, verification and recovery screens   # step 8  SCR-03, SCR-04, SCR-05
test: cross-account isolation and the auth flows             # step 9
docs: retire the single-user model                           # step 10
```

Step 6 is independent of the rest and can land first if it is convenient — it is a fix
to shipped code, not a new feature.

---

## Risks worth naming

- **Deliverability is invisible in dev.** Every local and CI run logs instead of sending,
  so the first real proof the flow works is production. Step 10.6 is not optional.
- **The backfill in step 3.** A missed `email_verified_at` backfill locks the existing
  account out of its own instance, and the symptom — correct password, 403 — looks like
  a code bug rather than a migration one.
- **The `pwd` claim's precision.** Sub-second mismatch logs everyone out on every
  request. Truncate on both sides and test it.
- **Backups now hold other people's data.** Nothing in this change touches
  `infra/backup/`, but the dumps it produces stop being yours alone the day sign-ups
  open.
