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

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WeekView from "@/components/plan/WeekView";
import EmptyWeek from "@/components/plan/EmptyWeek";
import type { EntryOccurrence } from "@/lib/api/plan";

const WEEK = { from: "2026-08-03", to: "2026-08-09" };

const ONE_ENTRY: EntryOccurrence[] = [
  {
    entry_id: "occ-1",
    name: "Gym",
    date: "2026-08-06",
    all_day: false,
    start_time: "18:30:00",
    end_time: "19:30:00",
    tag_id: null,
    tag_color: null,
    repeat_weekly: false,
  },
];

describe("EmptyWeek (SCR-33, G-5 resolved)", () => {
  it("renders for a week with no occurrences, with week navigation kept", () => {
    const markup = renderToStaticMarkup(
      <WeekView week={WEEK} occurrences={[]} />
    );
    expect(markup).toContain("Nothing planned yet");
    expect(markup).toContain("Write down your week");
    // Navigation survives the empty state.
    expect(markup).toContain("Aug 3 – 9");
    expect(markup).toContain('href="/plan?week=2026-07-27"');
    expect(markup).toContain('href="/plan?week=2026-08-10"');
  });

  it("contains no timer vocabulary at all — G-5 dropped the line, invariant 13 unscoped", () => {
    const markup = renderToStaticMarkup(<EmptyWeek from={WEEK.from} />);
    expect(markup).not.toMatch(/timer|block|focus|cycle|pomodoro/i);
    expect(markup).toContain("Nothing planned yet");

    const src = readFileSync(
      resolve(import.meta.dirname, "../../components/plan/EmptyWeek.tsx"),
      "utf8"
    );
    // Source included — headers and comments too (S-02 parity).
    expect(src).not.toMatch(/timer|block|focus|cycle|pomodoro/i);
  });

  it("copy is literal, never fabricated encouragement", () => {
    const markup = renderToStaticMarkup(<EmptyWeek from={WEEK.from} />);
    // Exact honest copy, and none of the hype shapes.
    expect(markup).toContain("Write down your week — work, classes, errands, anything.");
    expect(markup).not.toMatch(/great|amazing|journey|let's|let\u2019s|!/i);
  });

  it("offers ADD FIRST ENTRY into the editor, dated to the week's Monday", () => {
    const markup = renderToStaticMarkup(<EmptyWeek from={WEEK.from} />);
    expect(markup).toContain("ADD FIRST ENTRY");
    expect(markup).toContain('href="/plan?new=1&amp;date=2026-08-03"');
  });

  it("does not render when the week has entries", () => {
    const markup = renderToStaticMarkup(
      <WeekView week={WEEK} occurrences={ONE_ENTRY} />
    );
    expect(markup).not.toContain("Nothing planned yet");
    expect(markup).toContain("Gym");
  });

  it("no Copy last week — out of scope until it is deliberately scheduled", () => {
    const markup = renderToStaticMarkup(<EmptyWeek from={WEEK.from} />);
    expect(markup).not.toMatch(/copy last week/i);
  });
});
