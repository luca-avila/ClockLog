# ADR-005: Plan empty state carries no timer vocabulary

- Status: Accepted
- Date: 2026-08-15
- Supersedes: G-5 in docs/DECISIONS.md
- Screens: SCR-33

## Context

The empty-week copy (SCR-33) drafted the line "Timers are optional." —
honest, but it names the timer inside a module a planner-only user must be
able to use without ever meeting timer concepts.

## Decision

Dropped. Invariant 13 stands unscoped: Plan screens carry no timer
vocabulary at all, including the word *timer*.

## Alternatives considered

- **Keep the line as reassurance.** Rejected: any timer mention, however
  benign, breaks the planner-only reading and invites scope drift toward
  cross-module copy one sentence at a time.

## Consequences

- Empty states are honest and literal ("No entries yet"-style), never
  fabricated encouragement and never cross-module references.
- Enforced by `frontend/__tests__/plan/empty-week.test.tsx`, which scans
  the rendered markup and the `EmptyWeek.tsx` source for timer vocabulary.
  Note: that is why `EmptyWeek.tsx` carries its own license-header variant
  (see `AGENTS.md` § License headers).
