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

import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import AppShell from "@/components/shared/AppShell";
import { isSignedIn } from "@/lib/api/client";

// The shell group: every signed-in screen. The auth screens live outside it
// and render bare — no tab bar, no sidebar. Pathless (the leading _), so it
// adds a layout and a guard but no URL segment.
export const Route = createFileRoute("/_app")({
  // No token at all: straight to sign-in, before any screen fires a request
  // that would 401 its way there anyway. An expired token still reaches the
  // client's 401 policy (lib/api/client.ts), which owns that case.
  beforeLoad: () => {
    if (!isSignedIn()) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
