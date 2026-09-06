import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const repo = '/private/tmp/fdlc-program-observations';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const backend = new URL(input.backendUrl);
assert.equal(backend.hostname, '127.0.0.1');
assert.equal(backend.protocol, 'http:');
assert.ok(Array.isArray(input.fixtures) && input.fixtures.length >= 2);
const require = createRequire(repo + '/package.json');
const { chromium } = require('@playwright/test');
const { ConvexHttpClient } = require('convex/browser');
const { makeFunctionReference } = require('convex/server');
const client = new ConvexHttpClient(backend.origin);
const axePath = require.resolve('axe-core/axe.min.js', { paths: [require.resolve('@axe-core/playwright')] });
const output = path.join(path.dirname(process.argv[2]), 'persisted-browser');
mkdirSync(output, { recursive: true });
const digest = data => createHash('sha256').update(data).digest('hex');
const report = {
  scope: 'Actual local gateway query and persisted inference/provider records; synthetic qualification inputs and fixture-project permission shim; no provider or production authority',
  status: 'FAIL', checks: [], snapshots: [], errors: [],
  sourceSha256: digest(readFileSync(repo + '/apps/mission-control-ui/src/controlPlane/ExecutionRunInspector.tsx')),
};
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', error => report.errors.push(error.message));
await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
try {
  for (const fixture of input.fixtures) {
    assert.match(fixture.name, /^[a-z0-9-]+$/);
    const data = await client.query(makeFunctionReference('gateway:getAttemptEconomics'), { workflowRunId: fixture.workflowRunId });
    assert.equal(Boolean(data.inferenceSpendingFence), fixture.expected.spendingStopped);
    if (fixture.expected.unknownAggregate) {
      assert.equal(data.latestProjection.knownCostMicrousd, undefined);
      assert.equal(data.latestProjection.costCompleteness, 'UNKNOWN');
      assert.equal(data.latestProjection.confidence, 'NONE');
    }
    if (fixture.expected.historicalProjection) {
      assert.equal(data.latestProjection.costCompleteness, 'COMPLETE');
      assert.ok(data.inferenceSpendingFence);
    }
    writeFileSync(path.join(output, fixture.name + '-query.json'), JSON.stringify(data, null, 2) + '\n');
    report.snapshots.push({ name: fixture.name, workflowRunId: fixture.workflowRunId, querySha256: digest(JSON.stringify(data)), expected: fixture.expected });
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme });
      const url = new URL('http://127.0.0.1:5231/.fdlc-observation-preview/index.html');
      url.search = new URLSearchParams({ state: 'persisted', backend: backend.origin, workflowRunId: fixture.workflowRunId }).toString();
      await page.goto(url.href);
      await page.evaluate(t => {
        document.documentElement.classList.toggle('dark', t === 'dark');
        document.documentElement.dataset.theme = t;
      }, theme);
      await page.getByRole('heading', { name: 'Persisted local observation qualification' }).waitFor();
      await page.getByRole('region', { name: 'Physical inference receipts' }).waitFor();
      assert.equal(await page.getByRole('row').count(), data.receipts.length + 1);
      if (fixture.expected.spendingStopped) {
        assert.equal(await page.getByText('SPENDING STOPPED', { exact: true }).count(), 1);
        assert.match(await page.getByRole('alert').innerText(), /Existing allocations remain held/);
        assert.ok((await page.getByRole('alert').innerText()).includes(data.inferenceSpendingFence.sourceDigest));
      }
      if (fixture.expected.historicalProjection) {
        assert.equal(await page.getByText('Last projected cost', { exact: true }).count(), 1);
        assert.match(await page.getByRole('alert').innerText(), /last stored outcome projection and may predate this observation/);
      }
      if (fixture.expected.unknownAggregate) assert.equal(await page.getByText('Unknown', { exact: true }).count(), 1);
      const receipts = page.getByRole('region', { name: 'Physical inference receipts' });
      await receipts.focus();
      assert.equal(await receipts.evaluate(el => el === document.activeElement), true);
      if (width === 390) {
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('[aria-label="Physical inference receipts"]').scrollLeft > 0);
      }
      await page.addScriptTag({ path: axePath });
      const audit = await page.evaluate(async () => ({ overflow: document.documentElement.scrollWidth > innerWidth,
        violations: (await window.axe.run(document)).violations.map(x => ({ id: x.id, impact: x.impact, targets: x.nodes.map(n => n.target) })) }));
      assert.equal(audit.overflow, false);
      assert.deepEqual(audit.violations, []);
      await page.screenshot({ path: path.join(output, `${fixture.name}-${width}-${theme}.png`), fullPage: true });
      report.checks.push({ name: fixture.name, width, theme, ...audit, keyboardFocus: true, keyboardScroll: width === 390, result: 'PASS' });
    }
  }
  assert.deepEqual(report.errors, []);
  assert.equal(report.sourceSha256, digest(readFileSync(repo + '/apps/mission-control-ui/src/controlPlane/ExecutionRunInspector.tsx')));
  report.status = 'PASS';
} catch (error) {
  report.error = error.stack ?? String(error);
  throw error;
} finally {
  await browser.close();
  writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output }));
