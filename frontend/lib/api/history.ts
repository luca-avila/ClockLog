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

import { api, unwrap, type Schemas } from "./client";

export type BlockData = Schemas["BlockResponse"];

/** Mirrors backend TagSummary. */
export type TagSummary = Schemas["TagSummary"];

/** PATCH /blocks/:id — mirrors backend BlockUpdate. An omitted key is
 *  untouched; an explicit null clears label/tag_id only. started_at and
 *  ended_at have no null: a stored block always has a start and a closed
 *  end (invariants 3 and 7). Narrower than the generated schema on purpose:
 *  the server's "cannot be cleared" guard is a validator OpenAPI can't see. */
export interface BlockPatch {
  label?: string | null;
  tag_id?: string | null;
  status?: BlockData["status"];
  started_at?: string;
  ended_at?: string;
}

export async function fetchBlocks(from: string, to: string): Promise<BlockData[]> {
  return unwrap(api.GET("/blocks", { params: { query: { from, to } } }));
}

export async function fetchSummary(from: string, to: string): Promise<TagSummary[]> {
  return unwrap(api.GET("/blocks/summary", { params: { query: { from, to } } }));
}

export async function fetchRecentLabels(): Promise<string[]> {
  return unwrap(api.GET("/blocks/recent-labels"));
}

export async function updateBlock(id: string, data: BlockPatch): Promise<BlockData> {
  return unwrap(
    api.PATCH("/blocks/{block_id}", { params: { path: { block_id: id } }, body: data })
  );
}

export async function deleteBlock(id: string): Promise<void> {
  return unwrap(api.DELETE("/blocks/{block_id}", { params: { path: { block_id: id } } }));
}
