# ADR-006: Open registration with verified email and password recovery

- Status: Accepted
- Date: 2026-08-23
- Supersedes: G-6 in docs/DECISIONS.md

## Context

ClockLog shipped as a self-hosted app for exactly one person: `POST
/auth/register` sealed itself after the first account, and that closed door
was the whole security model for sign-up. The app is now distributed, so the
door stays open and everything the closed door was standing in for has to be
built: who may sign up, how addresses are trusted, how passwords are
recovered, and what becomes load-bearing once rows belong to many users.

## Decision

Open registration. Anyone who can reach the instance may sign up; email
addresses are verified; passwords are recoverable. Concretely:

- **Anyone may register.** There is no instance-level switch to close
  registration again. A self-hoster who wants a private instance restricts
  it at nginx, not in application code — no `allow_registration` flag, no
  `is_premium`-shaped conditional threaded through auth (invariant 15's
  reasoning applies here too).
- **An unverified account cannot sign in.** `POST /auth/login` returns
  `403 EMAIL_NOT_VERIFIED` until the address is confirmed. The alternative —
  let people in and nag them — leaves accounts that can never be recovered,
  because password reset is only as trustworthy as the address it mails.
  Verification is therefore a gate, not a reminder.
- **Passwords are recoverable, so sessions must be revocable.** The JWT's
  `sub` moves from the email to the user id and gains a `pwd` claim pinned
  to the account's `password_changed_at`; changing the password moves that
  timestamp and every outstanding token stops validating. A password change
  revokes every live session.
- **Email is sent through Resend, over plain `httpx`.** No SDK. The call is
  one authenticated POST, and this codebase already hand-rolls auth rather
  than take a framework for the same reason (see G-6 in `AGENTS.md`).
- **Email-bearing tokens are stored hashed and never reused.** Verification
  and reset tokens live in the database as a SHA-256 digest with an expiry
  and a single-use marker.
- **Auth responses must not reveal whether an address is registered.**
  Login always runs bcrypt, even for unknown emails; `forgot-password` and
  `resend-verification` answer `204` either way.
- **No per-user quotas.** Storage and row counts are unbounded per account.
  Deliberate accepted risk, revisited only if abuse actually happens — not
  pre-solved.

## Alternatives considered

- **Stay single-user.** Rejected: the decision to distribute was taken; the
  sealed-registration model cannot survive it.
- **Closed registration with an allow-list / invite flag.** Rejected: it
  reintroduces instance-policy conditionals into application code. Private
  deployment is an nginx concern.
- **Verification as reminder (sign in first, nag later).** Rejected: creates
  unrecoverable accounts, as above.
- **Resend SDK or a heavier mail provider.** Rejected: one `httpx` POST
  needs no new dependency (per-repo rule: do not introduce dependencies
  without asking).

## Consequences

- `POST /auth/register` no longer closes; `REGISTRATION_CLOSED` is retired.
- Outbound email (Resend) becomes an operational dependency of sign-up; in
  dev the verification link is written to the backend log instead.
- Every `/auth` endpoint is rate-limited per IP; the three mail-sending ones
  are additionally limited per email address.
- Three cross-tenant gaps, harmless under one account, became load-bearing
  and were closed as part of the change, proven by
  `backend/tests/test_isolation.py`: `tag_id` accepted without ownership
  check; history summary loading tags by id with no `user_id` filter; and
  the browser's shared `localStorage` (namespaced `clocklog_*`, cleared on
  account switch so one account's in-progress block and offline queue never
  follow the next one into the app).

## What this does NOT license

Multi-user does not mean multi-tenant features. There is no sharing, no
team, no visibility of one account's data from another, and no admin surface
— there is still no path in the app that reads across users. Invariants
11–14 are untouched: this changes who the rows belong to, not how the two
modules relate.
