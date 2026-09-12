import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const repo = process.argv[2] ?? '/private/tmp/fdlc-program-observations';
const backendBinary = '/Users/jaywest/.cache/convex/binaries/precompiled-2026-08-25-7cce8fb/convex-local-backend';
const runRoot = mkdtempSync('/private/tmp/fdlc-observation-codegen-');
const project = path.join(runRoot, 'project');
mkdirSync(path.join(project, 'convex'), { recursive: true });
const requireRepo = createRequire(path.join(repo, 'package.json'));
const convexPackage = requireRepo.resolve('convex/package.json');
const requireConvex = createRequire(convexPackage);
const esbuild = requireConvex('esbuild');
const cli = path.join(path.dirname(convexPackage), 'bin/main.js');
const hash = data => createHash('sha256').update(data).digest('hex');
const sourcePath = path.join(repo, 'convex/inferenceGateway.ts');
const source = readFileSync(sourcePath);
const schemaSource = readFileSync(path.join(repo, 'convex/schema.ts'), 'utf8');
const routeValidator = schemaSource.match(/const inferenceRouteValidator = v\.object\([\s\S]*?\n\}\);/)[0];
const reservationTable = schemaSource.slice(schemaSource.indexOf('  inferenceReservations: defineTable({'), schemaSource.indexOf('  // -------------------------------------------------------------------------\n  // AGENT PERFORMANCE', schemaSource.indexOf('  inferenceReservations: defineTable({')));
const extraValidators = ['inferenceCompletenessValidator', 'factoryOutcomeStageValidator'].map(name => schemaSource.match(new RegExp('const ' + name + ' = [\\s\\S]*?;'))[0]).join('\n');
const aggregateStart = schemaSource.indexOf('  factoryProviderReservations: defineTable(');
const aggregateTable = aggregateStart < 0 ? '' : schemaSource.slice(aggregateStart, schemaSource.indexOf('  factoryProviderUsageEvents: defineTable(', aggregateStart));
const aggregateImport = aggregateStart < 0 ? '' : `import { providerReservationValidator } from ${JSON.stringify(path.join(repo, 'convex/lib/providerLiabilityValidators.ts'))};`;
symlinkSync(path.join(repo, 'node_modules'), path.join(project, 'node_modules'), 'dir');
writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'isolated-identity-authority-proof', private: true, type: 'module', dependencies: { convex: JSON.parse(readFileSync(convexPackage)).version } }));
writeFileSync(path.join(project, 'convex.json'), JSON.stringify({ functions: 'convex/' }));
writeFileSync(path.join(project, 'convex/schema.ts'), `import { defineSchema, defineTable } from 'convex/server';\nimport { v } from 'convex/values';\n${aggregateImport}\n${routeValidator}\n${extraValidators}\nexport default defineSchema({\nworkspaceRepositories: defineTable(v.any()), workspaceHostBindings: defineTable(v.any()), factoryDefinitionVersions: defineTable(v.any()), projects: defineTable(v.any()), tenants: defineTable(v.any()), workOrders: defineTable(v.any()), tasks: defineTable(v.any()), workflowRuns: defineTable(v.any()), factoryExecutionProfiles: defineTable(v.any()), factoryProviderPrices: defineTable(v.any()), inferencePriceBooks: defineTable(v.any()), verificationReceipts: defineTable(v.any()), approvalDecisions: defineTable(v.any()), modelCatalog: defineTable(v.any()).index('by_project', ['projectId']),\n${aggregateTable}\n${reservationTable}\n});\n`);
const authShim = `export const FACTORY_PERMISSIONS = { MANAGE_AUTOMATION: 'MANAGE_AUTOMATION', APPROVE: 'APPROVE', VIEW: 'VIEW', IMPROVE: 'IMPROVE' }; export async function requireWorkspacePermission(ctx, projectId) { const project = await ctx.db.get(projectId); if (!project || !project.fixtureOnly) throw new Error('Fixture project required'); return { project, actorId: 'fixture-operator' }; }`;
const build = await esbuild.build({
  stdin: { contents: `export * from ${JSON.stringify(sourcePath)};`, resolveDir: repo, loader: 'ts' },
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022', treeShaking: true,
  external: ['convex/server', 'convex/values'], write: false, metafile: true,
  plugins: [{ name: 'fixture-auth-only', setup(build) {
    build.onResolve({ filter: /^@mission-control\/shared$/ }, () => ({ path: path.join(repo, 'packages/shared/src/index.ts') }));
    build.onResolve({ filter: /^\.\/lib\/companyAccess$/ }, args => args.importer === sourcePath ? { path: 'fixture-auth-only', namespace: 'fixture-auth-only' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'fixture-auth-only' }, () => ({ contents: authShim, loader: 'js' }));
  } }],
});
writeFileSync(path.join(project, 'convex/gateway.js'), build.outputFiles[0].contents);
writeFileSync(path.join(runRoot, 'bundle-metafile.json'), JSON.stringify(build.metafile, null, 2));
writeFileSync(path.join(runRoot, 'source-inferenceGateway.ts'), source);
writeFileSync(path.join(runRoot, 'fixture-auth-shim.js'), authShim);
const helperBuild = await esbuild.build({ stdin: { contents: `export { canonicalDigest } from ${JSON.stringify(path.join(repo, 'packages/shared/src/canonicalDigest.ts'))}; export { canonicalOutcomeSourceDigest } from ${JSON.stringify(path.join(repo, 'packages/shared/src/governedInference.ts'))};`, resolveDir: repo, loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', write: false });
writeFileSync(path.join(runRoot, 'canonical-helpers.mjs'), helperBuild.outputFiles[0].contents);
const { canonicalDigest, canonicalOutcomeSourceDigest } = await import(path.join(runRoot, 'canonical-helpers.mjs'));

const fixtureSource = readFileSync('/private/tmp/fdlc-observation-authority-harness/fixture.ts', 'utf8') + `import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { v } from 'convex/values';
import { inferencePriceBook } from ${JSON.stringify(path.join(repo, 'packages/shared/src/governedInference.ts'))};
const sha = letter => 'sha256:' + letter.repeat(64);
export const seed = mutation({ args: {}, handler: async ctx => {
 const now = Date.now(), tenantId = await ctx.db.insert('tenants', { fixtureOnly: true });
 const projectId = await ctx.db.insert('projects', { fixtureOnly: true, tenantId });
 const workOrderId = await ctx.db.insert('workOrders', { projectId, approvalStatus: 'APPROVED', currentRevisionNumber: 1, metadata: { implementationPolicy: { maxCostUsd: 0.0001 } } });
 const taskId = await ctx.db.insert('tasks', { projectId });
 const profileId = await ctx.db.insert('factoryExecutionProfiles', { projectId, profileDigest: sha('c'), enabled: true, qualificationStatus: 'EVIDENCE_QUALIFIED', admissionStatus: 'PRODUCTION_PILOT_ELIGIBLE', qualificationExpiresAt: now + 600000 });
 const runData = { projectId, parentTaskId: taskId, workOrderId, workOrderRevisionNumber: 1, status: 'RUNNING', executionProfileId: profileId, executionProfileDigest: sha('c'), executionManifestDigest: sha('d'), lease: { leaseId: 'fixture-lease', expiresAt: now + 600000 } };
 const workflowRunId = await ctx.db.insert('workflowRuns', runData), secondAttemptId = await ctx.db.insert('workflowRuns', runData);
 const route = { provider: 'fixture', providerRoute: 'fixture', modelId: 'fixture-model', routeDigest: sha('b'), adapter: 'fixture', adapterVersion: '1', endpoint: 'https://example.invalid' };
 const fallback = { ...route, modelId: 'fixture-fallback', routeDigest: sha('e') };
 for (const candidate of [route, fallback]) await ctx.db.insert('modelCatalog', { projectId, ...candidate, enabled: true, qualificationStatus: 'EVIDENCE_QUALIFIED', admissionStatus: 'PRODUCTION_PILOT_ELIGIBLE' });
 const snapshot = inferencePriceBook({ priceBookId: 'fixture-price-book', version: 1, currency: 'USD', source: { kind: 'OPERATOR_APPROVED', reference: 'synthetic local transaction proof', digest: sha('a') }, effectiveFrom: now - 1000, rates: [route, fallback].map(candidate => ({ routeDigest: candidate.routeDigest, inputMicrousdPerMillionTokens: 1000000, outputMicrousdPerMillionTokens: 1000000, cacheReadMicrousdPerMillionTokens: 0, cacheWriteMicrousdPerMillionTokens: 0, reasoningMicrousdPerMillionTokens: 0 })) });
 const priceBookId = await ctx.db.insert('inferencePriceBooks', { projectId, state: 'ACTIVE', effectiveFrom: snapshot.effectiveFrom, immutableSnapshot: snapshot, priceBookDigest: snapshot.digest });
 return { secondAttemptId, fallback, args: { projectId, workOrderId, taskId, workflowRunId, executionProfileId: profileId, executionProfileDigest: sha('c'), primaryRoute: route, allowedFallbacks: [fallback], maxPhysicalCalls: 2, maxInputTokens: 1, maxOutputTokens: 1, maxCacheReadTokens: 1, maxCacheWriteTokens: 1, maxReasoningTokens: 1, maxCostMicrousd: 100, logicalRequestKey: 'fixture-request', deadlineAt: now + 600000, priceBookId, policyDigest: sha('d'), leaseId: 'fixture-lease', leaseExpiresAt: now + 600000, registrationIdempotencyKey: 'fixture-registration' } };
} });
export const reservations = query({ args: { workOrderId: v.id('workOrders') }, handler: (ctx, args) => ctx.db.query('inferenceReservations').withIndex('by_work_order', q => q.eq('workOrderId', args.workOrderId)).collect() });
export const corruptAmount = mutation({ args: { reservationId: v.id('inferenceReservations'), maxCostMicrousd: v.number() }, handler: async (ctx, args) => { await ctx.db.patch(args.reservationId, { maxCostMicrousd: args.maxCostMicrousd }); } });
export const get = query({ args: { id: v.string() }, handler: (ctx, args) => ctx.db.get(args.id) });
export const patch = mutation({ args: { id: v.string(), values: v.any() }, handler: (ctx, args) => ctx.db.patch(args.id, args.values) });
export const clearSnapshot = mutation({ args: { id: v.string() }, handler: (ctx, args) => ctx.db.patch(args.id, { immutableSnapshot: undefined }) });
export const all = query({ args: { table: v.string() }, handler: (ctx, args) => ctx.db.query(args.table).collect() });
export const cloneLegacyProjection = mutation({ args: { id: v.id('factoryOutcomeProjections'), cohortDigest: v.string() }, handler: async (ctx, args) => { const row = await ctx.db.get(args.id); const { _id, _creationTime, immutableSnapshot, ...fields } = row; return ctx.db.insert('factoryOutcomeProjections', { ...fields, cohortDigest: args.cohortDigest }); } });
export const decisions = mutation({ args: { workOrderId: v.id('workOrders'), workflowRunId: v.id('workflowRuns') }, handler: async (ctx, args) => {
 const now = Date.now();
 const verification = { workOrderId: args.workOrderId, workflowRunId: args.workflowRunId, verdict: 'VERIFIED', independenceValid: true, verificationSubjectDigest: sha('b'), decisionInputDigest: sha('c'), recordedAt: now };
 const approval = { workOrderId: args.workOrderId, workflowRunId: args.workflowRunId, approvalType: 'WORK_ORDER_ACCEPTANCE', requestedAction: 'accept synthetic fixture', status: 'APPROVED', decision: 'APPROVE', approver: 'synthetic-human', decidedAt: now };
 return { verification: { ...verification, _id: await ctx.db.insert('verificationReceipts', verification) }, approval: { ...approval, _id: await ctx.db.insert('approvalDecisions', approval) } };
} });
`;
const fixtureBuild = await esbuild.build({ stdin: { contents: fixtureSource, resolveDir: repo, loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', external: ['convex/server', 'convex/values'], write: false });
writeFileSync(path.join(project, 'convex/fixture.js'), fixtureBuild.outputFiles[0].contents);
writeFileSync(path.join(runRoot, 'fixture-source.ts'), fixtureSource);

async function freePort() { return await new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); }); }
const cloudPort = await freePort(), sitePort = await freePort();
assert.notEqual(cloudPort, sitePort);
const url = 'http://127.0.0.1:' + cloudPort;
const instanceName = 'reservation-proof-' + randomBytes(6).toString('hex');
const instanceSecret = randomBytes(32).toString('hex');
const adminKey = execFileSync(backendBinary, ['keygen', 'admin-key', '--instance-name', instanceName, '--instance-secret', instanceSecret], { encoding: 'utf8' }).trim();
assert.ok(adminKey.startsWith(instanceName + '|'));
const env = { PATH: process.env.PATH, TMPDIR: '/private/tmp', CI: '1', CONVEX_OVERRIDE_ACCESS_TOKEN: 'synthetic-not-an-access-token', CONVEX_SELF_HOSTED_URL: url, CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey, SENTRY_DSN: '', DISABLE_BEACON: '1', NODE_OPTIONS: '--import=/private/tmp/fdlc-observation-authority-harness/loopback-only.mjs' };
const backendLog = createWriteStream(path.join(runRoot, 'backend.log'));
const backend = spawn(backendBinary, ['--interface', '127.0.0.1', '--port', String(cloudPort), '--site-proxy-port', String(sitePort), '--convex-origin', url, '--convex-site', 'http://127.0.0.1:' + sitePort, '--instance-name', instanceName, '--instance-secret', instanceSecret, '--local-storage', path.join(runRoot, 'storage'), '--disable-beacon', path.join(runRoot, 'database.sqlite3')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
backend.stdout.pipe(backendLog); backend.stderr.pipe(backendLog);
const report = { status: 'RUNNING', runRoot, startedAt: new Date().toISOString(), sourcePath, sourceSha256: hash(source), sourceBranchHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), backendBinary, backendSha256: hash(readFileSync(backendBinary)), convexVersion: JSON.parse(readFileSync(convexPackage)).version, gatewayBundleSha256: hash(build.outputFiles[0].contents), reservationTableSha256: hash(reservationTable), routeValidatorSha256: hash(routeValidator), backendUrl: url, sitePort, schemaSourceSha256: hash(schemaSource), sharedSourceSha256: hash(readFileSync(path.join(repo, 'packages/shared/src/governedInference.ts'))), scope: 'Unmodified production inference gateway and shared canonical constructors, fixture-only authorization shim, exact inference table schemas and indexes, synthetic related schemas and records, real local Convex backend. No external provider calls, real billing, full-app authorization, full application schema deployment, or real human acceptance proof.', dispatchSharedSha256: hash(readFileSync(path.join(repo, 'packages/shared/src/classifyInferenceDispatch.ts'))), profileGuardSha256: hash(readFileSync(path.join(repo, 'convex/lib/attemptExecutionProfile.ts'))), tests: [], cleanup: {} };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function record(name, result) { report.tests.push({ name, ...result }); }
async function cliRun(args, filename, cwd = project) {
 const result = await new Promise((resolve, reject) => { const child = spawn(process.execPath, [cli, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d); child.on('error', reject); child.on('close', code => resolve({ code, output: output.replaceAll(adminKey, '[ephemeral-key-redacted]').replaceAll(instanceSecret, '[ephemeral-secret-redacted]') })); });
 writeFileSync(path.join(runRoot, filename), result.output); if (result.code !== 0) throw new Error('CLI failed: ' + filename + ' code ' + result.code);
}
async function api(kind, fn, args) {
 const response = await fetch(url + '/api/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Convex ' + adminKey }, body: JSON.stringify({ path: fn, args, format: 'json' }) });
 const body = await response.json(); if (!response.ok || body.status !== 'success') throw new Error(body.errorMessage ?? JSON.stringify(body)); return body.value;
}
async function seed() { return api('mutation', 'fixture:seed', {}); }
async function reserve(args) { return api('mutation', 'gateway:createReservation', args); }
async function list(workOrderId) { return api('query', 'fixture:reservations', { workOrderId }); }
try {
 for (let attempt = 0; attempt < 150; attempt++) { try { const r = await fetch(url + '/instance_name'); if (r.ok && (await r.text()).trim() === instanceName) break; } catch {} if (attempt === 149) throw new Error('Backend startup timeout'); await delay(200); }
 const envResponse = await fetch(url + '/api/update_environment_variables', { method: 'POST', headers: { Authorization: 'Convex ' + adminKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: [{ name: 'MC_GOVERNED_INFERENCE_GATEWAY_ENABLED', value: '1' }] }) });
 assert.ok(envResponse.ok, 'Set local feature flag failed');
 await cliRun(['codegen', '--typecheck', 'disable'], 'root-codegen.log', repo);
 record('root code generation on disposable loopback backend', { passed: true });
 report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.error = String(error?.stack ?? error); process.exitCode = 1; }
finally {
 backend.kill('SIGTERM');
 await Promise.race([new Promise(resolve => backend.once('close', resolve)), delay(10000)]);
 if (backend.exitCode === null && backend.signalCode === null) { backend.kill('SIGKILL'); await new Promise(resolve => backend.once('close', resolve)); }
 backendLog.end();
 const reachable = async port => await new Promise(resolve => { const socket = net.createConnection({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); });
 report.cleanup = { backendExitCode: backend.exitCode, backendSignal: backend.signalCode, cloudPortClosed: !(await reachable(cloudPort)), sitePortClosed: !(await reachable(sitePort)), originalDatabasesUsed: false, ephemeralKeyPersisted: false, sourceUnchanged: hash(readFileSync(sourcePath)) === report.sourceSha256 };
 report.completedAt = new Date().toISOString();
 writeFileSync(path.join(runRoot, 'report.json'), JSON.stringify(report, null, 2));
 console.log(JSON.stringify({ status: report.status, passedTests: report.tests.filter(t => t.passed).length, runRoot, sourceSha256: report.sourceSha256, cleanup: report.cleanup, error: report.error }, null, 2));
}

process.exit(process.exitCode ?? 0);
