import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "factory-review-facets.e2e.spec.ts",
  timeout: 30_000,
  workers: 1,
  retries: 0,
  outputDir: "test-results/factory-review",
  use: { baseURL: "http://127.0.0.1:5197", headless: true, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm --filter mission-control-ui exec vite --config ../../tests/ui/factory-review/vite.config.mts",
    url: "http://127.0.0.1:5197",
    reuseExistingServer: !process.env.CI,
  },
});
