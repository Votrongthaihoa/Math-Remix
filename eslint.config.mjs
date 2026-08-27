import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["apps/platform/**/*.{ts,tsx}"],
    rules: {
      "@next/next/no-img-element": "off",
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "apps/*/dist/**",
    "apps/*/.vite/**",
    "apps/*/worker-configuration.d.ts",
    "packages/*/dist/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
