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

const enqueueAndSyncMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ synced: 1, dropped: 0, pending: 0, needsReauth: false })
);
vi.mock("@/lib/api/queue", () => ({
  enqueueAndSync: (...args: unknown[]) => enqueueAndSyncMock(...args),
}));

import { saveBlock } from "@/lib/api/blocks";
import type { TimerState } from "@/lib/timer/engine";

const START = Date.UTC(2026, 8, 9, 14, 0, 0);
const PAUSE = START + 12 * 60 * 1000;
const RESUME = START + 22 * 60 * 1000;
const END = START + 30 * 60 * 1000;

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
});
