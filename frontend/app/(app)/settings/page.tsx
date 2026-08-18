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

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type TimerSettings } from "@/lib/timer/engine";
import { updateSettings } from "@/lib/api/settings";
import { useSettings } from "@/lib/useSettings";
import TagManager from "@/components/shared/TagManager";

const DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 50, 60];

export default function SettingsPage() {
  const router = useRouter();
  const { settings, setSettings, loading } = useSettings();
  const [saved, setSaved] = useState(false);

  async function save(partial: Partial<TimerSettings>) {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    try {
      await updateSettings(partial);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // revert?
    }
  }

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading...</div>;

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <h1 className="text-lg font-medium text-neutral-800 mb-8">Settings</h1>

      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-neutral-400 mb-4">Timer</h2>
        <div className="space-y-4">
          <SettingRow label="Focus">
            <select
              value={settings.focusDuration}
              onChange={(e) => save({ focusDuration: Number(e.target.value) })}
              className="text-sm text-neutral-600 border rounded px-2 py-1"
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label="Short break">
            <select
              value={settings.shortBreakDuration}
              onChange={(e) => save({ shortBreakDuration: Number(e.target.value) })}
              className="text-sm text-neutral-600 border rounded px-2 py-1"
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label="Long break">
            <select
              value={settings.longBreakDuration}
              onChange={(e) => save({ longBreakDuration: Number(e.target.value) })}
              className="text-sm text-neutral-600 border rounded px-2 py-1"
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label="Blocks per cycle">
            <select
              value={settings.blocksPerCycle}
              onChange={(e) => save({ blocksPerCycle: Number(e.target.value) })}
              className="text-sm text-neutral-600 border rounded px-2 py-1"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </SettingRow>
          <ToggleRow
            label="Auto-start breaks"
            value={settings.autoStartBreaks}
            onChange={(v) => save({ autoStartBreaks: v })}
          />
          <ToggleRow
            label="Auto-start next focus"
            value={settings.autoStartNext}
            onChange={(v) => save({ autoStartNext: v })}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-neutral-400 mb-4">Alerts</h2>
        <ToggleRow
          label="Sound"
          value={settings.sound}
          onChange={(v) => save({ sound: v })}
        />
        <ToggleRow
          label="Notifications"
          value={settings.notifications}
          onChange={(v) => save({ notifications: v })}
        />
      </section>

      <section className="mb-8" id="tags">
        <h2 className="text-xs uppercase tracking-widest text-neutral-400 mb-4">Data: Tags</h2>
        <TagManager />
      </section>

      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-neutral-400 mb-4">Account</h2>
        <button
          onClick={() => {
            localStorage.removeItem("token");
            router.push("/login");
          }}
          className="text-sm text-red-500 hover:text-red-600 transition-colors"
        >
          Sign out
        </button>
      </section>

      {saved && (
        <div className="fixed bottom-4 right-4 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
          Saved
        </div>
      )}
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-neutral-600">{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-neutral-600">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-10 h-6 rounded-full transition-colors ${
          value ? "bg-neutral-800" : "bg-neutral-200"
        }`}
      >
        <div
          className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
            value ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
