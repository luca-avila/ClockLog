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

import { useState, useEffect, useRef } from "react";
import {
  type TimerState,
  type TimerSettings,
  type BlockType,
  elapsed,
  cyclePosition,
  nextDuration,
  defaultSettings,
  serializeState,
  deserializeState,
} from "@/lib/timer/engine";
import { saveBlock } from "@/lib/api/blocks";
import {
  fireAlert,
  createBrowserDeps,
  readHasCompletedBlock,
  markBlockCompleted,
} from "@/lib/alerts";
import CycleIndicator from "./CycleIndicator";
import LabelSheet from "./LabelSheet";

const STORAGE_KEY = "tempo_clock";

function loadStoredState(): TimerState | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return deserializeState(stored);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

async function completeAndSaveBlock(s: TimerState) {
  const t = Date.now();
  const intervals = s.intervals.map((iv) => ({ ...iv }));
  const last = intervals[intervals.length - 1];
  if (last?.endedAt === undefined) last.endedAt = t;

  const finalState: TimerState = { ...s, intervals };
  await saveBlock(finalState);
  localStorage.removeItem(STORAGE_KEY);
}

// Sound + notification + title change on every block end; channels degrade independently.
function alertBlockEnd(type: BlockType, settings: TimerSettings) {
  const long = type === "long_break";
  fireAlert(
    {
      settings: { sound: settings.sound, notifications: settings.notifications },
      hasCompletedBlock: readHasCompletedBlock(),
      title: type === "focus" ? "Focus block done" : "Break over",
      body:
        type === "focus"
          ? long
            ? "Time for a long break"
            : "Time for a break"
          : "Ready for the next focus block",
    },
    createBrowserDeps()
  );
  markBlockCompleted();
}

export default function TimerScreen() {
  const [state, setState] = useState<TimerState | null>(loadStoredState);
  const [settings] = useState<TimerSettings>(defaultSettings);
  const [label, setLabel] = useState(() => loadStoredState()?.label ?? "");
  const [now, setNow] = useState(() => Date.now());
  const [showLabelSheet, setShowLabelSheet] = useState(false);
  const [nextCompleted, setNextCompleted] = useState<number | null>(null);
  const [pendingBreak, setPendingBreak] = useState(false);

  const stateRef = useRef(state);
  const settingsRef = useRef(settings);

  useEffect(() => {
    stateRef.current = state;
    settingsRef.current = settings;
  });

  const running = state !== null;

  useEffect(() => {
    if (!running) return;

    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);

      const s = stateRef.current;
      if (!s) return;

      const paused =
        s.intervals.length > 0 &&
        s.intervals[s.intervals.length - 1].endedAt !== undefined;
      if (paused) return;

      const target = nextDuration(s.type, settingsRef.current) * 1000;
      const e = elapsed(s.startedAt, t, s.intervals);

      if (e >= target) {
        clearInterval(id);
        if (s.type === "focus") {
          // Focus done → show label sheet
          setShowLabelSheet(true);
          alertBlockEnd("focus", settingsRef.current);
          // Complete the intervals for saving
          const intervals = [...s.intervals];
          const last = intervals[intervals.length - 1];
          if (last.endedAt === undefined) last.endedAt = t;
          setState({ ...s, intervals });
        } else {
          // Break done → go to idle, keep cycle position
          alertBlockEnd(s.type, settingsRef.current);
          completeAndSaveBlock(s).then(() => {
            setState(null);
          });
        }
      }
    }, 200);

    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (state) localStorage.setItem(STORAGE_KEY, serializeState(state));
  }, [state]);

  function startBlock(type: BlockType, initialLabel: string | null = null) {
    const t = Date.now();
    const newState: TimerState = {
      id: crypto.randomUUID(),
      type,
      startedAt: t,
      label: initialLabel ?? null,
      tagId: null,
      focusBlocksCompleted: nextCompleted ?? state?.focusBlocksCompleted ?? 0,
      intervals: [{ startedAt: t }],
      blockStatus: "completed",
    };
    setPendingBreak(false);
    setState(newState);
  }

  function togglePause() {
    if (!state) return;
    const t = Date.now();
    const intervals = [...state.intervals];
    const last = intervals[intervals.length - 1];
    if (last.endedAt === undefined) {
      last.endedAt = t;
    } else {
      intervals.push({ startedAt: t });
    }
    setState({ ...state, intervals });
  }

  const isPaused =
    state !== null &&
    state.intervals.length > 0 &&
    state.intervals[state.intervals.length - 1].endedAt !== undefined;

  function stopBlock() {
    if (!state) return;
    const s: TimerState = { ...state, blockStatus: "aborted" };
    alertBlockEnd(state.type, settingsRef.current);
    completeAndSaveBlock(s).then(() => {
      if (state.type === "focus") {
        setNextCompleted(state.focusBlocksCompleted + 1);
        setPendingBreak(true);
      }
      setState(null);
      setLabel("");
    });
  }

  function handleLabelSave(labelText: string) {
    if (!state) return;
    const finalState: TimerState = {
      ...state,
      label: labelText || "Unlabeled",
    };
    completeAndSaveBlock(finalState).then(() => {
      setNextCompleted(state.focusBlocksCompleted + 1);
      setPendingBreak(true);
      setShowLabelSheet(false);
      setState(null);
      setLabel("");
    });
  }

  function handleLabelSkip() {
    if (!state) return;
    const finalState: TimerState = { ...state, label: "Unlabeled" };
    completeAndSaveBlock(finalState).then(() => {
      setNextCompleted(state.focusBlocksCompleted + 1);
      setPendingBreak(true);
      setShowLabelSheet(false);
      setState(null);
      setLabel("");
    });
  }

  function skipBreak() {
    if (state && state.type !== "focus") {
      completeAndSaveBlock(state);
    }
    setState(null);
    setPendingBreak(false);
  }

  const currentElapsed = state
    ? elapsed(state.startedAt, now, state.intervals)
    : 0;
  const targetDuration = state
    ? nextDuration(state.type, settings) * 1000
    : 0;

  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

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
              ? formatTime(nextDuration(breakType, settings) * 1000)
              : formatTime(settings.focusDuration * 60 * 1000)}
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
                  onClick={() => startBlock(breakType)}
                  className="px-10 py-3 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  START
                </button>
                <button
                  onClick={skipBreak}
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
                onClick={() => startBlock("focus", label || null)}
                className="px-12 py-3 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
              >
                START
              </button>

              {label && (
                <button
                  onClick={() => startBlock("focus", label)}
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

  // RUNNING or PAUSED
  const fraction = targetDuration > 0 ? currentElapsed / targetDuration : 0;
  const circumference = 2 * Math.PI * 42;
  const isBreak = state.type !== "focus";

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
              {isPaused ? "PAUSED" : formatTime(currentElapsed)}
            </div>
            {!isPaused && (
              <div className="text-[10px] text-neutral-400 mt-0.5">
                of {formatTime(targetDuration)}
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
            onClick={skipBreak}
            className="text-xs text-neutral-300 hover:text-neutral-500 transition-colors mt-2"
          >
            Skip break
          </button>
        )}

        {/* Controls */}
        <div className="mt-2">
          <div className="flex gap-3 items-center" data-testid="secondary-controls">
            <button
              onClick={togglePause}
              className="px-6 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-500 transition-colors"
            >
              {isPaused ? "RESUME" : "⏸ PAUSE"}
            </button>
            <button
              onClick={stopBlock}
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
