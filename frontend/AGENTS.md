<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

<!-- Everything below the END marker is hand-written and survives `next dev`.
     Do not add content inside the block above — it gets regenerated. -->

# Tempo frontend

The root `../AGENTS.md` governs. This file covers only what is specific to `frontend/`.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000 (backend must be up: `docker compose up -d` from the repo root)
npm run build
npm run test         # vitest run
npm run test:watch
npm run lint         # eslint
npx tsc --noEmit     # type check — CI runs this as a separate step from lint
```

## Layout

```
app/            App Router. (app)/ is the authenticated shell; login/ is public.
components/
  shared/       AppShell, Sidebar, TabBar, TagPicker, TagManager, QueueSync
  timer/        TimerScreen, LabelSheet, CycleIndicator, HistoryPage, BlockEditor
  plan/         PlanWeekScreen, PlanDayScreen, WeekView, DayView, EntrySheet, EmptyWeek
lib/
  api/          client (ApiError, bearer token), blocks, history, plan, tags, settings, queue
  timer/        engine.ts — the single source of elapsed-time truth
  plan/         layout.ts — day-timeline geometry; view.ts — URL state; hooks.ts
  date/         week.ts (calendar dates) · instant.ts (UTC instants)
  alerts/       notifications and sound
__tests__/      mirrors the areas above; *.test.tsx when a component is rendered
```

`@/*` resolves to the `frontend/` root (`tsconfig.json` and `vitest.config.mjs` both configure it).

## Rules with teeth

`eslint.config.mjs` enforces module independence (root invariant 11) via `no-restricted-imports`:

- `components/timer/**` and `lib/timer/**` may not import anything under `plan/`
- `components/plan/**` and `lib/plan/**` may not import anything under `timer/`
- `components/shared/**` may not import **either** feature module — the shell must still compile with one deleted

If ESLint flags one of these, the fix is to move the shared piece into `components/shared/` or `lib/`, never to add an override.

Other non-negotiables (full text in `../AGENTS.md`):

- **Never accumulate ticks.** `elapsed = Date.now() - startedAt`, recomputed every render. `setInterval` only triggers re-renders.
- **Timer state lives in `lib/timer/engine.ts`.** Do not duplicate elapsed-time math in components.
- **The in-progress block persists to `localStorage`** and must survive a refresh.
- **No `any`.** `strict` is on.
- Server Components by default; `"use client"` only where interactivity requires it.
- Mobile-first; desktop at `md:`/`lg:` breakpoints. See the `## Desktop` sections of `../docs/wireframes.md`.
- Tag colors are the only saturated color in the UI.
- Every new `.ts`/`.tsx` file gets the AGPL-3.0 header — copy it from `lib/api/client.ts`. **Under `components/plan/` and `lib/plan/`, copy it from `components/plan/DayView.tsx` instead:** the standard first line contains the word "Pomodoro", which invariant 13 bans anywhere under `plan/`, comments included.

## Gotchas

- `NEXT_PUBLIC_API_URL` is baked in at build time (`API_BASE` in `lib/api/client.ts`, defaulting to `http://localhost:8000`). Changing it requires a rebuild, not a restart.
- Tests run under `happy-dom`, not jsdom. Browser APIs the timer relies on (`Notification`, `Audio`, `localStorage`) usually need a stub.
- A CORS failure in dev means the backend's `CORS_ORIGINS` does not list your origin.
