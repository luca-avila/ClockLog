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

import type { TimerState } from "@/lib/timer/engine";
import { enqueueAndSync, type BlockPayload } from "./queue";

function stateToPayload(state: TimerState): BlockPayload {
  const lastInterval = state.intervals[state.intervals.length - 1];
  const endedAt =
    lastInterval?.endedAt !== undefined
      ? new Date(lastInterval.endedAt).toISOString()
      : new Date().toISOString();

  return {
    id: state.id,
    started_at: new Date(state.startedAt).toISOString(),
    ended_at: endedAt,
    status: state.blockStatus,
    kind: state.type,
    label: state.label ?? null,
    tag_id: state.tagId ?? null,
  };
}

export async function saveBlock(state: TimerState): Promise<void> {
  // Always queues first: an offline or expired-session save is deferred,
  // never dropped, and never interrupts the running timer by rejecting.
  await enqueueAndSync(stateToPayload(state));
}
