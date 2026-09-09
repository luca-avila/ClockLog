# ClockLog

A Pomodoro timer and weekly planner. Self-hostable, and open to sign-ups.

ClockLog is two loosely coupled tools that share a vocabulary but not a codepath:

- **Timer + History** — a Pomodoro timer where every block gets a label, producing a
  queryable history of how time was actually spent.
- **Plan** — a dated weekly calendar of ordinary entries (gym, work, classes, meals).
  Independent of the timer, and fully usable by someone who has never run a Pomodoro.

Either half can be deleted without breaking the other. That is enforced by tests, not
convention — see [docs/architecture.md](docs/architecture.md).

Runs on a single VPS: Docker Compose, nginx, certbot. AGPL-3.0.

---

## Quick start (development)

Requirements: Docker + Docker Compose, Node 20+.

```bash
# 1. Env file for Compose interpolation (gitignored; placeholders are fine in dev —
#    docker-compose.override.yml replaces runtime values with local credentials)
cp .env.example .env

# 2. Backend + Postgres. Applies migrations on boot.
docker compose up -d

# 3. Frontend (runs on the host for hot reload)
cd frontend && npm install && npm run dev
```

Then open <http://localhost:3000> and create an account from the sign-up screen.

In development `RESEND_API_KEY` is empty at runtime in the container (the dev
override empties the placeholder `.env` value), so no mail is sent — the verification
link is written to the backend log instead. Fish it out with `docker compose logs
backend`, open it, and you are signed in.

The base `docker-compose.yml` is prod-safe and requires its variables via
`${VAR:?}`, so dev, CI and prod all read `.env` (or the shell) for interpolation.
The auto-loaded `docker-compose.override.yml` then pins the runtime values dev
actually uses (including an empty `RESEND_API_KEY`). Production fills every `.env`
value — real Resend key included — and deploys with
`docker compose -f docker-compose.yml up -d --build`; an explicit `-f` never loads
the dev override.

| URL | What |
| --- | --- |
| <http://localhost:3000> | Frontend |
| <http://localhost:8000> | API |
| <http://localhost:8000/docs> | OpenAPI / Swagger UI |
| <http://localhost:8000/health> | Liveness probe → `{"status": "ok"}` |

Postgres is not published to the host by default; uncomment the `ports` block under `db`
in `docker-compose.yml` if you need a direct client.

### Accounts

Registration is open: anyone who can reach the instance can sign up. An address must be
verified before its account can sign in, and a forgotten password is recovered by email
— both go through [Resend](https://resend.com), configured in `.env` for production and
deliberately left unconfigured in development.

There is no switch to close registration. If you are hosting this for yourself alone,
restrict it at nginx; the application does not carry an instance-policy flag. See
[docs/operations.md](docs/operations.md#first-run) and
[docs/DECISIONS.md](docs/DECISIONS.md) § G-6.

---

## Tests and checks

```bash
./scripts/ci.sh                          # everything CI runs (needs `docker compose up -d`)

docker compose exec backend pytest       # backend suite
docker compose exec backend ruff check .
cd frontend && npm run test              # vitest
cd frontend && npm run lint && npx tsc --noEmit
```

---

## Documentation

| Doc | Read it for |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | How the system is put together, the data model, and why the two modules stay apart |
| [docs/api.md](docs/api.md) | Endpoint reference, request/response examples, error codes |
| [docs/operations.md](docs/operations.md) | Deploying, migrations, backup and restore, troubleshooting |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Closed decision log |
| [AGENTS.md](AGENTS.md) | Operating manual for contributors and coding agents |

## Stack

Python 3.12 · FastAPI · SQLAlchemy 2 (async) · Alembic · Pydantic v2 · PostgreSQL 16 ·
Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 ·
pytest · Vitest · Docker Compose.

## Contributing

Read [AGENTS.md](AGENTS.md) first — it carries the invariants, code style, and commit
conventions. External PRs require a signed CLA; the dual-licensing option depends on it.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
