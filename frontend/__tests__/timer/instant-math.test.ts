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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { describe, it, expect, afterAll } from "vitest";
import {
  localDayRange,
  localWeekRange,
  localMonthRange,
  startOfLocalDay,
  formatWeekSubtitle,
  formatMonthSubtitle,
  durationSeconds,
  formatClock,
  formatDuration,
  withLocalTime,
  formatCountdown,
} from "@/lib/date/instant";

// This module reads the host timezone, so pin a DST-observing zone before any
// Date is constructed and restore it after (Node re-reads process.env.TZ;
// Vitest isolates per file, so this does not leak).
const originalTz = process.env.TZ;
process.env.TZ = "Europe/Madrid";

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("localDayRange (invariant 5: local day -> UTC instants)", () => {
  it("bounds a normal day with its two local midnights, 24h apart", () => {
    const { from, to } = localDayRange(new Date(2026, 6, 15, 12, 34, 56));
    const f = new Date(from);
    const t = new Date(to);
    expect(f.getHours()).toBe(0);
    expect(f.getMinutes()).toBe(0);
    expect(f.getSeconds()).toBe(0);
    expect(f.getDate()).toBe(15);
    expect(t.getHours()).toBe(0);
    expect(t.getDate()).toBe(16);
    expect(t.getTime() - f.getTime()).toBe(24 * 3600 * 1000);
  });

  it("is 23h on the spring-forward day (Madrid 2026-03-29)", () => {
    const { from, to } = localDayRange(new Date(2026, 2, 29, 12, 0, 0));
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(23 * 3600 * 1000);
  });

  it("is 25h on the fall-back day (Madrid 2026-10-25)", () => {
    const { from, to } = localDayRange(new Date(2026, 9, 25, 12, 0, 0));
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(25 * 3600 * 1000);
  });

  it("emits second-precision instants ending in Z, no milliseconds", () => {
    const { from, to } = localDayRange(new Date(2026, 6, 15, 12, 0, 0));
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    expect(from).toMatch(iso);
    expect(to).toMatch(iso);
  });
});

describe("localWeekRange (invariant 5: Monday-start local week -> UTC instants)", () => {
  it("bounds the week of a mid-week anchor with Monday and the next Monday", () => {
    // Wed Sep 16 2026, Madrid: local Monday Sep 14 00:00 → 22:00Z the day before.
    const { from, to } = localWeekRange(new Date(2026, 8, 16, 12, 0, 0));
    expect(from).toBe("2026-09-13T22:00:00Z");
    expect(to).toBe("2026-09-20T22:00:00Z");
    expect(new Date(from).getDay()).toBe(1); // Monday
    expect(new Date(to).getDay()).toBe(1);
  });

  it("puts Sunday in the week that ends that Sunday", () => {
    const { from, to } = localWeekRange(new Date(2026, 8, 13, 12, 0, 0)); // Sunday
    expect(from).toBe("2026-09-06T22:00:00Z");
    expect(to).toBe("2026-09-13T22:00:00Z");
  });

  it("opens a new week on Monday", () => {
    const sunday = localWeekRange(new Date(2026, 8, 13, 12, 0, 0));
    const monday = localWeekRange(new Date(2026, 8, 14, 12, 0, 0));
    expect(monday.from).toBe(sunday.to);
  });

  it("crosses into the previous year for a Jan 1 anchor", () => {
    const { from, to } = localWeekRange(new Date(2026, 0, 1, 12, 0, 0)); // Thursday
    expect(from).toBe("2025-12-28T23:00:00Z"); // Monday Dec 29 2025 local
    expect(to).toBe("2026-01-04T23:00:00Z");
  });

  it("is 167h across the spring-forward week (Madrid 2026-03-23)", () => {
    const { from, to } = localWeekRange(new Date(2026, 2, 23, 12, 0, 0));
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(167 * 3600 * 1000);
  });

  it("ignores the anchor's time of day", () => {
    const midnight = localWeekRange(new Date(2026, 8, 16, 0, 0, 0));
    const noon = localWeekRange(new Date(2026, 8, 16, 12, 34, 56));
    expect(noon).toEqual(midnight);
  });

  it("emits local-midnight instants ending in Z, no milliseconds", () => {
    const { from, to } = localWeekRange(new Date(2026, 8, 16, 12, 0, 0));
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    expect(from).toMatch(iso);
    expect(to).toMatch(iso);
    expect(new Date(from).getHours()).toBe(0);
    expect(new Date(from).getMinutes()).toBe(0);
    expect(new Date(to).getHours()).toBe(0);
  });
});

describe("localMonthRange (invariant 5: local calendar month -> UTC instants)", () => {
  it("bounds a month with its first and next-first local midnights", () => {
    const { from, to } = localMonthRange(new Date(2026, 8, 16, 12, 0, 0));
    expect(from).toBe("2026-08-31T22:00:00Z"); // Sep 1 00:00 Madrid
    expect(to).toBe("2026-09-30T22:00:00Z"); // Oct 1 00:00 Madrid
  });

  it("rolls December into January of the next year", () => {
    const { from, to } = localMonthRange(new Date(2026, 11, 15, 12, 0, 0));
    expect(from).toBe("2026-11-30T23:00:00Z"); // Dec 1 2026 Madrid
    expect(to).toBe("2026-12-31T23:00:00Z"); // Jan 1 2027 Madrid
    expect(new Date(to).getFullYear()).toBe(2027);
  });

  it("ignores the anchor's day and time of day", () => {
    const first = localMonthRange(new Date(2026, 8, 1, 0, 0, 0));
    const last = localMonthRange(new Date(2026, 8, 30, 23, 59, 0));
    expect(last).toEqual(first);
  });

  it("emits local-midnight instants ending in Z, no milliseconds", () => {
    const { from, to } = localMonthRange(new Date(2026, 8, 16, 12, 0, 0));
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    expect(from).toMatch(iso);
    expect(to).toMatch(iso);
    expect(new Date(from).getDate()).toBe(1);
    expect(new Date(to).getDate()).toBe(1);
  });
});

describe("history range headings", () => {
  it("renders a week subtitle as Monday through Sunday", () => {
    expect(formatWeekSubtitle(new Date(2026, 8, 16, 12, 0, 0))).toBe("Sep 14 – Sep 20");
  });

  it("renders a month subtitle as the month and year of the anchor", () => {
    expect(formatMonthSubtitle(new Date(2026, 8, 16, 12, 0, 0))).toBe("September 2026");
    expect(formatMonthSubtitle(new Date(2026, 11, 15, 12, 0, 0))).toBe("December 2026");
  });
});

describe("startOfLocalDay", () => {
  it("drops the time of day", () => {
    const d = startOfLocalDay(new Date(2026, 8, 16, 23, 59, 59));
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 16]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([
      0, 0, 0, 0,
    ]);
  });
});

describe("durationSeconds", () => {
  it("sums multiple closed intervals", () => {
    expect(
      durationSeconds([
        { started_at: "2026-07-15T10:00:00Z", ended_at: "2026-07-15T10:25:00Z" },
        { started_at: "2026-07-15T11:00:00Z", ended_at: "2026-07-15T11:10:00Z" },
      ])
    ).toBe(2100);
  });

  it("an empty list is 0", () => {
    expect(durationSeconds([])).toBe(0);
  });
});

describe("formatClock", () => {
  it("renders a post-midnight instant as 00:xx, never 24:xx", () => {
    // Regression guard: toLocaleTimeString({hour12:false}) rendered this as 24:23.
    const postMidnight = new Date(2026, 6, 15, 0, 23, 0).toISOString();
    expect(formatClock(postMidnight)).toBe("00:23");
  });

  it("renders an ordinary afternoon time", () => {
    const afternoon = new Date(2026, 6, 15, 15, 45, 0).toISOString();
    expect(formatClock(afternoon)).toBe("15:45");
  });
});

describe("withLocalTime", () => {
  it("round-trips with formatClock and keeps the local calendar day", () => {
    const iso = new Date(2026, 6, 15, 9, 30, 0).toISOString();
    const moved = withLocalTime(iso, "17:45");
    expect(formatClock(moved)).toBe("17:45");
    const d = new Date(moved);
    expect(d.getDate()).toBe(15);
    expect(d.getMonth()).toBe(6);
  });
});

describe("formatDuration", () => {
  it("renders hours and minutes from seconds", () => {
    expect(formatDuration(5400)).toBe("1h 30m"); // 90m
    expect(formatDuration(2700)).toBe("45m"); // 45m
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("formatCountdown", () => {
  it("renders MM:SS from a millisecond duration", () => {
    expect(formatCountdown(25 * 60_000)).toBe("25:00");
    expect(formatCountdown(45_000)).toBe("00:45");
    expect(formatCountdown(0)).toBe("00:00");
  });
});
