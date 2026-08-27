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
import NavIcon, { type NavIconName } from "./NavIcon";

const TABS: readonly { href: string; label: string; icon: NavIconName }[] = [
  { href: "/", label: "Timer", icon: "timer" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/plan", label: "Plan", icon: "plan" },
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-neutral-200">
      <div className="flex justify-around items-center h-14 max-w-lg mx-auto">
        {TABS.map((tab) => {
          // Sub-routes like /plan/day belong to Plan; / must stay exact.
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 text-[10px] uppercase tracking-widest transition-colors ${
                active
                  ? "text-neutral-900 font-medium"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
            >
              <NavIcon name={tab.icon} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
