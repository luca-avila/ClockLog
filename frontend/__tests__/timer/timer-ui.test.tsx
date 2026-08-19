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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
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
  default: ({ onSave }: { onSave: (label: string, tagId: string | null) => void }) => (
    <div data-testid="label-sheet">
      <button onClick={() => onSave("test label", null)}>SAVE</button>
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

const STORAGE_KEY = "tempo_clock";
const CYCLE_KEY = "tempo_cycle";

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

describe("idle screen (SCR-10)", () => {
  it("renders START and the default focus duration", () => {
    const { container } = render();
    expect(container.textContent).toContain("START");
    expect(container.textContent).toContain("25:00");
    expect(container.textContent).toContain("Focus");
  });

  it("renders the optional label input", () => {
    const { container } = render();
    const input = container.querySelector('input[type="text"]');
    expect(input).toBeTruthy();
    expect((input as HTMLInputElement).placeholder).toContain("optional");
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
  it("queues the block for save", async () => {
    const { container } = render();
    clickButton(container, "START");
    clickButton(container, "STOP");
    await act(async () => {});
    expect(saveBlock).toHaveBeenCalled();
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
