// Tempo — a Pomodoro timer and weekly planner
// Copyright (C) 2024  Luca
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Timer surface — design plans (SCR-10/11/12/13)

Written against: `c14a250` (working tree clean at authoring time)

Three independent plans from a source-only audit of the timer surface. Each is
self-contained; execute in the order given, or any subset. All three are
presentation-only — no engine, reducer, persistence, or API change is in scope
for any of them.

**Order:** Plan 2 first (one line, zero risk, changes how every other change
looks on screen), then Plan 1, then Plan 3.

**Shared constraints for all three plans**

- `docs/wireframes.md` is canonical for this surface. `AGENTS.md` §Frontend
  governs style. Do not widen scope to History (SCR-20/21) or Plan.
- Tag colors are the only saturated color in the UI. None of these plans
  introduces color.
- The timer is deliberately sparse. None of these plans adds an element that
  the wireframes do not already draw.
- `frontend/__tests__/timer/timer-ui.test.tsx` asserts on `textContent`, never
  on class names. No plan here should require a test edit. If one does, stop —
  the change has exceeded its scope.
- Run `cd frontend && npm run lint && npx tsc --noEmit && npm run test` after
  each plan.

---

# Plan 1 — Restore the running timer number as the largest element on screen

## Evidence chain

- Surface: `frontend/components/timer/TimerScreen.tsx`, running / paused /
  break branch (SCR-11, SCR-12, SCR-13), route `/`.
- Problem: the countdown reads at `text-3xl` (30px) while running. The idle
  placeholder it replaces reads at `text-7xl` (72px), so pressing START shrinks
  the clock to under half its previous size at the exact moment it becomes
  live. It is not the largest element in the app; the idle numeral is, and a
  History empty-state glyph (`HistoryPage.tsx:128`, `text-4xl`) also outranks
  it.
- Design evidence: `docs/wireframes.md` §Notas de layout — "**El número del
  timer** es, por lejos, el elemento más grande de la app — legible desde el
  otro lado de la habitación." SCR-11 draws the number as the interior of the
  ring, with `of 25:00` subordinate beneath it.
- Owner: `frontend/components/timer/TimerScreen.tsx:390` (numeral),
  `:371` (ring `svg`). Exemplar for the target scale: `:271` (idle numeral).
- Scope and affected surfaces: the running, paused, and break states of the
  timer screen only. Idle is already correct and must not change.
- Uncertainty: the `of {target}` sub-line at `:394` is `text-[10px]` and was
  proportioned against a 30px numeral. Leave it untouched in this plan and
  judge it visually afterward; changing it is a separate decision.

## Design decision

Raise the running numeral to the idle numeral's type scale and grow the ring so
it fits. The layout note is unambiguous that this number is the app's largest
element, and the same component already contains the correct scale 120 lines
above — this is a conformance fix, not a new type decision.

The word `PAUSED` shares the numeral's `div` at `:391` but is not a number. At
72px, six letters overflow the ring. Keep `PAUSED` at the current `text-3xl`:
the contract governs the timer number, and the paused state's own affordance is
addressed by Plan 3.

## Reuse

- `text-7xl font-light tabular-nums tracking-tight text-neutral-700 select-none`
- Exemplar: `frontend/components/timer/TimerScreen.tsx:271` (idle numeral) —
  copy its scale exactly; do not invent an intermediate size.

No new primitive. No token file exists for this surface and none should be
created for a single component.

## Changes

1. `frontend/components/timer/TimerScreen.tsx:371`
   - Change: widen the ring from `w-52 h-52` to `w-72 h-72` (208px → 288px).
     Leave `viewBox="0 0 100 100"`, `r="42"`, `strokeWidth="6"`, and the
     `circumference` math alone — they are unit-relative and scale for free.
   - Preserve: the `-rotate-90` origin, both stroke colors, the
     `transition-[stroke-dashoffset] duration-500 ease-linear` sweep.
   - Verify: the progress arc still starts at twelve o'clock and sweeps
     clockwise; stroke weight grows proportionally with the ring.

2. `frontend/components/timer/TimerScreen.tsx:390–392`
   - Change: split the numeral from the paused word. Render `PAUSED` in a span
     at `text-3xl`, and the two `formatCountdown(...)` branches at `text-7xl`,
     both keeping `font-light tabular-nums tracking-tight text-neutral-700
     select-none`.
   - Preserve: the ended-state branch showing `formatCountdown(targetDuration)`
     rather than live elapsed, and the `isPaused ? … : isEnded ? … : …` order.
     `tabular-nums` is load-bearing — without it the digits jitter every tick.
   - Verify: `18:42` renders at 72px inside the ring with visible clearance on
     both sides; `PAUSED` does not touch the ring.

3. `frontend/components/timer/TimerScreen.tsx:347`
   - Change: only if the taller ring crowds the column, reduce the wrapper's
     `gap-6`. Do not touch `min-h-[80vh]` or `px-4`.
   - Preserve: vertical centering of the whole stack.
   - Verify: nothing overlaps the tab bar at 360×640.

## Scope

- Inherit: running, paused, break, and the brief ended state before the label
  sheet opens.
- Verify: idle (`:246–333`) must be pixel-unchanged; `LabelSheet` overlays the
  ring at `z-50` and must still cover it.
- Exclude: `CycleIndicator`, the `of {target}` sub-line, History, Plan, and the
  cycle-dot ordering issue noted at the end of this document.

## Validation

- Product: start a focus block; the countdown is legible from across a room —
  the stated purpose of the rule.
- Interface: `/` at 360px, 768px, and 1280px, in all four states (idle,
  running, paused, break) and at both `00:00` and a two-digit-hour value if
  `focusDuration` is set above 59 minutes in Settings.
- System: confirm the numeral classes are now character-identical to the idle
  numeral's, so a future reader sees one type decision and not two.
- Repository: `cd frontend && npm run test -- timer-ui && npx tsc --noEmit` →
  passes unchanged.

## Stop conditions

- Stop if a 72px numeral cannot fit the widest reachable value inside a 288px
  ring without clipping. Verified after the fact: `formatCountdown`
  (`lib/date/instant.ts:76`) emits `MM:SS` and never an hour field, and
  `DURATION_OPTIONS` (`app/(app)/settings/page.tsx:26`) caps at 60, so the
  widest string is `60:00` — five characters. This condition is moot.
- Stop if fitting the numeral requires touching `lib/timer/engine.ts`. It does
  not; presentation and elapsed-time computation are separate by invariant 1.

## Design documentation

- After acceptance and validation: none. This restores a documented rule; it
  does not create one.

---

# Plan 2 — Let the loaded typeface actually render

## Evidence chain

- Surface: every route, including the timer, via CSS inheritance from `body`.
- Problem: `Geist` and `Geist_Mono` are fetched and exposed as CSS variables,
  mapped into the Tailwind theme as `--font-sans` / `--font-mono`, and then
  overridden — the app renders in Arial. The webfonts are downloaded on every
  load and never painted.
- Design evidence: `frontend/app/layout.tsx:5–13` (fonts loaded, variables
  declared, applied to `<html>`); `frontend/app/globals.css:11–12` (`@theme
  inline` maps them to `--font-sans` / `--font-mono`); `frontend/app/globals.css:25`
  (`body { font-family: Arial, Helvetica, sans-serif; }`). A direct rule on
  `body` beats the value `body` inherits from Tailwind preflight's rule on
  `html`, so Arial wins everywhere. Confirmed by exhaustive grep: no `font-sans`
  or `font-mono` utility class exists anywhere under `frontend/app` or
  `frontend/components` to reassert the token.
- Owner: `frontend/app/globals.css:22–26`.
- Scope and affected surfaces: all screens.
- Uncertainty: none. The `@theme inline` mapping is unambiguous evidence that
  Geist was intended to render; line 25 is leftover `create-next-app` scaffold.

## Design decision

Delete the `font-family` declaration from the `body` rule so `--font-sans`
governs, as the theme mapping already intends. One line.

## Reuse

- `--font-sans` / `--font-geist-sans`, already declared and mapped.
- Exemplar: `frontend/app/globals.css:8–13`.

## Changes

1. `frontend/app/globals.css:22–26`
   - Change: remove the `font-family: Arial, Helvetica, sans-serif;`
     declaration from the `body` rule.
   - Preserve: `background: var(--background)` and `color: var(--foreground)`
     on the same rule — both are live and correct.
   - Verify: DevTools computed style on `body` reports the Geist family, and
     the Network panel shows the Geist file as used rather than merely fetched.

## Scope

- Inherit: every screen in the app.
- Verify: `tabular-nums` on the timer numerals now resolves against Geist —
  confirm the digits still occupy equal width and do not jitter per tick.
  Confirm the `⏸`, `⏹`, `●`, `○`, `↺`, `▤`, `▦`, `⚙︎` glyphs used across the
  UI still render, falling back cleanly where Geist lacks a glyph.
- Exclude: adding a `font-mono` consumer. `--font-mono` will remain mapped and
  unused; that is out of scope here.

## Validation

- Product: every screen still reads correctly; nothing reflows into overflow.
- Interface: `/`, `/history`, `/plan`, `/plan/day`, `/settings`, `/login` at
  360px and 1280px.
- System: confirm no component compensates for Arial metrics with a hardcoded
  width — check the idle label input's `w-64` at `TimerScreen.tsx:312`.
- Repository: `cd frontend && npm run lint && npm run test` → passes unchanged.

## Stop conditions

- Stop if removing the line changes nothing in the computed style — that would
  mean the cascade is not as traced here, and the diagnosis needs redoing
  before any further edit.

## Design documentation

- After acceptance and validation: none required. Optionally record in
  `AGENTS.md` §Frontend that Geist is the app typeface, since no document
  currently states it.

---

# Plan 3 — Give RESUME the affordance of a primary action

## Evidence chain

- Surface: `frontend/components/timer/TimerScreen.tsx`, paused state (SCR-12).
- Problem: one button at `:424–429` toggles its label between `⏸ PAUSE` and
  `RESUME` under a single class string, `text-xs font-medium text-neutral-400
  hover:text-neutral-500`. Paused, RESUME is therefore visually identical to
  `⏹ STOP` beside it: the action that recovers the block looks exactly like the
  action that ends it.
- Design evidence: `docs/wireframes.md` §SCR-12 draws RESUME and Stop as filled
  boxes, distinct from the low-contrast treatment SCR-11 gives running
  controls. `AGENTS.md` §Frontend states the low-contrast exception applies to
  "Pause, Stop, Skip" **during a running block** — it does not name Resume, and
  paused is not running.
- Owner: `frontend/components/timer/TimerScreen.tsx:423–431`. Exemplar for the
  primary treatment: `:322–325` (idle START).
- Scope and affected surfaces: paused state only.
- Uncertainty: none for RESUME. STOP is explicitly covered by the AGENTS.md
  exception and stays quiet — do not "balance" the pair by promoting both.

## Design decision

When paused, render the toggle button with the primary treatment already used
by START; keep the running-state `⏸ PAUSE` low-contrast exactly as it is. The
rationale in AGENTS.md — "during focus, the correct interaction is none" — is a
statement about the *running* block. Paused, the correct interaction is
precisely to resume, and the interface should say so.

## Reuse

- `px-10 py-3 bg-neutral-900 text-white text-sm font-medium rounded-lg
  hover:bg-neutral-800 transition-colors`
- Exemplar: `frontend/components/timer/TimerScreen.tsx:322–325` (idle START).
  Note the idle button is `px-12`; `px-10` matches the break-state START at
  `:293` and sits better beside STOP. Either is defensible — take `px-10`.

## Changes

1. `frontend/components/timer/TimerScreen.tsx:424–429`
   - Change: select the class string on `isPaused` — the START exemplar's
     classes when paused, the existing low-contrast string when running.
   - Preserve: the `onClick` dispatch exactly as written
     (`isPaused ? { kind: "resume" } : { kind: "pause" }`) and both label
     strings verbatim, including the `⏸` prefix on PAUSE. The tests match on
     these strings.
   - Verify: paused, RESUME is a filled dark button; running, PAUSE is
     unchanged from today.

2. `frontend/components/timer/TimerScreen.tsx:431–436` (STOP)
   - Change: none.
   - Preserve: the low-contrast treatment, per the documented exception.
   - Verify: STOP looks identical before and after.

## Scope

- Inherit: paused state at every viewport.
- Verify: the `flex gap-3 items-center` row at `:423` still aligns a tall
  filled button against a short text button without the baseline shifting —
  `items-center` should handle it.
- Exclude: the break-state Skip link at `:414`, the idle Skip break at `:298`,
  and STOP. All three are documented as quiet.

## Validation

- Product: pause a block, walk away, come back — the way back into the block is
  obvious at a glance.
- Interface: `/` paused at 360px and 1280px; confirm the running state is
  visually unchanged; confirm break-paused (pause during a break) also reads
  correctly, since it shares this branch.
- System: confirm the class string is character-identical to an existing
  primary button rather than a fourth hand-tuned variant. If a third primary
  button appears in this component later, that is the point to extract a shared
  primitive — not now.
- Repository: `cd frontend && npm run test -- timer-ui` → the
  "toggle between PAUSED and RESUME" case passes unchanged.

## Stop conditions

- Stop if making RESUME primary requires splitting the button into two
  elements — the label toggle is a single control and must stay one, or the
  tests' text assertions stop describing the real DOM.
- Stop if this pulls STOP or Skip toward higher contrast. That contradicts a
  documented decision and needs its own written gate.

## Design documentation

- After acceptance and validation: amend `AGENTS.md` §Frontend to read
  "Secondary actions **during a running block** (Pause, Stop, Skip) are
  deliberately low-contrast — Resume, in the paused state, is primary." The
  current wording is what allowed this to drift.

---

# Not planned

Audited, real, and deliberately left out of the plans above.

- **Cycle dots are positioned above the ring.** SCR-11, SCR-12, and SCR-13 all
  place `● ● ○ ○` *below* the label, under the ring; `TimerScreen.tsx:363` and
  `:348` render `CycleIndicator` above it. Idle is correct — SCR-10 does put the
  dots on top. Cheap to fix, but it moves the same elements Plan 1 resizes;
  sequence it after Plan 1 rather than alongside.
- **`CycleIndicator.tsx:31` carries `aria-label` on a bare `div`.** ARIA
  prohibits a name on a generic role, so assistive tech drops it. The repo's own
  `components/shared/TagPicker.tsx:36` pairs `role="group"` with its label —
  same fix shape, `role="img"` here.
- **Dark mode is declared but unimplemented.** `globals.css:15–20` defines a
  dark palette under `prefers-color-scheme`; no timer component carries a
  `dark:` variant, so a dark-mode visitor gets `text-neutral-700` numerals on
  `#0a0a0a`. Not planned because the evidence supports two opposite corrections
  — implement dark variants, or delete the dark block — and `AGENTS.md` lists
  theming as not built. This needs a decision, not a plan.

# Documentation drift found while sourcing

- `AGENTS.md` §Reference documents points at `DECISIONS.md` at the repo root;
  the file is `docs/DECISIONS.md`.
- `AGENTS.md` §Frontend still permits the Plan empty state to carry the
  "Timers are optional." line, which gate G-5 (`docs/DECISIONS.md:30`,
  2026-08-15) dropped. `components/plan/EmptyWeek.tsx` should be checked
  against G-5, not against AGENTS.md.
