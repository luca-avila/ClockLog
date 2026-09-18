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

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { BlockData } from "@/lib/api/history";
import { localDayRange, localWeekRange, localMonthRange } from "@/lib/date/instant";

const fetchBlocksMock = vi.hoisted(() => vi.fn());
const fetchSummaryMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/history", () => ({
  fetchBlocks: (...args: unknown[]) => fetchBlocksMock(...args),
  fetchSummary: (...args: unknown[]) => fetchSummaryMock(...args),
  // BlockEditor imports these; nothing here opens the editor.
  updateBlock: vi.fn(),
  deleteBlock: vi.fn(),
}));

const fetchTagsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/tags", () => ({
  fetchTags: (...args: unknown[]) => fetchTagsMock(...args),
}));

// Local-day bucketing reads the host timezone, so pin a DST-observing zone
// before any Date is constructed.
const originalTz = process.env.TZ;
process.env.TZ = "Europe/Madrid";

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import HistoryPage from "@/components/timer/HistoryPage";

// Wed Sep 16 2026, midday, Madrid.
const NOW = new Date(2026, 8, 16, 12, 0, 0);

function block(id: string, startedAt: Date, minutes: number): BlockData {
  return {
    id,
    user_id: "user-1",
    status: "completed",
    kind: "focus",
    label: id,
    tag_id: null,
    started_at: startedAt.toISOString(),
    intervals: [
      {
        id: `${id}-i1`,
        started_at: startedAt.toISOString(),
        ended_at: new Date(startedAt.getTime() + minutes * 60_000).toISOString(),
      },
    ],
  };
}

const TUE = new Date(2026, 8, 15, 9, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fetchBlocksMock.mockReset().mockResolvedValue([block("tue", TUE, 25)]);
  fetchSummaryMock.mockReset().mockResolvedValue([]);
  fetchTagsMock.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<HistoryPage />);
  });
  return { container, root };
}

async function flush() {
  await act(async () => {});
}

async function clickButton(container: HTMLElement, text: string) {
  const target = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.trim() === text
  );
  if (!target) throw new Error(`button "${text}" not found`);
  await act(async () => {
    target.click();
  });
}

function barButtons(container: HTMLElement): HTMLButtonElement[] {
  const section = container.querySelector('section[aria-label="Daily totals"]');
  return section ? [...section.querySelectorAll("button")] : [];
}

describe("HistoryPage daily bars (SCR-20)", () => {
  it("renders one focusable button per local day of the week", async () => {
    const { container } = await renderPage();
    await flush();

    await clickButton(container, "Week");
    await flush();

    expect(fetchBlocksMock).toHaveBeenLastCalledWith(
      localWeekRange(NOW).from,
      localWeekRange(NOW).to
    );
    const bars = barButtons(container);
    expect(bars).toHaveLength(7);
    for (const bar of bars) {
      expect(bar.tagName).toBe("BUTTON");
      expect(bar.getAttribute("type")).toBe("button");
      expect(bar.getAttribute("aria-label")).toMatch(/^Show \w+day, \w+ \d+ — /);
    }
    expect(bars[1].getAttribute("aria-label")).toBe("Show Tuesday, Sep 15 — 25m");
    // Zero days still render a bar slot; only Day omits the section.
    expect(bars[6].getAttribute("aria-label")).toBe("Show Sunday, Sep 20 — 0m");
  });

  it("renders one button per calendar day in Month", async () => {
    const { container } = await renderPage();
    await flush();

    await clickButton(container, "Month");
    await flush();

    expect(fetchBlocksMock).toHaveBeenLastCalledWith(
      localMonthRange(NOW).from,
      localMonthRange(NOW).to
    );
    expect(barButtons(container)).toHaveLength(30); // September
  });

  it("drills into Day from a bar and refetches that local day", async () => {
    const { container } = await renderPage();
    await flush();

    await clickButton(container, "Week");
    await flush();

    const tueBar = barButtons(container).find((b) =>
      b.getAttribute("aria-label")?.startsWith("Show Tuesday")
    );
    if (!tueBar) throw new Error("Tuesday bar not found");
    await act(async () => {
      tueBar.click();
    });
    await flush();

    const day = localDayRange(TUE);
    expect(fetchBlocksMock).toHaveBeenLastCalledWith(day.from, day.to);
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("Day");
    expect(container.textContent).toContain("Tuesday");
    expect(barButtons(container)).toHaveLength(0);
  });

  it("drills into Day from a day heading", async () => {
    const { container } = await renderPage();
    await flush();

    await clickButton(container, "Week");
    await flush();

    const heading = container.querySelector("h4 button");
    if (!heading) throw new Error("day heading button not found");
    expect(heading.getAttribute("aria-label")).toBe("Show Tuesday, Sep 15 — 25m");
    await act(async () => {
      (heading as HTMLButtonElement).click();
    });
    await flush();

    const day = localDayRange(TUE);
    expect(fetchBlocksMock).toHaveBeenLastCalledWith(day.from, day.to);
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("Day");
    expect(container.textContent).toContain("Tuesday");
  });

  it("renders no bars in Day or in the empty state", async () => {
    const { container } = await renderPage();
    await flush();
    expect(barButtons(container)).toHaveLength(0);
    expect(container.textContent).toContain("Wednesday");

    fetchBlocksMock.mockResolvedValue([]);
    await clickButton(container, "Week");
    await flush();
    expect(container.textContent).toContain("No blocks this week");
    expect(barButtons(container)).toHaveLength(0);
  });
});
