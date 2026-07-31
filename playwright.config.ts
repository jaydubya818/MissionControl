import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter mission-control-ui exec vite --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_CONVEX_URL: process.env.VITE_CONVEX_URL ?? "http://127.0.0.1:3212",
      // In local E2E, hit the orchestration server directly so an expected
      // gateway-down state does not spam Vite proxy errors for /gateway/status.
      VITE_ORCHESTRATION_URL: "http://127.0.0.1:4100",
      VITE_FLAG_UI_SHELL_V2: "true",
      VITE_FLAG_CONTEXT_REGISTRY: "true",
      VITE_FLAG_EOS_COMMAND_CENTER_PREVIEW: "true",
      // This shell-only E2E runs without a Convex backend. Production builds
      // cannot honor the bypass because RuntimeCompatibilityGate also requires DEV.
      VITE_RUNTIME_CONTRACT_E2E_BYPASS: "true",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
