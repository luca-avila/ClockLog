"use client";

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

import { useEffect, useState } from "react";
import { initQueueSync, onBlocksDropped } from "@/lib/api/queue";
import Toast from "./Toast";

/**
 * App-wide sync wiring, mounted once by the shell. The queue module itself
 * has no import-time side effects; this effect starts the initial flush,
 * reconnect retries, and the periodic retry. It also surfaces dropped
 * blocks — time spent is time spent, so losing one must be visible.
 */
export default function QueueSync() {
  const [dropped, setDropped] = useState(0);

  useEffect(() => {
    initQueueSync();
    return onBlocksDropped((count) => setDropped((n) => n + count));
  }, []);

  if (dropped === 0) return null;

  return (
    <Toast slot="app">
      <div
        role="alert"
        className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full"
      >
        {dropped} block{dropped !== 1 ? "s" : ""} could not be saved
        <button
          type="button"
          onClick={() => setDropped(0)}
          className="ml-2 text-amber-500 hover:text-amber-700"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </Toast>
  );
}
