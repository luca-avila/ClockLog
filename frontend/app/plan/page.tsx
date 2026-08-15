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

// Placeholder route so Plan is reachable from the tab bar (S-19C).
// S-20 replaces this with the week view; S-22 owns the empty state's copy.

export default function PlanRoute() {
  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <h1 className="text-sm uppercase tracking-widest text-neutral-400">Plan</h1>
    </div>
  );
}
