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
  type TimerState,
  type TimerSettings,
  serializeState,
  deserializeState,
  defaultSettings,
  transition,
  type ClockDeps,
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

  it("blocksPerCycle=0 from stale storage degrades to a 1-block cycle, not NaN", () => {
    const pos = cyclePosition(3, 0);
    expect(Number.isNaN(pos.completed)).toBe(false);
    expect(Number.isNaN(pos.remaining)).toBe(false);
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
    expect(parsed?.type).toBe("focus");
    expect(parsed?.label).toBe("testing localStorage");
    expect(parsed?.intervals).toHaveLength(1);

    clearStorage();
  });

  it("accepts a state persisted before targetMs existed", () => {
    const legacy = {
      id: "legacy",
      type: "short_break",
      startedAt: 1_700_000_000_000,
      label: null,
      tagId: null,
      focusBlocksCompleted: 4,
      blockStatus: "completed",
      intervals: [{ startedAt: 1_700_000_000_000 }],
    };
    expect(deserializeState(JSON.stringify(legacy))).toEqual(legacy);
  });
});

describe("deserializeState rejects corrupt or stale shapes (null, never NaN)", () => {
  it("rejects non-JSON and non-objects", () => {
    expect(deserializeState("not json{{{")).toBeNull();
    expect(deserializeState("42")).toBeNull();
    expect(deserializeState("null")).toBeNull();
  });

  it("rejects a missing id and unknown block type", () => {
    const base = {
      type: "focus",
      startedAt: 1,
      label: null,
      tagId: null,
      focusBlocksCompleted: 0,
      blockStatus: "completed",
      intervals: [{ startedAt: 1 }],
    };
    expect(deserializeState(JSON.stringify({ ...base }))).toBeNull();
    expect(
      deserializeState(JSON.stringify({ ...base, id: "x", type: "siesta" }))
    ).toBeNull();
  });

  it("rejects non-finite startedAt and non-array intervals", () => {
    const base = {
      id: "x",
      type: "focus",
      label: null,
      tagId: null,
      focusBlocksCompleted: 0,
      blockStatus: "completed",
    };
    expect(
      deserializeState(JSON.stringify({ ...base, startedAt: "nope", intervals: [] }))
    ).toBeNull();
    expect(
      deserializeState(JSON.stringify({ ...base, startedAt: 1, intervals: "no" }))
    ).toBeNull();
  });

  it("rejects intervals without finite numbers", () => {
    const base = {
      id: "x",
      type: "focus",
      startedAt: 1,
      label: null,
      tagId: null,
      focusBlocksCompleted: 0,
      blockStatus: "completed",
    };
    expect(
      deserializeState(JSON.stringify({ ...base, intervals: [{ endedAt: 5 }] }))
    ).toBeNull();
    expect(
      deserializeState(JSON.stringify({ ...base, intervals: [{ startedAt: Infinity }] }))
    ).toBeNull();
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

// ─── transition() ──────────────────────────────────────────────────

function makeClock(start: number): ClockDeps & { advance: (ms: number) => void } {
  let time = start;
  let idCounter = 0;
  const clock = {
    now: () => time,
    uuid: () => `test-uuid-${++idCounter}`,
    advance: (ms: number) => {
      time += ms;
    },
  };
  return clock;
}

const settings: TimerSettings = {
  ...defaultSettings,
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  blocksPerCycle: 4,
};

describe("transition — start", () => {
  it("creates a new focus block with captured targetMs", () => {
    const clock = makeClock(1_000_000);
    const result = transition(
      null,
      { kind: "start", type: "focus", label: "test", tagId: null },
      clock,
      settings,
      0,
      false
    );
    expect(result.state).not.toBeNull();
    expect(result.state!.type).toBe("focus");
    expect(result.state!.label).toBe("test");
    expect(result.state!.targetMs).toBe(25 * 60 * 1000);
    expect(result.state!.intervals).toHaveLength(1);
    expect(result.state!.intervals[0].startedAt).toBe(1_000_000);
  });

  it("clears pendingBreak on start", () => {
    const clock = makeClock(1_000_000);
    const result = transition(
      null,
      { kind: "start", type: "short_break", label: null, tagId: null },
      clock,
      settings,
      4,
      true
    );
    expect(result.effects).toContainEqual({
      type: "advanceCycle",
      completed: 4,
      pendingBreak: false,
    });
  });

  it("does not emit advanceCycle when pendingBreak is false", () => {
    const clock = makeClock(1_000_000);
    const result = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    expect(result.effects.filter((e) => e.type === "advanceCycle")).toHaveLength(0);
  });
});

describe("transition — pause and resume", () => {
  it("pauses a running block", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    clock.advance(5000);
    const paused = transition(started.state, { kind: "pause" }, clock, settings, 0, false);
    expect(paused.state!.intervals).toHaveLength(1);
    expect(paused.state!.intervals[0].endedAt).toBe(1_005_000);
  });

  it("resumes a paused block", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    clock.advance(5000);
    const paused = transition(started.state, { kind: "pause" }, clock, settings, 0, false);
    clock.advance(3000);
    const resumed = transition(paused.state, { kind: "resume" }, clock, settings, 0, false);
    expect(resumed.state!.intervals).toHaveLength(2);
    expect(resumed.state!.intervals[1].startedAt).toBe(1_008_000);
    expect(resumed.state!.intervals[1].endedAt).toBeUndefined();
  });

  it("ignores pause when already paused", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    clock.advance(5000);
    const paused = transition(started.state, { kind: "pause" }, clock, settings, 0, false);
    const pausedAgain = transition(paused.state, { kind: "pause" }, clock, settings, 0, false);
    expect(pausedAgain.state!.intervals).toHaveLength(1);
  });

  it("ignores resume when not paused", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    const resumed = transition(started.state, { kind: "resume" }, clock, settings, 0, false);
    expect(resumed.state!.intervals).toHaveLength(1);
    expect(resumed.state!.intervals[0].endedAt).toBeUndefined();
  });
});

describe("transition — stop", () => {
  it("aborts a focus block and advances cycle", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      2,
      false
    );
    clock.advance(5000);
    const stopped = transition(started.state, { kind: "stop" }, clock, settings, 2, false);
    expect(stopped.state).toBeNull();
    expect(stopped.effects).toContainEqual(expect.objectContaining({ type: "save" }));
    expect(stopped.effects).toContainEqual({ type: "alert", blockType: "focus" });
    expect(stopped.effects).toContainEqual({
      type: "advanceCycle",
      completed: 3,
      pendingBreak: true,
    });
  });

  it("aborts a break block without advancing cycle", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "short_break", label: null, tagId: null },
      clock,
      settings,
      4,
      true
    );
    clock.advance(5000);
    const stopped = transition(started.state, { kind: "stop" }, clock, settings, 4, true);
    expect(stopped.state).toBeNull();
    expect(stopped.effects).toContainEqual(expect.objectContaining({ type: "save" }));
    const cycleEffects = stopped.effects.filter((e) => e.type === "advanceCycle");
    expect(cycleEffects).toHaveLength(0);
  });
});

describe("transition — tick", () => {
  it("returns state unchanged when time is under target", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    clock.advance(1000);
    const result = transition(started.state, { kind: "tick" }, clock, settings, 0, false);
    expect(result.state).toBe(started.state);
    expect(result.effects).toHaveLength(0);
  });

  it("shows label sheet when focus time is up", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    clock.advance(25 * 60 * 1000 + 1);
    const result = transition(started.state, { kind: "tick" }, clock, settings, 0, false);
    expect(result.state).not.toBeNull();
    expect(result.state!.type).toBe("focus");
    expect(result.effects).toContainEqual({ type: "showLabelSheet" });
    expect(result.effects).toContainEqual({ type: "alert", blockType: "focus" });
  });

  it("closes the last interval on focus completion", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    clock.advance(25 * 60 * 1000 + 1);
    const result = transition(started.state, { kind: "tick" }, clock, settings, 0, false);
    const last = result.state!.intervals[result.state!.intervals.length - 1];
    expect(last.endedAt).toBe(1_000_000 + 25 * 60 * 1000 + 1);
  });

  it("saves and goes idle when break time is up", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "short_break", label: null, tagId: null },
      clock,
      settings,
      4,
      true
    );
    clock.advance(5 * 60 * 1000 + 1);
    const result = transition(started.state, { kind: "tick" }, clock, settings, 4, true);
    expect(result.state).toBeNull();
    expect(result.effects).toContainEqual(expect.objectContaining({ type: "save" }));
    expect(result.effects).toContainEqual({ type: "alert", blockType: "short_break" });
  });

  it("does nothing on tick when paused", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    clock.advance(5000);
    const paused = transition(started.state, { kind: "pause" }, clock, settings, 0, false);
    clock.advance(25 * 60 * 1000);
    const result = transition(paused.state, { kind: "tick" }, clock, settings, 0, false);
    expect(result.state).toBe(paused.state);
    expect(result.effects).toHaveLength(0);
  });
});

describe("transition — labelSave", () => {
  it("saves with label and advances cycle", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    clock.advance(5000);
    const result = transition(
      started.state,
      { kind: "labelSave", label: "my task", tagId: "tag-1" },
      clock,
      settings,
      0,
      false
    );
    expect(result.state).toBeNull();
    const saveEffect = result.effects.find(
      (e): e is { type: "save"; state: TimerState } => e.type === "save"
    )!;
    expect(saveEffect).toBeDefined();
    expect(saveEffect.state.label).toBe("my task");
    expect(saveEffect.state.tagId).toBe("tag-1");
    expect(result.effects).toContainEqual({
      type: "advanceCycle",
      completed: 1,
      pendingBreak: true,
    });
  });

  it("empty label becomes null", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    const result = transition(
      started.state,
      { kind: "labelSave", label: "", tagId: null },
      clock,
      settings,
      0,
      false
    );
    const saveEffect = result.effects.find(
      (e): e is { type: "save"; state: TimerState } => e.type === "save"
    )!;
    expect(saveEffect.state.label).toBeNull();
  });
});

describe("transition — elapsed time (drift-proof)", () => {
  it("background tab jump does not accumulate", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    // Simulate 10 minutes of background throttle
    clock.advance(10 * 60 * 1000);
    const result = transition(started.state, { kind: "tick" }, clock, settings, 0, false);
    // 10 min elapsed, target is 25 min — should not complete
    expect(result.state).toBe(started.state);
    expect(result.effects).toHaveLength(0);
  });

  it("respects captured targetMs, not current settings", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    // Even if we pass different settings to tick, the captured targetMs governs
    const differentSettings = { ...settings, focusDuration: 5 };
    clock.advance(25 * 60 * 1000 + 1);
    const result = transition(started.state, { kind: "tick" }, clock, differentSettings, 0, false);
    // targetMs was 25 min, so 25 min + 1 should trigger completion
    expect(result.effects).toContainEqual({ type: "showLabelSheet" });
  });
});

describe("transition — cycle integration", () => {
  it("start after 4 completions with pendingBreak clears pendingBreak", () => {
    const clock = makeClock(1_000_000);
    const result = transition(
      null,
      { kind: "start", type: "long_break", label: null, tagId: null },
      clock,
      settings,
      4,
      true
    );
    expect(result.effects).toContainEqual({
      type: "advanceCycle",
      completed: 4,
      pendingBreak: false,
    });
  });

  it("stop focus at position 3 advances to 4 (triggers long break next)", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      3,
      false
    );
    const stopped = transition(started.state, { kind: "stop" }, clock, settings, 3, false);
    expect(stopped.effects).toContainEqual({
      type: "advanceCycle",
      completed: 4,
      pendingBreak: true,
    });
  });
});
