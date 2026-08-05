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
import { apiFetch, getToken } from "./client";

interface BlockPayload {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: "completed" | "aborted";
  label: string | null;
  tag_id: string | null;
}

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
    label: state.label ?? null,
    tag_id: state.tagId ?? null,
  };
}

export async function saveBlock(state: TimerState): Promise<void> {
  if (!getToken()) return;
  await apiFetch("/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stateToPayload(state)),
  });
}
