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

# Decision log — closed

Every gate from the retired build plan, with its consequence. The one
standing decision point lives in `AGENTS.md` — the note under § Invariants →
Module independence, and § Scope boundaries: phase 3 (timer↔plan integration)
requires renegotiating invariants 12 and 13 in writing before any code.

| Gate | Decision | Consequence |
| --- | --- | --- |
| **G-1** — pause vs. abort (2026-08-05) | Pause is in. | `block` has a child `block_interval` table (`started_at`, `ended_at`); duration is derived from the interval sum, never stored. Paused time is excluded from elapsed. |
| **G-2** — do breaks carry labels? (2026-08-05) | No. Breaks are dead time. | Label sheet appears only after focus blocks; break blocks are labelless by type. |
| **G-3** — settings storage (2026-08-05) | Server-side. | One `user_setting` row per user; settings travel with the account. |
| **G-4** — planner tags (2026-08-15) | Shared. The plan uses the timer's `tag` table; `tag/` stays in `shared/`. | Tags are the single visual element shared across both modules; deleting a tag untaggs blocks **and** entries (`SET NULL`, invariant 10); the delete warning counts affected rows across both. |
| **G-5** — SCR-33 empty-state copy (2026-08-15) | "Timers are optional." dropped. | Invariant 13 stands unscoped: Plan screens carry no timer vocabulary at all, including the word *timer*. |

Supporting decisions recorded when the plan was retired:

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
  still hard-import timer components — full frontend deletability needs
  its own slice if ever needed.
- **RRULE/recurrence engine: never.** `repeat_weekly` is a plain flag;
  occurrences expand at read time (server-side) and nowhere else.
