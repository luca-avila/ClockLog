# ADR-008: Plan API speaks dates, not instants

- Status: Accepted
- Date: 2026-08-15

## Context

Invariant 5 says the API speaks instants, never dates: history endpoints
take a `from`/`to` UTC range the client computed from its own local day
boundaries, and the server never reasons about "days". But a planner entry
is wall-clock calendar data — a 09:00 class is 09:00 whatever the offset —
which UTC instants misrepresent.

## Decision

The plan API is the one deliberate exception to invariant 5. `plan` stores
a naive `date` + `time` and its endpoints take dates. Invariant 5 governs
blocks (recorded events), not entries.

## Alternatives considered

- **Force the plan onto instants.** Rejected: it would pin wall-clock data
  to an offset and break the entry on every DST or timezone move.
- **Let history endpoints take dates too.** Rejected: day-bucketed
  aggregation server-side would then need a timezone, and invariant 5 would
  be a lie.

## Consequences

- Do not convert plan params to datetimes, and do not copy date params into
  any history endpoint.
- `backend/app/plan/` columns stay naive `date`/`time` — the only place in
  the schema where naive values are correct (timezone-aware datetimes
  everywhere else).
