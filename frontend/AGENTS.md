<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

<!-- Everything below the END marker is hand-written and survives `next dev`.
     Do not add content inside the block above — it gets regenerated. -->

# ClockLog frontend

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

Other non-negotiables (expanded in UI conventions below):

- **Never accumulate ticks.** `elapsed = Date.now() - startedAt`, recomputed every render. `setInterval` only triggers re-renders.
- **Timer state lives in `lib/timer/engine.ts`.** Do not duplicate elapsed-time math in components.
- **The in-progress block persists to `localStorage`** and must survive a refresh.
- **No `any`.** `strict` is on.
- Server Components by default; `"use client"` only where interactivity requires it.
- Mobile-first; desktop at `md:`/`lg:` breakpoints — a bottom tab bar on phones, the sidebar from `md:` up.
- Tag colors are the only saturated color in the UI.
- Every new `.ts`/`.tsx` file gets the AGPL-3.0 header — copy it from `lib/api/client.ts`. **Under `components/plan/` and `lib/plan/`, copy it from `components/plan/DayView.tsx` instead:** the standard first line contains the word "Pomodoro", which invariant 13 bans anywhere under `plan/`, comments included.

## UI conventions

**Mobile-first.** Phone width is the primary target: author the mobile layout first and add desktop layouts at breakpoints (`md:`/`lg:`). Desktop is a first-class second target, not an afterthought — match the desktop treatment the shipped screens already use.

- **Mobile:** a bottom tab bar — `⏱ Timer · ▤ History · ▦ Plan`. Settings is reached from the header gear, not the tab bar.
- **Desktop:** a persistent left sidebar carrying the same three destinations plus tags and Settings. History gains a two-pane layout (day list + block inspector) so editing a block never navigates away.
- **A `fixed` overlay must clear the mobile tab bar.** The tab bar is an opaque 56px band at `bottom-0`, so anything pinned to the bottom uses `bottom-16 md:bottom-4` and a `z-index` above it, or it is painted underneath on the primary target. Two slots, and they do not share: **app-wide** messages take the centered one (`QueueSync`), **page-scoped** messages the right (`/settings`). A screen shows at most one page-scoped message at a time.

Other conventions:

- The timer is necessarily a client component.
- **Geist is the app typeface** (`Geist` / `Geist_Mono`, loaded in `app/layout.tsx` and mapped to `--font-sans` / `--font-mono` in `globals.css`). Do not set `font-family` on `body` — a direct rule there overrides the token for every screen.
- **The palette lives in `app/globals.css`, and only there.** Every screen is authored in `neutral-*` plus `white`, so the app's color is set by overriding the Tailwind scale (`--color-neutral-50` … `--color-neutral-900`, `--color-white`) in one `@theme` block. The shipped palette is **sepia** — a warm cream ground with brown ink, so `bg-neutral-900` reads as espresso rather than black. Repaint by editing those tokens; never hard-code a hex or reach for another Tailwind color family in a component, or the palette stops being one revertable edit. The tint is low-chroma on purpose: it keeps tag colors the only saturated color in the app.
- **Dark mode follows the OS, and only the OS.** A `@media (prefers-color-scheme: dark)` block in `globals.css` redefines the same tokens as warm charcoal — a brown-grey ground with soft ivory ink, the steps between staying low-chroma so tags keep the saturation. Tokens keep their *role*, not their lightness — `neutral-900` is still ink, `white` is still the raised surface — so components carry **no `dark:` variants**; a screen authored correctly in light is correct in dark. The block also flips the only two status families in use (`red-300/600`, `amber-50/200/700`); a new non-neutral class needs its dark value there too. There is no in-app toggle (root `AGENTS.md` § Scope boundaries). `app/icon.svg` carries its own dark stroke, since a favicon cannot read the CSS tokens.
- The cycle indicator (`● ● ○ ○`) appears only on the timer, never in the Plan.
- Density differs by module on purpose: the timer is sparse, the plan grid is dense. They are used in different mental states.
- **Empty states are honest and literal** ("No blocks yet"), never fabricated encouragement. The Plan empty state mentions the timer not at all — gate G-5 dropped the "Timers are optional." line, and invariant 13 stands unscoped ([ADR-005](../docs/decisions/005-plan-empty-state-copy.md)). **Exception:** `components/plan/EmptyWeek.tsx` uses `// ClockLog — a weekly planner screen` as its header first line because `__tests__/plan/empty-week.test.tsx` scans that specific source file for the regex `timer|block|focus|cycle|pomodoro`, and the word "timer" in the standard variant would trip it.
- **One filled button, one size.** `components/shared/PrimaryButton` is the only filled `bg-neutral-900` treatment in the app, and every action that commits something — START, RESUME, SAVE, SIGN IN — routes through it. It takes no `className`: a per-call-site override is how seven divergent copies of it happened the first time. It lives in `shared/` because both feature modules need it and neither may import the other (invariant 11), so its name, props, and copy stay free of Pomodoro vocabulary (invariant 13).
- Secondary actions **during a running block** (Pause, Stop, Skip) are deliberately low-contrast. During focus, the correct interaction is none. **Resume, in the paused state, is primary** — it carries the same filled treatment as START, because paused is not running and the correct interaction there is precisely to resume.

## Gotchas

- `NEXT_PUBLIC_API_URL` is baked in at build time (`API_BASE` in `lib/api/client.ts`, defaulting to `http://localhost:8000`). Changing it requires a rebuild, not a restart.
- Tests run under `happy-dom`, not jsdom. Browser APIs the timer relies on (`Notification`, `Audio`, `localStorage`) usually need a stub.
- A CORS failure in dev means the backend's `CORS_ORIGINS` does not list your origin.
