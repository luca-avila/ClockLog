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

export type BlockType = "focus" | "short_break" | "long_break";

export interface Interval {
  startedAt: number; // epoch ms
  endedAt?: number; // epoch ms, undefined if in-progress
}

export interface TimerState {
  id: string;
  type: BlockType;
  startedAt: number;
  label: string | null;
  tagId: string | null;
  focusBlocksCompleted: number;
  intervals: Interval[];
  blockStatus: "completed" | "aborted";
  targetMs?: number;
}

export interface TimerSettings {
  focusDuration: number; // minutes
  shortBreakDuration: number;
  longBreakDuration: number;
  blocksPerCycle: number;
  autoStartBreaks: boolean;
  autoStartNext: boolean;
  sound: boolean;
  notifications: boolean;
}

export interface CyclePosition {
  completed: number;
  remaining: number;
  isLongBreak: boolean;
}

export const defaultSettings: TimerSettings = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  blocksPerCycle: 4,
  autoStartBreaks: false,
  autoStartNext: false,
  sound: true,
  notifications: true,
};

// ─── Pure helpers ──────────────────────────────────────────────────

/** Elapsed ms between startedAt and now, adjusted for pause intervals. */
export function elapsed(
  startedAt: number,
  now: number,
  intervals?: Interval[]
): number {
  if (!intervals || intervals.length === 0) {
    return now - startedAt;
  }

  let total = 0;
  for (let i = 0; i < intervals.length; i++) {
    const interval = intervals[i];
    if (interval.endedAt !== undefined) {
      total += interval.endedAt - interval.startedAt;
    } else {
      total += now - interval.startedAt;
    }
  }
  return total;
}

/** Derive cycle position from completed focus blocks. Never stored. */
export function cyclePosition(
  focusBlocksCompleted: number,
  blocksPerCycle: number
): CyclePosition {
  const cycle = Math.max(1, blocksPerCycle);
  const position = focusBlocksCompleted % cycle;
  const isLongBreak = focusBlocksCompleted > 0 && position === 0;

  return {
    completed: isLongBreak ? 0 : position,
    remaining: cycle - (isLongBreak ? 0 : position),
    isLongBreak,
  };
}

/** Duration in seconds for the given block type and settings. */
export function nextDuration(type: BlockType, settings: TimerSettings): number {
  switch (type) {
    case "focus":
      return settings.focusDuration * 60;
    case "short_break":
      return settings.shortBreakDuration * 60;
    case "long_break":
      return settings.longBreakDuration * 60;
  }
}

export function serializeState(state: TimerState): string {
  return JSON.stringify(state);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const BLOCK_TYPES: readonly string[] = ["focus", "short_break", "long_break"];

/**
 * Parse persisted timer state, validating the shape by hand. Corrupt or
 * stale-shape localStorage yields null — never a TimerState whose
 * startedAt is undefined and whose elapsed() is NaN. The caller clears
 * the key on null.
 */
export function deserializeState(json: string): TimerState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const s = parsed as Record<string, unknown>;

  if (typeof s.id !== "string" || s.id.length === 0) return null;
  if (typeof s.type !== "string" || !BLOCK_TYPES.includes(s.type)) return null;
  if (!isFiniteNumber(s.startedAt)) return null;
  if (s.label !== null && typeof s.label !== "string") return null;
  if (s.tagId !== null && typeof s.tagId !== "string") return null;
  if (!isFiniteNumber(s.focusBlocksCompleted)) return null;
  if (s.blockStatus !== "completed" && s.blockStatus !== "aborted") return null;
  if (s.targetMs !== undefined && !isFiniteNumber(s.targetMs)) return null;
  if (!Array.isArray(s.intervals)) return null;
  for (const iv of s.intervals) {
    if (typeof iv !== "object" || iv === null) return null;
    const interval = iv as Record<string, unknown>;
    if (!isFiniteNumber(interval.startedAt)) return null;
    if (interval.endedAt !== undefined && !isFiniteNumber(interval.endedAt)) {
      return null;
    }
  }

  return parsed as TimerState;
}

// ─── ClockDeps seam ────────────────────────────────────────────────
//
// The engine is pure: it never reads the clock or generates IDs
// directly.  Two adapters justify the seam (browser + test), matching
// the pattern in lib/api/queue.ts.

export interface ClockDeps {
  now: () => number;
  uuid: () => string;
}

export const browserClock: ClockDeps = {
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
};

// ─── State machine ─────────────────────────────────────────────────

export type TimerEvent =
  | { kind: "start"; type: BlockType; label: string | null; tagId: string | null }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "stop" }
  | { kind: "labelSave"; label: string | null; tagId: string | null }
  | { kind: "tick" };

export type TimerEffect =
  | { type: "save"; state: TimerState }
  | { type: "alert"; blockType: BlockType }
  | { type: "showLabelSheet" }
  | { type: "advanceCycle"; completed: number; pendingBreak: boolean };

export interface TransitionResult {
  state: TimerState | null;
  effects: TimerEffect[];
}

function isPaused(state: TimerState): boolean {
  const last = state.intervals[state.intervals.length - 1];
  return last !== undefined && last.endedAt !== undefined;
}

function togglePause(state: TimerState, now: number): TimerState {
  const intervals = [...state.intervals];
  const last = intervals[intervals.length - 1];
  if (last.endedAt === undefined) {
    last.endedAt = now;
  } else {
    intervals.push({ startedAt: now });
  }
  return { ...state, intervals };
}

/**
 * Pure state machine.  Takes the current state (null = idle), an event,
 * a clock, and settings; returns the next state plus a list of effects
 * the caller must execute (save, alert, show label sheet, advance cycle).
 *
 * No side effects, no async, no imports — just computation.
 */
export function transition(
  state: TimerState | null,
  event: TimerEvent,
  clock: ClockDeps,
  settings: TimerSettings,
  cycleCompleted: number,
  cyclePendingBreak: boolean
): TransitionResult {
  const now = clock.now();

  switch (event.kind) {
    case "start": {
      const t = now;
      const completed = cycleCompleted;
      const newState: TimerState = {
        id: clock.uuid(),
        type: event.type,
        startedAt: t,
        label: event.label,
        tagId: event.tagId,
        focusBlocksCompleted: completed,
        intervals: [{ startedAt: t }],
        blockStatus: "completed",
        targetMs: nextDuration(event.type, settings) * 1000,
      };
      return {
        state: newState,
        effects: cyclePendingBreak
          ? [{ type: "advanceCycle", completed, pendingBreak: false }]
          : [],
      };
    }

    case "pause": {
      if (!state || isPaused(state)) return { state, effects: [] };
      return { state: togglePause(state, now), effects: [] };
    }

    case "resume": {
      if (!state || !isPaused(state)) return { state, effects: [] };
      return { state: togglePause(state, now), effects: [] };
    }

    case "stop": {
      if (!state) return { state: null, effects: [] };
      const aborted: TimerState = { ...state, blockStatus: "aborted" };
      const effects: TimerEffect[] = [
        { type: "save", state: aborted },
        { type: "alert", blockType: state.type },
      ];
      if (state.type === "focus") {
        effects.push({
          type: "advanceCycle",
          completed: state.focusBlocksCompleted + 1,
          pendingBreak: true,
        });
      }
      return { state: null, effects };
    }

    case "labelSave": {
      if (!state) return { state: null, effects: [] };
      const finalState: TimerState = {
        ...state,
        label: event.label || null,
        tagId: event.tagId,
      };
      const nextCompleted = state.focusBlocksCompleted + 1;
      return {
        state: null,
        effects: [
          { type: "save", state: finalState },
          { type: "alert", blockType: state.type },
          {
            type: "advanceCycle",
            completed: nextCompleted,
            pendingBreak: true,
          },
        ],
      };
    }

    case "tick": {
      if (!state) return { state: null, effects: [] };
      if (isPaused(state)) return { state, effects: [] };

      const target =
        state.targetMs ?? nextDuration(state.type, settings) * 1000;
      const e = elapsed(state.startedAt, now, state.intervals);

      if (e < target) return { state, effects: [] };

      // Block time is up
      if (state.type === "focus") {
        // Complete the intervals for saving
        const intervals = [...state.intervals];
        const last = intervals[intervals.length - 1];
        if (last.endedAt === undefined) last.endedAt = now;
        return {
          state: { ...state, intervals },
          effects: [
            { type: "showLabelSheet" },
            { type: "alert", blockType: "focus" },
          ],
        };
      }

      // Break done → close the last interval, save, and go idle.
      // The save needs endedAt on the last interval to produce a valid
      // BlockPayload, matching the focus-completion path.
      {
        const intervals = [...state.intervals];
        const last = intervals[intervals.length - 1];
        if (last.endedAt === undefined) last.endedAt = now;
        return {
          state: null,
          effects: [
            { type: "save", state: { ...state, intervals } },
            { type: "alert", blockType: state.type },
          ],
        };
      }
    }
  }
}
