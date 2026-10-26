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

import Link from "next/link";
import Logo from "@/components/Logo";
import TimerScreen from "@/components/timer/TimerScreen";

// SCR-11 without an account. Outside the (app) group on purpose: History,
// Plan and Settings all need one, so the guest gets no shell to navigate —
// only the timer and a way back to sign in.
export default function GuestPage() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-neutral-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="text-lg text-neutral-800">
            <Logo />
          </span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-neutral-400">Guest · nothing is saved</span>
            <Link
              href="/login"
              className="text-neutral-600 transition-colors hover:text-neutral-900"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 pb-6">
        <TimerScreen guest />
      </main>
    </div>
  );
}
