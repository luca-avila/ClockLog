# ADR-007: Rename Tempo to ClockLog

- Status: Accepted
- Date: 2026-08-27
- Supersedes: G-7 in docs/DECISIONS.md

## Context

The project was previously called *Tempo*. The name collided conceptually
(and in package/role naming) and the rename had to happen before any
deployment or users existed, while it was still a pure tree rename with no
data migration.

## Decision

Rename to ClockLog. The Postgres role and database (`tempo` → `clocklog`),
the backup dump prefix (`tempo-*.dump` → `clocklog-*.dump`), the Python
package (`clocklog-backend`), the logger (`clocklog.errors`), and the
`localStorage` prefix (`tempo_*` → `clocklog_*`) were all renamed at the
same time. The wordmark changed from `temp`+ring to `cl`+ring+`cklog`; ring
geometry is unchanged.

## Alternatives considered

- **Keep Tempo.** Rejected: reason for the rename stands, and the cost only
  grows once deployed.
- **Rename later with migration.** Rejected: no deployment or users existed
  at the date of the change, so no data migration was needed — waiting
  would only have created one.

## Consequences

- Doing this before ADR-006 landed means the session guard's `clocklog_*`
  prefix was never shipped under the old name.
- No backward-compatibility shims: there was nothing deployed to be
  compatible with.
