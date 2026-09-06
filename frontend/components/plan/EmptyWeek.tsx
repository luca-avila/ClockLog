// ClockLog — a weekly planner screen
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
import { newEntryUrl } from "@/lib/plan/urls";

// Honest and literal (SCR-33, G-5): no fabricated encouragement, no
// vocabulary from the other module.
export default function EmptyWeek({ from }: { from: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 px-6 py-20 text-center">
      <span className="text-3xl text-neutral-300" aria-hidden>
        ▦
      </span>
      <h2 className="text-sm font-medium text-neutral-600">
        Nothing planned yet
      </h2>
      <p className="max-w-xs text-sm text-neutral-400">
        Write down your week — work, classes, errands, anything.
      </p>
      <Link
        href={newEntryUrl(from)}
        className="mt-3 rounded-full border border-neutral-300 px-6 py-2.5 text-xs font-medium tracking-wide text-neutral-700 transition-colors hover:border-neutral-500 hover:text-neutral-900"
      >
        + ADD FIRST ENTRY
      </Link>
    </div>
  );
}
