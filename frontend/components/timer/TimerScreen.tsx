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
  elapsed,
  cyclePosition,
  nextDuration,
  defaultSettings,
  serializeState,
  deserializeState,
} from "@/lib/timer/engine";
import { saveBlock } from "@/lib/api/blocks";
import CycleIndicator from "./CycleIndicator";

const STORAGE_KEY = "tempo_clock";

function loadStoredState(): TimerState | null {
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
  const intervals = [...s.intervals];
  const last = intervals[intervals.length - 1];
  if (last.endedAt === undefined) last.endedAt = t;

  const finalState: TimerState = { ...s, intervals };
  await saveBlock(finalState);
  localStorage.removeItem(STORAGE_KEY);
}

export default function TimerScreen() {
  const [state, setState] = useState<TimerState | null>(loadStoredState);
  const [settings] = useState<TimerSettings>(defaultSettings);
  const [label, setLabel] = useState(() => loadStoredState()?.label ?? "");
  const [showControls, setShowControls] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const stateRef = useRef(state);
  const settingsRef = useRef(settings);

  useEffect(() => {
    stateRef.current = state;
    settingsRef.current = settings;
  });

  const running = state !== null && state.type !== "break";

  // Re-render every 200ms; check for completion inline
  useEffect(() => {
    if (!running) return;

    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);

      const s = stateRef.current;
      if (!s || s.type === "break") return;

      const paused =
        s.intervals.length > 0 &&
        s.intervals[s.intervals.length - 1].endedAt !== undefined;
      if (paused) return;

      const target = nextDuration(s.type, settingsRef.current) * 1000;
      const e = elapsed(s.startedAt, t, s.intervals);

      if (e >= target) {
        clearInterval(id);
        completeAndSaveBlock(s).then(() => {
          setState(null);
          setLabel("");
          setShowControls(false);
        });
      }
    }, 200);

    return () => clearInterval(id);
  }, [running]);

  // Persist to localStorage
  useEffect(() => {
    if (state) localStorage.setItem(STORAGE_KEY, serializeState(state));
  }, [state]);

  function startFocus(initialLabel: string | null) {
    const t = Date.now();
    const newState: TimerState = {
      type: "focus",
      startedAt: t,
      label: initialLabel || null,
      tagId: null,
      focusBlocksCompleted: state?.focusBlocksCompleted ?? 0,
      intervals: [{ startedAt: t }],
    };
    setState(newState);
    setShowControls(false);
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
    completeAndSaveBlock(state).then(() => {
      setState(null);
      setLabel("");
      setShowControls(false);
    });
  }

  const currentElapsed = state ? elapsed(state.startedAt, now, state.intervals) : 0;
  const targetDuration = state ? nextDuration(state.type, settings) * 1000 : 0;

  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  const pos = cyclePosition(
    state?.focusBlocksCompleted ?? 0,
    settings.blocksPerCycle
  );

  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8 px-4">
        <CycleIndicator completed={pos.completed} total={settings.blocksPerCycle} isBreak={false} />
        <div className="text-7xl font-light tabular-nums tracking-tight text-neutral-700 select-none">
          {formatTime(targetDuration || 25 * 60 * 1000)}
        </div>
        <div className="text-sm uppercase tracking-widest text-neutral-400">Focus</div>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What are you working on? (optional)"
          className="w-64 text-center text-sm text-neutral-500 placeholder:text-neutral-300 border-b border-neutral-200 pb-1 outline-none focus:border-neutral-400 transition-colors"
        />
        <button
          onClick={() => startFocus(label || null)}
          className="px-12 py-3 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
        >
          START
        </button>
        {label && (
          <button
            onClick={() => startFocus(label)}
            className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            ● Last: &quot;{label}&quot; ↺
          </button>
        )}
      </div>
    );
  }

  const fraction = targetDuration > 0 ? currentElapsed / targetDuration : 0;
  const circumference = 2 * Math.PI * 42;

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 px-4">
      <CycleIndicator
        completed={pos.completed}
        total={settings.blocksPerCycle}
        isBreak={state.type !== "focus"}
      />
      <div className="relative">
        <svg className="w-52 h-52 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke={state.type === "focus" ? "#e5e5e5" : "#a7f3d0"} strokeWidth="6" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={state.type === "focus" ? "#171717" : "#059669"} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)} className="transition-[stroke-dashoffset] duration-500 ease-linear" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-light tabular-nums tracking-tight text-neutral-700 select-none">
            {isPaused ? "PAUSED" : formatTime(currentElapsed)}
          </div>
          {!isPaused && (
            <div className="text-[10px] text-neutral-400 mt-0.5">of {formatTime(targetDuration)}</div>
          )}
        </div>
      </div>
      {state.label && (
        <div className="text-sm text-neutral-500 flex items-center gap-1">
          {state.type === "focus" && <span className="inline-block w-2 h-2 rounded-full bg-neutral-700" />}
          {state.label}
        </div>
      )}
      <div className="mt-1">
        <CycleIndicator completed={pos.completed} total={settings.blocksPerCycle} isBreak={state.type !== "focus"} />
      </div>
      <div className="mt-4" onClick={() => setShowControls(!showControls)}>
        {showControls ? (
          <div className="flex gap-3 items-center" data-testid="secondary-controls">
            <button
              onClick={(e) => { e.stopPropagation(); togglePause(); }}
              className="px-6 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-500 transition-colors"
            >
              {isPaused ? "RESUME" : "⏸ PAUSE"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); stopBlock(); }}
              className="px-6 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-500 transition-colors"
            >
              ⏹ STOP
            </button>
          </div>
        ) : (
          <div className="text-xs text-neutral-300 cursor-pointer select-none">tap for controls</div>
        )}
      </div>
    </div>
  );
}
