import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  // routeTree.gen.ts and lib/api/schema.gen.ts are generated — regenerate,
  // never hand-edit or lint them.
  globalIgnores(["dist/**", "coverage/**", "**/*.gen.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    // A route file exports `Route` alongside its component, and shadcn's
    // ui files export their variants — both are fine for fast refresh.
    files: ["routes/**", "components/ui/**", "__tests__/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: ["components/timer/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/components/plan/*", "@components/plan/*", "@/lib/plan/*"],
        },
      ],
    },
  },
  {
    files: ["lib/timer/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/lib/plan/*", "@/components/plan/*"],
        },
      ],
    },
  },
  {
    files: ["components/plan/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/components/timer/*", "@components/timer/*", "@/lib/timer/*"],
        },
      ],
    },
  },
  {
    files: ["lib/plan/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/lib/timer/*", "@/components/timer/*"],
        },
      ],
    },
  },
  {
    // S-19C: the shell is shared — it may not import either feature module
    // (invariant 11), so deleting timer/ or plan/ leaves it compiling.
    files: ["components/shared/**", "components/ui/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/components/timer/*", "@/components/plan/*"],
        },
      ],
    },
  },
]);

export default eslintConfig;
