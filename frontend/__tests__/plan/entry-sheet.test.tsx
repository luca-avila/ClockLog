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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import EntrySheet from "@/components/plan/EntrySheet";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const api = vi.hoisted(() => ({
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  fetchEntry: vi.fn(),
}));
vi.mock("@/lib/api/plan", () => api);

const tagsApi = vi.hoisted(() => ({ fetchTags: vi.fn() }));
vi.mock("@/lib/api/tags", () => tagsApi);

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const TAGS = [
  { id: "t1", user_id: "u", name: "Study", color: "#22c55e", created_at: "x" },
  { id: "t2", user_id: "u", name: "Work", color: "#3b82f6", created_at: "x" },
];

// The stored row: anchored Tue Jul 28, repeats weekly.
const STORED = {
  id: "e1",
  user_id: "u",
  tag_id: null,
  name: "Gym",
  date: "2026-07-28",
  all_day: false,
  start_time: "18:30:00",
  end_time: "19:30:00",
  repeat_weekly: true,
  created_at: "x",
};

function setup(mode: React.ComponentProps<typeof EntrySheet>["mode"]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<EntrySheet mode={mode} returnTo="/plan" />));
  return { container, root };
}

function byLabel(container: HTMLElement, label: string) {
  return container.querySelector<HTMLInputElement | HTMLButtonElement>(
    `[aria-label="${label}"]`
  ) as HTMLInputElement | HTMLButtonElement;
}

const valueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)!.set!;

function setVal(container: HTMLElement, label: string, value: string) {
  const el = byLabel(container, label) as HTMLInputElement;
  act(() => {
    valueSetter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function click(container: HTMLElement, label: string) {
  act(() => {
    (byLabel(container, label) as HTMLElement).click();
  });
}

async function flush() {
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  replace.mockReset();
  tagsApi.fetchTags.mockResolvedValue(TAGS);
  api.fetchEntry.mockResolvedValue(STORED);
  api.createEntry.mockResolvedValue({});
  api.updateEntry.mockResolvedValue({});
  api.deleteEntry.mockResolvedValue(undefined);
});

describe("sheet shape (SCR-32, phase-2 version)", () => {
  it("renders name / day / from-to / tag / repeat weekly / SAVE — and no focus-timer checkbox", async () => {
    const { container } = setup({ kind: "create", date: "2026-07-28", hour: 9 });
    await flush();

    expect(byLabel(container, "Name")).toBeTruthy();
    expect(byLabel(container, "Day")).toBeTruthy();
    expect(byLabel(container, "From")).toBeTruthy();
    expect(byLabel(container, "To")).toBeTruthy();
    expect(byLabel(container, "SAVE")).toBeTruthy();

    // Tag chips render via the shared picker
    expect(container.textContent).toContain("Study");
    expect(container.textContent).toContain("Work");

    // The only checkboxes are All day and Repeat weekly — the ⚠ callout's
    // focus-timer checkbox is phase 3 and must not exist.
    const checkboxes = [...container.querySelectorAll('input[type="checkbox"]')].map(
      (i) => i.getAttribute("aria-label")
    );
    expect(checkboxes.sort()).toEqual(["All day", "Repeat weekly"]);
    expect(container.textContent).not.toContain("Use focus");
    expect(container.textContent).not.toContain("focus");
  });

  it("reuses the shared TagPicker — no plan-local tag UI", () => {
    const src = readFileSync(
      resolve(import.meta.dirname, "../../components/plan/EntrySheet.tsx"),
      "utf8"
    );
    expect(src).toContain("@/components/shared/TagPicker");
    expect(src).not.toMatch(/backgroundColor/); // chip colors live in the picker
  });
});

describe("all-day handling", () => {
  it("toggles from/to out of the DOM and sends nulls, not empty strings", async () => {
    const { container } = setup({ kind: "create", date: "2026-07-28", hour: 9 });
    await flush();

    click(container, "All day");
    expect(byLabel(container, "From")).toBeNull();
    expect(byLabel(container, "To")).toBeNull();

    setVal(container, "Name", "Trip to Porto");
    await act(async () => {
      (byLabel(container, "SAVE") as HTMLElement).click();
    });

    expect(api.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        all_day: true,
        start_time: null,
        end_time: null,
      })
    );
  });
});

describe("times", () => {
  it("an end before start is surfaced inline as a midnight span, not an error", async () => {
    const { container } = setup({ kind: "create", date: "2026-07-28", hour: 9 });
    await flush();

    setVal(container, "Name", "Late dinner");
    setVal(container, "From", "22:00");
    setVal(container, "To", "00:30");

    expect(container.textContent).toContain("after midnight");
    expect(container.querySelector('[role="alert"]')).toBeNull();

    await act(async () => {
      (byLabel(container, "SAVE") as HTMLElement).click();
    });
    // The server accepts midnight spans (S-19); the sheet never blocks them.
    expect(api.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ start_time: "22:00", end_time: "00:30" })
    );
  });

  it("missing times on a timed entry surface inline, before any server call", async () => {
    const { container } = setup({ kind: "create", date: "2026-07-28", hour: null });
    await flush();

    setVal(container, "Name", "Untitled");
    await act(async () => {
      (byLabel(container, "SAVE") as HTMLElement).click();
    });

    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(api.createEntry).not.toHaveBeenCalled();
  });
});

describe("editing", () => {
  it("loads the stored entry — an occurrence of a repeating entry edits its anchor, by id", async () => {
    // Tapped from, say, the Aug 4 occurrence — the URL carries only entry_id.
    const { container } = setup({ kind: "edit", entryId: "e1" });
    await flush();

    expect((byLabel(container, "Name") as HTMLInputElement).value).toBe("Gym");
    expect((byLabel(container, "Day") as HTMLInputElement).value).toBe("2026-07-28");

    await act(async () => {
      (byLabel(container, "SAVE") as HTMLElement).click();
    });

    expect(api.updateEntry).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({ date: "2026-07-28", repeat_weekly: true })
    );
    expect(replace).toHaveBeenCalled();
    expect(String(replace.mock.calls[0][0])).toMatch(/^\/plan\?t=/);
  });

  it("a re-render with an equal mode object does not refetch the entry", async () => {
    const { container, root } = setup({ kind: "edit", entryId: "e1" });
    await flush();
    expect(api.fetchEntry).toHaveBeenCalledTimes(1);

    // What the user would be doing when the parent re-renders.
    setVal(container, "Name", "Gym — edited");

    // readPlanView rebuilds `mode` on every parent render: same values, new
    // object. Keying the effect on that identity refetched and clobbered the
    // form under the user's cursor.
    act(() =>
      root.render(<EntrySheet mode={{ kind: "edit", entryId: "e1" }} returnTo="/plan" />)
    );
    await flush();

    expect(api.fetchEntry).toHaveBeenCalledTimes(1);
    expect((byLabel(container, "Name") as HTMLInputElement).value).toBe("Gym — edited");
  });

  it("delete removes the stored entry and closes", async () => {
    const { container } = setup({ kind: "edit", entryId: "e1" });
    await flush();

    await act(async () => {
      (byLabel(container, "Delete") as HTMLElement).click();
    });

    expect(api.deleteEntry).toHaveBeenCalledWith("e1");
    expect(replace).toHaveBeenCalled();
    expect(String(replace.mock.calls[0][0])).toMatch(/^\/plan\?t=/);
  });
});

describe("create prefill", () => {
  it("an hour from a tap-to-create link prefills from/to", async () => {
    const { container } = setup({ kind: "create", date: "2026-07-28", hour: 14 });
    await flush();

    expect((byLabel(container, "From") as HTMLInputElement).value).toBe("14:00");
    expect((byLabel(container, "To") as HTMLInputElement).value).toBe("15:00");
  });
});
