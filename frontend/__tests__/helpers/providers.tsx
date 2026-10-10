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

import { act, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRouter,
  type AnyRouter,
} from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";

/** A QueryClient per test: no retries (a rejected mock fails at once) and no
 *  cache shared between tests. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** The app's real route tree on an in-memory history at `path`, so a Link
 *  renders the same href it would in the browser. */
export function createTestRouter(path = "/", queryClient?: QueryClient): AnyRouter {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: queryClient ?? createTestQueryClient() },
  });
}

export interface Harness {
  router: AnyRouter;
  queryClient: QueryClient;
}

/** The two providers a screen needs, without mounting a route: the component
 *  under test is rendered as-is, with router context for Link/useNavigate/
 *  useLocation and a QueryClient for its queries. */
export function withProviders(
  ui: ReactNode,
  { path = "/", router, queryClient }: Partial<Harness> & { path?: string } = {}
): Harness & { element: ReactNode } {
  const qc = queryClient ?? createTestQueryClient();
  const r = router ?? createTestRouter(path, qc);
  return {
    router: r,
    queryClient: qc,
    element: (
      <QueryClientProvider client={qc}>
        <RouterContextProvider router={r}>{ui}</RouterContextProvider>
      </QueryClientProvider>
    ),
  };
}

/** renderToStaticMarkup with the providers in place. */
export function staticMarkup(ui: ReactNode, path = "/"): string {
  return renderToStaticMarkup(withProviders(ui, { path }).element);
}

/** Lets pending queries settle and their results render. TanStack Query
 *  notifies on a macrotask, so an empty `act(async () => {})` is not enough. */
export async function flushQueries(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}
