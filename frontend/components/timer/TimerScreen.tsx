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

import { useState, useEffect, useRef, useCallback } from "react";
import {
  type TimerState,
  type BlockType,
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

export default function TimerScreen() {
  const [state, setState] = useState<TimerState | null>(loadStoredState);
  const { settings } = useSettings();
  const [label, setLabel] = useState(() => loadStoredState()?.label ?? "");
  const [now, setNow] = useState(() => Date.now());
  const [showLabelSheet, setShowLabelSheet] = useState(false);
  const [storedCycle] = useState(loadStoredCycle);
  const [nextCompleted, setNextCompleted] = useState<number | null>(
    storedCycle.completed
  );
  const [pendingBreak, setPendingBreak] = useState(storedCycle.pendingBreak);

  const stateRef = useRef(state);
  const settingsRef = useRef(settings);
  const nextCompletedRef = useRef(nextCompleted);
  const pendingBreakRef = useRef(pendingBreak);

  useEffect(() => {
    settingsRef.current = settings;
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        CYCLE_KEY,
        JSON.stringify({ completed: nextCompleted, pendingBreak })
      );
    } catch {
      /* private mode — cycle resets on refresh, nothing else breaks */
    }
  }, [nextCompleted, pendingBreak]);

  const ticking = state?.phase === "running";

  const dispatch = useCallback(
    (event: Parameters<typeof transition>[1]) => {
      const result = transition(
        stateRef.current,
        event,
        browserClock,
        settingsRef.current,
        nextCompletedRef.current ?? stateRef.current?.focusBlocksCompleted ?? 0,
        pendingBreakRef.current
      );
      stateRef.current = result.state;
      setState(result.state);

      // Single effect loop — list order is execution order.
      for (const effect of result.effects) {
        switch (effect.type) {
          case "setCycle":
            nextCompletedRef.current = effect.completed;
            pendingBreakRef.current = effect.pendingBreak;
            setNextCompleted(effect.completed);
            setPendingBreak(effect.pendingBreak);
            break;
          case "showLabelSheet":
            setShowLabelSheet(true);
            break;
          case "save":
            saveBlock(effect.state).catch(() => {
              /* queued for retry; the UI moves on regardless */
            });
            break;
          case "alert":
            alertBlockEnd(effect.blockType, settingsRef.current, effect.nextBreak);
            break;
        }
      }

      // Clear label on any state→null transition
      if (result.state === null) setLabel("");
    },
    []
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
    if (state) localStorage.setItem(STORAGE_KEY, serializeState(state));
    else localStorage.removeItem(STORAGE_KEY);
  }, [state]);

  function handleLabelSave(labelText: string, tagId: string | null) {
    setShowLabelSheet(false);
    dispatch({ kind: "labelSave", label: labelText || null, tagId });
  }

  function handleLabelSkip() {
    setShowLabelSheet(false);
    dispatch({ kind: "labelSave", label: null, tagId: null });
  }

  const currentElapsed = state
    ? elapsed(state.startedAt, now, state.intervals)
    : 0;
  const targetDuration = state
    ? state.targetMs ?? nextDuration(state.type, settings) * 1000
    : 0;

  const currentCompleted = nextCompleted ?? state?.focusBlocksCompleted ?? 0;
  const pos = cyclePosition(currentCompleted, settings.blocksPerCycle);

  const breakType: BlockType =
    currentCompleted > 0 && currentCompleted % settings.blocksPerCycle === 0
      ? "long_break"
      : "short_break";

  // IDLE
  if (!state) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8 px-4">
          <CycleIndicator
            completed={pos.completed}
            total={settings.blocksPerCycle}
            isBreak={pendingBreak}
          />

          <div className="text-7xl font-light tabular-nums tracking-tight text-neutral-700 select-none">
            {pendingBreak
              ? formatCountdown(nextDuration(breakType, settings) * 1000)
              : formatCountdown(settings.focusDuration * 60 * 1000)}
          </div>

          <div className="text-sm uppercase tracking-widest text-neutral-400">
            {pendingBreak
              ? breakType === "long_break"
                ? "Long break"
                : "Short break"
              : "Focus"}
          </div>

          {pendingBreak ? (
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
  const isBreak = state.type !== "focus";
  const isPaused = state.phase === "paused";
  const isEnded = state.phase === "ended";

  return (
    <>
      {showLabelSheet && <LabelSheet onSave={handleLabelSave} onSkip={handleLabelSkip} />}

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
          <p className="text-sm text-neutral-400">{state.type === "long_break" ? "Long break" : "Short break"}</p>
        ) : state.label ? (
          <div className="text-sm text-neutral-500 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-neutral-700" />
            {state.label}
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
