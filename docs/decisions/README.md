# Architecture Decision Records

Accepted architectural and product decisions for ClockLog, one file per
decision. New decisions get a new file — never edit an accepted ADR in
place; supersede it with a new one.

Format: see [template.md](template.md) (Context / Decision / Alternatives
considered / Consequences). Status values: `Accepted` (current),
`Superseded` (replaced — points at its replacement), `Deprecated`
(withdrawn, no replacement).

Migrated from the old gate log `docs/DECISIONS.md` (gates G-1…G-7); each
ADR below records the gate it supersedes. `docs/DECISIONS.md` is kept as
a redirect.

| ADR | Decision | Status | Date |
| --- | --- | --- | --- |
| [001](001-pause-vs-abort.md) | Pause is a first-class state; abort preserves elapsed time | Accepted | 2026-08-05 |
| [002](002-break-labels.md) | Breaks carry no labels | Accepted | 2026-08-05 |
| [003](003-settings-storage.md) | Settings stored server-side, per user | Accepted | 2026-08-05 |
| [004](004-shared-planner-tags.md) | Planner reuses the shared tag table | Accepted | 2026-08-15 |
| [005](005-plan-empty-state-copy.md) | Plan empty state carries no timer vocabulary | Accepted | 2026-08-15 |
| [006](006-open-registration.md) | Open registration with verified email + recovery | Accepted | 2026-08-23 |
| [007](007-rename-tempo-to-clocklog.md) | Rename Tempo → ClockLog | Accepted | 2026-08-27 |
| [008](008-plan-dates-not-instants.md) | Plan API speaks dates, not instants | Accepted | 2026-08-15 |
| [009](009-module-deletability.md) | Module deletability is enforced by tests | Accepted | 2026-08-15 |
| [010](010-no-recurrence-engine.md) | No recurrence engine; `repeat_weekly` flag only | Accepted | 2026-08-15 |

The one standing decision point is not an ADR: phase 3 (timer↔plan
integration) requires renegotiating invariants 12 and 13 in writing before
any code. See `AGENTS.md` § Invariants → Module independence and
§ Scope boundaries.
