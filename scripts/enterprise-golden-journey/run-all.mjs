import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { suites } from './evidence.mjs';
const output = resolve(process.argv[2] ?? `golden-evidence/${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`);
await mkdir(output, { recursive: false });
let failed = false;
for (const suite of suites) {
  const result = spawnSync(process.execPath, ['scripts/enterprise-golden-journey/run.mjs', suite, join(output, suite)], { stdio: 'inherit', env: process.env });
  failed ||= result.status !== 0;
}
const result = spawnSync(process.execPath, ['scripts/enterprise-golden-journey/aggregate.mjs', output], { stdio: 'inherit' });
console.log(`Retained Golden Journey evidence: ${output}`);
if (failed || result.status !== 0) process.exitCode = 1;
