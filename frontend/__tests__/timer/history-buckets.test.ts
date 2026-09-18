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

import { describe, it, expect, vi, afterAll } from "vitest";
import type { BlockData } from "@/lib/api/history";

// HistoryPage imports the API modules even though these tests only use its
// pure bucketing helper, so stub them before the module loads.
vi.mock("@/lib/api/history", () => ({
  fetchBlocks: vi.fn(),
  fetchSummary: vi.fn(),
  updateBlock: vi.fn(),
  deleteBlock: vi.fn(),
}));
vi.mock("@/lib/api/tags", () => ({ fetchTags: vi.fn() }));

import { bucketDayFocus } from "@/components/timer/HistoryPage";

// Local-day bucketing reads the host timezone, so pin a DST-observing zone
// before any Date is constructed (Vitest isolates per file).
const originalTz = process.env.TZ;
process.env.TZ = "Europe/Madrid";

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

function block(
  id: string,
  startedAt: Date,
  minutes: number,
  kind: BlockData["kind"] = "focus"
): BlockData {
  return {
    id,
    user_id: "user-1",
    status: "completed",
    kind,
    label: id,
    tag_id: null,
    started_at: startedAt.toISOString(),
    intervals: [
      {
        id: `${id}-i1`,
        started_at: startedAt.toISOString(),
        ended_at: new Date(startedAt.getTime() + minutes * 60_000).toISOString(),
      },
    ],
  };
}

const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 8, 14 + i)); // Mon Sep 14
const february = Array.from({ length: 28 }, (_, i) => new Date(2026, 1, 1 + i));

describe("bucketDayFocus (SCR-20 daily bars)", () => {
  it("counts a midnight-crossing focus block in the day it started (invariant 7)", () => {
    // Tue Sep 15 23:30 local for an hour: ends on the 16th, belongs to the 15th.
    const totals = bucketDayFocus(
      [block("night", new Date(2026, 8, 15, 23, 30, 0), 60)],
      week
    );
    expect(totals[1]).toBe(3600); // Tue
    expect(totals[2]).toBe(0); // Wed
  });

  it("excludes breaks, even a day that is nothing but breaks", () => {
    const totals = bucketDayFocus(
      [block("break", new Date(2026, 8, 15, 9, 0, 0), 25, "short_break")],
      week
    );
    expect(totals).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("leaves empty days at zero and keeps the busiest day the largest", () => {
    const totals = bucketDayFocus(
      [
        block("mon", new Date(2026, 8, 14, 9, 0, 0), 60),
        block("wed", new Date(2026, 8, 16, 9, 0, 0), 120),
      ],
      week
    );
    expect(totals).toEqual([3600, 0, 7200, 0, 0, 0, 0]);
    expect(Math.max(0, ...totals)).toBe(7200);
  });

  it("returns one slot per day of the week, in order", () => {
    expect(bucketDayFocus([], week)).toHaveLength(7);
  });

  it("returns 28 zero-interleaved slots for a February month", () => {
    const totals = bucketDayFocus(
      [
        block("early", new Date(2026, 1, 3, 9, 0, 0), 30),
        block("late", new Date(2026, 1, 20, 9, 0, 0), 45),
      ],
      february
    );
    expect(totals).toHaveLength(28);
    expect(totals[2]).toBe(1800); // Feb 3
    expect(totals[19]).toBe(2700); // Feb 20
    expect(totals.filter((s) => s > 0)).toHaveLength(2);
  });
});
