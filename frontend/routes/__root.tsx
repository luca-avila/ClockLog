// ClockLog — a Pomodoro timer and weekly planner
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

import type { QueryClient } from "@tanstack/react-query";
import { Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-xs flex-col justify-center px-4 text-center">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
        404
      </p>
      <h1 className="mb-6 text-xl text-neutral-800">Nothing here</h1>
      <Link to="/" className="text-xs text-neutral-400 transition-colors hover:text-neutral-600">
        Back to the app
      </Link>
    </div>
  );
}
