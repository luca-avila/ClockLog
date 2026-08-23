// Tempo — a timer and weekly planner
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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Header omits the word this module may never contain (invariant 13).

import Link from "next/link";

export interface PlanHeaderProps {
  /** Small-caps line above the title — what this screen is. */
  eyebrow: string;
  title: string;
  /** Quiet line under the title: counts and totals, never encouragement. */
  meta?: string;
  view: "week" | "day";
  weekHref: string;
  dayHref: string;
  prevHref: string;
  nextHref: string;
  prevLabel: string;
  nextLabel: string;
  /** Only rendered when the screen is off the current week or day. */
  currentHref?: string;
  currentLabel: string;
  newHref: string;
}

const PILL =
  "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-neutral-200 text-lg text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-800";

/**
 * The header both plan screens share (SCR-31, SCR-33): what you are looking
 * at, how much of it there is, and the four ways out — switch scale, step
 * back or forward, jump to now, add.
 */
export default function PlanHeader({
  eyebrow,
  title,
  meta,
  view,
  weekHref,
  dayHref,
  prevHref,
  nextHref,
  prevLabel,
  nextLabel,
  currentHref,
  currentLabel,
  newHref,
}: PlanHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-5 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-light tracking-tight text-neutral-800 sm:text-4xl">
          {title}
        </h1>
        {meta && <p className="mt-2 text-sm text-neutral-500">{meta}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Week / Day is the one thing the old screen never said out loud:
            the two scales were reachable only by tapping a day heading. */}
        <div className="flex rounded-full border border-neutral-200 p-0.5 text-xs">
          {(
            [
              ["Week", weekHref, view === "week"],
              ["Day", dayHref, view === "day"],
            ] as const
          ).map(([label, href, active]) => (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                active
                  ? "bg-neutral-100 font-medium text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link href={prevHref} aria-label={prevLabel} className={PILL}>
            <span aria-hidden>&lsaquo;</span>
          </Link>
          {currentHref && (
            <Link
              href={currentHref}
              className="h-9 rounded-full border border-neutral-200 px-4 text-xs font-medium leading-9 text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900"
            >
              {currentLabel}
            </Link>
          )}
          <Link href={nextHref} aria-label={nextLabel} className={PILL}>
            <span aria-hidden>&rsaquo;</span>
          </Link>
        </div>

        {/* Outlined on purpose: opening the editor commits nothing, and the
            filled treatment belongs to PrimaryButton alone. */}
        <Link
          href={newHref}
          className="h-9 rounded-full border border-neutral-300 px-4 text-xs font-medium leading-9 text-neutral-700 transition-colors hover:border-neutral-500 hover:text-neutral-900"
        >
          + New entry
        </Link>
      </div>
    </header>
  );
}
