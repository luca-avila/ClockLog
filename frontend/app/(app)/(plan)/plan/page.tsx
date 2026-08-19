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
import PlanWeekScreen from "@/components/plan/PlanWeekScreen";
import EntrySheet from "@/components/plan/EntrySheet";
import { usePlanView } from "@/lib/plan/hooks";

function Page() {
  const view = usePlanView();

  return (
    <>
      <PlanWeekScreen week={view.week} tick={view.tick} today={view.today} />
      {view.sheet && <EntrySheet mode={view.sheet} returnTo="/plan" />}
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
