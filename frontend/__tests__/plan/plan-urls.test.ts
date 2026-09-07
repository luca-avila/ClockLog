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
  dayUrl,
  editEntryUrl,
  newEntryUrl,
  weekUrl,
  withTick,
} from "@/lib/plan/urls";
import { readPlanView } from "@/lib/plan/view";

const TODAY = "2026-08-19";

/** Builder output is a path + query; readPlanView only reads the query. */
function viewOf(builtUrl: string) {
  return readPlanView(new URLSearchParams(builtUrl.split("?")[1] ?? ""), TODAY);
}

describe("plan URL builders — exact grammar pins (the strings the hand-rolled templates produced)", () => {
  it("weekUrl targets the week screen by its Monday anchor", () => {
    expect(weekUrl("2026-08-03")).toBe("/plan?week=2026-08-03");
  });

  it("dayUrl targets the day screen by calendar date", () => {
    expect(dayUrl("2026-07-28")).toBe("/plan/day?date=2026-07-28");
  });

  it("newEntryUrl writes hour only when present — and 0 is present", () => {
    expect(newEntryUrl("2026-08-03")).toBe("/plan?new=1&date=2026-08-03");
    expect(newEntryUrl("2026-08-03", 14)).toBe("/plan?new=1&date=2026-08-03&hour=14");
    expect(newEntryUrl("2026-08-03", 0)).toBe("/plan?new=1&date=2026-08-03&hour=0");
  });

  it("editEntryUrl opens over the week without a date, over the day with one", () => {
    expect(editEntryUrl("e1")).toBe("/plan?edit=e1");
    expect(editEntryUrl("e1", "2026-07-28")).toBe("/plan/day?date=2026-07-28&edit=e1");
  });

  it("withTick sets t, replacing any existing one", () => {
    expect(withTick("/plan", 42)).toBe("/plan?t=42");
    expect(withTick("/plan/day?date=x", 42)).toBe("/plan/day?date=x&t=42");
    expect(withTick("/plan?t=1", 42)).toBe("/plan?t=42");
  });
});

describe("roundtrip builder -> readPlanView — the reader/writer contract", () => {
  it("weekUrl parses back to Monday-start bounds of the anchor", () => {
    expect(viewOf(weekUrl("2026-08-03")).week).toEqual({
      from: "2026-08-03",
      to: "2026-08-09",
    });
  });

  it("dayUrl parses back to the date", () => {
    expect(viewOf(dayUrl("2026-07-28")).date).toBe("2026-07-28");
  });

  it("newEntryUrl(d) yields a create sheet with hour null — never 0", () => {
    expect(viewOf(newEntryUrl("2026-08-03")).sheet).toEqual({
      kind: "create",
      date: "2026-08-03",
      hour: null,
    });
  });

  it("a written hour roundtrips, midnight (0) included", () => {
    expect(viewOf(newEntryUrl("2026-08-03", 14)).sheet).toEqual({
      kind: "create",
      date: "2026-08-03",
      hour: 14,
    });
    expect(viewOf(newEntryUrl("2026-08-03", 0)).sheet).toEqual({
      kind: "create",
      date: "2026-08-03",
      hour: 0,
    });
  });

  it("editEntryUrl roundtrips to an edit sheet on both screens", () => {
    expect(viewOf(editEntryUrl("e1")).sheet).toEqual({ kind: "edit", entryId: "e1" });
    expect(viewOf(editEntryUrl("e1", "2026-07-28")).sheet).toEqual({
      kind: "edit",
      entryId: "e1",
    });
  });

  it("withTick sets the tick the screen behind refetches on", () => {
    expect(viewOf(withTick("/plan", 42)).tick).toBe("42");
  });
});
