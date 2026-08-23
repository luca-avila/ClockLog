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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { describe, it, expect } from "vitest";
import { focusName } from "@/components/timer/HistoryPage";

describe("focusName", () => {
  it("returns the label when present", () => {
    expect(focusName("Deep work", "Focus")).toBe("Deep work");
  });

  it("falls back to tag name when label is null", () => {
    expect(focusName(null, "Focus")).toBe("Focus");
  });

  // Also covers a deleted tag: the lookup misses and the name arrives undefined.
  it("returns Unlabeled when both are absent", () => {
    expect(focusName(null, undefined)).toBe("Unlabeled");
  });
});
