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

import type { TimerState } from "@/lib/timer/engine";
import { enqueueAndSync, type BlockPayload, type FlushResult } from "./queue";

function stateToPayload(state: TimerState, endedAt: number): BlockPayload {
  // The wire carries the engine's real segments. closeBlock() already closes
  // the final interval before a save effect fires, but an open tail is closed
  // here too so the payload is never wall-to-wall (pause gaps must not be
  // counted as work). Only an open interval gets `endedAt`: one already
  // closed keeps its own end and nothing is appended, because a fabricated
  // zero-length segment is exactly what POST /blocks rejects — and a rejected
  // save is a dropped block.
  const intervals = state.intervals.map((interval) => ({
    started_at: new Date(interval.startedAt).toISOString(),
    ended_at: new Date(interval.endedAt ?? endedAt).toISOString(),
  }));
  return {
    id: state.id,
    status: state.blockStatus,
    kind: state.type,
    label: state.label ?? null,
    tag_id: state.tagId ?? null,
    intervals,
  };
}

export async function saveBlock(state: TimerState, endedAt: number): Promise<FlushResult> {
  // Always queues first: an offline or expired-session save is deferred,
  // never dropped, and never interrupts the running timer by rejecting.
  // The result is returned (not discarded) so callers can see drops —
  // invariant 9 makes silent data loss unacceptable.
  return enqueueAndSync(stateToPayload(state, endedAt));
}
