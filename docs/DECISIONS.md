// ClockLog — a Pomodoro timer and weekly planner
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

# Decision log — closed

Every design gate that was opened during the build, with its
consequence. The one standing decision point lives in `AGENTS.md` — the note under § Invariants →
Module independence, and § Scope boundaries: phase 3 (timer↔plan integration)
requires renegotiating invariants 12 and 13 in writing before any code.

| Gate | Decision | Consequence |
| --- | --- | --- |
| **G-1** — pause vs. abort (2026-08-05) | Pause is in. | `block` has a child `block_interval` table (`started_at`, `ended_at`); duration is derived from the interval sum, never stored. Paused time is excluded from elapsed. |
| **G-2** — do breaks carry labels? (2026-08-05) | No. Breaks are dead time. | Label sheet appears only after focus blocks; break blocks are labelless by type. |
| **G-3** — settings storage (2026-08-05) | Server-side. | One `user_setting` row per user; settings travel with the account. |
| **G-4** — planner tags (2026-08-15) | Shared. The plan uses the timer's `tag` table; `tag/` stays in `shared/`. | Tags are the single visual element shared across both modules; deleting a tag untaggs blocks **and** entries (`SET NULL`, invariant 10); the delete warning counts affected rows across both. |
| **G-5** — SCR-33 empty-state copy (2026-08-15) | "Timers are optional." dropped. | Invariant 13 stands unscoped: Plan screens carry no timer vocabulary at all, including the word *timer*. |
| **G-6** — single-user vs. open registration (2026-08-23) | **Open registration.** ClockLog becomes a multi-tenant hosted app: anyone may sign up, email addresses are verified, and passwords are recoverable. | `POST /auth/register` no longer closes; `REGISTRATION_CLOSED` is retired. Email verification is a hard gate on login. The JWT subject becomes the user id and carries a password-generation claim, so a password reset revokes every live session. Outbound email (Resend) becomes an operational dependency of sign-up. Cross-tenant checks that were inert under one user become load-bearing. See § G-6 in detail below. |
| **G-7** — product name (2026-08-27) | **Rename from Tempo to ClockLog.** | The project was previously called *Tempo*. The Postgres role and database (`tempo` → `clocklog`), the backup dump prefix (`tempo-*.dump` → `clocklog-*.dump`), the Python package (`clocklog-backend`), the logger (`clocklog.errors`), and the `localStorage` prefix (`tempo_*` → `clocklog_*`) were all renamed at the same time. No deployment or users existed at the date of the change, so no data migration was needed. Doing this before G-6 lands means the session guard's `clocklog_*` prefix was never shipped under the old name. The wordmark changed from `temp`+ring to `cl`+ring+`cklog`; ring geometry is unchanged. |

Supporting decisions, recorded once both modules shipped:

- **Plan API speaks dates, not instants.** An entry is wall-clock calendar
  data — a 09:00 class is 09:00 whatever the offset — so `plan` stores a
  naive `date` + `time` and its endpoints take dates. This is the one
  deliberate exception to CLAUDE.md invariant 5, which governs blocks
  (recorded events). Do not convert plan params to datetimes, and do not
  copy date params into any history endpoint.
- **Deletability is enforced, not hoped for.** `main.py` mounts the two
  feature routers tolerantly, `shared/` counts tag usage via table
  metadata (never feature imports), and `tests/test_deletability.py`
  proves either module deletable. Known gap, deliberate: frontend routes
  still hard-import timer components — full frontend deletability would
  need its own change if ever wanted.
- **RRULE/recurrence engine: never.** `repeat_weekly` is a plain flag;
  occurrences expand at read time (server-side) and nowhere else.


---

## G-6 in detail — the single-user assumption, retired

ClockLog shipped as a self-hosted app for exactly one person: `POST /auth/register`
sealed itself after the first account, and that closed door was the whole
security model for sign-up. The app is now distributed, so the door stays open
and everything the closed door was standing in for has to be built.

**What was decided, and what follows from it.**

- **Anyone may register.** There is no instance-level switch to close
  registration again. A self-hoster who wants a private instance restricts it at
  nginx, not in application code — no `allow_registration` flag, no
  `is_premium`-shaped conditional threaded through auth (invariant 15's reasoning
  applies here too).
- **An unverified account cannot sign in.** `POST /auth/login` returns
  `403 EMAIL_NOT_VERIFIED` until the address is confirmed. The alternative — let
  people in and nag them — leaves accounts that can never be recovered, because
  password reset is only as trustworthy as the address it mails. Verification is
  therefore a gate, not a reminder.
- **Passwords are recoverable, so sessions must be revocable.** A reset flow that
  cannot evict whoever stole the password is theatre. The JWT's `sub` moves from
  the email to the user id and gains a `pwd` claim pinned to the account's
  `password_changed_at`; changing the password moves that timestamp and every
  outstanding token stops validating.
- **Email is sent through Resend, over plain `httpx`.** No SDK. The call is one
  authenticated POST, and this codebase already hand-rolls auth rather than take a
  framework for the same reason.
- **No per-user quotas.** Storage and row counts are unbounded per account. This
  is a deliberate accepted risk, revisited only if abuse actually happens — not
  pre-solved.

**What this decision does *not* license.** Multi-user does not mean multi-tenant
features. There is no sharing, no team, no visibility of one account's data from
another, and no admin surface — there is still no path in the app that reads
across users. Invariants 11–14 are untouched: this changes who the rows belong
to, not how the two modules relate.

**The debts it calls in.** Three cross-tenant gaps were harmless under a single
account and are not harmless now: `tag_id` is accepted on blocks and entries
without checking that the tag belongs to the caller; the history summary loads
tags by id with no `user_id` filter; and the browser's `localStorage` is shared by
every account that signs in on that browser, including an offline queue that
would flush one user's blocks under another's token. Fixing these is part of the
change, not a follow-up — see `docs/plans/multi-user-auth.md`.
