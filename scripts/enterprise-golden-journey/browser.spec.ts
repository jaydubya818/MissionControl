import { test, expect } from '@playwright/test';

test('implemented Mission portfolio survives a browser disconnect and reconnect (shell only)', async ({ page, context }, testInfo) => {
  await page.goto('/v2/missions');
  await expect(page.getByRole('heading', { name: 'Missions', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('portfolio.png'), fullPage: true });
  const canonicalUrl = page.url();
  await context.setOffline(true);
  await context.setOffline(false);
  const started = performance.now();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Missions', exact: true })).toBeVisible();
  expect(page.url()).toBe(canonicalUrl);
  await testInfo.attach('reconnect-measurement', { body: JSON.stringify({ durationMs: performance.now() - started,
    scope: 'SHELL_ONLY', durableMissionState: 'NOT_RUN', authenticatedLogin: 'NOT_RUN', sofie: 'NOT_RUN' }), contentType: 'application/json' });
});
