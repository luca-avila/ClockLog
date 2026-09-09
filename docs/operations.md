# Operations runbook

Everything you do to ClockLog after the code is written: run it, migrate it, deploy it,
back it up, and diagnose it. One VPS, Docker Compose.

---

## Development

```bash
docker compose up -d              # backend + Postgres, migrations applied on boot
docker compose logs -f backend    # follow backend logs
cd frontend && npm run dev        # frontend on :3000, hot reload
```

`docker compose up` auto-loads `docker-compose.override.yml` (dev-only: `dev` stage,
`./backend` bind mount, local credentials, no prod sidecars), so the container
serves the checkout and Python edits reload without a rebuild. **Rebuild only when
`pyproject.toml` or the Dockerfile changes:**

```bash
docker compose up -d --build backend
```

The base `docker-compose.yml` is prod-safe and interpolates its required variables
from `.env` / the shell, so development also needs an env file. `cp .env.example
.env` works as-is: the override replaces the runtime values with local
clocklog/clocklog credentials and an empty runtime `RESEND_API_KEY`, so the
placeholders only have to exist for interpolation — including a non-secret
`RESEND_API_KEY` placeholder, which the base's `${RESEND_API_KEY:?}` requires but
the override empties at runtime. A missing required variable fails fast: `docker
compose config` exits non-zero with a `... requerida en .env` message.

Interpolation covers profile-excluded services too: `NEXT_PUBLIC_API_URL` must exist
in `.env` even though the frontend does not run in Compose in dev (it runs on the
host via `npm run dev`), and the `backup` sidecar only starts in prod. The GitHub
workflow injects the same values as step-level `env` because a runner has no `.env`.

Postgres is not published to the host — uncomment the `ports` block under `db` if you
need `psql` from outside.

### First run

Registration is open — sign up from the app at <http://localhost:3000>. An address must
be verified before it can sign in.

**In development no mail is sent.** The override leaves `RESEND_API_KEY` empty at
runtime in the container, so the sender writes the email content — including the
link — to the log instead:

```bash
docker compose logs backend | grep 'not sent, no RESEND_API_KEY'
```

Open that URL and you are verified and signed in. The same applies to password-reset
links. This is also how CI runs: no test may touch the network, and `conftest.py`
asserts the key is empty before the suite starts.

**Lost a password?** Use the app's own recovery flow — that is what it is for. The
manual override still exists for the case where mail delivery itself is broken:

```bash
docker compose exec backend python -c "
from app.core.security import get_password_hash; print(get_password_hash('new-password'))"
docker compose exec db psql -U clocklog -d clocklog \
  -c "UPDATE \"user\" SET hashed_password='<paste-hash>', password_changed_at=now() \
      WHERE email='you@example.com';"
```

Move `password_changed_at` in the same statement — it is what invalidates the account's
outstanding tokens. Skipping it leaves every old session valid, which defeats the point
if you are resetting because a token leaked.

**Verifying an address by hand**, if a provider is bouncing mail:

```bash
docker compose exec db psql -U clocklog -d clocklog \
  -c "UPDATE \"user\" SET email_verified_at=now() WHERE email='them@example.com';"
```

### Email delivery

Transactional mail goes through [Resend](https://resend.com) as a single authenticated
`httpx` POST — there is no SDK and no queue. Production needs three variables:

| Variable | Notes |
| --- | --- |
| `RESEND_API_KEY` | From the Resend dashboard. Required in `.env` (base `:?`); the dev/CI override empties it at runtime |
| `EMAIL_FROM` | Must be an address on a domain verified in Resend, e.g. `ClockLog <no-reply@example.com>` |
| `APP_BASE_URL` | Origin the links point at — the **frontend** origin, not the API |

Set up before the first real sign-up: verify the sending domain in Resend and publish
its SPF and DKIM records. Skipping this does not fail loudly — mail is simply delivered
to spam, and the symptom reaching you is "I never got the email".

Sends happen in a background task and failures are logged, never surfaced as a 500: a
registration that succeeded is not rolled back because a provider was slow. That makes
the log the only place a delivery problem shows up.

```bash
docker compose logs backend | grep -i 'email send failed'
```

The user-facing recovery for any lost mail is `resend-verification` or
`forgot-password` — both rate-limited per IP and per address.

---

## Migrations

**Always through Alembic. Never hand-written SQL against the database.**

```bash
docker compose exec backend alembic revision --autogenerate -m "add entry table"
docker compose exec backend alembic upgrade head
docker compose exec backend alembic downgrade -1     # roll back one
docker compose exec backend alembic current          # what is applied
docker compose exec backend alembic history          # the chain
```

**Review every autogenerated migration before committing it.** Autogenerate reliably
misses server defaults, index renames, and column type changes with data implications —
all three have bitten this repo. A PR that changes a model must include its migration.

The backend container runs `alembic upgrade head` before serving, in dev and in prod, so
deploys are unattended and a failed migration stops the boot rather than serving against
a stale schema.

---

## Tests and CI

```bash
./scripts/ci.sh                                       # everything CI runs
docker compose exec backend pytest                    # backend
docker compose exec backend pytest tests/timer/test_history.py
docker compose exec backend pytest -k aborted
cd frontend && npm run test                           # vitest
npx vitest run -t "recovers an in-progress block"     # one test by name
```

`.github/workflows/ci.yml` runs the same sequence on pushes and PRs to `main`: Compose
up, wait for the backend, then pytest, `ruff check`, `ruff format --check`, vitest,
eslint, `tsc --noEmit`.

### Test database safety

Backend tests `DELETE FROM` every table. They run against a **separate `clocklog_test`
database**, never the dev one. `TEST_DATABASE_URL` is set by `docker-compose.override.yml`;
if unset the backend derives it from `DATABASE_URL` by swapping in `clocklog_test`.

`tests/conftest.py` raises unless the resolved URL ends in `_test`. **That assertion is
the safety mechanism, not a formality — do not weaken it to make a test run.**

### Invariant tests

`test_independence.py` and `test_deletability.py` prove that `timer/` and `plan/` stay
mutually deletable. If one fails, the invariant broke: fix the code, not the test.

---

## Deployment

nginx and TLS (certbot) run on the VPS itself, outside Compose. Compose services bind to
`127.0.0.1` only and the reverse proxy fronts them.

```bash
# First time
cp .env.example .env      # then fill in every value
docker compose -f docker-compose.yml up -d --build

# Subsequent deploys
git pull
docker compose -f docker-compose.yml up -d --build
```

`docker-compose.yml` is the full prod stack: backend (prod stage, non-root),
Postgres, frontend and the backup sidecar, with `restart: unless-stopped`, capped
JSON-file logging (10 MB × 3), loopback-only ports and `${VAR:?}` fail-fast for
**every** required variable — `RESEND_API_KEY` included. Passing an explicit `-f`
means Compose does **not** auto-load the dev override, so prod is clean by
construction rather than by undoing dev values.

`docker-compose.prod.yml` still exists only for the legacy two-file command
(`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`).
It is a documentation shim: with a complete `.env`, the merged config is
byte-identical to the base (the diff is empty), because every gate now lives in
the base. New deploys use the single-file command above; the two-file form is kept
so scripts written before this handoff keep working with unchanged behavior.

### Verifying the fail-fast and a prod boot

The `:?` gates are reproducible without relying on the checkout's `.env`. To prove
each one, point Compose at an env file that has every required variable except the
one under test:

```bash
cp .env.example /tmp/prod-env-complete
sed -i 's/^RESEND_API_KEY=.*/RESEND_API_KEY=test-only-not-a-real-key/' /tmp/prod-env-complete
for v in SECRET_KEY DATABASE_URL CORS_ORIGINS EMAIL_FROM APP_BASE_URL \
         POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB NEXT_PUBLIC_API_URL \
         RESEND_API_KEY; do
  grep -v "^$v=" /tmp/prod-env-complete > "/tmp/prod-env-sin-$v"
  docker compose -f docker-compose.yml --env-file "/tmp/prod-env-sin-$v" \
    config >/dev/null 2>&1 \
    && echo "FALLO: $v no exigida" || echo "ok: $v exigida"
done
```

The legacy two-file command is equivalent, not stricter: with the key present both
commands render the same config, and without it both refuse to start.

```bash
docker compose -f docker-compose.yml --env-file /tmp/prod-env-complete \
  config > /tmp/p1.yml
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file /tmp/prod-env-complete config > /tmp/p2.yml
diff /tmp/p1.yml /tmp/p2.yml      # empty: prod.yml adds no structural delta
```

Smoke-boot prod in a throwaway project before a real deploy (it builds the prod-stage
images and starts all four services on loopback ports):

```bash
docker compose -f docker-compose.yml \
  --env-file /tmp/prod-env-complete -p clocklog-prodcheck up -d --build
curl -fsS http://localhost:8000/health
docker compose -p clocklog-prodcheck ps
docker compose -p clocklog-prodcheck down -v
```

### Generating the secret

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Rotating `SECRET_KEY` invalidates every issued token on every account — everyone signs
in again. It is the blunt instrument; revoking one account's sessions is a password
change, which moves `password_changed_at`.

### Environment variables

| Variable | Service | Notes |
| --- | --- | --- |
| `DATABASE_URL` | backend | `postgresql+asyncpg://…` |
| `SECRET_KEY` | backend | JWT signing key; generate as above |
| `CORS_ORIGINS` | backend | Comma-separated allowlist. Credentials are off, so this is an explicit allow |
| `LOGIN_RATE_LIMIT` / `LOGIN_RATE_WINDOW_SECONDS` | backend | Per-IP sliding window on the credential endpoints (defaults 10 / 60) |
| `AUTH_EMAIL_RATE_LIMIT` / `AUTH_EMAIL_RATE_WINDOW_SECONDS` | backend | Tighter window on endpoints that send mail, keyed per IP **and** per address (defaults 3 / 3600) |
| `RESEND_API_KEY` | backend | Required (`:?` in the base). In dev/CI the runtime value is empty (override), which disables sending and logs the link instead |
| `EMAIL_FROM` | backend | Verified sender address |
| `APP_BASE_URL` | backend | Frontend origin the emailed links point at |
| `TEST_DATABASE_URL` | backend (dev/CI) | Must end in `_test` |
| `NEXT_PUBLIC_API_URL` | frontend | **Baked in at build time** |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | db | |
| `BACKUP_INTERVAL_SECONDS` / `BACKUP_KEEP` / `BACKUP_RCLONE_REMOTE` | backup | Dump cadence, local copies kept, optional off-site remote |

**`NEXT_PUBLIC_API_URL` is compiled into the client bundle.** Changing it requires
rebuilding the frontend image — restarting the container does nothing.

### Images

- `backend/Dockerfile` is multi-stage: `dev` (adds pytest, ruff, httpx) and `prod`
  (runtime deps only, non-root `appuser`). The base `docker-compose.yml` targets
  `prod`; `docker-compose.override.yml` switches it to `dev` for local work.
- `frontend/Dockerfile` builds a Next.js standalone server on `node:20-alpine`.

### Required variables and fail-fast

The base file requires `SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGINS`, `EMAIL_FROM`,
`APP_BASE_URL`, `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`,
`NEXT_PUBLIC_API_URL` and `RESEND_API_KEY`. While one is missing or empty,
`docker compose -f docker-compose.yml config` exits non-zero naming the variable —
the stack will not boot half-configured, in dev or in prod.

`RESEND_API_KEY` looks like a contradiction ("empty in dev/CI" vs "required") and
isn't: Compose interpolates each file's `${VAR:?}` *before* the override merges, so
an override cannot rescue a `:?` from the base — the base must require the key in
every mode. Dev and CI therefore satisfy the *interpolation* with a non-secret
placeholder (`.env` locally, step-level `env` in CI), and
`docker-compose.override.yml` pins the *runtime* value to empty, which is what the
container sees: the sender logs the verification/reset link and `tests/conftest.py`
keeps asserting an empty runtime key. Prod uses the real key. Leaving it empty in
the prod `.env` fails `config` with `RESEND_API_KEY requerida en .env`; leaving the
placeholder boots but Resend rejects every send at runtime (auth error in the
logs) — replace it, like `SECRET_KEY`.

### nginx sketch

A worked example lives at `infra/nginx.example.conf`. The shipped layout is a **single
origin** serving both halves by path — `/` is the frontend, `/api` is the backend —
which keeps the app same-origin and CORS out of the way:

```
location /api/ { proxy_pass http://127.0.0.1:8000/; }   # strips the /api prefix
location /     { proxy_pass http://127.0.0.1:3001; }    # frontend host port
```

The frontend binds host port **3001** (moved off 3000), and the backend 8000. The
`/api/` proxy_pass has a trailing slash so `/api/auth/register` reaches the backend as
`/auth/register` — the backend routers mount at the app root.

The backend takes the **last** entry of `X-Forwarded-For` as the client IP — the one
nginx appends with `$proxy_add_x_forwarded_for`; the earlier ones are spoofeable, and
rotating them must not buy a fresh rate-limit bucket. This holds exactly while nginx is
the only proxy: if another hop ever sits in between, that hop must overwrite the header
(`proxy_set_header X-Forwarded-For $remote_addr;`) instead of appending.

---

## Backups

The `backup` sidecar (defined in the base compose file, running in prod) loops:
`pg_dump -Fc` into the `backups` volume every `BACKUP_INTERVAL_SECONDS` (default 24 h),
keeps `BACKUP_KEEP` local copies (default 14), and — when `BACKUP_RCLONE_REMOTE` is
set — copies each dump off-site with rclone. An upload failure logs a warning and
keeps the local copy; it never stops the loop. Rotation runs regardless of upload
outcome.

The compose defaults only apply while the variable is absent from `.env`. A real
`.env` that sets `BACKUP_KEEP=2` wins over the default, so check (and raise, if
needed) the value in the production `.env` — editing the compose default alone does
not change retention on a host that already sets the variable.

For an off-site remote, mount `rclone.conf` read-only into the container (the line is
already in `docker-compose.yml`, commented). Leaving `BACKUP_RCLONE_REMOTE` empty is a
conscious local-only choice: verify periodically and test a restore.

### Check that backups are actually happening

```bash
docker compose -f docker-compose.yml logs backup | tail -20
docker compose -f docker-compose.yml exec backup ls -lh /backups
```

A backup you have never restored is a hypothesis. Test it.

### Restore

```bash
# 1. Stop the backend so nothing writes mid-restore
docker compose -f docker-compose.yml stop backend

# 2. Restore into the existing database (custom format, --clean drops first)
docker compose -f docker-compose.yml exec backup \
  sh -c 'pg_restore --clean --if-exists -d "$PGDATABASE" /backups/clocklog-<stamp>.dump'

# 3. Bring the backend back (it will run `alembic upgrade head` on boot)
docker compose -f docker-compose.yml start backend
```

If the dump predates a migration, step 3 brings the schema forward. If it *postdates*
the running code, roll the code forward first — never downgrade a schema to fit a dump.

---

## Monitoring and diagnosis

Every response carries `X-Request-ID`. Every unhandled exception logs exactly one JSON
line containing that id, the method, the path, the error, and the traceback. The client
gets `{"code": "INTERNAL_ERROR", "message": "Internal server error", "request_id": …}`
and never a traceback.

```bash
docker compose logs backend | grep <request-id>
docker compose logs backend | grep unhandled_exception
```

Liveness: `curl -fsS http://localhost:8000/health`.

### Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `pytest` errors with `TEST_DATABASE_URL must point at a *_test database` | The resolved URL does not end in `_test`. Fix the env var — never the assertion. |
| Backend won't start, Alembic errors on boot | A migration failed. `docker compose logs backend`, then `alembic current` / `alembic history`. |
| Frontend fetches fail with a CORS error | `CORS_ORIGINS` does not list the browser's origin. Dev default is `http://localhost:3000`. |
| Frontend still calls the old API host | `NEXT_PUBLIC_API_URL` is baked in at build time — rebuild the frontend image. |
| Backend code changes have no effect | The bind mount covers `.py` files, so this usually means a dependency or Dockerfile change: `docker compose up -d --build backend`. |
| `docker compose config` fails with `... requerida en .env` | A required variable is missing from `.env` (or the shell). Fill it in; in dev, `cp .env.example .env` provides placeholders the override then replaces at runtime. |
| `./backend:/app` or `target: dev` shows up in a prod compose config | The dev override was auto-loaded — the command must pass an explicit `-f`, e.g. `docker compose -f docker-compose.yml config`. |
| `docker compose config` fails with `RESEND_API_KEY requerida en .env` | The `.env` (or shell) carries a missing/empty key — e.g. an `.env` copied from a pre-handoff `.env.example`. Set the non-secret placeholder (dev) or the real key (prod); `cp .env.example .env` restores the placeholder. |
| Prod boots but verification/reset emails are only logged | The dev override was auto-loaded: the deploy command omitted `-f`, so the override emptied `RESEND_API_KEY` at runtime. Deploy with `docker compose -f docker-compose.yml up -d --build` (or the legacy two-file form) — an explicit `-f` never loads the override. |
| Prod boots but Resend rejects sends with an auth error | The `.env` still has the non-secret placeholder instead of a real key. Replace it and redeploy — like `SECRET_KEY`, the placeholder passes interpolation but fails in production. |
| Backups keep fewer copies than the compose default | The production `.env` sets `BACKUP_KEEP` (e.g. `2`), which overrides the compose default. Raise it in `.env`. |
| Async test hangs or raises "attached to a different loop" | asyncpg binds a connection to its creating loop. Keep the session-scoped loop settings in `pyproject.toml`. |
| A 500 with no detail | Grep the logs for the `X-Request-ID` from the response. |
| `429` on every login attempt | The sliding window is per IP and in memory; wait out `Retry-After`, or restart the backend to clear it. |
| ESLint fails with `no-restricted-imports` | A timer↔plan (or shared→feature) import crept in. Move the shared piece into `shared/`. |
| `test_plan_contains_no_timer_vocabulary` fails on a file you only added a header to | The standard license header contains "Pomodoro". Use the `plan/` variant — see AGENTS.md § License headers. |
| Timer under-reports elapsed time in a background tab | A counter is accumulating instead of deriving from `startedAt`. Fix at the engine, not the component. |
| "N blocks could not be saved" toast | The offline queue dropped payloads the server rejected with a 4xx. Check the backend logs for the rejection reason — this is real data loss, not a cosmetic warning. |
| Blocks stop syncing but the timer runs fine | By design: saves are queued write-behind. Check `localStorage.clocklog_block_queue` and whether the session expired (401 pauses the flush). |

---

## Routine maintenance

- **Dependencies:** none are added without asking. When bumping, run `./scripts/ci.sh`
  before committing.
- **Disk:** `docker system prune` after repeated rebuilds; the `backups` volume is
  self-rotating.
- **Logs:** capped at 10 MB × 3 per service by the compose file's logging block.
- **Certificates:** certbot on the host; verify renewal with `certbot renew --dry-run`.
- **Disk growth is now other people's data.** Accounts are unmetered by decision (G-6),
  so blocks and entries accumulate at a rate you do not control. Watch the volume rather
  than assume it; the same goes for the `backups` volume, whose dumps now contain
  third-party records and should be treated accordingly wherever they are copied.
- **Email reputation:** if sign-ups stop completing, check Resend's dashboard for
  bounces and complaints before looking at the app.
