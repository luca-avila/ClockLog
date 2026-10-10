// ClockLog — a timer and weekly planner
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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Header omits the word this module may never contain (invariant 13).

import type { PlanSearch } from "./view";

/** Pure builders for the plan's links — the writer side of `parsePlanSearch`
 *  (view.ts). Each returns `{ to, search }`, spread straight into a router
 *  `<Link>` or `navigate()`, so every plan URL is produced by one module and
 *  the reader/writer contract is pinned by roundtrip tests (plan-urls.test.ts). */

export const PLAN_WEEK_PATH = "/plan";
export const PLAN_DAY_PATH = "/plan/day";

export type PlanLink =
  | { to: typeof PLAN_WEEK_PATH; search: PlanSearch }
  | { to: typeof PLAN_DAY_PATH; search: PlanSearch };

/** The week screen for a Monday anchor. Callers already hold the Monday —
 *  addDays(week.from, ±7) and weekBounds(date).from. */
export function weekLink(from: string): PlanLink {
  return { to: PLAN_WEEK_PATH, search: { week: from } };
}

/** The day screen for a calendar date. */
export function dayLink(date: string): PlanLink {
  return { to: PLAN_DAY_PATH, search: { date } };
}

/** The editor in create mode on `date`; `hour` prefills the start time.
 *  0 is written (a tap at midnight); undefined omits the param. */
export function newEntryLink(date: string, hour?: number): PlanLink {
  return {
    to: PLAN_WEEK_PATH,
    search: hour !== undefined ? { new: 1, date, hour } : { new: 1, date },
  };
}

/** The editor in edit mode for an entry: on the day screen when `date` is
 *  given (sheet over the day), on the week screen when it is not. */
export function editEntryLink(entryId: string, date?: string): PlanLink {
  return date === undefined
    ? { to: PLAN_WEEK_PATH, search: { edit: entryId } }
    : { to: PLAN_DAY_PATH, search: { date, edit: entryId } };
}

/** The week screen with no anchor: the current week. */
export function currentWeekLink(): PlanLink {
  return { to: PLAN_WEEK_PATH, search: {} };
}

/** The day screen with no date: today. */
export function todayLink(): PlanLink {
  return { to: PLAN_DAY_PATH, search: {} };
}
