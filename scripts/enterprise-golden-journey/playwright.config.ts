import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const output = process.env.MC_GOLDEN_BROWSER_OUTPUT;
if (!output) throw Error('Fresh MC_GOLDEN_BROWSER_OUTPUT required');
export default defineConfig({
  testDir: '.', testMatch: 'browser.spec.ts', retries: 0, workers: 1, timeout: 30_000,
  outputDir: resolve(output, 'traces'),
  reporter: [['line'], ['json', { outputFile: resolve(output, 'results.json') }]],
  use: { baseURL: 'http://127.0.0.1:4287', trace: 'on', screenshot: 'on', headless: true },
  webServer: { command: 'pnpm --filter mission-control-ui exec vite --host 127.0.0.1 --port 4287 --strictPort',
    url: 'http://127.0.0.1:4287', reuseExistingServer: false,
    env: { VITE_AUTH_MODE: 'demo', VITE_CONVEX_URL: 'http://127.0.0.1:1', VITE_ORCHESTRATION_URL: 'http://127.0.0.1:1',
      VITE_FLAG_UI_SHELL_V2: 'true', VITE_FLAG_CONTEXT_REGISTRY: 'true', VITE_FLAG_EOS_COMMAND_CENTER_PREVIEW: 'true',
      VITE_FLAG_COMPANY_CONTEXT: 'false', VITE_RUNTIME_CONTRACT_E2E_BYPASS: 'true' } },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: '390px', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
});
