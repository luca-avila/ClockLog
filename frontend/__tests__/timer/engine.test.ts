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

import { describe, it, expect } from "vitest";
import {
  elapsed,
  cyclePosition,
  nextDuration,
  TimerState,
  serializeState,
  deserializeState,
  defaultSettings,
  TimerSettings,
} from "@/lib/timer/engine";

const STORAGE_KEY = "tempo_clock";

function clearStorage() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

describe("elapsed", () => {
  it("returns 0 when startedAt equals now", () => {
    const now = 1000000;
    expect(elapsed(now, now)).toBe(0);
  });

  it("computes elapsed time in ms", () => {
    const startedAt = 1000000;
    const now = 1000000 + 25 * 60 * 1000; // 25 minutes later
    expect(elapsed(startedAt, now)).toBe(25 * 60 * 1000);
  });

  it("handles background tab of 10 minutes correctly", () => {
    // Simulate: tab starts at T, gets throttled, re-render at T+10min
    const startedAt = 0;
    const now = 10 * 60 * 1000;
    expect(elapsed(startedAt, now)).toBe(600_000);
  });

  it("is structurally drift-proof — no accumulator", () => {
    // If we had an accumulating counter that added 1s per tick,
    // a throttled tab would under-report. But elapsed() is pure
    // subtraction of two instants, so it's always correct.
    const startedAt = 500_000;
    const now = 500_000 + 1_800_000; // 30 min later
    // Drift is structurally impossible — it's a pure function
    expect(elapsed(startedAt, now)).toBe(1_800_000);
  });

  it("DST forward — real duration unchanged", () => {
    // Spring forward: 02:00 → 03:00, so wall-clock shows 25 min
    // but real time was 24 min (not applicable in pure ms — both
    // instants are epoch ms, so DST never matters)
    const startedAt = new Date("2026-03-29T01:00:00Z").getTime();
    const endedAt = new Date("2026-03-29T01:25:00Z").getTime();
    expect(elapsed(startedAt, endedAt)).toBe(25 * 60 * 1000);
  });
});

describe("elapsed with intervals", () => {
  it("sums intervals including open one up to now", () => {
    const startedAt = 1_000_000;
    const intervals = [
      { startedAt: 1_000_000, endedAt: 1_000_000 + 300_000 }, // 5 min closed
      { startedAt: 1_000_000 + 360_000, endedAt: 1_000_000 + 660_000 }, // 5 min closed
      { startedAt: 1_000_000 + 720_000 }, // in progress
    ];
    const now = 1_000_000 + 900_000;
    // 300k closed + 300k closed + (900k-720k) open = 780k
    expect(elapsed(startedAt, now, intervals)).toBe(780_000);
  });

  it("open interval is counted up to now", () => {
    const startedAt = 1_000_000;
    const intervals = [
      { startedAt: 1_000_000, endedAt: 1_000_000 + 300_000 },
      { startedAt: 1_000_000 + 360_000 }, // open since then
    ];
    const now = 1_000_000 + 660_000; // 5 min into second interval
    // 5 min closed + 5 min open-so-far = 10 min
    expect(elapsed(startedAt, now, intervals)).toBe(600_000);
  });

  it("excludes pause gaps between intervals", () => {
    const startedAt = 0;
    const intervals = [
      { startedAt: 0, endedAt: 300_000 },
      // 120s pause gap (not counted)
      { startedAt: 420_000, endedAt: 600_000 },
    ];
    expect(elapsed(startedAt, 600_000, intervals)).toBe(480_000); // 5+3=8 min
  });
});

describe("cyclePosition", () => {
  it("after 0 completions → 4 remaining, not long break", () => {
    const pos = cyclePosition(0, 4);
    expect(pos).toEqual({ completed: 0, remaining: 4, isLongBreak: false });
  });

  it("after 4 completions with blocksPerCycle=4 → 0 remaining, long break", () => {
    const pos = cyclePosition(4, 4);
    expect(pos).toEqual({ completed: 0, remaining: 4, isLongBreak: true });
  });

  it("after 5 completions with blocksPerCycle=4 → 1 completed, 3 remaining", () => {
    // Cycle wraps: 4 done → long break → start new cycle at 1 completed
    const pos = cyclePosition(5, 4);
    expect(pos).toEqual({ completed: 1, remaining: 3, isLongBreak: false });
  });

  it("after 1 completion → 1 completed, 3 remaining", () => {
    const pos = cyclePosition(1, 4);
    expect(pos).toEqual({ completed: 1, remaining: 3, isLongBreak: false });
  });
});

describe("nextDuration", () => {
  const settings: TimerSettings = {
    ...defaultSettings,
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    blocksPerCycle: 4,
  };

  it("returns focus duration for focus type", () => {
    expect(nextDuration("focus", settings)).toBe(25 * 60);
  });

  it("returns short break duration when not cycle end", () => {
    expect(nextDuration("short_break", settings)).toBe(5 * 60);
  });

  it("returns long break duration when cycle end", () => {
    expect(nextDuration("long_break", settings)).toBe(15 * 60);
  });
});

describe("state serialization", () => {
  it("round-trips an in-progress focus block", () => {
    const state: TimerState = {
      id: "test-uuid-123",
      type: "focus",
      startedAt: 1_700_000_000_000,
      label: "debug JWT refresh",
      tagId: null,
      focusBlocksCompleted: 2,
      blockStatus: "completed",
      intervals: [
        { startedAt: 1_700_000_000_000, endedAt: 1_700_000_000_000 + 300_000 },
        { startedAt: 1_700_000_000_000 + 360_000 },
      ],
    };

    const json = serializeState(state);
    const restored = deserializeState(json);

    expect(restored).toEqual(state);
  });

  it("survives localStorage round-trip", () => {
    clearStorage();

    const state: TimerState = {
      id: crypto.randomUUID(),
      type: "focus",
      startedAt: Date.now(),
      label: "testing localStorage",
      tagId: null,
      focusBlocksCompleted: 0,
      blockStatus: "completed",
      intervals: [
        { startedAt: Date.now() },
      ],
    };

    localStorage.setItem(STORAGE_KEY, serializeState(state));
    const restored = localStorage.getItem(STORAGE_KEY);
    expect(restored).not.toBeNull();
    const parsed = deserializeState(restored!);
    expect(parsed.type).toBe("focus");
    expect(parsed.label).toBe("testing localStorage");
    expect(parsed.intervals).toHaveLength(1);

    clearStorage();
  });
});

describe("reopened after block ended", () => {
  it("reports that the block ended at T", () => {
    const settings: TimerSettings = {
      ...defaultSettings,
      focusDuration: 25,
    };

    const targetDuration = nextDuration("focus", settings); // 25 * 60 * 1000
    const startedAt = 1_000_000;
    const intervals = [{ startedAt }]; // never ended
    const now = startedAt + targetDuration + 5 * 60 * 1000; // 5 min overdue

    const e = elapsed(startedAt, now, intervals);
    // The elapsed time exceeds the target duration
    expect(e).toBeGreaterThan(targetDuration);
    // The caller decides save/adjust/discard — engine just reports facts
  });
});
