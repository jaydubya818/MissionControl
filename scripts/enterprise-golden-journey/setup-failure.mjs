import { mkdir, access, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { sourceIdentity, seal, lock } from './evidence.mjs';
const [suite, arg] = process.argv.slice(2), output = resolve(arg);
await mkdir(output, { recursive: true });
try { await access(join(output, 'manifest.json')); process.exit(0); } catch {}
const report = { schema: 'enterprise-golden-suite/v1', suite, status: 'FAIL', failureClassification: 'SETUP_FAILED_OR_INTERRUPTED',
  source: await sourceIdentity(), sourceLock: lock, reason: 'Suite did not seal a final report. Inspect retained hosted job logs.',
  paidOperations: 0, productionIntegration: 'NOT_RUN' };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await seal(output);
