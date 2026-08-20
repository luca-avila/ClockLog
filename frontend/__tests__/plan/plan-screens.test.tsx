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
import { railFor, railPosition, timelineLanes } from "@/lib/plan/layout";
import { minutesBetween } from "@/lib/date/week";
import type { EntryOccurrence, TimedOccurrence } from "@/lib/api/plan";

const WEEK = { from: "2026-07-27", to: "2026-08-02" };

let occSeq = 0;

function occ(
  name: string,
  date: string,
  start: string | null,
  end: string | null,
  extra: Partial<Omit<TimedOccurrence, "all_day" | "start_time" | "end_time">> = {}
): EntryOccurrence {
  // Opaque ids: hrefs embed entry_id, so names must stay out of it.
  // A timed entry always has both times — the discriminated union in the
  // type mirrors the server's invariant.
  const base = {
    entry_id: `occ-${++occSeq}`,
    name,
    date,
    tag_id: null,
    tag_color: null,
    repeat_weekly: false,
    ...extra,
  };
  if (start === null || end === null) {
    return { ...base, all_day: true };
  }
  return { ...base, all_day: false, start_time: start, end_time: end };
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

  it("paints the tag dot from tag_color — the UI's only saturated color", () => {
    const markup = renderToStaticMarkup(
      <WeekView
        week={WEEK}
        occurrences={[
          occ("Gym", "2026-07-28", "18:30", "19:30", {
            tag_id: "t1",
            tag_color: "#22c55e",
          }),
          occ("Run", "2026-07-29", "07:00", "07:30"),
        ]}
      />
    );
    expect(markup).toContain("#22c55e");
    // Untagged entries keep a neutral dot, not a fabricated color.
    expect(markup).toContain("bg-neutral-300");
  });

  it("renders the summary line from the data", () => {    const markup = renderToStaticMarkup(
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
    // One entry anywhere: the day list renders, not the empty state.
    const markup = renderToStaticMarkup(
      <WeekView
        week={WEEK}
        occurrences={[occ("Gym", "2026-07-28", "18:30", "19:30")]}
      />
    );
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

  it("a midnight-spanning entry renders at the correct height — same computation as the rail", () => {
    const entries = [occ("Party", DAY, "23:00", "01:00")];
    const markup = renderToStaticMarkup(
      <DayView date={DAY} occurrences={entries} />
    );
    const rail = railFor(entries as EntryOccurrence[]);
    const expected = railPosition(1380, 1500, rail)!;
    // Extract the heightPct from the positioned entry's inline style.
    const heightMatch = markup.match(/height:\s*([\d.]+)%/);
    expect(heightMatch).not.toBeNull();
    expect(parseFloat(heightMatch![1])).toBeCloseTo(expected.heightPct);
  });
});

describe("timelineLanes", () => {
  it("non-overlapping entries share lane 0", () => {
    const laid = timelineLanes([
      occ("A", "2026-07-28", "09:00", "10:00"),
      occ("B", "2026-07-28", "11:00", "12:00"),
    ] as TimedOccurrence[]);
    expect(laid.map((l) => l.lane)).toEqual([0, 0]);
    expect(laid.map((l) => l.lanes)).toEqual([1, 1]);
  });

  it("overlapping entries take separate lanes", () => {
    const laid = timelineLanes([
      occ("Office", "2026-07-28", "09:00", "17:00"),
      occ("Call", "2026-07-28", "15:00", "16:00"),
    ] as TimedOccurrence[]);
    expect(laid[0].lanes).toBe(2);
    expect(new Set(laid.map((l) => l.lane))).toEqual(new Set([0, 1]));
  });

  it("carries startMin and endMin matching the canonical helpers", () => {
    const laid = timelineLanes([
      occ("A", "2026-07-28", "09:00", "10:00"),
    ] as TimedOccurrence[]);
    expect(laid[0].startMin).toBe(540);
    expect(laid[0].endMin).toBe(600);
    expect(laid[0].endMin).toBe(laid[0].startMin + minutesBetween("09:00", "10:00"));
  });

  it("a midnight-spanning entry yields endMin past 24h, not wrapped to early morning", () => {
    const laid = timelineLanes([
      occ("Party", "2026-07-28", "23:00", "01:00"),
    ] as TimedOccurrence[]);
    expect(laid[0].startMin).toBe(1380);
    expect(laid[0].endMin).toBe(1500);
    expect(laid[0].endMin).toBe(laid[0].startMin + minutesBetween("23:00", "01:00"));
  });
});

describe("rail geometry (railFor / railPosition)", () => {
  const DEFAULT = { startMin: 7 * 60, minutes: 15 * 60 };

  it("default rail when nothing exceeds 07:00–22:00", () => {
    expect(railFor([occ("Gym", "2026-07-28", "18:30", "19:30")])).toEqual(DEFAULT);
    expect(railFor([])).toEqual(DEFAULT);
  });

  it("a 06:00 entry extends the rail earlier — it is never clamped to 07:00", () => {
    const rail = railFor([occ("Swim", "2026-07-28", "06:00", "07:00")]);
    expect(rail).toEqual({ startMin: 6 * 60, minutes: 16 * 60 });
    const pos = railPosition(6 * 60, 7 * 60, rail)!;
    expect(pos.topPct).toBe(0); // the real time sits at the rail's top edge
    expect(pos.heightPct).toBeCloseTo((60 / (16 * 60)) * 100);
  });

  it("a 23:00 entry extends the rail later — no negative height", () => {
    const rail = railFor([occ("Late", "2026-07-28", "23:00", "23:30")]);
    expect(rail.startMin + rail.minutes).toBe(23 * 60 + 30);
    const pos = railPosition(23 * 60, 23 * 60 + 30, rail)!;
    expect(pos.topPct).toBeGreaterThan(0);
    expect(pos.heightPct).toBeGreaterThan(0);
  });

  it("a midnight-spanning entry pushes the end past 24:00", () => {
    // 23:00 – 01:00 = 120 minutes, ending at minute-of-day 1500.
    const rail = railFor([occ("Party", "2026-07-28", "23:00", "01:00")]);
    expect(rail.startMin + rail.minutes).toBe(25 * 60);
    const pos = railPosition(23 * 60, 25 * 60, rail)!;
    expect(pos.topPct).toBeCloseTo(((23 * 60 - 7 * 60) / (25 * 60 - 7 * 60)) * 100);
    expect(pos.heightPct).toBeCloseTo((120 / (25 * 60 - 7 * 60)) * 100);
  });

  it("degenerate intervals return null instead of a geometry lie", () => {
    expect(railPosition(600, 600, DEFAULT)).toBeNull();
    expect(railPosition(700, 600, DEFAULT)).toBeNull();
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
