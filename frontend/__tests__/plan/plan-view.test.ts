// Tempo — a timer and weekly planner
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
import { readPlanView } from "@/lib/plan/view";

const TODAY = "2026-08-19";

function view(qs: string) {
  return readPlanView(new URLSearchParams(qs), TODAY);
}

describe("readPlanView", () => {
  it("defaults date/week from today with no params", () => {
    const v = view("");
    expect(v.date).toBe(TODAY);
    expect(v.week).toEqual({ from: "2026-08-17", to: "2026-08-23" });
    expect(v.tick).toBe("");
    expect(v.sheet).toBeNull();
  });

  it("passes through a real date, falls back to today for garbage", () => {
    expect(view("date=2026-08-03").date).toBe("2026-08-03");
    expect(view("date=nonsense").date).toBe(TODAY);
    expect(view("date=2026-13-45").date).toBe(TODAY);
    expect(view("date=2026-02-30").date).toBe(TODAY);
  });

  it("week param sets Monday-start bounds; absent falls back to today's week", () => {
    expect(view("week=2026-08-12").week).toEqual({ from: "2026-08-10", to: "2026-08-16" });
    expect(view("").week).toEqual({ from: "2026-08-17", to: "2026-08-23" });
  });

  it("new=1 with no hour param yields hour null, not 0 (the bug)", () => {
    const sheet = view("new=1&date=2026-08-03").sheet;
    expect(sheet).toEqual({ kind: "create", date: "2026-08-03", hour: null });
  });

  it("hour parses a valid integer, rejects the rest", () => {
    expect(view("new=1&hour=9").sheet).toEqual({ kind: "create", date: TODAY, hour: 9 });
    for (const bad of ["abc", "", " ", "25", "-1", "9.5"]) {
      expect(view(`new=1&hour=${bad}`).sheet).toEqual({
        kind: "create",
        date: TODAY,
        hour: null,
      });
    }
  });

  it("edit wins over new", () => {
    expect(view("edit=abc").sheet).toEqual({ kind: "edit", entryId: "abc" });
    expect(view("edit=abc&new=1").sheet).toEqual({ kind: "edit", entryId: "abc" });
  });

  it("tick mirrors the t param", () => {
    expect(view("t=12345").tick).toBe("12345");
  });
});
