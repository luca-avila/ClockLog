# ADR-012: Frontend as a Vite SPA with TanStack Router, TanStack Query and a generated API client

- Status: Accepted (lands with the branch that implements it)
- Date: 2026-10-10
- Supersedes: [next-static-export-migration.md](../next-static-export-migration.md) (the
  staged Next.js static-export plan, never implemented)

## Context

Every screen already ran in the browser: the timer is client-side by invariant 2, the
offline queue and the session live in `localStorage`, and the auth token is a bearer
header, never a cookie. Next.js was carrying a Node server in production
(`output: "standalone"`) for none of that, and the staged plan to export it statically
still had to work around Server Components, `Suspense` boundaries for
`useSearchParams`, and `next/font`.

Two gaps were real. The request/response types in `frontend/lib/api/*.ts` were
hand-written mirrors of the Pydantic schemas, so a backend change broke the frontend
silently, at runtime. And every screen fetched in its own `useEffect` with a hand-rolled
cancel flag, a reload counter or — on the plan — a `?t=` cache-buster in the URL.

## Decision

The frontend is a client-only SPA:

- **Vite + React + TypeScript**, built to static files and served by nginx inside the
  `frontend` image (`frontend/Dockerfile`, `frontend/nginx.conf`). No Node at runtime.
- **TanStack Router** with file-based routes in `frontend/routes/`; search params are
  validated per route (`validateSearch`), and links are type-checked against the route
  tree. The signed-in shell is the pathless `_app` layout, with a `beforeLoad` guard.
- **TanStack Query** for every server read and write. Keys and `queryOptions` live in
  `frontend/lib/queries/`; mutations invalidate what they change.
- **A client generated from FastAPI's OpenAPI schema**: `openapi-typescript` writes
  `frontend/lib/api/schema.gen.ts` (`npm run gen:api`) and `openapi-fetch` calls it.
  CI regenerates the file against the backend it boots and fails on any diff.
- **Tailwind + shadcn/ui**: shadcn's semantic tokens are aliases of the sepia neutral
  scale in `frontend/styles/globals.css`, and its components are copied into
  `frontend/components/ui/` (`PrimaryButton` now wraps its `Button`).

## Alternatives considered

- **Finish the Next static export.** Keeps the framework, but every Next-specific
  feature it offers (Server Components, Server Actions, per-request rendering) is one
  this app cannot use with an export — the cost without the benefit.
- **React Router.** Works, but its search params are untyped strings; the plan screens
  live in the URL (`?week=`, `?date=`, `?new=1`, `?edit=`, `?hour=`) and benefit most
  from typed, validated search.
- **orval** for the client. Generates hooks too, which would put a second, generated
  query layer beside `lib/queries/`. `openapi-typescript` + `openapi-fetch` is types plus
  a thin `fetch` wrapper — less to read, and the query layer stays hand-written.

## Consequences

- **Env var rename:** `NEXT_PUBLIC_API_URL` → `VITE_API_URL` in `.env`, Compose, CI and
  the `publish.yml` repo variable. A VPS `.env` that still has only the old name fails
  `docker compose config` — add the new one before deploying.
- **Ports:** the container listens on 80; the host binding stays `127.0.0.1:3001`, so
  the VPS nginx config does not change. The dev server stays on `:3000`.
- **Backend contract tightened:** `BlockResponse.status`/`kind` are `Literal`s, so the
  generated types carry the unions the frontend used to assert by hand.
- **Plan URLs:** the `?t=` param is gone. Saving or deleting an entry invalidates
  `["entries"]` instead.
- **Tests** render with `__tests__/helpers/providers.tsx` (the real route tree on a
  memory history plus a fresh `QueryClient`). Fetchers are still mocked per module;
  the `queryOptions` live in a separate module precisely so those mocks reach them.
- **Generated files** (`routeTree.gen.ts`, `lib/api/schema.gen.ts`) carry no license
  header and are ignored by ESLint: regenerate them, never hand-edit.

## What this does NOT license

- Moving the token into a cookie or adding an auth library — the bearer-header design
  (AGENTS.md § Security) is unchanged.
- Putting the timer's state in the Query cache. It is client state by invariant 2 and
  stays in `lib/timer/engine.ts`; the offline queue keeps its own retry semantics.
- Wholesale restyling with shadcn defaults. The palette stays the sepia scale; add
  shadcn components one at a time, mapped onto it.
