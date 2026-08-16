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

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PlanWeekScreen from "@/components/plan/PlanWeekScreen";
import EntrySheet, { type EntrySheetMode } from "@/components/plan/EntrySheet";
import { localTodayIso } from "@/lib/date/week";

function Page() {
  const params = useSearchParams();
  const editId = params.get("edit");
  const isNew = params.get("new") === "1";
  const date = params.get("date") ?? "";
  const hour = Number(params.get("hour"));

  let sheet: EntrySheetMode | null = null;
  if (editId) {
    sheet = { kind: "edit", entryId: editId };
  } else if (isNew) {
    sheet = {
      kind: "create",
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localTodayIso(),
      hour: Number.isFinite(hour) ? hour : null,
    };
  }

  return (
    <>
      <PlanWeekScreen />
      {sheet && <EntrySheet mode={sheet} returnTo="/plan" />}
    </>
  );
}

export default function PlanRoute() {
  return (
    <Suspense>
      <Page />
    </Suspense>
  );
}
