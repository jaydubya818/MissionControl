import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const repo = '/private/tmp/fdlc-program-observations';
const require = createRequire(repo + '/package.json');
const { chromium } = require('@playwright/test');
const axePath = require.resolve('axe-core/axe.min.js', { paths: [require.resolve('@axe-core/playwright')] });
const output = '/private/tmp/fdlc-observations-inspector-browser';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const report = { scope: 'Synthetic local component rendering; no backend or provider authority', status: 'FAIL', checks: [], errors: [], sourceSha256: createHash('sha256').update(readFileSync(repo + '/apps/mission-control-ui/src/controlPlane/ExecutionRunInspector.tsx')).digest('hex') };
page.on('pageerror', error => report.errors.push(error.message));
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
});
try {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const state of ['loading', 'empty', 'fenced', 'empty-fenced', 'overflow']) {
      await page.goto(`http://127.0.0.1:5231/.fdlc-observation-preview/index.html?state=${state}`);
      await page.getByRole('heading', { name: 'Synthetic local observation fixture' }).waitFor();
      if (state.includes('fenced')) {
        await page.getByText('Inference spending stopped', { exact: true }).waitFor();
        assert.match(await page.getByRole('alert').innerText(), /Existing allocations remain held/);
        assert.equal(await page.getByText('SPENDING STOPPED', { exact: true }).count(), 1);
      }
      if (state === 'loading') assert.match(await page.getByRole('status').innerText(), /Loading inference economics/);
      if (state === 'empty') assert.equal(await page.getByText('No governed inference reservation', { exact: true }).count(), 1);
      if (state === 'fenced') assert.equal(await page.getByText('ESTIMATED · $0.00675', { exact: true }).count(), 1);
      if (state === 'overflow') {
        assert.equal(await page.getByText('Unknown', { exact: true }).count(), 1);
        assert.equal(await page.getByText('Aggregate cost unavailable', { exact: true }).count(), 1);
        assert.equal(await page.getByRole('row').count(), 3);
      }
      await page.addScriptTag({ path: axePath });
      const audit = await page.evaluate(async () => ({ overflow: document.documentElement.scrollWidth > innerWidth, violations: (await window.axe.run(document)).violations.map(x => ({ id: x.id, impact: x.impact, targets: x.nodes.map(n => n.target) })) }));
      assert.equal(audit.overflow, false);
      assert.deepEqual(audit.violations, []);
      if (width === 390 && state === 'fenced') {
        const receipts = page.getByRole('region', { name: 'Physical inference receipts' });
        await receipts.focus();
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('[aria-label="Physical inference receipts"]').scrollLeft > 0);
      }
      await page.screenshot({ path: `${output}/${state}-${width}.png`, fullPage: true });
      report.checks.push({ state, width, ...audit, result: 'PASS' });
    }
  }
  assert.deepEqual(report.errors, []);
  report.status = 'PASS';
} finally {
  await browser.close();
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output }));
