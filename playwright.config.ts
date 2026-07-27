import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm --filter mission-control-ui exec vite --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_CONVEX_URL: "http://127.0.0.1:3210",
      VITE_FLAG_UI_SHELL_V2: "true",
      VITE_FLAG_CONTEXT_REGISTRY: "true",
      VITE_FLAG_EOS_COMMAND_CENTER_PREVIEW: "true",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
