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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import Link from "next/link";
import Sidebar from "./Sidebar";
import TabBar from "./TabBar";

// SCR-01: mobile = bottom tab bar + header gear to Settings; desktop =
// persistent sidebar. The shell knows no module beyond shared/ — it
// navigates by href, so either feature module stays deletable (invariant 11).
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-5 py-3 border-b border-neutral-100">
          <Link href="/" className="text-lg font-light tracking-tight text-neutral-800">
            Tempo
          </Link>
          {/* Settings is reached from the gear, never a fourth tab */}
          <Link
            href="/settings"
            aria-label="Settings"
            className="text-neutral-400 hover:text-neutral-700 transition-colors text-lg"
          >
            ⚙
          </Link>
        </header>
        <main className="flex-1 pb-20 md:pb-6">{children}</main>
      </div>
      <TabBar />
    </div>
  );
}
