import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // React components in tests use the automatic JSX runtime, like Next does. Vite 8 transforms with
  // oxc (the old `esbuild` option is ignored and no longer type-checks).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    // Node by default; DOM tests opt in with a `// @vitest-environment jsdom` comment on the first line.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
