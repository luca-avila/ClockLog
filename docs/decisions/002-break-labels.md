# ADR-002: Breaks carry no labels

- Status: Accepted
- Date: 2026-08-05
- Supersedes: G-2 in docs/DECISIONS.md

## Context

Every focus block gets a label on completion (SCR-14), producing the
queryable history. The gate was whether break blocks go through the same
sheet — is a break "time spent" worth describing, or dead time?

## Decision

No. Breaks are dead time. The label sheet appears only after focus blocks;
break blocks are labelless by type.

## Alternatives considered

- **Label everything.** Uniform pipeline, but labels on breaks add noise to
  history aggregation with no query value — nobody asks "what did I do on
  my breaks?" Rejected.

## Consequences

- History aggregation by tag and by day only ever sees focus blocks.
- SCR-14 (label sheet) is unreachable from a break block.
