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

export type BlockType = "focus" | "short_break" | "long_break";

export type TimerPhase = "running" | "paused" | "ended";

export interface Interval {
  startedAt: number; // epoch ms
  endedAt?: number; // epoch ms, undefined if in-progress
}

export interface TimerState {
  id: string;
  type: BlockType;
  phase: TimerPhase;
  startedAt: number;
  label: string | null;
  tagId: string | null;
  focusBlocksCompleted: number;
  intervals: Interval[];
  blockStatus: "completed" | "aborted";
  targetMs: number;
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

// ─── Pure helpers (invariant 1 lives here) ─────────────────────────

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

/** Which break follows N completed focus blocks. Derived, never stored. */
export function nextBreakType(
  focusBlocksCompleted: number,
  blocksPerCycle: number
): BlockType {
  return cyclePosition(focusBlocksCompleted, blocksPerCycle).isLongBreak
    ? "long_break"
    : "short_break";
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

// ─── Deserialization ───────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isBlockType(v: unknown): v is BlockType {
  return v === "focus" || v === "short_break" || v === "long_break";
}

function isTimerPhase(v: unknown): v is TimerPhase {
  return v === "running" || v === "paused" || v === "ended";
}

/**
 * Parse persisted timer state, validating the shape by hand. Corrupt or
 * stale-shape localStorage yields null — never a TimerState whose
 * startedAt is undefined and whose elapsed() is NaN. The caller clears
 * the key on null.
 *
 * Back-compat: `phase` is optional.  Absent → derive from the last
 * interval (closed → "paused", else "running").  Present but invalid
 * → reject.
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

  const id = s.id;
  if (typeof id !== "string" || id.length === 0) return null;

  const type = s.type;
  if (!isBlockType(type)) return null;

  const startedAt = s.startedAt;
  if (!isFiniteNumber(startedAt)) return null;

  const label = s.label;
  if (label !== null && typeof label !== "string") return null;

  const tagId = s.tagId;
  if (tagId !== null && typeof tagId !== "string") return null;

  const focusBlocksCompleted = s.focusBlocksCompleted;
  if (!isFiniteNumber(focusBlocksCompleted)) return null;

  const blockStatus = s.blockStatus;
  if (blockStatus !== "completed" && blockStatus !== "aborted") return null;

  const rawTargetMs = s.targetMs;
  if (rawTargetMs !== undefined && !isFiniteNumber(rawTargetMs)) return null;

  if (!Array.isArray(s.intervals)) return null;
  const intervals: Interval[] = [];
  for (const iv of s.intervals) {
    if (typeof iv !== "object" || iv === null) return null;
    const interval = iv as Record<string, unknown>;
    if (!isFiniteNumber(interval.startedAt)) return null;
    if (interval.endedAt !== undefined && !isFiniteNumber(interval.endedAt)) {
      return null;
    }
    intervals.push(
      interval.endedAt === undefined
        ? { startedAt: interval.startedAt }
        : { startedAt: interval.startedAt, endedAt: interval.endedAt }
    );
  }

  // Phase: accept absent (back-compat), reject invalid present.
  let phase: TimerPhase;
  if (s.phase === undefined || s.phase === null) {
    // Derive from the last interval — mirrors the old isPaused() logic.
    const last = intervals[intervals.length - 1];
    phase = last !== undefined && last.endedAt !== undefined ? "paused" : "running";
  } else if (isTimerPhase(s.phase)) {
    phase = s.phase;
  } else {
    return null;
  }

  // Fill absent targetMs for state written by a build predating `targetMs`;
  // the component's settings are still loading at `initMachine` time, and a
  // stale in-flight block is not worth threading settings through deserialization for.
  const targetMs = isFiniteNumber(rawTargetMs)
    ? rawTargetMs
    : nextDuration(type, defaultSettings) * 1000;

  return {
    id,
    type,
    phase,
    startedAt,
    label,
    tagId,
    focusBlocksCompleted,
    intervals,
    blockStatus,
    targetMs,
  };
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

// ─── Interval helpers ──────────────────────────────────────────────

/** Deep-copy intervals and close the last open one. Returns both the
 *  copied intervals and the block's real end instant. Pure — never mutates input. */
function closeBlock(
  intervals: Interval[],
  at: number
): { intervals: Interval[]; endedAt: number } {
  const copy = intervals.map((iv) => ({ ...iv }));
  const last = copy[copy.length - 1];
  // `start` always seeds one interval, so `last` is present; when it is
  // already closed (paused, or ended by an earlier tick) its own end is the
  // block's real end, not `at`.
  if (!last) return { intervals: copy, endedAt: at };
  if (last.endedAt === undefined) last.endedAt = at;
  return { intervals: copy, endedAt: last.endedAt };
}

// ─── State machine ─────────────────────────────────────────────────

export type TimerEvent =
  | { kind: "start"; type: BlockType; label: string | null; tagId: string | null }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "stop" }
  | { kind: "labelSave"; label: string | null; tagId: string | null }
  | { kind: "skipBreak" }
  | { kind: "tick" };

export type TimerEffect =
  | { type: "save"; state: TimerState; endedAt: number }
  | { type: "alert"; blockType: BlockType; nextBreak?: BlockType }
  | { type: "showLabelSheet" }
  | { type: "setCycle"; completed: number; pendingBreak: boolean };

export interface TransitionResult {
  state: TimerState | null;
  effects: TimerEffect[];
}

/**
 * Pure state machine.  Takes the current state (null = idle), an event,
 * a clock, and settings; returns the next state plus a list of effects
 * the caller must execute (save, alert, show label sheet, set cycle).
 *
 * Phase gates make double-fire suppression explicit and provable —
 * ticking the same ended state twice yields effects only on the first
 * call.
 *
 * No side effects, no async, no mutations of input — just computation.
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
      const completed = cycleCompleted;
      const newState: TimerState = {
        id: clock.uuid(),
        type: event.type,
        phase: "running",
        startedAt: now,
        label: event.label,
        tagId: event.tagId,
        focusBlocksCompleted: completed,
        intervals: [{ startedAt: now }],
        blockStatus: "completed",
        targetMs: nextDuration(event.type, settings) * 1000,
      };
      return {
        state: newState,
        effects: cyclePendingBreak
          ? [{ type: "setCycle", completed, pendingBreak: false }]
          : [],
      };
    }

    case "pause": {
      if (!state || state.phase !== "running") return { state, effects: [] };
      return {
        state: {
          ...state,
          phase: "paused",
          intervals: closeBlock(state.intervals, now).intervals,
        },
        effects: [],
      };
    }

    case "resume": {
      if (!state || state.phase !== "paused") return { state, effects: [] };
      return {
        state: {
          ...state,
          phase: "running",
          intervals: [...state.intervals, { startedAt: now }],
        },
        effects: [],
      };
    }

    case "stop": {
      if (!state) return { state: null, effects: [] };
      // Defensive: an ended block is terminal — labelSave owns the save.
      if (state.phase === "ended") return { state, effects: [] };
      const closed = closeBlock(state.intervals, now);
      const aborted: TimerState = {
        ...state,
        phase: "ended",
        blockStatus: "aborted",
        intervals: closed.intervals,
      };
      const effects: TimerEffect[] = [
        { type: "save", state: aborted, endedAt: closed.endedAt },
      ];
      if (state.type === "focus") {
        const nextCompleted = state.focusBlocksCompleted + 1;
        const nextBreak = nextBreakType(nextCompleted, settings.blocksPerCycle);
        effects.push({ type: "alert", blockType: "focus", nextBreak });
        effects.push({
          type: "setCycle",
          completed: nextCompleted,
          pendingBreak: true,
        });
      } else {
        effects.push({ type: "alert", blockType: state.type });
      }
      return { state: null, effects };
    }

    case "labelSave": {
      if (!state) return { state: null, effects: [] };
      const closed = closeBlock(state.intervals, now);
      const finalState: TimerState = {
        ...state,
        label: event.label || null,
        tagId: event.tagId,
        intervals: closed.intervals,
      };
      const nextCompleted = state.focusBlocksCompleted + 1;
      return {
        state: null,
        effects: [
          { type: "save", state: finalState, endedAt: closed.endedAt },
          {
            type: "setCycle",
            completed: nextCompleted,
            pendingBreak: true,
          },
        ],
      };
    }

    case "skipBreak": {
      // A skipped break is not recorded — no time was spent, so discard
      // the state instead of saving it.
      if (!state) {
        // Idle with pending break — just clear the cycle.
        return {
          state: null,
          effects: cyclePendingBreak
            ? [{ type: "setCycle", completed: cycleCompleted, pendingBreak: false }]
            : [],
        };
      }
      if (state.type !== "focus" && (state.phase === "running" || state.phase === "paused")) {
        // Running or paused break — discard without saving.
        return {
          state: null,
          effects: [{ type: "setCycle", completed: cycleCompleted, pendingBreak: false }],
        };
      }
      // Defensive: focus block or ended state — no-op.
      return { state, effects: [] };
    }

    case "tick": {
      if (!state) return { state: null, effects: [] };
      if (state.phase !== "running") return { state, effects: [] };

      const target = state.targetMs;
      const e = elapsed(state.startedAt, now, state.intervals);

      if (e < target) return { state, effects: [] };

      // Block time is up
      if (state.type === "focus") {
        const nextCompleted = state.focusBlocksCompleted + 1;
        const nextBreak = nextBreakType(nextCompleted, settings.blocksPerCycle);
        return {
          state: {
            ...state,
            phase: "ended",
            intervals: closeBlock(state.intervals, now).intervals,
          },
          effects: [
            { type: "showLabelSheet" },
            { type: "alert", blockType: "focus", nextBreak },
          ],
        };
      }

      // Break done → close the last interval, save, and go idle.
      // The recorded end must be the block's real end rather than a
      // default computed downstream in stateToPayload.
      const closed = closeBlock(state.intervals, now);
      return {
        state: null,
        effects: [
          {
            type: "save",
            state: {
              ...state,
              intervals: closed.intervals,
            },
            endedAt: closed.endedAt,
          },
          { type: "alert", blockType: state.type },
        ],
      };
    }
  }
}
