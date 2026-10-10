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

import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSettings, type Settings, type SettingsUpdate } from "@/lib/api/settings";
import { settingsKeys } from "@/lib/queries/settings";
import { signOut } from "@/lib/api/session";
import { useSettings } from "@/lib/useSettings";
import TagManager from "@/components/shared/TagManager";
import Toast from "@/components/shared/Toast";

const DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 50, 60];

/** SCR-40. */
export default function SettingsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { settings, loading } = useSettings();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimistic: the cached settings change first, so the timer sees the new
  // value too; a failed save puts the previous value back.
  const mutation = useMutation({
    mutationFn: updateSettings,
    onMutate: (partial: SettingsUpdate) => {
      const previous = queryClient.getQueryData<Settings>(settingsKeys.all);
      queryClient.setQueryData<Settings>(settingsKeys.all, { ...settings, ...stripNulls(partial) });
      setError(null);
      return { previous };
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(settingsKeys.all, fresh);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
    onError: (_err, _partial, context) => {
      // The server does not have this value — show the truth again.
      queryClient.setQueryData(settingsKeys.all, context?.previous);
      setError("Could not save — try again");
    },
  });

  function save(partial: Partial<Settings>) {
    mutation.mutate(partial);
  }

  // #tags does not exist while settings load, so the browser's own anchor
  // scroll finds nothing and the sidebar's Tags link looks dead. Run it again
  // once the sections are real.
  useEffect(() => {
    if (loading) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView();
  }, [loading]);

  return (
    // Same frame and header as Timer and History, so moving between them
    // never shifts the page under the eye.
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-10">
      <header className="mb-8">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
          Preferences
        </p>
        <h1 className="text-3xl font-light tracking-tight text-neutral-800 sm:text-4xl">
          Settings
        </h1>
        <p className="mt-2 text-sm text-neutral-500">Changes save as you make them.</p>
      </header>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start" aria-label="Loading settings">
          <div className="h-80 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-56 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="space-y-6">
            <Section title="Timer">
              <SelectRow
                label="Focus"
                options={DURATION_OPTIONS}
                value={settings.focusDuration}
                onChange={(focusDuration) => save({ focusDuration })}
                unit="min"
              />
              <SelectRow
                label="Short break"
                options={DURATION_OPTIONS}
                value={settings.shortBreakDuration}
                onChange={(shortBreakDuration) => save({ shortBreakDuration })}
                unit="min"
              />
              <SelectRow
                label="Long break"
                options={DURATION_OPTIONS}
                value={settings.longBreakDuration}
                onChange={(longBreakDuration) => save({ longBreakDuration })}
                unit="min"
              />
              <SelectRow
                label="Blocks per cycle"
                options={[2, 3, 4, 5, 6]}
                value={settings.blocksPerCycle}
                onChange={(blocksPerCycle) => save({ blocksPerCycle })}
              />
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
            </Section>

            <Section title="Alerts">
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
            </Section>
          </div>

          <div className="space-y-6">
            <Section
              id="tags"
              title="Tags"
              description="Deleting a tag keeps everything it was on — those items just become untagged."
            >
              <TagManager />
            </Section>

            <Section title="Account">
              <div className="flex min-h-14 items-center justify-between gap-4 py-3">
                <span className="text-sm text-neutral-700">Sign out of this browser</span>
                <button
                  onClick={() => {
                    // The fence lives in signOut — the confirm and the sweep are one
                    // place, not a second copy. Navigation stays client-side.
                    if (signOut()) void navigate({ to: "/login" });
                  }}
                  className="h-9 rounded-full border border-neutral-200 px-4 text-xs font-medium text-red-500 transition-colors hover:border-red-300 hover:text-red-600"
                >
                  Sign out
                </button>
              </div>
            </Section>
          </div>
        </div>
      )}

      {(error || saved) && (
        <Toast slot="page">
          {/* Neutral like the Timer's notice: tag colors are the only
              saturated ink, and red stays reserved for the error text. */}
          <div
            role={error ? "alert" : "status"}
            className={`rounded-full bg-neutral-100 px-3 py-1.5 text-xs ${
              error ? "text-red-500" : "text-neutral-500"
            }`}
          >
            {error ?? "Saved"}
          </div>
        </Toast>
      )}
    </div>
  );
}

/** A settings card: the same white, bordered surface as the Timer's cycle panel. */
function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    // scroll-mt clears the mobile header when the sidebar's Tags link jumps here.
    <section id={id} className="scroll-mt-6 rounded-2xl border border-neutral-200 bg-white px-5 pt-5 pb-2">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">{title}</h2>
      {description && <p className="mt-1.5 text-sm text-neutral-500">{description}</p>}
      <div className="mt-2 divide-y divide-neutral-100">{children}</div>
    </section>
  );
}

function SelectRow({
  label,
  options,
  value,
  onChange,
  unit,
}: {
  label: string;
  options: number[];
  value: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-4 py-3">
      <span className="text-sm text-neutral-700">{label}</span>
      {/* appearance-none drops the OS chrome that ignored the palette; the
          chevron is drawn back on top, out of the pointer's way. */}
      <span className="relative">
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-9 cursor-pointer appearance-none rounded-full border border-neutral-200 bg-white pl-4 pr-9 text-sm tabular-nums text-neutral-700 transition-colors hover:border-neutral-400 focus-visible:border-neutral-500 focus-visible:outline-none"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {unit ? `${o} ${unit}` : o}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 16 16"
          className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
        </svg>
      </span>
    </label>
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
    <div className="flex min-h-14 items-center justify-between gap-4 py-3">
      <span className="text-sm text-neutral-700">{label}</span>
      {/* role="switch" + aria-checked: without them a screen reader heard an
          unnamed button with no state. */}
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 ${
          value ? "bg-neutral-800" : "bg-neutral-200"
        }`}
      >
        <span
          className={`absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

/** SettingsUpdate allows null ("leave unchanged"); the cache holds no nulls. */
function stripNulls(partial: SettingsUpdate): Partial<Settings> {
  return Object.fromEntries(
    Object.entries(partial).filter(([, v]) => v !== null && v !== undefined)
  ) as Partial<Settings>;
}
