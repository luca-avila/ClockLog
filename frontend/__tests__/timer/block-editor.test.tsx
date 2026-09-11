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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { BlockData } from "@/lib/api/history";

const updateBlock = vi.hoisted(() => vi.fn());
const deleteBlock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/history", () => ({ updateBlock, deleteBlock }));

vi.mock("@/lib/api/tags", () => ({ fetchTags: vi.fn().mockResolvedValue([]) }));

import BlockEditor from "@/components/timer/BlockEditor";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  updateBlock.mockClear();
  deleteBlock.mockClear();
});

// Anchored to the runner's local day: BlockEditor edits wall-clock times, so a
// fixture pinned to a UTC instant asserts the runner's offset, not the code.
const START_ISO = new Date(2026, 0, 15, 9, 0, 0, 0).toISOString();
const END_ISO = new Date(2026, 0, 15, 9, 25, 0, 0).toISOString();

function makeBlock(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: "blk-1",
    user_id: "u1",
    status: "completed",
    kind: "focus",
    label: "original",
    tag_id: null,
    started_at: START_ISO,
    intervals: [
      {
        id: "iv-1",
        started_at: START_ISO,
        ended_at: END_ISO,
      },
    ],
    ...overrides,
  };
}

function render(block: BlockData) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(<BlockEditor block={block} tags={[]} onDone={vi.fn()} />)
  );
  return { container, root };
}

function setNativeValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("BlockEditor end-date validation", () => {
  it("surfaces error when start is past end and does not call updateBlock", async () => {
    const block = makeBlock();
    const { container } = render(block);

    const startInput = container.querySelector("#block-start") as HTMLInputElement;
    // Set start to 10:00 — past the 09:25 end
    act(() => setNativeValue(startInput, "10:00"));

    // Click SAVE
    const saveBtn = container.querySelector('button[aria-label="SAVE"]') as HTMLButtonElement;
    await act(async () => saveBtn.click());

    expect(container.textContent).toContain("End must be after start");
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("does not send null end", async () => {
    const block = makeBlock();
    const { container } = render(block);

    // Clearing Ended leaves an open block, which the server now rejects; the
    // editor must block the save locally instead of PATCHing ended_at: null.
    const endInput = container.querySelector("#block-end") as HTMLInputElement;
    act(() => setNativeValue(endInput, ""));

    expect(container.textContent).toContain("End is required");

    const saveBtn = container.querySelector('button[aria-label="SAVE"]') as HTMLButtonElement;
    await act(async () => saveBtn.click());

    expect(updateBlock).not.toHaveBeenCalled();
  });
});
