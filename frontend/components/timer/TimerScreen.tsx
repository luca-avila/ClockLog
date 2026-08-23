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

import {
  useState,
  useEffect,
  useCallback,
  useReducer,
  useSyncExternalStore,
} from "react";
import {
  type TimerState,
  type BlockType,
  type TimerEvent,
  type TimerSettings,
  type ClockDeps,
  type TimerEffect,
  elapsed,
  cyclePosition,
  nextBreakType,
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
import PrimaryButton from "@/components/shared/PrimaryButton";

// The hydration gate below never changes after mount, so it has nothing to
// subscribe to. useSyncExternalStore is still the right tool: it is the one
// hook that can return a different value on the server than on the client
// without React treating the difference as a mismatch.
const subscribeNever = () => () => {};

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


// ─── Presentation helpers ───────────────────────────────────────────

const TYPE_NAME: Record<BlockType, string> = {
  focus: "Focus",
  short_break: "Short break",
  long_break: "Long break",
};

/**
 * The countdown dial (SCR-11 / SCR-13). A break dots its track instead of
 * tinting it: tag colors stay the only saturated ink in the app.
 */
function Dial({
  fraction,
  muted,
  children,
}: {
  fraction: number;
  muted: boolean;
  children: React.ReactNode;
}) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative aspect-square w-full max-w-[16rem] sm:max-w-[18rem]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          className="stroke-neutral-200"
          strokeDasharray={muted ? "0.5 4" : undefined}
          strokeLinecap="round"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`transition-[stroke-dashoffset] duration-500 ease-linear ${
            muted ? "stroke-neutral-400" : "stroke-neutral-800"
          }`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(Math.max(fraction, 0), 1))}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
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
    // rather than stranding a completed block: an unlabelled block is a lost block.
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
  // initMachine reads localStorage, which the server cannot: rendering the
  // restored machine during hydration makes the server's default disagree
  // with it. Hold the first paint so the restored state is the only one
  // ever painted — a wrong countdown must never flash on the largest
  // element in the app.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);

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
    ? machine.timer.targetMs
    : 0;

  const pos = cyclePosition(machine.completed, settings.blocksPerCycle);

  const breakType = nextBreakType(machine.completed, settings.blocksPerCycle);


  // ─── Presentation (SCR-11 / SCR-13) ─────────────────────────────
  // The dial is painted in every state, idle included: starting a block
  // changes the fill, never the layout, so nothing on screen jumps at the
  // one moment the user is watching it.

  const isBreakNow = machine.timer
    ? machine.timer.type !== "focus"
    : machine.pendingBreak;
  const currentType: BlockType = machine.timer
    ? machine.timer.type
    : machine.pendingBreak
      ? breakType
      : "focus";
  const isPaused = machine.timer?.phase === "paused";
  const isEnded = machine.timer?.phase === "ended";
  const isRunning = machine.timer?.phase === "running";

  const idleDuration = nextDuration(currentType, settings) * 1000;
  const dialTotal = machine.timer ? targetDuration : idleDuration;
  const dialValue = machine.timer
    ? isEnded
      ? targetDuration
      : currentElapsed
    : idleDuration;
  const fraction = machine.timer && dialTotal > 0 ? currentElapsed / dialTotal : 0;

  // Same wrapper as every painted state, so nothing reflows when they arrive.
  const shell = (children: React.ReactNode) => (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-10">{children}</div>
  );

  if (!hydrated) return shell(null);

  return (
    <>
      {machine.labelSheetOpen && <LabelSheet onSave={handleLabelSave} onSkip={handleLabelSkip} />}

      {shell(
        <>
          <header className="mb-8">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
              Now
            </p>
            <h1 className="text-3xl font-light tracking-tight text-neutral-800 sm:text-4xl">
              Timer
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              {machine.timer
                ? isPaused
                  ? "Paused — the clock is stopped."
                  : isBreakNow
                    ? "Step away from the screen."
                    : "In a block. Recording time."
                : machine.pendingBreak
                  ? "Block done. Start the break when you actually step away."
                  : "Nothing running."}
            </p>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            <section className="rounded-2xl border border-neutral-200 bg-white px-5 py-8 sm:px-8 sm:py-10">
              <div className="flex flex-col items-center gap-6">
                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
                  {isPaused ? "PAUSED" : TYPE_NAME[currentType]}
                </span>

                <Dial fraction={fraction} muted={isBreakNow}>
                  <span className="text-6xl font-light tabular-nums tracking-tight text-neutral-900 select-none sm:text-7xl">
                    {formatCountdown(dialValue)}
                  </span>
                  <span className="mt-2 text-xs tabular-nums text-neutral-400">
                    {machine.timer && !isPaused && !isEnded
                      ? `of ${formatCountdown(targetDuration)}`
                      : machine.timer
                        ? `${Math.round(Math.min(fraction, 1) * 100)}% elapsed`
                        : "ready"}
                  </span>
                </Dial>

                {/* What is being recorded. Blank in a break: a break has no label. */}
                {machine.timer && !isBreakNow && machine.timer.label && (
                  <p className="flex max-w-full items-center gap-2 text-sm text-neutral-600">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-neutral-700" aria-hidden />
                    <span className="truncate">{machine.timer.label}</span>
                  </p>
                )}

                {!machine.timer && !machine.pendingBreak && (
                  <div className="flex w-full max-w-sm flex-col items-center gap-3">
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="What are you working on? (optional)"
                      aria-label="Block label"
                      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-center text-sm text-neutral-700 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400"
                    />
                  </div>
                )}

                <div className="mt-1 flex flex-col items-center gap-3">
                  {!machine.timer ? (
                    <>
                      <PrimaryButton
                        onClick={() =>
                          dispatch({
                            kind: "start",
                            type: currentType,
                            label: machine.pendingBreak ? null : label || null,
                            tagId: null,
                          })
                        }
                      >
                        START
                      </PrimaryButton>
                      {machine.pendingBreak && (
                        <button
                          onClick={() => dispatch({ kind: "skipBreak" })}
                          className="text-xs text-neutral-400 transition-colors hover:text-neutral-600"
                        >
                          Skip break
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3" data-testid="secondary-controls">
                        {isPaused ? (
                          <PrimaryButton onClick={() => dispatch({ kind: "resume" })}>
                            RESUME
                          </PrimaryButton>
                        ) : (
                          <button
                            onClick={() => dispatch({ kind: "pause" })}
                            className="rounded-lg px-6 py-2.5 text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-600"
                          >
                            ⏸ PAUSE
                          </button>
                        )}
                        <button
                          onClick={() => dispatch({ kind: "stop" })}
                          className="rounded-lg px-6 py-2.5 text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-600"
                        >
                          ⏹ STOP
                        </button>
                      </div>
                      {isBreakNow && isRunning && (
                        <button
                          onClick={() => dispatch({ kind: "skipBreak" })}
                          className="text-xs text-neutral-400 transition-colors hover:text-neutral-600"
                        >
                          Skip break
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* Where the cycle lives now: off the stage, next to it. */}
            <aside className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
                Cycle
              </p>
              <div className="mt-3 flex justify-start">
                <CycleIndicator
                  completed={pos.completed}
                  total={settings.blocksPerCycle}
                  isBreak={isBreakNow}
                />
              </div>
              <p className="mt-3 text-sm text-neutral-500">
                {pos.completed} of {settings.blocksPerCycle} blocks in this cycle
              </p>

              <dl className="mt-5 space-y-2.5 border-t border-neutral-100 pt-4 text-sm">
                {(
                  [
                    ["focus", settings.focusDuration],
                    ["short_break", settings.shortBreakDuration],
                    ["long_break", settings.longBreakDuration],
                  ] as const
                ).map(([type, minutes]) => (
                  <div key={type} className="flex items-baseline justify-between gap-3">
                    <dt
                      className={
                        type === currentType ? "text-neutral-900" : "text-neutral-500"
                      }
                    >
                      {TYPE_NAME[type]}
                    </dt>
                    <dd className="tabular-nums text-neutral-600">{minutes} min</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-4 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
                Up next:{" "}
                <span className="text-neutral-600">
                  {machine.timer
                    ? isBreakNow
                      ? TYPE_NAME.focus
                      : TYPE_NAME[nextBreakType(machine.completed, settings.blocksPerCycle)]
                    : machine.pendingBreak
                      ? TYPE_NAME[breakType]
                      : TYPE_NAME.focus}
                </span>
              </p>

              {label && !machine.timer && !machine.pendingBreak && (
                <button
                  onClick={() =>
                    dispatch({ kind: "start", type: "focus", label, tagId: null })
                  }
                  className="mt-4 w-full truncate rounded-xl border border-neutral-200 px-3 py-2 text-left text-xs text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-800"
                >
                  ↺ Start again: &quot;{label}&quot;
                </button>
              )}
            </aside>
          </div>
        </>
      )}
    </>
  );
}
