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

import { createFileRoute } from "@tanstack/react-router";
import LoginScreen from "@/components/auth/LoginScreen";

interface LoginSearch {
  /** Set by the reset screen: every session was just revoked. */
  reset?: 1;
}

export const Route = createFileRoute("/login")({
  validateSearch: (raw: Record<string, unknown>): LoginSearch =>
    raw.reset === 1 || raw.reset === "1" ? { reset: 1 } : {},
  component: LoginRoute,
});

function LoginRoute() {
  const { reset } = Route.useSearch();
  return <LoginScreen reset={reset === 1} />;
}
