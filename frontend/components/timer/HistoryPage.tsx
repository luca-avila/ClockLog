"use client";

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

import { useEffect, useState } from "react";
import {
  fetchBlocks,
  fetchSummary,
  type BlockData,
  type TagSummary,
} from "@/lib/api/history";

function dayRange(date: Date) {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(date);
  to.setDate(to.getDate() + 1);
  to.setHours(0, 0, 0, 0);
  return { from: from.toISOString().slice(0, -5) + "Z", to: to.toISOString().slice(0, -5) + "Z" };
}

function formatLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function blockDuration(b: BlockData) {
  return b.intervals.reduce((sum, iv) => {
    if (iv.ended_at) {
      return sum + (new Date(iv.ended_at).getTime() - new Date(iv.started_at).getTime()) / 1000;
    }
    return sum;
  }, 0);
}

const KIND_LABEL: Record<BlockData["kind"], string> = {
  focus: "",
  short_break: "short break",
  long_break: "long break",
};

export default function HistoryPage() {
  const [date, setDate] = useState(() => new Date());
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [summary, setSummary] = useState<TagSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = dayRange(date);
    Promise.all([fetchBlocks(from, to), fetchSummary(from, to)])
      .then(([b, s]) => {
        setBlocks(b);
        setSummary(s);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [date]);

  function prevDay() {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d);
  }

  function nextDay() {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d);
  }

  // Focus totals only — breaks appear in the list (SCR-20) but never in
  // the "Xh Ym focus" line.
  const focusBlocks = blocks.filter((b) => b.kind === "focus");
  const focusSeconds = focusBlocks.reduce((sum, b) => sum + blockDuration(b), 0);
  const totalMinutes = focusSeconds / 60;

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      {/* Day navigation */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={prevDay} className="text-neutral-400 hover:text-neutral-600 text-lg">
          ‹
        </button>
        <h2 className="text-sm font-medium text-neutral-700">{formatLabel(date)}</h2>
        <button onClick={nextDay} className="text-neutral-400 hover:text-neutral-600 text-lg">
          ›
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-400 text-center py-8">Loading...</div>
      ) : blocks.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">▤</div>
          <p className="text-sm text-neutral-500">No blocks yet</p>
          <p className="text-xs text-neutral-400 mt-1">
            Your finished blocks will show up here.
          </p>
        </div>
      ) : (
        <>
          {/* Summary header */}
          <div className="mb-4">
            <p className="text-xs text-neutral-400 mb-3">
              {Math.floor(totalMinutes / 60)}h {Math.floor(totalMinutes % 60)}m focus ·{" "}
              {focusBlocks.length} block{focusBlocks.length !== 1 ? "s" : ""}
            </p>
            {summary.map((s) => (
              <div key={s.tag_name} className="flex items-center gap-2 text-sm text-neutral-600">
                <span className="inline-block w-2 h-2 rounded-full bg-neutral-700" />
                <span className="flex-1">{s.tag_name}</span>
                <span className="text-neutral-400 tabular-nums">
                  {formatDuration(s.total_seconds)}
                </span>
              </div>
            ))}
          </div>

          <hr className="border-neutral-200 mb-4" />

          {/* Block list */}
          <div className="space-y-3">
            {blocks.map((b) => {
              const start = b.intervals[0]?.started_at || b.started_at;
              const duration = blockDuration(b);
              const isFocus = b.kind === "focus";

              return (
                <div key={b.id} className="flex items-start gap-3">
                  <span className="text-xs text-neutral-400 w-10 pt-0.5 tabular-nums">
                    {formatTime(start)}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      {b.status === "aborted" && (
                        <span className="text-xs text-amber-500">⚠</span>
                      )}
                      <span className="text-sm text-neutral-700">
                        {/* SCR-20: breaks render hollow */}
                        {isFocus ? "● " : "○ "}
                        {isFocus ? b.label || "Unlabeled" : KIND_LABEL[b.kind]}
                      </span>
                    </div>
                    {b.status === "aborted" && (
                      <span className="text-xs text-neutral-400">aborted · early</span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400 tabular-nums">
                    {formatDuration(duration)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
