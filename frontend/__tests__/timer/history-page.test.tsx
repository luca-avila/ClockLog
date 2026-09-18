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
  // BlockEditor imports these; nothing in these tests opens the editor.
  updateBlock: vi.fn(),
  deleteBlock: vi.fn(),
}));

const fetchTagsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/tags", () => ({
  fetchTags: (...args: unknown[]) => fetchTagsMock(...args),
}));

// The ranges are local-calendar math, so pin a DST-observing zone that is
// offset from UTC before any Date is constructed.
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

function block(
  id: string,
  startedAt: Date,
  minutes: number,
  kind: BlockData["kind"] = "focus"
): BlockData {
  return {
    id,
    user_id: "user-1",
    status: "completed",
    kind,
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fetchBlocksMock.mockReset().mockResolvedValue([]);
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

describe("HistoryPage view switch (SCR-20)", () => {
  it("defaults to Day and asks for the local day range only", async () => {
    const { container } = await renderPage();
    await flush();

    const day = localDayRange(NOW);
    expect(fetchBlocksMock).toHaveBeenLastCalledWith(day.from, day.to);
    expect(fetchSummaryMock).toHaveBeenLastCalledWith(day.from, day.to);
    expect(container.textContent).toContain("Wednesday");
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("Day");
  });

  it("Week asks for the Monday-start range and keeps the anchor's day", async () => {
    const { container } = await renderPage();
    await flush();

    await clickButton(container, "Week");
    await flush();

    const week = localWeekRange(NOW);
    expect(fetchBlocksMock).toHaveBeenLastCalledWith(week.from, week.to);
    expect(fetchSummaryMock).toHaveBeenLastCalledWith(week.from, week.to);
    expect(container.textContent).toContain("Sep 14 – Sep 20");
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("Week");
  });

  it("Month asks for the calendar-month range", async () => {
    const { container } = await renderPage();
    await flush();

    await clickButton(container, "Month");
    await flush();

    const month = localMonthRange(NOW);
    expect(fetchBlocksMock).toHaveBeenLastCalledWith(month.from, month.to);
    expect(fetchSummaryMock).toHaveBeenLastCalledWith(month.from, month.to);
    expect(container.textContent).toContain("September 2026");
  });

  it("renders one heading per local day, with that day's focus total", async () => {
    fetchBlocksMock.mockResolvedValue([
      block("mon", new Date(2026, 8, 14, 9, 0, 0), 60),
      block("tue", new Date(2026, 8, 15, 9, 0, 0), 25),
      block("tue-break", new Date(2026, 8, 15, 9, 30, 0), 5, "short_break"),
    ]);
    const { container } = await renderPage();
    await flush();

    await clickButton(container, "Week");
    await flush();

    const headings = [...container.querySelectorAll("h4")].map((h) => h.textContent);
    expect(headings).toEqual(["Mon, Sep 14 — 1h 0m", "Tue, Sep 15 — 25m"]);
  });

  it("Day stays one flat list with no day heading", async () => {
    fetchBlocksMock.mockResolvedValue([
      block("a", new Date(2026, 8, 16, 9, 0, 0), 25),
      block("b", new Date(2026, 8, 16, 10, 0, 0), 25),
    ]);
    const { container } = await renderPage();
    await flush();

    expect(container.querySelectorAll("h4")).toHaveLength(0);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
  });

  it("empty copy is honest and per-view", async () => {
    const { container } = await renderPage();
    await flush();
    expect(container.textContent).toContain("No blocks yet");

    await clickButton(container, "Week");
    await flush();
    expect(container.textContent).toContain("No blocks this week");
    expect(container.textContent).toContain("Your finished blocks will show up here.");

    await clickButton(container, "Month");
    await flush();
    expect(container.textContent).toContain("No blocks this month");
  });
});
