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

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export interface BlockData {
  id: string;
  user_id: string;
  status: string;
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
  const token = getToken();
  const params = new URLSearchParams({ from, to });
  const res = await fetch(`${BASE}/blocks?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch blocks");
  return res.json();
}

export async function fetchSummary(from: string, to: string): Promise<TagSummary[]> {
  const token = getToken();
  const params = new URLSearchParams({ from, to });
  const res = await fetch(`${BASE}/blocks/summary?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch summary");
  return res.json();
}

export async function patchBlock(
  id: string,
  data: Record<string, unknown>
): Promise<BlockData> {
  const token = getToken();
  const res = await fetch(`${BASE}/blocks/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update block");
  return res.json();
}

export async function deleteBlock(id: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}/blocks/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to delete block");
}
