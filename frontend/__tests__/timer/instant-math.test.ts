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

import { describe, it, expect, afterAll } from "vitest";
import {
  localDayRange,
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

describe("durationSeconds", () => {
  it("sums multiple closed intervals", () => {
    expect(
      durationSeconds([
        { started_at: "2026-07-15T10:00:00Z", ended_at: "2026-07-15T10:25:00Z" },
        { started_at: "2026-07-15T11:00:00Z", ended_at: "2026-07-15T11:10:00Z" },
      ])
    ).toBe(2100);
  });

  it("an open interval (ended_at null) contributes 0", () => {
    expect(
      durationSeconds([
        { started_at: "2026-07-15T10:00:00Z", ended_at: "2026-07-15T10:25:00Z" },
        { started_at: "2026-07-15T11:00:00Z", ended_at: null },
      ])
    ).toBe(1500);
    expect(durationSeconds([{ started_at: "2026-07-15T10:00:00Z", ended_at: null }])).toBe(0);
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
