import { join, resolve } from 'node:path';
import { writeFile, access } from 'node:fs/promises';
import { json, suites, verifySeal, aggregate } from './evidence.mjs';
const root = resolve(process.argv[2]);
const reports = [];
for (const suite of suites) {
  try { await access(join(root, suite)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  await verifySeal(join(root, suite));
  reports.push(await json(join(root, suite, 'report.json')));
}
const report = aggregate(reports);
await writeFile(join(root, 'qualification.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ qualification: report.qualification, deterministicChecks: report.deterministicChecks, releaseEligible: false }));
if (report.qualification === 'FAIL' || process.argv.includes('--require-release')) process.exitCode = 1;
