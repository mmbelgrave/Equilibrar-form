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
    ".next-export/**",
    "build/**",
    "next-env.d.ts",
    // The preview-mode build (scripts/preview-mode.cjs) and that CommonJS launcher.
    ".next-preview/**",
    "scripts/*.cjs",
  ]),
]);

export default eslintConfig;
