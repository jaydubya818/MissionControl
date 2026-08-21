import { defineConfig } from "vitest/config";

/**
 * Root suite: Convex control-plane unit/contract tests and repository scripts.
 *
 * The operator UI is intentionally NOT included here. It needs a DOM
 * environment and the `@/` alias, both of which live in
 * `apps/mission-control-ui/vitest.config.ts`; including it from the root made
 * `vitest run` fail on `window is not defined` and unresolved `@/lib/utils`.
 * `pnpm run test` runs every workspace suite through `pnpm -r`.
 */
export default defineConfig({
  test: {
    include: [
      "convex/__tests__/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
    // These suites are written against `node:test`, not Vitest. Vitest collects
    // them as "no test suite found"; they run through `pnpm run test:scripts`.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "scripts/governed-vercel-production.test.mjs",
      "scripts/local-golden-path-candidate.test.mjs",
      "scripts/lib/agent-config-registry.test.mjs",
    ],
  },
});
