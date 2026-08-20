"use client";

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

import { useState, useEffect, useCallback, useReducer } from "react";
import {
  type TimerState,
  type BlockType,
  type TimerEvent,
  type TimerSettings,
  type ClockDeps,
  type TimerEffect,
  elapsed,
  cyclePosition,
  nextDuration,
  serializeState,
  deserializeState,
  transition,
  browserClock,
} from "@/lib/timer/engine";
import { useSettings } from "@/lib/useSettings";
import { saveBlock } from "@/lib/api/blocks";
import { formatCountdown } from "@/lib/date/instant";
import {
  fireAlert,
  createBrowserDeps,
  readHasCompletedBlock,
  markBlockCompleted,
} from "@/lib/alerts";
import CycleIndicator from "./CycleIndicator";
import LabelSheet from "./LabelSheet";

const STORAGE_KEY = "tempo_clock";
const CYCLE_KEY = "tempo_cycle";

interface StoredCycle {
  completed: number | null;
  pendingBreak: boolean;
}

function loadStoredCycle(): StoredCycle {
  if (typeof window === "undefined") return { completed: null, pendingBreak: false };
  try {
    const raw = localStorage.getItem(CYCLE_KEY);
    if (!raw) return { completed: null, pendingBreak: false };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { completed: null, pendingBreak: false };
    }
    const p = parsed as { completed?: unknown; pendingBreak?: unknown };
    return {
      completed:
        typeof p.completed === "number" && Number.isFinite(p.completed)
          ? p.completed
          : null,
      pendingBreak: p.pendingBreak === true,
    };
  } catch {
    return { completed: null, pendingBreak: false };
  }
}

function loadStoredState(): TimerState | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const state = deserializeState(stored);
    if (!state) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

function alertBlockEnd(
  blockType: BlockType,
  settings: { sound: boolean; notifications: boolean },
  nextBreak?: BlockType
) {
  let body: string;
  if (blockType === "focus") {
    body = nextBreak === "long_break" ? "Time for a long break" : "Time for a break";
  } else {
    body = "Ready for the next focus block";
  }
  fireAlert(
    {
      settings: { sound: settings.sound, notifications: settings.notifications },
      hasCompletedBlock: readHasCompletedBlock(),
      title: blockType === "focus" ? "Focus block done" : "Break over",
      body,
    },
    createBrowserDeps()
  );
  markBlockCompleted();
}

// ─── Reducer ────────────────────────────────────────────────────────

interface Machine {
  timer: TimerState | null;
  completed: number;
  pendingBreak: boolean;
  labelSheetOpen: boolean;
  pending: TimerEffect[];
}

type Action =
  | { kind: "event"; event: TimerEvent; settings: TimerSettings; clock: ClockDeps }
  | { kind: "drained"; count: number };

function initMachine(): Machine {
  const timer = loadStoredState();
  const cycle = loadStoredCycle();
  return {
    timer,
    completed: cycle.completed ?? timer?.focusBlocksCompleted ?? 0,
    pendingBreak: cycle.pendingBreak,
    // Only a focus block awaiting its label is ever persisted "ended" (G-2), so a
    // stored ended block means the sheet was open when the tab closed — reopen it
    // rather than stranding a completed block (ux-research § success criteria 5).
    labelSheetOpen: timer?.phase === "ended" && timer.type === "focus",
    pending: [],
  };
}

function reducer(m: Machine, action: Action): Machine {
  switch (action.kind) {
    case "drained":
      return { ...m, pending: m.pending.slice(action.count) };
    case "event": {
      const result = transition(
        m.timer, action.event, action.clock, action.settings,
        m.completed, m.pendingBreak,
      );
      let next: Machine = { ...m, timer: result.state };
      const external: TimerEffect[] = [];
      for (const effect of result.effects) {
        switch (effect.type) {
          case "setCycle":
            next = { ...next, completed: effect.completed, pendingBreak: effect.pendingBreak };
            break;
          case "showLabelSheet":
            next = { ...next, labelSheetOpen: true };
            break;
          default:
            external.push(effect);
        }
      }
      if (action.event.kind === "labelSave") next = { ...next, labelSheetOpen: false };
      return { ...next, pending: [...m.pending, ...external] };
    }
  }
}

// ─── Component ──────────────────────────────────────────────────────

export default function TimerScreen() {
  const [machine, rawDispatch] = useReducer(reducer, undefined, initMachine);
  const { settings } = useSettings();
  const [label, setLabel] = useState(() => machine.timer?.label ?? "");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(
        CYCLE_KEY,
        JSON.stringify({ completed: machine.completed, pendingBreak: machine.pendingBreak })
      );
    } catch {
      /* private mode — cycle resets on refresh, nothing else breaks */
    }
  }, [machine.completed, machine.pendingBreak]);

  const ticking = machine.timer?.phase === "running";

  // Clock rides on the action rather than being read inside the reducer's
  // closure; transition calls clock.now()/clock.uuid() internally. The reducer
  // is not literally deterministic under a dev double-invoke, but the discarded
  // first result is thrown away with its effects, so this is benign.
  const dispatch = useCallback(
    (event: TimerEvent) => rawDispatch({ kind: "event", event, settings, clock: browserClock }),
    [settings],
  );

  useEffect(() => {
    if (!ticking) return;

    const id = setInterval(() => {
      setNow(Date.now());
      dispatch({ kind: "tick" });
    }, 200);

    return () => clearInterval(id);
  }, [ticking, dispatch]);

  useEffect(() => {
    if (machine.timer) localStorage.setItem(STORAGE_KEY, serializeState(machine.timer));
    else localStorage.removeItem(STORAGE_KEY);
  }, [machine.timer]);

  useEffect(() => {
    if (machine.timer === null) setLabel(""); // eslint-disable-line react-hooks/set-state-in-effect -- label is a draft input, not machine state
  }, [machine.timer]);

  useEffect(() => {
    const batch = machine.pending;
    if (batch.length === 0) return;
    for (const effect of batch) {
      if (effect.type === "save") {
        saveBlock(effect.state, effect.endedAt).catch(() => {
          /* queued for retry; the UI moves on regardless */
        });
      } else if (effect.type === "alert") {
        alertBlockEnd(effect.blockType, settings, effect.nextBreak);
      }
    }
    rawDispatch({ kind: "drained", count: batch.length });
  }, [machine.pending, settings]);

  function handleLabelSave(labelText: string, tagId: string | null) {
    dispatch({ kind: "labelSave", label: labelText || null, tagId });
  }

  function handleLabelSkip() {
    dispatch({ kind: "labelSave", label: null, tagId: null });
  }

  const currentElapsed = machine.timer
    ? elapsed(machine.timer.startedAt, now, machine.timer.intervals)
    : 0;
  const targetDuration = machine.timer
    ? machine.timer.targetMs ?? nextDuration(machine.timer.type, settings) * 1000
    : 0;

  const pos = cyclePosition(machine.completed, settings.blocksPerCycle);

  const breakType: BlockType =
    machine.completed > 0 && machine.completed % settings.blocksPerCycle === 0
      ? "long_break"
      : "short_break";

  // IDLE
  if (!machine.timer) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8 px-4">
          <CycleIndicator
            completed={pos.completed}
            total={settings.blocksPerCycle}
            isBreak={machine.pendingBreak}
          />

          <div className="text-7xl font-light tabular-nums tracking-tight text-neutral-700 select-none">
            {machine.pendingBreak
              ? formatCountdown(nextDuration(breakType, settings) * 1000)
              : formatCountdown(settings.focusDuration * 60 * 1000)}
          </div>

          <div className="text-sm uppercase tracking-widest text-neutral-400">
            {machine.pendingBreak
              ? breakType === "long_break"
                ? "Long break"
                : "Short break"
              : "Focus"}
          </div>

          {machine.pendingBreak ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-neutral-400">Step away from the screen</p>
              <div className="flex gap-4">
                <button
                  onClick={() =>
                    dispatch({ kind: "start", type: breakType, label: null, tagId: null })
                  }
                  className="px-10 py-3 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  START
                </button>
                <button
                  onClick={() => dispatch({ kind: "skipBreak" })}
                  className="px-10 py-3 text-sm font-medium text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  Skip break
                </button>
              </div>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="What are you working on? (optional)"
                className="w-64 text-center text-sm text-neutral-500 placeholder:text-neutral-300 border-b border-neutral-200 pb-1 outline-none focus:border-neutral-400 transition-colors"
              />

              <button
                onClick={() =>
                  dispatch({
                    kind: "start",
                    type: "focus",
                    label: label || null,
                    tagId: null,
                  })
                }
                className="px-12 py-3 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
              >
                START
              </button>

              {label && (
                <button
                  onClick={() =>
                    dispatch({
                      kind: "start",
                      type: "focus",
                      label,
                      tagId: null,
                    })
                  }
                  className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  ● Last: &quot;{label}&quot; ↺
                </button>
              )}
            </>
          )}
        </div>
      </>
    );
  }

  // RUNNING, PAUSED, or ENDED
  const fraction = targetDuration > 0 ? currentElapsed / targetDuration : 0;
  const circumference = 2 * Math.PI * 42;
  const isBreak = machine.timer.type !== "focus";
  const isPaused = machine.timer.phase === "paused";
  const isEnded = machine.timer.phase === "ended";

  return (
    <>
      {machine.labelSheetOpen && <LabelSheet onSave={handleLabelSave} onSkip={handleLabelSkip} />}

      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 px-4">
        <CycleIndicator
          completed={pos.completed}
          total={settings.blocksPerCycle}
          isBreak={isBreak}
        />

        {/* Ring */}
        <div className="relative">
          <svg className="w-52 h-52 -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke={isBreak ? "#a7f3d0" : "#e5e5e5"}
              strokeWidth="6"
            />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke={isBreak ? "#059669" : "#171717"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - Math.min(fraction, 1))}
              className="transition-[stroke-dashoffset] duration-500 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-light tabular-nums tracking-tight text-neutral-700 select-none">
              {isPaused ? "PAUSED" : isEnded ? formatCountdown(targetDuration) : formatCountdown(currentElapsed)}
            </div>
            {!isPaused && !isEnded && (
              <div className="text-[10px] text-neutral-400 mt-0.5">
                of {formatCountdown(targetDuration)}
              </div>
            )}
          </div>
        </div>

        {/* Label or break message */}
        {isBreak ? (
          <p className="text-sm text-neutral-400">{machine.timer.type === "long_break" ? "Long break" : "Short break"}</p>
        ) : machine.timer.label ? (
          <div className="text-sm text-neutral-500 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-neutral-700" />
            {machine.timer.label}
          </div>
        ) : null}

        {/* Break: Skip link */}
        {isBreak && !isPaused && (
          <button
            onClick={() => dispatch({ kind: "skipBreak" })}
            className="text-xs text-neutral-300 hover:text-neutral-500 transition-colors mt-2"
          >
            Skip break
          </button>
        )}

        {/* Controls */}
        <div className="mt-2">
          <div className="flex gap-3 items-center" data-testid="secondary-controls">
            <button
              onClick={() => dispatch(isPaused ? { kind: "resume" } : { kind: "pause" })}
              className="px-6 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-500 transition-colors"
            >
              {isPaused ? "RESUME" : "⏸ PAUSE"}
            </button>
            <button
              onClick={() => dispatch({ kind: "stop" })}
              className="px-6 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-500 transition-colors"
            >
              ⏹ STOP
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
