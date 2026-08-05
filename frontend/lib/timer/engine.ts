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

/** Pure function: elapsed ms between startedAt and now, adjusted for pause intervals. */
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
  const position = focusBlocksCompleted % blocksPerCycle;
  const isLongBreak = focusBlocksCompleted > 0 && position === 0;

  return {
    completed: isLongBreak ? 0 : position,
    remaining: blocksPerCycle - (isLongBreak ? 0 : position),
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

export function deserializeState(json: string): TimerState {
  return JSON.parse(json) as TimerState;
}
