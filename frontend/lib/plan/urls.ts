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

/** Pure builders for the plan's URL grammar — the writer side of
 *  `readPlanView` (view.ts). Strings in, strings out, no next/navigation,
 *  so every plan URL is produced by one module and the reader/writer
 *  contract is pinned by roundtrip tests (plan-urls.test.ts). */

export const PLAN_WEEK_PATH = "/plan";
export const PLAN_DAY_PATH = "/plan/day";

/** The week screen's URL for a Monday anchor. Callers already hold the
 *  Monday — addDays(week.from, ±7) and weekBounds(date).from. */
export function weekUrl(from: string): string {
  return `${PLAN_WEEK_PATH}?week=${from}`;
}

/** The day screen's URL for a calendar date. */
export function dayUrl(date: string): string {
  return `${PLAN_DAY_PATH}?date=${date}`;
}

/** The editor in create mode on `date`; `hour` prefills the start time.
 *  0 is written (a tap at midnight); undefined omits the param. */
export function newEntryUrl(date: string, hour?: number): string {
  return `${PLAN_WEEK_PATH}?new=1&date=${date}${hour !== undefined ? `&hour=${hour}` : ""}`;
}

/** The editor in edit mode for an entry: on the day screen when `date` is
 *  given (sheet over the day), on the week screen when it is not. */
export function editEntryUrl(entryId: string, date?: string): string {
  return date === undefined
    ? `${PLAN_WEEK_PATH}?edit=${entryId}`
    : `${PLAN_DAY_PATH}?date=${date}&edit=${entryId}`;
}

/** Cache-buster. useOccurrences (lib/plan/hooks.ts) refetches when the `t`
 *  param changes, so save/delete append it and cancel does not. The tick is
 *  required: the builder stays pure (strings in, strings out). */
export function withTick(url: string, tick: number): string {
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set("t", String(tick)); // .set, not append: a preexisting t= is replaced
  return `${path}?${params.toString()}`;
}
