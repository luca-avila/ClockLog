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
    const startedAt = 0;
    const now = 10 * 60 * 1000;
    expect(elapsed(startedAt, now)).toBe(600_000);
  });

  it("is structurally drift-proof — no accumulator", () => {
    const startedAt = 500_000;
    const now = 500_000 + 1_800_000; // 30 min later
    expect(elapsed(startedAt, now)).toBe(1_800_000);
  });

  it("DST forward — real duration unchanged", () => {
    const startedAt = new Date("2026-03-29T01:00:00Z").getTime();
    const endedAt = new Date("2026-03-29T01:25:00Z").getTime();
    expect(elapsed(startedAt, endedAt)).toBe(25 * 60 * 1000);
  });
});

describe("elapsed with intervals", () => {
  it("sums intervals including open one up to now", () => {
    const startedAt = 1_000_000;
    const intervals = [
      { startedAt: 1_000_000, endedAt: 1_000_000 + 300_000 },
      { startedAt: 1_000_000 + 360_000, endedAt: 1_000_000 + 660_000 },
      { startedAt: 1_000_000 + 720_000 },
    ];
    const now = 1_000_000 + 900_000;
    expect(elapsed(startedAt, now, intervals)).toBe(780_000);
  });

  it("open interval is counted up to now", () => {
    const startedAt = 1_000_000;
    const intervals = [
      { startedAt: 1_000_000, endedAt: 1_000_000 + 300_000 },
      { startedAt: 1_000_000 + 360_000 },
    ];
    const now = 1_000_000 + 660_000;
    expect(elapsed(startedAt, now, intervals)).toBe(600_000);
  });

  it("excludes pause gaps between intervals", () => {
    const startedAt = 0;
    const intervals = [
      { startedAt: 0, endedAt: 300_000 },
      { startedAt: 420_000, endedAt: 600_000 },
    ];
    expect(elapsed(startedAt, 600_000, intervals)).toBe(480_000);
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
      phase: "running",
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
      phase: "running",
      startedAt: Date.now(),
      label: "testing localStorage",
      tagId: null,
      focusBlocksCompleted: 0,
      blockStatus: "completed",
      intervals: [{ startedAt: Date.now() }],
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
    expect(deserializeState(JSON.stringify(legacy))).toEqual({
      ...legacy,
      phase: "running",
    });
  });

  it("accepts a state persisted before phase existed (running)", () => {
    const legacy = {
      id: "pre-phase",
      type: "focus",
      startedAt: 1_700_000_000_000,
      label: null,
      tagId: null,
      focusBlocksCompleted: 0,
      blockStatus: "completed",
      intervals: [{ startedAt: 1_700_000_000_000 }],
    };
    const restored = deserializeState(JSON.stringify(legacy));
    expect(restored).not.toBeNull();
    expect(restored!.phase).toBe("running");
  });

  it("accepts a state persisted before phase existed (paused — last interval closed)", () => {
    const legacy = {
      id: "pre-phase-paused",
      type: "focus",
      startedAt: 1_700_000_000_000,
      label: null,
      tagId: null,
      focusBlocksCompleted: 0,
      blockStatus: "completed",
      intervals: [{ startedAt: 1_700_000_000_000, endedAt: 1_700_000_000_000 + 60_000 }],
    };
    const restored = deserializeState(JSON.stringify(legacy));
    expect(restored).not.toBeNull();
    expect(restored!.phase).toBe("paused");
  });

  it("rejects a present-but-invalid phase", () => {
    const base = {
      id: "x",
      type: "focus",
      startedAt: 1,
      label: null,
      tagId: null,
      focusBlocksCompleted: 0,
      blockStatus: "completed",
      intervals: [{ startedAt: 1 }],
    };
    expect(deserializeState(JSON.stringify({ ...base, phase: "siesta" }))).toBeNull();
    expect(deserializeState(JSON.stringify({ ...base, phase: 42 }))).toBeNull();
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

    const targetDuration = nextDuration("focus", settings);
    const startedAt = 1_000_000;
    const intervals = [{ startedAt }];
    const now = startedAt + targetDuration + 5 * 60 * 1000;

    const e = elapsed(startedAt, now, intervals);
    expect(e).toBeGreaterThan(targetDuration);
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
  it("creates a new focus block with phase running and captured targetMs", () => {
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
    expect(result.state!.phase).toBe("running");
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
      type: "setCycle",
      completed: 4,
      pendingBreak: false,
    });
  });

  it("does not emit setCycle when pendingBreak is false", () => {
    const clock = makeClock(1_000_000);
    const result = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    expect(result.effects.filter((e) => e.type === "setCycle")).toHaveLength(0);
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
    expect(paused.state!.phase).toBe("paused");
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
    expect(resumed.state!.phase).toBe("running");
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

  it("ignores pause on ended state", () => {
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
    const ended = transition(started.state, { kind: "tick" }, clock, settings, 0, false);
    expect(ended.state!.phase).toBe("ended");
    const paused = transition(ended.state, { kind: "pause" }, clock, settings, 0, false);
    expect(paused.state!.phase).toBe("ended");
  });
});

describe("transition — stop", () => {
  it("aborts a focus block, alerts with nextBreak, and advances cycle", () => {
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
    expect(stopped.effects).toHaveLength(3);
    expect(stopped.effects[0].type).toBe("save");
    expect(stopped.effects[1]).toEqual({ type: "alert", blockType: "focus", nextBreak: "short_break" });
    expect(stopped.effects[2]).toEqual({
      type: "setCycle",
      completed: 3,
      pendingBreak: true,
    });
  });

  it("stop at 4th focus block alerts with nextBreak long_break", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      3,
      false
    );
    clock.advance(5000);
    const stopped = transition(started.state, { kind: "stop" }, clock, settings, 3, false);
    expect(stopped.effects[1]).toEqual({ type: "alert", blockType: "focus", nextBreak: "long_break" });
  });

  it("closes the last interval on stop", () => {
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
    const stopped = transition(started.state, { kind: "stop" }, clock, settings, 0, false);
    const saveEffect = stopped.effects.find(
      (e): e is { type: "save"; state: TimerState; endedAt: number } => e.type === "save"
    )!;
    const last = saveEffect.state.intervals[saveEffect.state.intervals.length - 1];
    expect(last.endedAt).toBe(1_005_000);
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
    const cycleEffects = stopped.effects.filter((e) => e.type === "setCycle");
    expect(cycleEffects).toHaveLength(0);
  });

  it("endedAt equals now when stopping while running", () => {
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
    const stopped = transition(started.state, { kind: "stop" }, clock, settings, 0, false);
    const saveEffect = stopped.effects.find(
      (e): e is { type: "save"; state: TimerState; endedAt: number } => e.type === "save"
    )!;
    expect(saveEffect.endedAt).toBe(1_005_000);
  });

  it("endedAt equals the pause instant when stopping while paused", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    clock.advance(3000);
    const paused = transition(started.state, { kind: "pause" }, clock, settings, 0, false);
    clock.advance(7000);
    const stopped = transition(paused.state, { kind: "stop" }, clock, settings, 0, false);
    const saveEffect = stopped.effects.find(
      (e): e is { type: "save"; state: TimerState; endedAt: number } => e.type === "save"
    )!;
    expect(saveEffect.endedAt).toBe(1_003_000);
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
    expect(result.state!.phase).toBe("ended");
    expect(result.effects).toEqual([
      { type: "showLabelSheet" },
      { type: "alert", blockType: "focus", nextBreak: "short_break" },
    ]);
  });

  it("4th focus block completion alerts with nextBreak long_break", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      3,
      false
    );
    clock.advance(25 * 60 * 1000 + 1);
    const result = transition(started.state, { kind: "tick" }, clock, settings, 3, false);
    expect(result.effects).toEqual([
      { type: "showLabelSheet" },
      { type: "alert", blockType: "focus", nextBreak: "long_break" },
    ]);
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

  it("endedAt equals the tick instant on break completion", () => {
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
    const saveEffect = result.effects.find(
      (e): e is { type: "save"; state: TimerState; endedAt: number } => e.type === "save"
    )!;
    expect(saveEffect.endedAt).toBe(1_000_000 + 5 * 60 * 1000 + 1);
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

  it("does nothing on tick when ended (phase guard)", () => {
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
    const ended = transition(started.state, { kind: "tick" }, clock, settings, 0, false);
    expect(ended.state!.phase).toBe("ended");
    // Tick again — phase guard must suppress
    const second = transition(ended.state, { kind: "tick" }, clock, settings, 0, false);
    expect(second.state).toBe(ended.state);
    expect(second.effects).toHaveLength(0);
  });
});

describe("transition — labelSave", () => {
  it("saves with label and advances cycle — no alert (alert already fired on tick)", () => {
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
    const ended = transition(started.state, { kind: "tick" }, clock, settings, 0, false);
    const result = transition(
      ended.state,
      { kind: "labelSave", label: "my task", tagId: "tag-1" },
      clock,
      settings,
      0,
      false
    );
    expect(result.state).toBeNull();
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0].type).toBe("save");
    const saveEffect = result.effects[0] as { type: "save"; state: TimerState; endedAt: number };
    expect(saveEffect.state.label).toBe("my task");
    expect(saveEffect.state.tagId).toBe("tag-1");
    expect(result.effects[1]).toEqual({
      type: "setCycle",
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
    clock.advance(25 * 60 * 1000 + 1);
    const ended = transition(started.state, { kind: "tick" }, clock, settings, 0, false);
    const result = transition(
      ended.state,
      { kind: "labelSave", label: "", tagId: null },
      clock,
      settings,
      0,
      false
    );
    const saveEffect = result.effects.find(
      (e): e is { type: "save"; state: TimerState; endedAt: number } => e.type === "save"
    )!;
    expect(saveEffect.state.label).toBeNull();
  });

  it("endedAt equals the tick instant on labelSave", () => {
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
    const ended = transition(started.state, { kind: "tick" }, clock, settings, 0, false);
    const tickInstant = 1_000_000 + 25 * 60 * 1000 + 1;

    // The label sheet sits open for ten minutes before the user names the block.
    clock.advance(10 * 60 * 1000);

    const result = transition(
      ended.state,
      { kind: "labelSave", label: "my task", tagId: null },
      clock,
      settings,
      0,
      false
    );
    const saveEffect = result.effects[0] as { type: "save"; state: TimerState; endedAt: number };
    expect(saveEffect.endedAt).toBe(tickInstant);

    // The saved intervals must agree with the effect's endedAt.
    const last = saveEffect.state.intervals[saveEffect.state.intervals.length - 1];
    expect(last.endedAt).toBe(tickInstant);
  });
});

describe("transition — skipBreak", () => {
  it("from idle with pendingBreak clears pendingBreak", () => {
    const clock = makeClock(1_000_000);
    const result = transition(null, { kind: "skipBreak" }, clock, settings, 4, true);
    expect(result.state).toBeNull();
    expect(result.effects).toContainEqual({
      type: "setCycle",
      completed: 4,
      pendingBreak: false,
    });
  });

  it("from idle without pendingBreak is a no-op", () => {
    const clock = makeClock(1_000_000);
    const result = transition(null, { kind: "skipBreak" }, clock, settings, 0, false);
    expect(result.state).toBeNull();
    expect(result.effects).toHaveLength(0);
  });

  it("discards a running break without saving", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "short_break", label: null, tagId: null },
      clock,
      settings,
      4,
      true
    );
    const result = transition(started.state, { kind: "skipBreak" }, clock, settings, 4, true);
    expect(result.state).toBeNull();
    const saveEffects = result.effects.filter((e) => e.type === "save");
    expect(saveEffects).toHaveLength(0);
    expect(result.effects).toContainEqual({
      type: "setCycle",
      completed: 4,
      pendingBreak: false,
    });
  });

  it("is a no-op on a focus block", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    const result = transition(started.state, { kind: "skipBreak" }, clock, settings, 0, false);
    expect(result.state).toBe(started.state);
    expect(result.effects).toHaveLength(0);
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
    clock.advance(10 * 60 * 1000);
    const result = transition(started.state, { kind: "tick" }, clock, settings, 0, false);
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
    const differentSettings = { ...settings, focusDuration: 5 };
    clock.advance(25 * 60 * 1000 + 1);
    const result = transition(started.state, { kind: "tick" }, clock, differentSettings, 0, false);
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
      type: "setCycle",
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
      type: "setCycle",
      completed: 4,
      pendingBreak: true,
    });
  });
});

describe("transition — purity", () => {
  it("start does not mutate the input state", () => {
    const clock = makeClock(1_000_000);
    const input = null;
    const snapshot = input;
    transition(input, { kind: "start", type: "focus", label: null, tagId: null }, clock, settings, 0, false);
    expect(input).toBe(snapshot);
  });

  it("pause does not mutate the input state or its intervals", () => {
    const clock = makeClock(1_000_000);
    const started = transition(
      null,
      { kind: "start", type: "focus", label: null, tagId: null },
      clock,
      settings,
      0,
      false
    );
    const snapshot = JSON.stringify(started.state);
    transition(started.state, { kind: "pause" }, clock, settings, 0, false);
    expect(JSON.stringify(started.state)).toBe(snapshot);
  });

  it("resume does not mutate the input state or its intervals", () => {
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
    const snapshot = JSON.stringify(paused.state);
    transition(paused.state, { kind: "resume" }, clock, settings, 0, false);
    expect(JSON.stringify(paused.state)).toBe(snapshot);
  });

  it("tick does not mutate the input state or its intervals", () => {
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
    const snapshot = JSON.stringify(started.state);
    transition(started.state, { kind: "tick" }, clock, settings, 0, false);
    expect(JSON.stringify(started.state)).toBe(snapshot);
  });

  it("stop does not mutate the input state or its intervals", () => {
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
    const snapshot = JSON.stringify(started.state);
    transition(started.state, { kind: "stop" }, clock, settings, 0, false);
    expect(JSON.stringify(started.state)).toBe(snapshot);
  });

  it("double-tick past target: effects on first call only", () => {
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

    const first = transition(started.state, { kind: "tick" }, clock, settings, 0, false);
    expect(first.effects.length).toBeGreaterThan(0);
    expect(first.state!.phase).toBe("ended");

    // Tick the same ended state again — phase guard must suppress
    const second = transition(first.state, { kind: "tick" }, clock, settings, 0, false);
    expect(second.effects).toHaveLength(0);
    expect(second.state).toBe(first.state);
  });

  it("double-tick on a break past target: save on first call only", () => {
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

    const first = transition(started.state, { kind: "tick" }, clock, settings, 4, true);
    expect(first.state).toBeNull();
    const firstSaves = first.effects.filter((e) => e.type === "save");
    expect(firstSaves.length).toBe(1);

    // Tick null state — no-op
    const second = transition(first.state, { kind: "tick" }, clock, settings, 4, true);
    expect(second.state).toBeNull();
    expect(second.effects).toHaveLength(0);
  });
});
