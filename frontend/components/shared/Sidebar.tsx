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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import NavIcon from "./NavIcon";
import { destinationsIn, isActivePath, type NavDestination } from "./nav";

// Destination data and the active rule live in one shared registry
// (shared/nav.ts) — the sidebar renders the "rail" and "rail-foot" tiers.
const primary = destinationsIn("rail");
const secondary = destinationsIn("rail-foot");

export default function Sidebar() {
  const pathname = usePathname();

  function renderItem(item: NavDestination) {
    const active = isActivePath(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors ${
          // The border is on both states, transparent when idle: an active
          // item must not be 2px taller than the one above it.
          active
            ? "border-neutral-200 bg-white font-medium text-neutral-900"
            : "border-transparent text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
        }`}
      >
        <span
          className={`shrink-0 transition-colors ${
            active ? "text-neutral-700" : "text-neutral-400 group-hover:text-neutral-600"
          }`}
        >
          <NavIcon name={item.icon} />
        </span>
        {item.label}
      </Link>
    );
  }

  return (
    // Sticky and full height: history and plan pages are long, and a rail
    // that scrolls away takes the navigation with it.
    <aside className="sticky top-0 hidden md:flex h-dvh w-56 shrink-0 flex-col border-r border-neutral-200 px-3 py-5">
      {/* The dot that used to stand in for a mark is gone: the wordmark's
          own ring is the mark, and two circles in a row read as a bullet. */}
      <Link href="/" className="mb-7 block px-3 text-lg text-neutral-800">
        <Logo />
      </Link>

      <nav className="flex flex-col gap-1">{primary.map(renderItem)}</nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-neutral-200 pt-3">
        {secondary.map(renderItem)}
      </div>
    </aside>
  );
}
