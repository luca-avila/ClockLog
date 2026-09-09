# ADR-004: Planner reuses the shared tag table

- Status: Accepted
- Date: 2026-08-15
- Supersedes: G-4 in docs/DECISIONS.md

## Context

The planner (phase 2) needed categorization. Options: its own tag/category
table per module, or one shared table owned by `shared/`.

## Decision

Shared. The plan uses the timer's `tag` table; `tag/` stays in `shared/`.
Tags are the single visual element shared across both modules — and the
only saturated color in the UI.

## Alternatives considered

- **Per-module tags.** Cleaner independence story, but two tag systems with
  the same name, color, and picker is worse than one shared dependency.
  Rejected: the shared vocabulary is the point.

## Consequences

- Deleting a tag never deletes blocks or entries (`SET NULL`, invariant 10);
  they become untagged.
- The delete warning counts affected rows across both tables.
- `tag/` remaining in `shared/` is load-bearing for invariant 11: it is one
  of the only three things both modules may import.
