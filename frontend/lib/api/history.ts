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

import { apiFetch } from "./client";

export interface BlockData {
  id: string;
  user_id: string;
  status: "completed" | "aborted";
  label: string | null;
  tag_id: string | null;
  started_at: string;
  intervals: { id: string; started_at: string; ended_at: string | null }[];
}

export interface TagSummary {
  tag_id: string | null;
  tag_name: string;
  total_seconds: number;
  block_count: number;
}

export async function fetchBlocks(from: string, to: string): Promise<BlockData[]> {
  return apiFetch(`/blocks?${new URLSearchParams({ from, to })}`);
}

export async function fetchSummary(from: string, to: string): Promise<TagSummary[]> {
  return apiFetch(`/blocks/summary?${new URLSearchParams({ from, to })}`);
}

export async function updateBlock(
  id: string,
  data: Record<string, unknown>
): Promise<BlockData> {
  return apiFetch(`/blocks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteBlock(id: string): Promise<void> {
  return apiFetch(`/blocks/${id}`, { method: "DELETE" });
}
