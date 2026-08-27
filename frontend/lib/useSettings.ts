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

"use client";

import { useEffect, useState } from "react";
import { type TimerSettings, defaultSettings } from "@/lib/timer/engine";
import { fetchSettings } from "@/lib/api/settings";

/**
 * Settings shared by the timer and the settings page. Starts from
 * defaults so the idle screen renders immediately; the server value
 * replaces them when it arrives. Offline or signed out: defaults.
 */
export function useSettings() {
  const [settings, setSettings] = useState<TimerSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {
        /* offline — defaults keep the timer usable */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, setSettings, loading };
}
