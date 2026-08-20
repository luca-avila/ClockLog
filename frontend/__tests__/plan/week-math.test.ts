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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  weekBounds,
  addDays,
  weekDays,
  minutesBetween,
  formatDuration,
  localTodayIso,
  isCalendarDate,
  minuteOfDay,
  hhmm,
} from "@/lib/date/week";

describe("weekBounds (Monday-start, pure date math)", () => {
  it("returns Monday..Sunday for an anchor mid-week", () => {
    // 2026-07-28 is a Tuesday
    expect(weekBounds("2026-07-28")).toEqual({
      from: "2026-07-27",
      to: "2026-08-02",
    });
  });

  it("anchors on a Monday return that same Monday", () => {
    expect(weekBounds("2026-07-27").from).toBe("2026-07-27");
    expect(weekBounds("2026-07-27").to).toBe("2026-08-02");
  });

  it("anchors on a Sunday belong to the previous Monday", () => {
    expect(weekBounds("2026-08-02")).toEqual({
      from: "2026-07-27",
      to: "2026-08-02",
    });
  });

  it("is correct across the US DST-forward week (2026-03-08)", () => {
    // Sunday 2026-03-08 springs forward; the containing week is Mar 2–8.
    expect(weekBounds("2026-03-08")).toEqual({ from: "2026-03-02", to: "2026-03-08" });
    expect(weekBounds("2026-03-06")).toEqual({ from: "2026-03-02", to: "2026-03-08" });
    // And the week after is unaffected.
    expect(weekBounds("2026-03-09")).toEqual({ from: "2026-03-09", to: "2026-03-15" });
  });

  it("is correct across the US DST-back week (2026-11-01)", () => {
    expect(weekBounds("2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(weekBounds("2026-10-30")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  it("is correct across a year boundary", () => {
    // 2026-01-01 is a Thursday → week spans 2025-12-29..2026-01-04.
    expect(weekBounds("2026-01-01")).toEqual({ from: "2025-12-29", to: "2026-01-04" });
  });
});

describe("localTodayIso (wall-clock today, not UTC today)", () => {
  const realTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = realTz;
    vi.useRealTimers();
  });

  it("uses the local calendar date west of UTC after midnight UTC", () => {
    // 2026-08-16T02:30Z is still Aug 15 in New York (UTC-4); the UTC
    // string would wrongly say "2026-08-16".
    process.env.TZ = "America/New_York";
    vi.useFakeTimers({ now: new Date("2026-08-16T02:30:00Z").getTime() });
    expect(localTodayIso()).toBe("2026-08-15");
  });

  it("uses the local calendar date east of UTC before noon UTC", () => {
    // 2026-08-16T02:30Z is already Aug 16 in Tokyo (UTC+9).
    process.env.TZ = "Asia/Tokyo";
    vi.useFakeTimers({ now: new Date("2026-08-16T02:30:00Z").getTime() });
    expect(localTodayIso()).toBe("2026-08-16");
  });
});

describe("addDays / weekDays", () => {
  it("adds across month and year boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("weekDays yields seven consecutive days starting at from", () => {
    expect(weekDays("2026-07-27")).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });
});

describe("minutesBetween (wall-clock, midnight-spanning)", () => {
  it("computes plain durations", () => {
    expect(minutesBetween("09:00:00", "12:00:00")).toBe(180);
    expect(minutesBetween("18:30:00", "19:30:00")).toBe(60);
  });

  it("an end before its start spans midnight and keeps the real length", () => {
    expect(minutesBetween("22:00:00", "00:30:00")).toBe(150);
    expect(minutesBetween("23:00:00", "01:00:00")).toBe(120);
  });
});

describe("isCalendarDate", () => {
  it("rejects malformed shapes", () => {
    expect(isCalendarDate(undefined)).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
    expect(isCalendarDate("")).toBe(false);
    expect(isCalendarDate("2026-8-3")).toBe(false);
    expect(isCalendarDate("not-a-date")).toBe(false);
  });

  it("rejects dates that would roll over on round-trip", () => {
    expect(isCalendarDate("2026-13-45")).toBe(false);
    expect(isCalendarDate("2026-02-30")).toBe(false);
  });

  it("accepts real calendar dates, including a leap day", () => {
    expect(isCalendarDate("2026-08-03")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
  });
});

describe("formatDuration", () => {
  it("renders whole hours compactly", () => {
    expect(formatDuration(2040)).toBe("34h");
    expect(formatDuration(60)).toBe("1h");
  });

  it("renders hours and minutes", () => {
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(45)).toBe("45m");
  });
});

describe("minuteOfDay", () => {
  it("parses HH:MM", () => {
    expect(minuteOfDay("00:00")).toBe(0);
    expect(minuteOfDay("09:30")).toBe(570);
    expect(minuteOfDay("23:59")).toBe(1439);
  });

  it("parses HH:MM:SS, ignoring seconds", () => {
    expect(minuteOfDay("09:30:00")).toBe(570);
  });
});

describe("hhmm", () => {
  it("trims HH:MM:SS to HH:MM", () => {
    expect(hhmm("18:30:00")).toBe("18:30");
  });

  it("returns HH:MM unchanged", () => {
    expect(hhmm("09:00")).toBe("09:00");
  });
});
