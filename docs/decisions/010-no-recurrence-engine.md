# ADR-010: No recurrence engine; `repeat_weekly` flag only

- Status: Accepted
- Date: 2026-08-15

## Context

A weekly planner invites a recurrence engine (RRULE semantics, series
exceptions, edited instances). That is a large surface for an isolated dated
calendar whose unit is an entry on a date (invariant 14).

## Decision

Never. Weekly repetition is a plain `repeat_weekly` flag on the entry;
occurrences expand at read time, server-side, and nowhere else. All-day
entries are supported on a single date; multi-day spans are not.

## Alternatives considered

- **iCal RRULE.** Rejected: recurrence semantics, exception handling, and
  series editing are an order of magnitude more machinery than the planner
  needs. The app records weeks; it is not a calendar platform.

## Consequences

- An entry belongs to a date, not a weekday; repetition is display
  expansion, not stored instances.
- No recurrence columns, no exception tables, no RRULE parser dependency.
