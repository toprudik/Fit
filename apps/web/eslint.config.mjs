import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Toasts go through the DaFit wrapper: it sets the look, the position and the 6 s for actions.
    ignores: ["src/components/ui/sonner.tsx"],
    rules: {
      "no-restricted-imports": ["error", { paths: [{ name: "sonner", message: "Import { toast } from \"@/components/ui/sonner\"." }] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output (npm run e2e).
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
