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

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const enqueueAndSyncMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ synced: 1, dropped: 0, pending: 0, needsReauth: false })
);
vi.mock("@/lib/api/queue", () => ({
  enqueueAndSync: (...args: unknown[]) => enqueueAndSyncMock(...args),
}));

import { saveBlock } from "@/lib/api/blocks";
import type { BlockData } from "@/lib/api/history";
import { groupByLocalDay, localDayKey } from "@/lib/timer/history-group";
import type { TimerState } from "@/lib/timer/engine";

// Grouping is local-calendar math, so pin a DST-observing zone before any
// Date is constructed and restore it after.
const originalTz = process.env.TZ;
process.env.TZ = "Europe/Madrid";

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const START = Date.UTC(2026, 8, 9, 14, 0, 0);
const PAUSE = START + 12 * 60 * 1000;
const RESUME = START + 22 * 60 * 1000;
const END = START + 30 * 60 * 1000;

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

function baseState(): TimerState {
  return {
    id: "blk-1",
    type: "focus",
    phase: "ended",
    startedAt: START,
    label: "mates",
    tagId: null,
    focusBlocksCompleted: 0,
    intervals: [
      { startedAt: START, endedAt: PAUSE },
      { startedAt: RESUME, endedAt: END },
    ],
    blockStatus: "completed",
    targetMs: 25 * 60 * 1000,
  };
}

beforeEach(() => {
  enqueueAndSyncMock.mockClear();
});

describe("stateToPayload (through saveBlock)", () => {
  it("sends N closed intervals and no envelope times", async () => {
    await saveBlock(baseState(), END);

    expect(enqueueAndSyncMock).toHaveBeenCalledTimes(1);
    const payload = enqueueAndSyncMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.id).toBe("blk-1");
    expect(payload.status).toBe("completed");
    expect(payload.kind).toBe("focus");
    expect(payload.label).toBe("mates");
    expect(payload.tag_id).toBeNull();
    expect(payload).not.toHaveProperty("started_at");
    expect(payload).not.toHaveProperty("ended_at");
    expect(payload.intervals).toEqual([
      { started_at: new Date(START).toISOString(), ended_at: new Date(PAUSE).toISOString() },
      { started_at: new Date(RESUME).toISOString(), ended_at: new Date(END).toISOString() },
    ]);
  });

  it("sends only real work: the 10-minute pause gap is absent from the sum", async () => {
    await saveBlock(baseState(), END);

    const payload = enqueueAndSyncMock.mock.calls[0][0] as {
      intervals: { started_at: string; ended_at: string }[];
    };
    const workMs = payload.intervals.reduce((sum, iv) => {
      return sum + (Date.parse(iv.ended_at) - Date.parse(iv.started_at));
    }, 0);
    // 12 min + 8 min = 20 min, not the 30 wall-clock minutes.
    expect(workMs).toBe(20 * 60 * 1000);
  });

  it("closes an open final interval at endedAt (aborted path)", async () => {
    const aborted: TimerState = {
      ...baseState(),
      blockStatus: "aborted",
      intervals: [{ startedAt: START }],
    };
    const stopAt = START + 7 * 60 * 1000;

    await saveBlock(aborted, stopAt);

    const payload = enqueueAndSyncMock.mock.calls[0][0] as {
      status: string;
      intervals: { started_at: string; ended_at: string }[];
    };
    expect(payload.status).toBe("aborted");
    expect(payload.intervals).toEqual([
      { started_at: new Date(START).toISOString(), ended_at: new Date(stopAt).toISOString() },
    ]);
  });

  it("aborting while paused keeps the closed intervals and appends nothing", async () => {
    // Pause closes the last interval, so stop() hands over an already-closed
    // list and an `endedAt` later than every end. Fabricating a zero-length
    // tail here would make the server 422 and the block would be dropped.
    const abortedWhilePaused: TimerState = {
      ...baseState(),
      blockStatus: "aborted",
      intervals: [{ startedAt: START, endedAt: PAUSE }],
    };
    const stopAt = PAUSE + 5 * 60 * 1000;

    await saveBlock(abortedWhilePaused, stopAt);

    const payload = enqueueAndSyncMock.mock.calls[0][0] as {
      status: string;
      intervals: { started_at: string; ended_at: string }[];
    };
    expect(payload.status).toBe("aborted");
    expect(payload.intervals).toEqual([
      { started_at: new Date(START).toISOString(), ended_at: new Date(PAUSE).toISOString() },
    ]);
  });
});

describe("groupByLocalDay (invariant 7: a block belongs to the day it started)", () => {
  it("buckets by start, so a midnight-crossing block stays on its starting day", () => {
    const spanning = block("night", new Date(2026, 8, 14, 23, 50, 0), 40);
    const groups = groupByLocalDay([spanning]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-09-14");
    expect(groups[0].items.map((b) => b.id)).toEqual(["night"]);
    // The next local day is where it *ended*; it owns nothing.
    expect(localDayKey(groups[0].items[0].intervals[0].ended_at)).toBe("2026-09-15");
  });

  it("orders the groups oldest first and the rows by start", () => {
    const blocks = [
      block("late-tue", new Date(2026, 8, 15, 18, 0, 0), 30),
      block("mon-b", new Date(2026, 8, 14, 15, 0, 0), 30),
      block("mon-a", new Date(2026, 8, 14, 9, 0, 0), 30),
    ];

    const groups = groupByLocalDay(blocks);

    expect(groups.map((g) => g.key)).toEqual(["2026-09-14", "2026-09-15"]);
    expect(groups[0].items.map((b) => b.id)).toEqual(["mon-a", "mon-b"]);
  });

  it("totals only focus time per day, excluding breaks", () => {
    const groups = groupByLocalDay([
      block("focus", new Date(2026, 8, 14, 9, 0, 0), 25),
      block("break", new Date(2026, 8, 14, 9, 30, 0), 5, "short_break"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].focusSeconds).toBe(25 * 60);
  });

  it("keeps the two sides of midnight in separate groups, so no gap spans a day", () => {
    const groups = groupByLocalDay([
      block("before", new Date(2026, 8, 14, 23, 50, 0), 10),
      block("after", new Date(2026, 8, 15, 0, 10, 0), 10),
    ]);

    expect(groups.map((g) => g.key)).toEqual(["2026-09-14", "2026-09-15"]);
    expect(groups.map((g) => g.items.length)).toEqual([1, 1]);
  });

  it("labels a group with its local weekday and date", () => {
    const groups = groupByLocalDay([block("mon", new Date(2026, 8, 14, 9, 0, 0), 60)]);
    expect(groups[0].label).toBe("Mon, Sep 14");
  });

  it("returns nothing for an empty range", () => {
    expect(groupByLocalDay([])).toEqual([]);
  });
});
