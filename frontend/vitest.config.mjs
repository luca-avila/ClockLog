import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./"),
      // next/font is a compiler transform, not a runtime module — see the stub.
      "next/font/google": resolve(import.meta.dirname, "./__tests__/stubs/next-font-google.ts"),
    },
  },
});
