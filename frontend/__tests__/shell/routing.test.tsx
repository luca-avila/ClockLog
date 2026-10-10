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

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import LoginScreen from "@/components/auth/LoginScreen";
import { createTestRouter, withProviders } from "@/__tests__/helpers/providers";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  localStorage.clear();
});

describe("the signed-in guard (routes/_app.tsx)", () => {
  it("sends a browser with no token to /login before any screen loads", async () => {
    const router = createTestRouter("/history");
    await router.load();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("lets a browser with a token through", async () => {
    localStorage.setItem("token", "t");
    const router = createTestRouter("/history");
    await router.load();
    expect(router.state.location.pathname).toBe("/history");
  });

  it("leaves the auth screens public", async () => {
    const router = createTestRouter("/register");
    await router.load();
    expect(router.state.location.pathname).toBe("/register");
  });
});

describe("search params are validated at the route", () => {
  it("reads ?reset=1 on /login", async () => {
    const router = createTestRouter("/login?reset=1");
    await router.load();
    expect(router.state.location.search).toEqual({ reset: 1 });
  });

  it("keeps a token that looks like a number as the string it was", async () => {
    const router = createTestRouter("/verify-email?token=12345");
    await router.load();
    const match = router.state.matches.find((m) => m.routeId === "/verify-email");
    expect(match?.search).toEqual({ token: "12345" });
  });
});

describe("login after a password reset (SCR-02)", () => {
  it("shows the reset notice and drops the flag from the URL", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const { element, router } = withProviders(<LoginScreen reset />, { path: "/login?reset=1" });
    const navigate = vi.spyOn(router, "navigate").mockResolvedValue(undefined);
    act(() => createRoot(container).render(element));

    expect(container.textContent).toContain("Your password was reset");
    expect(navigate).toHaveBeenCalledWith({ to: "/login", search: {}, replace: true });
  });
});
