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

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api/client";
import TagPicker from "@/components/shared/TagPicker";
import { fetchTags, type Tag } from "@/lib/api/tags";

interface LabelSheetProps {
  onSave: (label: string, tagId: string | null) => void;
  onSkip: () => void;
}

export default function LabelSheet({ onSave, onSkip }: LabelSheetProps) {
  const [label, setLabel] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagId, setTagId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<string[]>("/blocks/recent-labels")
      .then(setRecent)
      .catch(() => {});
    fetchTags()
      .then(setTags)
      .catch(() => {});
  }, []);

  function handleSave() {
    onSave(label, tagId);
  }

  function handleRecentClick(item: string) {
    onSave(item, tagId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20">
      <div className="w-full max-w-md bg-white rounded-t-2xl p-6 pb-10 shadow-xl">
        <div className="flex flex-col items-center gap-5">
          <h2 className="text-lg font-medium text-neutral-800">Block complete</h2>
          <p className="text-sm text-neutral-500">What did you work on?</p>

          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Write a label..."
            autoFocus
            className="w-full text-center text-sm text-neutral-700 placeholder:text-neutral-300 border-b border-neutral-200 pb-1 outline-none focus:border-neutral-400 transition-colors"
          />

          {recent.length > 0 && (
            <div className="w-full">
              <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">
                Recent
              </p>
              <div className="flex flex-wrap gap-2">
                {recent.map((item) => (
                  <button
                    key={item}
                    onClick={() => handleRecentClick(item)}
                    className="px-3 py-1 text-xs rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="w-full">
            <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">
              Tag
            </p>
            <TagPicker tags={tags} value={tagId} onChange={setTagId} />
          </div>

          <div className="flex gap-4 mt-2">
            <button
              onClick={handleSave}
              className="px-10 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
            >
              SAVE
            </button>
            <button
              onClick={onSkip}
              className="px-10 py-2.5 text-sm font-medium text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
