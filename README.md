# Tempo

A self-hosted, single-user Pomodoro timer and weekly planner.

Tempo is two loosely coupled tools that share a vocabulary but not a codepath:

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
# 1. Backend + Postgres. Applies migrations on boot.
docker compose up -d

# 2. Frontend (runs on the host for hot reload)
cd frontend && npm install && npm run dev

# 3. Create the single account — there is no sign-up screen (see below)
curl -X POST http://localhost:8000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"at-least-8-chars"}'
```

Then open <http://localhost:3000> and sign in.

No `.env` is needed for development — `docker-compose.yml` hard-codes dev values.
`.env` is production-only.

| URL | What |
| --- | --- |
| <http://localhost:3000> | Frontend |
| <http://localhost:8000> | API |
| <http://localhost:8000/docs> | OpenAPI / Swagger UI |
| <http://localhost:8000/health> | Liveness probe → `{"status": "ok"}` |

Postgres is not published to the host by default; uncomment the `ports` block under `db`
in `docker-compose.yml` if you need a direct client.

### Registration is single-use

`POST /auth/register` closes permanently once one account exists, and the login page
offers no sign-up link — this is a single-user, self-hosted app, so the first request to
that endpoint is the install step. See [docs/operations.md](docs/operations.md#first-run).

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
| [docs/wireframes.md](docs/wireframes.md) | Screen-by-screen layouts (canonical for UI) |
| [docs/ux-research.md](docs/ux-research.md) | Original problem definition and UX rationale (partly stale — see [docs/README.md](docs/README.md)) |
| [DECISIONS.md](DECISIONS.md) | Closed decision log |
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
