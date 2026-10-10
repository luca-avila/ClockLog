# ClockLog frontend

The root `../AGENTS.md` governs. This file covers only what is specific to `frontend/`.

A client-only SPA: Vite + React + TypeScript, TanStack Router, TanStack Query,
Tailwind + shadcn/ui, and an API client generated from the backend's OpenAPI schema.
Why, and what was rejected: [ADR-012](../docs/decisions/012-vite-spa-frontend.md).

## Commands

```bash
npm install
npm run dev          # http://localhost:3000 (backend must be up: `docker compose up -d` from the repo root)
npm run build        # tsc --noEmit + vite build → dist/
npm run preview      # serve dist/ locally
npm run test         # vitest run
npm run test:watch
npm run lint         # eslint
npx tsc --noEmit     # type check — CI runs this as a separate step from lint
npm run gen:api      # regenerate lib/api/schema.gen.ts from the running backend's /openapi.json
```

## Layout

```
index.html  main.tsx  QueryClient + router, mounted on #root
routes/         TanStack Router file routes. routeTree.gen.ts is generated from them
                by the Vite plugin (dev and build) — commit it, never edit it.
  __root.tsx    root + 404 screen
  _app.tsx      pathless layout: AppShell + the signed-in guard (beforeLoad)
  _app/         index (timer) · history · settings · plan/index · plan/day
  login.tsx  register.tsx  verify-email.tsx  forgot-password.tsx  reset-password.tsx
components/
  shared/       AppShell, Sidebar, TabBar, TagPicker, TagManager, QueueSync, PrimaryButton
  timer/        TimerScreen, LabelSheet, CycleIndicator, HistoryPage, BlockEditor
  plan/         PlanWeekScreen, PlanDayScreen, WeekView, DayView, EntrySheet, EmptyWeek
  auth/         the SCR-02..05 screens · settings/  SettingsScreen (SCR-40)
  ui/           shadcn/ui primitives — copied in, ours to edit
lib/
  api/          schema.gen.ts (generated) · client (openapi-fetch, ApiError, unwrap) ·
                session · queue · per-resource fetchers (blocks, history, plan, tags, settings)
  queries/      TanStack Query keys + queryOptions, one file per resource
  timer/        engine.ts — the single source of elapsed-time truth
  plan/         layout.ts — day-timeline geometry; view.ts — URL → view; urls.ts — typed links; hooks.ts
  date/         week.ts (calendar dates) · instant.ts (UTC instants)
  alerts/       notifications and sound
styles/         globals.css — the palette and the shadcn tokens
__tests__/      mirrors the areas above; *.test.tsx when a component is rendered
  helpers/      providers.tsx — real route tree on a memory history + a fresh QueryClient
```

`@/*` resolves to the `frontend/` root (`tsconfig.json` and `vite.config.ts` both configure it).

## The data layer

- **Route files stay thin.** A file in `routes/` declares the path, validates its search
  params, and renders a component from `components/`. Screen logic lives in the component.
- **Every backend call goes through `api`** (`lib/api/client.ts`), the `openapi-fetch`
  client typed by `schema.gen.ts`. Fetchers wrap it in `unwrap(...)`, which returns the
  data or throws `ApiError` with the backend's stable `code`. No raw `fetch`, no
  hand-written response types: alias the generated ones (`Schemas["TagResponse"]`).
- **Reads are `useQuery(xxxQuery())`** with a factory from `lib/queries/`. Keep the
  factories out of the fetcher modules: tests mock `@/lib/api/<resource>`, and a
  `queryFn` in the same module would call the real fetcher past the mock.
- **Writes are `useMutation`** and invalidate the keys they change. No reload counters,
  no URL cache-busters.
- **Not in Query:** the timer state (`lib/timer/engine.ts`, invariant 2) and the offline
  block queue (`lib/api/queue.ts`, invariants 3/8/9). Both are client state with their
  own rules.
- **After a backend schema change:** `npm run gen:api && npx tsc --noEmit`, fix what tsc
  lists, and commit the regenerated `schema.gen.ts`. CI fails on a stale one.

## Rules with teeth

`eslint.config.mjs` enforces module independence (root invariant 11) via `no-restricted-imports`:

- `components/timer/**` and `lib/timer/**` may not import anything under `plan/`
- `components/plan/**` and `lib/plan/**` may not import anything under `timer/`
- `components/shared/**` may not import **either** feature module — the shell must still compile with one deleted

If ESLint flags one of these, the fix is to move the shared piece into `components/shared/` or `lib/`, never to add an override. Route files under `routes/_app/` necessarily import their feature's components; deleting a feature module means deleting its route files too (ADR-009's known gap).

Other non-negotiables (expanded in UI conventions below):

- **Never accumulate ticks.** `elapsed = Date.now() - startedAt`, recomputed every render. `setInterval` only triggers re-renders.
- **Timer state lives in `lib/timer/engine.ts`.** Do not duplicate elapsed-time math in components.
- **The in-progress block persists to `localStorage`** and must survive a refresh.
- **No `any`.** `strict` is on.
- No `"use client"` directives — there are no Server Components here; everything runs in the browser.
- Mobile-first; desktop at `md:`/`lg:` breakpoints — a bottom tab bar on phones, the sidebar from `md:` up.
- Tag colors are the only saturated color in the UI.
- Every new `.ts`/`.tsx` file gets the AGPL-3.0 header — copy it from `lib/api/client.ts`. **Under `components/plan/`, `lib/plan/` and `routes/_app/plan/` (and in `lib/queries/plan.ts`), copy it from `components/plan/DayView.tsx` instead:** the standard first line contains the word "Pomodoro", which invariant 13 bans anywhere under `plan/`, comments included. `*.gen.ts` files carry no header — they are regenerated.

## UI conventions

**Mobile-first.** Phone width is the primary target: author the mobile layout first and add desktop layouts at breakpoints (`md:`/`lg:`). Desktop is a first-class second target, not an afterthought — match the desktop treatment the shipped screens already use.

- **Mobile:** a bottom tab bar — `⏱ Timer · ▤ History · ▦ Plan`. Settings is reached from the header gear, not the tab bar.
- **Desktop:** a persistent left sidebar carrying the same three destinations plus tags and Settings. History gains a two-pane layout (day list + block inspector) so editing a block never navigates away.
- **A `fixed` overlay must clear the mobile tab bar.** The tab bar is an opaque 56px band at `bottom-0`, so anything pinned to the bottom uses `bottom-16 md:bottom-4` and a `z-index` above it, or it is painted underneath on the primary target. Two slots, and they do not share: **app-wide** messages take the centered one (`QueueSync`), **page-scoped** messages the right (`/settings`). A screen shows at most one page-scoped message at a time.

Other conventions:

- **Geist is the app typeface** (`@fontsource-variable/geist` / `geist-mono`, imported in `styles/globals.css` and mapped to `--font-sans` / `--font-mono` there). Do not set `font-family` on `body` — a direct rule there overrides the token for every screen.
- **The palette lives in `styles/globals.css`, and only there.** Every screen is authored in `neutral-*` plus `white`, so the app's color is set by overriding the Tailwind scale (`--color-neutral-50` … `--color-neutral-900`, `--color-white`) in one `@theme` block. The shipped palette is **sepia** — a warm cream ground with brown ink, so `bg-neutral-900` reads as espresso rather than black. Repaint by editing those tokens; never hard-code a hex or reach for another Tailwind color family in a component, or the palette stops being one revertable edit. The tint is low-chroma on purpose: it keeps tag colors the only saturated color in the app.
- **shadcn/ui is mapped onto that palette, not beside it.** Its semantic tokens (`--primary`, `--border`, `--muted`, ...) are aliases of the neutral scale in the same file, so a shadcn component paints sepia. Add components one at a time with `npx shadcn@latest add <name>` (or copy the source into `components/ui/`), then check it against the conventions here — a component's default look never overrides them.
- The cycle indicator (`● ● ○ ○`) appears only on the timer, never in the Plan.
- Density differs by module on purpose: the timer is sparse, the plan grid is dense. They are used in different mental states.
- **Empty states are honest and literal** ("No blocks yet"), never fabricated encouragement. The Plan empty state mentions the timer not at all — gate G-5 dropped the "Timers are optional." line, and invariant 13 stands unscoped ([ADR-005](../docs/decisions/005-plan-empty-state-copy.md)). **Exception:** `components/plan/EmptyWeek.tsx` uses `// ClockLog — a weekly planner screen` as its header first line because `__tests__/plan/empty-week.test.tsx` scans that specific source file for the regex `timer|block|focus|cycle|pomodoro`, and the word "timer" in the standard variant would trip it.
- **One filled button, one size.** `components/shared/PrimaryButton` (a fixed variant of the shadcn `Button`) is the only filled `bg-neutral-900` / `bg-primary` treatment in the app, and every action that commits something — START, RESUME, SAVE, SIGN IN — routes through it. It takes no `className`: a per-call-site override is how seven divergent copies of it happened the first time. It lives in `shared/` because both feature modules need it and neither may import the other (invariant 11), so its name, props, and copy stay free of Pomodoro vocabulary (invariant 13).
- Secondary actions **during a running block** (Pause, Stop, Skip) are deliberately low-contrast. During focus, the correct interaction is none. **Resume, in the paused state, is primary** — it carries the same filled treatment as START, because paused is not running and the correct interaction there is precisely to resume.

## Gotchas

- `VITE_API_URL` is baked in at build time (`API_BASE` in `lib/api/client.ts`, defaulting to `http://localhost:8000`). Changing it requires a rebuild, not a restart.
- TanStack Router parses search values as JSON first: `?hour=9` arrives as the number 9, `?new=1` as 1. `validateSearch` must accept both the parsed and the string form (see `parsePlanSearch`).
- Query results render on a later tick. In tests, `await flushQueries()` (from `__tests__/helpers/providers.tsx`) after rendering, not a bare `act(async () => {})`.
- Tests run under `happy-dom`, not jsdom. Browser APIs the timer relies on (`Notification`, `Audio`, `localStorage`) usually need a stub.
- A CORS failure in dev means the backend's `CORS_ORIGINS` does not list your origin.
