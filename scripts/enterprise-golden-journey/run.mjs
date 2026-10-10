import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, open } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { lock, suites, json, sha256, sourceIdentity, seal, validateHybrid } from './evidence.mjs';

const [suite, outputArgument] = process.argv.slice(2);
assert.ok(suites.includes(suite), 'Known suite required'); assert.ok(outputArgument, 'Fresh output directory required');
const output = resolve(outputArgument), root = process.cwd();
await mkdir(dirname(output), { recursive: true }); await mkdir(output);
const source = await sourceIdentity();
const report = { schema: 'enterprise-golden-suite/v1', suite, status: 'IN_PROGRESS', source, sourceLock: lock,
  startedAt: new Date().toISOString(), commands: [], fixtureBoundaries: [], productionIntegration: 'NOT_RUN', paidOperations: 0 };
const save = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await save();
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|HOME|TMPDIR|TEMP|TMP|CI|SystemRoot|PNPM_HOME|PLAYWRIGHT_BROWSERS_PATH)$/.test(key)
  || /^(MC_GOLDEN_|MC_COMPATIBILITY_|MC_LOCAL_MYFACTORY_ROOT$|MYFACTORY_FIXTURE_GIT$)/.test(key)));
env.MC_GOLDEN_DATABASE_AUDIT = join(output, 'database-cleanup.jsonl');
env.CONVEX_TELEMETRY_DISABLED = '1'; env.DO_NOT_TRACK = '1';
async function command(name, executable, args, overrides = {}) {
  const path = join(output, name + '.log'), fd = await open(path, 'wx'), started = performance.now();
  let code;
  try {
    code = await new Promise((resolveCode, reject) => {
      const child = spawn(executable, args, { cwd: root, env: { ...env, ...overrides }, stdio: ['ignore', fd.fd, fd.fd] });
      child.once('error', reject); child.once('exit', (status, signal) => resolveCode(signal ? -1 : status));
    });
  } finally { await fd.close(); report.commands.push({ name, executable, args, code: code ?? -1, durationMs: performance.now() - started, log: name + '.log' }); await save(); }
  assert.equal(code, 0, `${name} failed; retained ${path}`);
}
const node = (name, file, args = [], overrides) => command(name, process.execPath, ['--import', 'tsx', file, ...args], overrides);
const vitest = (name, files) => command(name, 'pnpm', ['exec', 'vitest', 'run', ...files]);
function requireInput(name) {
  if (!env[name]) { const error = new Error(`Missing ${name}; no fallback permitted`); error.notRun = true; throw error; }
  return resolve(env[name]);
}
async function database() { requireInput('MC_COMPATIBILITY_CONVEX_BINARY'); report.fixtureBoundaries.push('Disposable real Convex with synthetic authenticated identities; no external login service'); }
async function partner() {
  const path = requireInput('MC_LOCAL_MYFACTORY_ROOT'); requireInput('MYFACTORY_FIXTURE_GIT');
  const git = args => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8' }).trim();
  assert.equal(git(['rev-parse', 'HEAD']), lock.myFactory); assert.equal(git(['status', '--porcelain']), '');
  report.myFactorySourceVerified = lock.myFactory;
  const digests = JSON.parse(execFileSync(docker(), ['image', 'inspect', 'postgres:17', '--format', '{{json .RepoDigests}}'], { encoding: 'utf8' }));
  assert.ok(digests.includes(lock.postgresImage), 'PostgreSQL tag must resolve to the locked digest');
  report.fixtureBoundaries.push('Actual MyFactory local Docker provider and PostgreSQL; protected deterministic slug producer; NOT Vercel Sandbox');
}
function docker() { return requireInput('MC_GOLDEN_DOCKER'); }
async function runtime() {
  const origin = requireInput('MC_GOLDEN_RUNTIME_BUILD'), build = join(output, 'runtime');
  await mkdir(build);
  for (const [name, expected] of Object.entries(lock.runtimeFiles)) {
    const bytes = await readFile(join(origin, name)); assert.equal(sha256(bytes), expected, `Runtime dependency changed: ${name}`);
    // The image archive is checked in place; retain the small build inputs per run.
    if (name !== 'image.tar') { const dest = join(build, name); await mkdir(dirname(dest), { recursive: true }); await copyFile(join(origin, name), dest); }
  }
  await command('runtime-artifact', process.execPath, ['scripts/qualification/inspect-native-successor.mjs', join(origin, 'image.tar'), build, join(build, 'artifact')]);
  const identity = await json(join(build, 'artifact/image-binding.json'));
  assert.equal(identity.manifestDigest, lock.runtimeImage); assert.equal(identity.sourceSha, lock.runtimeSource);
  // Prove the retained bundles came from the pinned source, independently of metadata labels.
  const provenance = await json(join(build, 'provenance.json'));
  for (const artifact of Object.values(provenance.bundles.artifacts)) for (const [path, digest] of Object.entries(artifact.inputs)) {
    const bytes = execFileSync('git', ['show', `${lock.runtimeSource}:${path}`], { maxBuffer: 8_000_000 });
    assert.equal('sha256:' + sha256(bytes), digest, `Runtime source differs: ${path}`);
  }
  await node('runtime-controls', 'scripts/qualification/unpublished-verifier-controls.mts', [join(build, 'bundles'), join(build, 'image.txt'), join(build, 'registered-controls'), docker(), join(build, 'artifact/image-binding.json'), '3']);
  report.fixtureBoundaries.push('Exact retained native image; actual producer and verifier containers; deterministic document operations; no model calls');
  report.runtimeImageVerified = identity;
  return build;
}
async function journey(mode, build) {
  const dest = join(output, mode);
  await node(mode, 'scripts/qualification/native-successor-journey.mts', [build, docker(), dest, mode]);
  const j = await json(join(dest, 'journey.json'));
  assert.equal(j.repositoryCleanup, 'VERIFIED'); assert.equal(j.databaseCleanup, 'VERIFIED');
  assert.equal('sha256:' + sha256(await readFile(join(dest, 'candidates.bundle'))), j.candidateArchiveDigest);
  if (mode === 'hybrid') {
    report.proof = validateHybrid(j, await json(join(dest, 'durable-records.json')));
    if (j.stages.missionReadIsolation.strictOwnerIsolation !== 'PASS') report.blockingFindings = ['CANONICAL_MISSION_READ_ALLOWS_SAME_TENANT_OTHER_OWNER'];
    await command('independent-evidence-validator', process.execPath, ['scripts/enterprise-golden-journey/verify.mjs', dest]);
  }
  else if (mode === 'unknown' || mode === 'cancel') { assert.equal(j.additionalExecutions, 0); assert.ok(j.stages.unknownAfterRestart.attemptExposureMicrousd > 0); }
  else { assert.equal(j.nativeExecution, 'PASS'); assert.equal(j.nativeSettlement, 'PASS'); }
  return j;
}
try {
  for (const [path, expected] of Object.entries(lock.dependencyLocks)) assert.equal(sha256(await readFile(path)), expected, `Dependency lock changed: ${path}`);
  if (suite === 'contracts') {
    await command('report-contracts', process.execPath, ['--test', 'scripts/enterprise-golden-journey/evidence.test.mjs', 'scripts/enterprise-golden-journey/sofie-contract.test.mjs', 'scripts/enterprise-golden-journey/boundary.test.mjs']);
    await vitest('backend-domain-regressions', ['convex/__tests__']);
    await vitest('enterprise-contracts', ['convex/__tests__/enterpriseDelegationAdmission.test.ts', 'convex/__tests__/enterpriseMissionOwner.test.ts', 'convex/__tests__/missionWorkOrderContract.test.ts', 'convex/__tests__/missionGovernance.test.ts', 'convex/__tests__/qualificationGateScope.test.ts']);
  } else if (suite === 'database-concurrency') {
    await database(); await node('mission-isolation', 'scripts/enterprise-golden-journey/isolation.mjs', [], { MC_ISOLATION_EVIDENCE: join(output, 'isolation.json') });
    await node('accounting', 'scripts/enterprise-compatibility/accounting.mjs', [], { MC_ACCOUNTING_EVIDENCE: join(output, 'accounting.json') });
    const evidence = await json(join(output, 'accounting.json')); assert.ok(evidence.checks.length >= 13);
  } else if (suite === 'native-execution') {
    await database(); const build = await runtime(); await journey('execute', build);
  } else if (suite === 'delegated-execution') {
    await database(); await partner(); await node('delegated', 'scripts/enterprise-compatibility/local-provider.mjs', [], {
      MC_CANONICAL_ACCOUNTING_QUALIFICATION: '1', MC_LOCAL_PROVIDER_EVIDENCE: join(output, 'delegated.json') });
    const evidence = await json(join(output, 'delegated.json')); assert.equal(evidence.myFactorySourceSha, lock.myFactory); assert.ok(evidence.checks.length >= 16);
  } else if (suite === 'hybrid-mission') {
    await database(); await partner(); const build = await runtime(); await journey('hybrid', build);
  } else if (suite === 'security-recovery') {
    await database(); const build = await runtime();
    await vitest('negative-contracts', ['convex/__tests__/offlineVerification.test.ts', 'convex/__tests__/offlineEvidenceIngress.test.ts', 'convex/__tests__/offlineAttemptEvidence.test.ts', 'convex/__tests__/enterpriseAttemptAccounting.test.ts', 'convex/__tests__/offlineAttemptBudget.test.ts']);
    await node('sandbox-security', 'scripts/qualification/native-sandbox-security.mts', [docker(), join(output, 'sandbox-security')]);
    for (const mode of ['recovery', 'unknown', 'cancel']) await journey(mode, build);
  } else if (suite === 'sofie-integration') {
    await command('sofie-contract', process.execPath, ['--test', 'scripts/enterprise-golden-journey/sofie-contract.test.mjs', 'scripts/enterprise-golden-journey/boundary.test.mjs']);
    report.fixtureBoundaries.push('Sofie consumer contract fixture. Canonical readback exercised in hybrid-mission. Live MyEve adapter absent.');
    report.liveSofieIntegration = 'NOT_RUN';
  } else if (suite === 'browser-journey') {
    await command('playwright', 'pnpm', ['exec', 'playwright', 'test', '-c', 'scripts/enterprise-golden-journey/playwright.config.ts'], { MC_GOLDEN_BROWSER_OUTPUT: join(output, 'browser') });
    report.fixtureBoundaries.push('Actual MissionControl shell in explicit demo mode; empty backend boundary. Does not qualify login, Sofie, or Mission acceptance.');
    report.completeBrowserJourney = 'NOT_RUN';
  }
  report.status = 'PASS';
} catch (error) {
  report.status = error.notRun ? 'NOT_RUN' : 'FAIL'; report.failureClassification = error.notRun ? 'DEPENDENCY_UNAVAILABLE' : 'ASSERTION_OR_EXECUTION_FAILURE';
  report.reason = error.message; process.exitCode = error.notRun ? 0 : 1;
} finally {
  try {
    const audit = (await readFile(env.MC_GOLDEN_DATABASE_AUDIT, 'utf8')).trim().split('\n').map(JSON.parse);
    const created = audit.filter(a => a.status === 'CREATED').map(a => a.root);
    const destroyed = audit.filter(a => a.status === 'DESTROYED').map(a => a.root);
    assert.deepEqual([...created].sort(), [...destroyed].sort());
    report.databaseCleanup = { status: 'VERIFIED', databases: created.length };
  } catch (error) {
    if (error.code !== 'ENOENT') { report.status = 'FAIL'; report.failureClassification = 'CLEANUP_UNVERIFIED'; process.exitCode = 1; }
  }
  report.completedAt = new Date().toISOString();
  report.sourceUnchanged = (await sourceIdentity()).treeDigest === source.treeDigest;
  if (!report.sourceUnchanged) { report.status = 'FAIL'; report.failureClassification = 'SOURCE_CHANGED_DURING_RUN'; process.exitCode = 1; }
  await save(); await seal(output);
  console.log(JSON.stringify({ suite, status: report.status, reason: report.reason, evidence: output }));
}
