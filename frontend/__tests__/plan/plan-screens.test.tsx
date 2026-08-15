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
import DayView from "@/components/plan/DayView";
import { timelineLanes } from "@/lib/plan/layout";
import type { EntryOccurrence } from "@/lib/api/plan";

const WEEK = { from: "2026-07-27", to: "2026-08-02" };

function occ(
  name: string,
  date: string,
  start: string | null,
  end: string | null,
  extra: Partial<EntryOccurrence> = {}
): EntryOccurrence {
  return {
    entry_id: `id-${name}-${date}`,
    name,
    date,
    all_day: start === null,
    start_time: start,
    end_time: end,
    tag_id: null,
    repeat_weekly: false,
    ...extra,
  };
}

describe("WeekView (SCR-30)", () => {
  it("renders exactly the occurrences it is given — never expands repeats itself", () => {
    // One stored occurrence in this week: one row. Expansion is the
    // server's job (S-19B); the view is a mirror of the data.
    const markup = renderToStaticMarkup(
      <WeekView week={WEEK} occurrences={[occ("Gym", "2026-07-28", "18:30", "19:30")]} />
    );
    expect(markup).toContain("Gym");
    expect(markup.match(/Gym/g)).toHaveLength(1);

    // A weekly-flagged occurrence must NOT be fabricated onto other days:
    // the view renders the row it was handed, once, and nothing derived.
    const flagged = renderToStaticMarkup(
      <WeekView
        week={WEEK}
        occurrences={[
          occ("Gym", "2026-07-28", "18:30", "19:30", { repeat_weekly: true }),
        ]}
      />
    );
    expect(flagged.match(/Gym/g)).toHaveLength(1);
  });

  it("renders the summary line from the data", () => {
    const markup = renderToStaticMarkup(
      <WeekView
        week={WEEK}
        occurrences={[
          occ("Office", "2026-07-27", "09:00", "17:00"),
          occ("Gym", "2026-07-28", "18:30", "19:30"),
          occ("Trip", "2026-07-29", null, null),
        ]}
      />
    );
    // 8h + 1h timed; the all-day entry counts as an entry, not as hours.
    expect(markup).toContain("3 entries");
    expect(markup).toContain("9h");
  });

  it("renders all-day entries in the day header band, not at a time slot", () => {
    const markup = renderToStaticMarkup(
      <WeekView
        week={WEEK}
        occurrences={[occ("Trip to Porto", "2026-07-29", null, null)]}
      />
    );
    expect(markup).toContain("all day");
    expect(markup).toContain("Trip to Porto");
    // The all-day band precedes timed rows; it must not carry a time range.
    const band = markup.split("Trip to Porto")[0];
    expect(band).toContain("all day");
    expect(band).not.toMatch(/\d{2}:\d{2}/);
  });

  it("renders every day of the week, empty ones included", () => {
    const markup = renderToStaticMarkup(<WeekView week={WEEK} occurrences={[]} />);
    for (const d of [
      "2026-07-27",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]) {
      expect(markup).toContain(d);
    }
  });
});

describe("DayView (SCR-31)", () => {
  const DAY = "2026-07-28";

  it("renders overlapping entries side by side — both present", () => {
    const markup = renderToStaticMarkup(
      <DayView
        date={DAY}
        occurrences={[
          occ("Office", DAY, "09:00", "17:00"),
          occ("Call", DAY, "15:00", "16:00"),
        ]}
      />
    );
    expect(markup).toContain("Office");
    expect(markup).toContain("Call");
  });

  it("renders an hour rail and positions timed entries by their times", () => {
    const markup = renderToStaticMarkup(
      <DayView date={DAY} occurrences={[occ("Gym", DAY, "18:30", "19:30")]} />
    );
    expect(markup).toContain("18:30");
    expect(markup).toContain("19:30");
    expect(markup).toContain("08");
  });

  it("offers tap-to-create at an hour in empty space", () => {
    const markup = renderToStaticMarkup(
      <DayView date={DAY} occurrences={[]} />
    );
    // Hour cells link into the (S-21) editor with the hour prefilled.
    expect(markup).toMatch(/new=1[^"]*hour=14|hour=14[^"]*new=1/);
  });
});

describe("timelineLanes", () => {
  it("non-overlapping entries share lane 0", () => {
    const laid = timelineLanes([
      occ("A", "2026-07-28", "09:00", "10:00"),
      occ("B", "2026-07-28", "11:00", "12:00"),
    ]);
    expect(laid.map((l) => l.lane)).toEqual([0, 0]);
    expect(laid.map((l) => l.lanes)).toEqual([1, 1]);
  });

  it("overlapping entries take separate lanes", () => {
    const laid = timelineLanes([
      occ("Office", "2026-07-28", "09:00", "17:00"),
      occ("Call", "2026-07-28", "15:00", "16:00"),
    ]);
    expect(laid[0].lanes).toBe(2);
    expect(new Set(laid.map((l) => l.lane))).toEqual(new Set([0, 1]));
  });
});

describe("plan screens carry no timer vocabulary (invariants 11, 13)", () => {
  const dir = resolve(import.meta.dirname, "../../components/plan");
  const files = ["WeekView.tsx", "DayView.tsx"];

  it("no ⏱ marker and no cycle indicator anywhere", () => {
    const week = renderToStaticMarkup(
      <WeekView week={WEEK} occurrences={[occ("Gym", "2026-07-28", "18:30", "19:30")]} />
    );
    const day = renderToStaticMarkup(
      <DayView date="2026-07-28" occurrences={[]} />
    );
    for (const markup of [week, day]) {
      expect(markup).not.toContain("⏱");
      expect(markup).not.toContain("● ●"); // cycle indicator shape
    }
  });

  it("components import nothing from components/timer", () => {
    for (const f of files) {
      const src = readFileSync(resolve(dir, f), "utf8");
      expect(src, f).not.toMatch(/@\/components\/timer/);
    }
  });

  it("views stay shallow: no repeat-expansion logic inside components", () => {
    // No flag-driven branching at all: the views never see repeat_weekly.
    // (±7-day prev/next navigation is legitimate; expansion is not.)
    for (const f of files) {
      const src = readFileSync(resolve(dir, f), "utf8");
      expect(src, f).not.toContain("repeat_weekly");
    }
  });
});
