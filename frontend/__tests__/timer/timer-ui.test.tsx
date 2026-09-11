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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import type { TimerState } from "@/lib/timer/engine";

const saveBlock = vi.hoisted(() => vi.fn().mockResolvedValue({ dropped: [] }));
vi.mock("@/lib/api/blocks", () => ({ saveBlock }));

vi.mock("@/lib/alerts", () => ({
  fireAlert: vi.fn(),
  createBrowserDeps: vi.fn(() => ({})),
  readHasCompletedBlock: vi.fn(() => false),
  markBlockCompleted: vi.fn(),
}));

vi.mock("@/components/timer/LabelSheet", () => ({
  default: ({
    onSave,
    onSkip,
  }: {
    onSave: (label: string, tagId: string | null) => void;
    onSkip: () => void;
  }) => (
    <div data-testid="label-sheet">
      <button onClick={() => onSave("test label", null)}>SAVE</button>
      <button onClick={onSkip}>SKIP</button>
    </div>
  ),
}));

vi.mock("@/lib/api/settings", () => ({
  fetchSettings: vi.fn().mockResolvedValue({
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    blocksPerCycle: 4,
    autoStartBreaks: false,
    autoStartNext: false,
    sound: true,
    notifications: true,
  }),
  updateSettings: vi.fn(),
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import TimerScreen from "@/components/timer/TimerScreen";

const STORAGE_KEY = "clocklog_clock";
const CYCLE_KEY = "clocklog_cycle";

let now = 1_700_000_000_000;
beforeEach(() => {
  vi.useFakeTimers();
  now = 1_700_000_000_000;
  vi.setSystemTime(now);
  localStorage.clear();
  saveBlock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<TimerScreen />));
  return { container, root };
}

function clickButton(el: HTMLElement, text: string) {
  const buttons = [...el.querySelectorAll("button")];
  const target = buttons.find((b) => b.textContent?.includes(text));
  if (!target) throw new Error(`button with text "${text}" not found`);
  act(() => target.click());
}

describe("hydration", () => {
  // initMachine reads localStorage, which the server cannot. Painting the
  // restored machine during hydration made the server's default disagree with
  // it, and React regenerated the tree. The server must paint no timer state
  // at all — not the default, which is just as wrong as the restored one.
  it("the server render paints no countdown, no cycle, and no controls", () => {
    localStorage.setItem(
      CYCLE_KEY,
      JSON.stringify({ completed: 2, pendingBreak: true })
    );
    const markup = renderToStaticMarkup(<TimerScreen />);
    expect(markup).not.toContain("25:00");
    expect(markup).not.toContain("05:00");
    expect(markup).not.toContain("START");
    expect(markup).not.toContain("bg-emerald-500");
    expect(markup).not.toContain("aria-label");
  });

  it("the client paints the restored state once mounted", () => {
    localStorage.setItem(
      CYCLE_KEY,
      JSON.stringify({ completed: 2, pendingBreak: true })
    );
    const { container } = render();
    expect(container.textContent).toContain("Short break");
    expect(container.textContent).toContain("START");
  });
});

describe("idle screen (SCR-10)", () => {
  it("renders START and the default focus duration", () => {
    const { container } = render();
    expect(container.textContent).toContain("START");
    expect(container.textContent).toContain("25:00");
    expect(container.textContent).toContain("Focus");
  });
});

describe("starting a block", () => {
  it("transitions to running state with timer and controls", () => {
    const { container } = render();
    clickButton(container, "START");
    // Shows target duration
    expect(container.textContent).toContain("of 25:00");
    // Controls appear
    expect(container.textContent).toContain("PAUSE");
    expect(container.textContent).toContain("STOP");
  });
});

describe("pause and resume (SCR-12)", () => {
  it("toggle between PAUSED and RESUME", () => {
    const { container } = render();
    clickButton(container, "START");

    clickButton(container, "PAUSE");
    expect(container.textContent).toContain("PAUSED");
    expect(container.textContent).toContain("RESUME");

    clickButton(container, "RESUME");
    expect(container.textContent).not.toContain("PAUSED");
    expect(container.textContent).toContain("PAUSE");
  });
});

describe("stop (abort)", () => {
  it("opens the label sheet and saves nothing until the block is named", async () => {
    const { container } = render();
    clickButton(container, "START");
    clickButton(container, "STOP");
    await act(async () => {});
    expect(container.querySelector('[data-testid="label-sheet"]')).toBeTruthy();
    expect(saveBlock).not.toHaveBeenCalled();
  });

  it("saves the aborted block with its label when the sheet is confirmed", async () => {
    const { container } = render();
    clickButton(container, "START");
    clickButton(container, "STOP");
    clickButton(container, "SAVE");
    await act(async () => {});
    expect(saveBlock).toHaveBeenCalledTimes(1);
    expect(saveBlock).toHaveBeenCalledWith(
      expect.objectContaining({ blockStatus: "aborted", label: "test label" }),
      expect.any(Number)
    );
  });

  it("saves the aborted block unlabelled when the sheet is skipped", async () => {
    const { container } = render();
    clickButton(container, "START");
    clickButton(container, "STOP");
    clickButton(container, "SKIP");
    await act(async () => {});
    expect(saveBlock).toHaveBeenCalledTimes(1);
    expect(saveBlock).toHaveBeenCalledWith(
      expect.objectContaining({ blockStatus: "aborted", label: null }),
      expect.any(Number)
    );
  });

  it("stops a break without opening the sheet and saves immediately", async () => {
    const startedAt = now - 60_000;
    const breakState: TimerState = {
      id: "test-break",
      type: "short_break",
      phase: "running",
      startedAt,
      label: null,
      tagId: null,
      focusBlocksCompleted: 4,
      intervals: [{ startedAt }],
      blockStatus: "completed",
      targetMs: 5 * 60 * 1000,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(breakState));
    localStorage.setItem(CYCLE_KEY, JSON.stringify({ completed: 4, pendingBreak: false }));
    const { container } = render();
    expect(container.textContent).toContain("STOP");
    clickButton(container, "STOP");
    await act(async () => {});
    expect(container.querySelector('[data-testid="label-sheet"]')).toBeNull();
    expect(saveBlock).toHaveBeenCalledTimes(1);
    expect(saveBlock).toHaveBeenCalledWith(
      expect.objectContaining({ blockStatus: "aborted" }),
      expect.any(Number)
    );
  });
});

describe("corrupt localStorage (invariant 4)", () => {
  it("renders idle screen, not NaN, when storage is garbage", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    localStorage.setItem(CYCLE_KEY, JSON.stringify({ completed: null, pendingBreak: false }));
    const { container } = render();
    expect(container.textContent).not.toContain("NaN");
  });

  it("renders idle when storage has a stale shape", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: "x", type: "focus", startedAt: "not-a-number" })
    );
    localStorage.setItem(CYCLE_KEY, JSON.stringify({ completed: null, pendingBreak: false }));
    const { container } = render();
    expect(container.textContent).not.toContain("NaN");
  });
});

describe("reload while the label sheet is open (SCR-14)", () => {
  function seedEndedFocusBlock() {
    const startedAt = now - 25 * 60 * 1000;
    const state: TimerState = {
      id: "test-ended",
      type: "focus",
      phase: "ended",
      startedAt,
      label: null,
      tagId: null,
      focusBlocksCompleted: 0,
      intervals: [{ startedAt, endedAt: now }],
      blockStatus: "completed",
      targetMs: 25 * 60 * 1000,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(CYCLE_KEY, JSON.stringify({ completed: 0, pendingBreak: false }));
  }

  it("reopens the sheet instead of stranding the block", () => {
    seedEndedFocusBlock();
    const { container } = render();
    expect(container.querySelector('[data-testid="label-sheet"]')).toBeTruthy();
  });

  it("saves the recovered block as completed, not aborted", async () => {
    seedEndedFocusBlock();
    const { container } = render();
    clickButton(container, "SAVE");
    await act(async () => {});
    expect(saveBlock).toHaveBeenCalledTimes(1);
    expect(saveBlock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "test-ended", blockStatus: "completed", label: "test label" }),
      expect.any(Number)
    );
  });

  it("does not open the sheet for a block that is merely paused", () => {
    const startedAt = now - 60_000;
    const state: TimerState = {
      id: "test-paused",
      type: "focus",
      phase: "paused",
      startedAt,
      label: null,
      tagId: null,
      focusBlocksCompleted: 0,
      intervals: [{ startedAt, endedAt: now }],
      blockStatus: "completed",
      targetMs: 25 * 60 * 1000,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(CYCLE_KEY, JSON.stringify({ completed: 0, pendingBreak: false }));
    const { container } = render();
    expect(container.querySelector('[data-testid="label-sheet"]')).toBeNull();
    expect(container.textContent).toContain("PAUSED");
  });
});

describe("reload with an aborted block awaiting its label (SCR-14)", () => {
  function seedEndedAbortedBlock() {
    const startedAt = now - 3 * 60 * 1000;
    const state: TimerState = {
      id: "test-ended-aborted",
      type: "focus",
      phase: "ended",
      startedAt,
      label: null,
      tagId: null,
      focusBlocksCompleted: 0,
      intervals: [{ startedAt, endedAt: now }],
      blockStatus: "aborted",
      targetMs: 25 * 60 * 1000,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(CYCLE_KEY, JSON.stringify({ completed: 0, pendingBreak: false }));
  }

  it("reopens the sheet and recovers a single aborted save plus its cycle advance", async () => {
    seedEndedAbortedBlock();
    const { container } = render();
    expect(container.querySelector('[data-testid="label-sheet"]')).toBeTruthy();

    clickButton(container, "SAVE");
    await act(async () => {});

    // Exactly one save — the deferred block and the cycle advance land together.
    expect(saveBlock).toHaveBeenCalledTimes(1);
    expect(saveBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "test-ended-aborted",
        blockStatus: "aborted",
        label: "test label",
      }),
      expect.any(Number)
    );
    expect(JSON.parse(localStorage.getItem(CYCLE_KEY)!)).toEqual({
      completed: 1,
      pendingBreak: true,
    });
  });
});

describe("completed focus block shows label sheet", () => {
  it("label sheet appears when elapsed >= target", () => {
    const startedAt = now;
    const state: TimerState = {
      id: "test-complete",
      type: "focus",
      phase: "running",
      startedAt,
      label: null,
      tagId: null,
      focusBlocksCompleted: 0,
      intervals: [{ startedAt }],
      blockStatus: "completed",
      targetMs: 25 * 60 * 1000,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(CYCLE_KEY, JSON.stringify({ completed: 0, pendingBreak: false }));

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<TimerScreen />));

    // No label sheet yet (just started)
    expect(container.querySelector('[data-testid="label-sheet"]')).toBeNull();

    // Advance past the 25-minute target
    act(() => vi.advanceTimersByTime(25 * 60 * 1000 + 1000));

    // The interval check fires and triggers the label sheet
    expect(container.querySelector('[data-testid="label-sheet"]')).toBeTruthy();
  });
});

describe("space shortcut (SCR-11)", () => {
  function pressSpace(target: Element = document.body) {
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
          cancelable: true,
        })
      );
    });
  }

  function seedEndedFocusBlock() {
    const startedAt = now - 25 * 60 * 1000;
    const state: TimerState = {
      id: "test-ended-space",
      type: "focus",
      phase: "ended",
      startedAt,
      label: null,
      tagId: null,
      focusBlocksCompleted: 0,
      intervals: [{ startedAt, endedAt: now }],
      blockStatus: "completed",
      targetMs: 25 * 60 * 1000,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(CYCLE_KEY, JSON.stringify({ completed: 0, pendingBreak: false }));
  }

  it("starts a focus block from idle", () => {
    const { container } = render();
    expect(container.textContent).toContain("Press Space to start");
    pressSpace();
    expect(container.textContent).toContain("of 25:00");
    expect(container.textContent).toContain("PAUSE");
  });

  it("moves focus off navigation before Space starts", () => {
    // Clicking a sidebar/tab link leaves that link focused after the route
    // changes; the shortcut must not hand Space back to the navigation.
    const navLink = document.createElement("a");
    document.body.appendChild(navLink);
    navLink.focus();

    const { container } = render();
    const screen = container.querySelector('[data-testid="timer-screen"]');
    expect(screen).not.toBeNull();
    expect(document.activeElement).toBe(screen);

    pressSpace(screen!);
    expect(container.textContent).toContain("of 25:00");
  });

  it("ignores Space while a block is running", () => {
    const { container } = render();
    clickButton(container, "START");
    expect(container.textContent).not.toContain("Press Space to start");
    pressSpace();
    expect(container.textContent).toContain("PAUSE");
    expect(container.textContent).not.toContain("PAUSED");
  });

  it("resumes a paused block on Space", () => {
    const { container } = render();
    clickButton(container, "START");
    clickButton(container, "PAUSE");
    expect(container.textContent).toContain("PAUSED");
    expect(container.textContent).toContain("Press Space to resume");
    pressSpace();
    expect(container.textContent).not.toContain("PAUSED");
    expect(container.textContent).toContain("PAUSE");
  });

  it("does not start another block while the label sheet is open", () => {
    seedEndedFocusBlock();
    const { container } = render();
    expect(container.querySelector('[data-testid="label-sheet"]')).toBeTruthy();
    pressSpace();
    // The recovered ended block is still awaiting its label, not replaced by
    // a fresh running block.
    expect(container.querySelector('[data-testid="label-sheet"]')).toBeTruthy();
    expect(container.textContent).not.toContain("of 25:00");
  });
});
