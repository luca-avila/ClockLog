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

import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    // Must run before react(): it generates routeTree.gen.ts from routes/
    // and splits each route's component into its own chunk.
    tanstackRouter({
      target: "react",
      routesDirectory: "./routes",
      generatedRouteTree: "./routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": resolve(import.meta.dirname, ".") },
  },
  server: {
    // 3000, not Vite's 5173: CORS_ORIGINS and APP_BASE_URL in dev already
    // name this origin, and the emailed links must land on it.
    port: 3000,
    strictPort: true,
  },
  test: {
    environment: "happy-dom",
    include: ["__tests__/**/*.test.{ts,tsx}"],
  },
});
