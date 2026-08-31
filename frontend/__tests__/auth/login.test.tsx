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
// GNU General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import LoginPage from "@/app/login/page";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const adoptSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/session", () => ({ adoptSession }));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<LoginPage />));
  return { container, root };
}

const valueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)!.set!;

function setVal(input: HTMLInputElement, value: string) {
  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fillForm(container: HTMLElement) {
  const email = container.querySelector<HTMLInputElement>('input[type="email"]')!;
  const password = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  setVal(email, "user@example.com");
  setVal(password, "secret12");
}

async function submit(container: HTMLElement) {
  await act(async () => {
    (container.querySelector('button[type="submit"]') as HTMLElement).click();
  });
}

function unverifiedFetch() {
  return {
    ok: false,
    status: 403,
    json: async () => ({ code: "EMAIL_NOT_VERIFIED" }),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  adoptSession.mockReset();
  push.mockReset();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("login — SIGN IN always available (SCR-02)", () => {
  it("keeps SIGN IN available after EMAIL_NOT_VERIFIED, with resend as a secondary action", async () => {
    fetchMock.mockResolvedValue(unverifiedFetch());
    const { container } = setup();
    fillForm(container);
    await submit(container);

    const signIn = container.querySelector('button[type="submit"]')!;
    expect(signIn).toBeTruthy();
    expect(signIn.textContent).toContain("SIGN IN");

    const resend = [...container.querySelectorAll("button")].find((b) =>
      /resend/i.test(b.textContent ?? "")
    );
    expect(resend).toBeTruthy();
    expect(resend!.getAttribute("type")).toBe("button");
  });

  it("retries login successfully after verifying in another tab — no reload", async () => {
    fetchMock.mockResolvedValueOnce(unverifiedFetch()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "tok" }),
    });
    adoptSession.mockResolvedValueOnce(true);
    const { container } = setup();
    fillForm(container);
    await submit(container);
    await submit(container);

    expect(push).toHaveBeenCalledWith("/");
    const loginCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/auth/login"));
    expect(loginCalls).toHaveLength(2);
  });

  it("resend fires /auth/resend-verification and keeps SIGN IN", async () => {
    fetchMock
      .mockResolvedValueOnce(unverifiedFetch())
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) });
    const { container } = setup();
    fillForm(container);
    await submit(container);

    await act(async () => {
      const resend = [...container.querySelectorAll("button")].find((b) =>
        /resend/i.test(b.textContent ?? "")
      )!;
      resend.click();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/resend-verification"),
      expect.anything()
    );
    expect(container.textContent).toContain("Link sent — check your inbox");
    expect(container.querySelector('button[type="submit"]')!.textContent).toContain("SIGN IN");
  });
});
