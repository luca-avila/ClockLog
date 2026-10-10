// ClockLog — a timer and weekly planner
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

// Header omits the word this module may never contain (invariant 13).

import { createFileRoute } from "@tanstack/react-router";
import PlanWeekScreen from "@/components/plan/PlanWeekScreen";
import EntrySheet from "@/components/plan/EntrySheet";
import { localTodayIso } from "@/lib/date/week";
import { parsePlanSearch, readPlanView } from "@/lib/plan/view";
import { weekLink } from "@/lib/plan/urls";

// SCR-31, SCR-33
export const Route = createFileRoute("/_app/plan/")({
  validateSearch: parsePlanSearch,
  component: PlanRoute,
});

function PlanRoute() {
  const view = readPlanView(Route.useSearch(), localTodayIso());
  return (
    <>
      <PlanWeekScreen week={view.week} today={view.today} />
      {view.sheet && <EntrySheet mode={view.sheet} returnTo={weekLink(view.week.from)} />}
    </>
  );
}
