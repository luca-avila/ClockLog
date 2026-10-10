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

import { describe, it, expect } from "vitest";
import {
  currentWeekLink,
  dayLink,
  editEntryLink,
  newEntryLink,
  todayLink,
  weekLink,
  type PlanLink,
} from "@/lib/plan/urls";
import { parsePlanSearch, readPlanView } from "@/lib/plan/view";
import { createTestRouter } from "@/__tests__/helpers/providers";

const TODAY = "2026-08-19";

/** A link's search, read back the way the plan routes read it. */
function viewOf(link: PlanLink) {
  return readPlanView(parsePlanSearch({ ...link.search }), TODAY);
}

/** The href the router writes for a link — the URL a user would share. */
function hrefOf(link: PlanLink): string {
  return createTestRouter().buildLocation(link).href;
}

describe("plan link builders — exact grammar pins (the URLs the hand-rolled templates produced)", () => {
  it("weekLink targets the week screen by its Monday anchor", () => {
    expect(hrefOf(weekLink("2026-08-03"))).toBe("/plan?week=2026-08-03");
  });

  it("dayLink targets the day screen by calendar date", () => {
    expect(hrefOf(dayLink("2026-07-28"))).toBe("/plan/day?date=2026-07-28");
  });

  it("newEntryLink writes hour only when present — and 0 is present", () => {
    expect(hrefOf(newEntryLink("2026-08-03"))).toBe("/plan?new=1&date=2026-08-03");
    expect(hrefOf(newEntryLink("2026-08-03", 14))).toBe("/plan?new=1&date=2026-08-03&hour=14");
    expect(hrefOf(newEntryLink("2026-08-03", 0))).toBe("/plan?new=1&date=2026-08-03&hour=0");
  });

  it("editEntryLink opens over the week without a date, over the day with one", () => {
    expect(hrefOf(editEntryLink("e1"))).toBe("/plan?edit=e1");
    expect(hrefOf(editEntryLink("e1", "2026-07-28"))).toBe("/plan/day?date=2026-07-28&edit=e1");
  });

  it("the current-week and today links carry no params", () => {
    expect(hrefOf(currentWeekLink())).toBe("/plan");
    expect(hrefOf(todayLink())).toBe("/plan/day");
  });
});

describe("roundtrip builder -> readPlanView — the reader/writer contract", () => {
  it("weekLink parses back to Monday-start bounds of the anchor", () => {
    expect(viewOf(weekLink("2026-08-03")).week).toEqual({
      from: "2026-08-03",
      to: "2026-08-09",
    });
  });

  it("dayLink parses back to the date", () => {
    expect(viewOf(dayLink("2026-07-28")).date).toBe("2026-07-28");
  });

  it("newEntryLink(d) yields a create sheet with hour null — never 0", () => {
    expect(viewOf(newEntryLink("2026-08-03")).sheet).toEqual({
      kind: "create",
      date: "2026-08-03",
      hour: null,
    });
  });

  it("a written hour roundtrips, midnight (0) included", () => {
    expect(viewOf(newEntryLink("2026-08-03", 14)).sheet).toEqual({
      kind: "create",
      date: "2026-08-03",
      hour: 14,
    });
    expect(viewOf(newEntryLink("2026-08-03", 0)).sheet).toEqual({
      kind: "create",
      date: "2026-08-03",
      hour: 0,
    });
  });

  it("editEntryLink roundtrips to an edit sheet on both screens", () => {
    expect(viewOf(editEntryLink("e1")).sheet).toEqual({ kind: "edit", entryId: "e1" });
    expect(viewOf(editEntryLink("e1", "2026-07-28")).sheet).toEqual({
      kind: "edit",
      entryId: "e1",
    });
  });

  it("an href parses back through the router to the same search", () => {
    const router = createTestRouter();
    const link = newEntryLink("2026-08-03", 0);
    const searchStr = router.buildLocation(link).searchStr;
    expect(parsePlanSearch(router.options.parseSearch(searchStr))).toEqual(link.search);
  });
});
