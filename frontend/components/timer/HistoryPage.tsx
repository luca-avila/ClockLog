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
import { fetchTags, type Tag } from "@/lib/api/tags";
import { localDayRange, formatClock, formatDuration, durationSeconds } from "@/lib/date/instant";
import BlockEditor from "./BlockEditor";

function formatLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const stamp = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (date.toDateString() === today.toDateString()) return `Today, ${stamp}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${stamp}`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
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
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetchTags()
      .then(setTags)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const { from, to } = localDayRange(date);
    let cancelled = false;
    Promise.all([fetchBlocks(from, to), fetchSummary(from, to)])
      .then(([b, s]) => {
        if (cancelled) return;
        setBlocks(b);
        setSummary(s);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, reload]);

  function prevDay() {
    setLoading(true);
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d);
  }

  function nextDay() {
    setLoading(true);
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d);
  }

  // Focus totals only — breaks appear in the list (SCR-20) but never in
  // the "Xh Ym focus" line.
  const focusBlocks = blocks.filter((b) => b.kind === "focus");
  const focusSeconds = focusBlocks.reduce((sum, b) => sum + durationSeconds(b.intervals), 0);
  const totalMinutes = focusSeconds / 60;

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  function afterEditorDone() {
    setSelectedId(null);
    setLoading(true);
    setReload((n) => n + 1);
  }

  return (
    <div className="max-w-md mx-auto py-8 px-4 md:max-w-3xl">
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
        <div className="md:flex md:gap-8 md:items-start">
          <div className="flex-1">
            {/* Summary header */}
            <div className="mb-4">
              <p className="text-xs text-neutral-400 mb-3">
                {Math.floor(totalMinutes / 60)}h {Math.floor(totalMinutes % 60)}m focus ·{" "}
                {focusBlocks.length} block{focusBlocks.length !== 1 ? "s" : ""}
              </p>
              {summary.map((s) => (
                <div key={s.tag_name} className="flex items-center gap-2 text-sm text-neutral-600">
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-neutral-300"
                    style={s.tag_color ? { backgroundColor: s.tag_color } : undefined}
                  />
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
                const duration = durationSeconds(b.intervals);
                const isFocus = b.kind === "focus";

                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    aria-label={`Edit block: ${isFocus ? b.label || "Unlabeled" : KIND_LABEL[b.kind]}`}
                    className={`flex items-start gap-3 w-full text-left rounded-lg px-2 -mx-2 py-1 transition-colors ${
                      selectedId === b.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                    }`}
                  >
                    <span className="text-xs text-neutral-400 w-10 pt-0.5 tabular-nums">
                      {formatClock(start)}
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
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop inspector (SCR-21 ## Desktop): edit without navigating away */}
          {selected && (
            <aside className="hidden md:block md:w-80 shrink-0 sticky top-4 border border-neutral-100 rounded-2xl">
              <BlockEditor
                key={selected.id}
                block={selected}
                tags={tags}
                onDone={afterEditorDone}
              />
            </aside>
          )}
        </div>
      )}

      {/* Mobile: the editor is a bottom sheet, same pattern as the plan's EntrySheet */}
      {selected && (
        <div className="md:hidden fixed inset-0 z-20">
          <div
            className="absolute inset-0 bg-black/30"
            aria-hidden
            onClick={afterEditorDone}
          />
          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-xl">
            <BlockEditor
              key={selected.id}
              block={selected}
              tags={tags}
              onDone={afterEditorDone}
            />
          </div>
        </div>
      )}
    </div>
  );
}
