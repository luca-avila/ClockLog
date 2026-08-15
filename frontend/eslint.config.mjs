import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["components/timer/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/components/plan/*", "@components/plan/*"],
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
          patterns: ["@/components/timer/*", "@components/timer/*"],
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
    files: ["components/shared/**"],
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
