import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { runObservationScenarios } from './observations.mjs';

const repo = process.argv[2] ?? '/private/tmp/fdlc-program-observations';
const browserCallbackPath = '/private/tmp/fdlc-observations-persisted-browser.mjs';
const withPersistedBrowser = process.argv.includes('--persisted-browser');
const backendBinary = '/Users/jaywest/.cache/convex/binaries/precompiled-2026-08-25-7cce8fb/convex-local-backend';
const runRoot = mkdtempSync('/private/tmp/fdlc-observation-backend-');
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
const reservationTable = schemaSource.slice(schemaSource.indexOf('  inferencePriceBooks: defineTable({'), schemaSource.indexOf('  // -------------------------------------------------------------------------\n  // AGENT PERFORMANCE', schemaSource.indexOf('  inferencePriceBooks: defineTable({')));
const extraValidators = ['inferenceCompletenessValidator', 'factoryOutcomeStageValidator'].map(name => schemaSource.match(new RegExp('const ' + name + ' = [\\s\\S]*?;'))[0]).join('\n');
const aggregateStart = schemaSource.indexOf('  factoryProviderPrices: defineTable(');
assert.ok(aggregateStart >= 0, 'Exact provider table schemas required');
const aggregateTable = schemaSource.slice(aggregateStart, schemaSource.indexOf('  factoryDefinitions: defineTable(', aggregateStart));
const aggregateImport = `import { providerPriceValidator, providerReservationValidator, providerUsageValidator } from ${JSON.stringify(path.join(repo, 'convex/lib/providerLiabilityValidators.ts'))};`;
symlinkSync(path.join(repo, 'node_modules'), path.join(project, 'node_modules'), 'dir');
writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'isolated-identity-authority-proof', private: true, type: 'module', dependencies: { convex: JSON.parse(readFileSync(convexPackage)).version } }));
writeFileSync(path.join(project, 'convex.json'), JSON.stringify({ functions: 'convex/' }));
writeFileSync(path.join(project, 'convex/schema.ts'), `import { defineSchema, defineTable } from 'convex/server';\nimport { v } from 'convex/values';\n${aggregateImport}\n${routeValidator}\n${extraValidators}\nexport default defineSchema({\nworkspaceRepositories: defineTable(v.any()), workspaceHostBindings: defineTable(v.any()), factoryDefinitionVersions: defineTable(v.any()), projects: defineTable(v.any()), tenants: defineTable(v.any()), workOrders: defineTable(v.any()), tasks: defineTable(v.any()), workflowRuns: defineTable(v.any()), factoryExecutionProfiles: defineTable(v.any()), factorySandboxProfiles: defineTable(v.any()), verificationReceipts: defineTable(v.any()), approvalDecisions: defineTable(v.any()), modelCatalog: defineTable(v.any()).index('by_project', ['projectId']),\n${aggregateTable}\n${reservationTable}\n});\n`);
const authShim = `export const FACTORY_PERMISSIONS = { MANAGE_AUTOMATION: 'MANAGE_AUTOMATION', APPROVE: 'APPROVE', VIEW: 'VIEW', IMPROVE: 'IMPROVE' }; export async function requireWorkspacePermission(ctx, projectId) { const project = await ctx.db.get(projectId); if (!project || !project.fixtureOnly) throw new Error('Fixture project required'); return { project, actorId: 'fixture-operator' }; }`;
const providerSourcePath = path.join(repo, 'convex/factory/providerLiability.ts');
async function bundleSource(entry) { return esbuild.build({ absWorkingDir: repo,
  stdin: { contents: `export * from ${JSON.stringify(entry)};`, resolveDir: repo, loader: 'ts' },
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022', treeShaking: true,
  external: ['convex/server', 'convex/values'], write: false, metafile: true,
  plugins: [{ name: 'fixture-auth-only', setup(build) {
    build.onResolve({ filter: /^@mission-control\/shared$/ }, () => ({ path: path.join(repo, 'packages/shared/src/index.ts') }));
    build.onResolve({ filter: /^\.\.?\/lib\/companyAccess$/ }, args => [sourcePath, providerSourcePath].includes(args.importer) ? { path: 'fixture-auth-only', namespace: 'fixture-auth-only' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'fixture-auth-only' }, () => ({ contents: authShim, loader: 'js' }));
  } }],
}); }
const build = await bundleSource(sourcePath);
const providerBuild = await bundleSource(providerSourcePath);
writeFileSync(path.join(project, 'convex/provider.js'), providerBuild.outputFiles[0].contents);
writeFileSync(path.join(runRoot, 'provider-bundle-metafile.json'), JSON.stringify(providerBuild.metafile, null, 2));
writeFileSync(path.join(project, 'convex/gateway.js'), build.outputFiles[0].contents);
writeFileSync(path.join(runRoot, 'bundle-metafile.json'), JSON.stringify(build.metafile, null, 2));
writeFileSync(path.join(runRoot, 'source-inferenceGateway.ts'), source);
writeFileSync(path.join(runRoot, 'fixture-auth-shim.js'), authShim);
const helperBuild = await esbuild.build({ absWorkingDir: repo, stdin: { contents: `export { canonicalDigest } from ${JSON.stringify(path.join(repo, 'packages/shared/src/canonicalDigest.ts'))}; export { canonicalOutcomeSourceDigest } from ${JSON.stringify(path.join(repo, 'packages/shared/src/governedInference.ts'))}; export { liabilityDigest } from ${JSON.stringify(path.join(repo, 'convex/lib/providerLiability.ts'))};`, resolveDir: repo, loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', write: false });
writeFileSync(path.join(runRoot, 'canonical-helpers.mjs'), helperBuild.outputFiles[0].contents);
const { canonicalDigest, canonicalOutcomeSourceDigest, liabilityDigest } = await import(path.join(runRoot, 'canonical-helpers.mjs'));

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
 const priceBookId = await ctx.db.insert('inferencePriceBooks', { projectId, state: 'ACTIVE', effectiveFrom: snapshot.effectiveFrom, immutableSnapshot: snapshot, priceBookDigest: snapshot.digest, priceBookKey: snapshot.priceBookId, version: snapshot.version, currency: snapshot.currency, sourceKind: snapshot.source.kind, sourceReference: snapshot.source.reference, sourceDigest: snapshot.source.digest, rates: snapshot.rates, registrationIdempotencyKey: 'fixture-price', createdBy: 'synthetic-fixture', createdAt: now });
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
const fixtureBuild = await esbuild.build({ absWorkingDir: repo, stdin: { contents: fixtureSource, resolveDir: repo, loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', external: ['convex/server', 'convex/values'], write: false, metafile: true });
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
const harnessBindings = Object.fromEntries(['run.mjs', 'fixture.ts', 'bedrockAuthority.ts', 'observations.mjs', 'loopback-only.mjs'].map(file => [file, hash(readFileSync(path.join('/private/tmp/fdlc-observation-authority-harness', file)))]));
const sourceBindings = Object.fromEntries([...new Set([sourcePath, providerSourcePath, path.join(repo, 'convex/schema.ts'), ...[build, providerBuild, fixtureBuild].flatMap(b => Object.keys(b.metafile.inputs).map(f => path.resolve(repo, f)).filter(f => f.startsWith(repo + '/') && !f.includes('/node_modules/') && existsSync(f)))])].map(f => [path.relative(repo, f), hash(readFileSync(f))]));
writeFileSync(path.join(runRoot, 'source-bindings.json'), JSON.stringify(sourceBindings, null, 2));
const sourcesUnchanged = () => Object.entries(sourceBindings).every(([file, digest]) => hash(readFileSync(path.join(repo, file))) === digest);
const backendLog = createWriteStream(path.join(runRoot, 'backend.log'));
const redact = value => String(value).replaceAll(adminKey, '[ephemeral-key-redacted]').replaceAll(instanceSecret, '[ephemeral-secret-redacted]');
const backend = spawn(backendBinary, ['--interface', '127.0.0.1', '--port', String(cloudPort), '--site-proxy-port', String(sitePort), '--convex-origin', url, '--convex-site', 'http://127.0.0.1:' + sitePort, '--instance-name', instanceName, '--instance-secret', instanceSecret, '--local-storage', path.join(runRoot, 'storage'), '--disable-beacon', path.join(runRoot, 'database.sqlite3')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
// Keep the complete raw log only in memory, redact before any persistence.
let backendOutput = '';
backend.stdout.on('data', data => { backendOutput += data; });
backend.stderr.on('data', data => { backendOutput += data; });
const report = { status: 'RUNNING', runRoot, startedAt: new Date().toISOString(), sourcePath, sourceSha256: hash(source), sourceBranchHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), backendBinary, backendSha256: hash(readFileSync(backendBinary)), convexVersion: JSON.parse(readFileSync(convexPackage)).version, gatewayBundleSha256: hash(build.outputFiles[0].contents), reservationTableSha256: hash(reservationTable), routeValidatorSha256: hash(routeValidator), backendUrl: url, sitePort, schemaSourceSha256: hash(schemaSource), sharedSourceSha256: hash(readFileSync(path.join(repo, 'packages/shared/src/governedInference.ts'))), providerBundleSha256: hash(providerBuild.outputFiles[0].contents), providerTableSha256: hash(aggregateTable), sourceBindings, harnessBindings, scope: 'Unmodified production inference gateway, provider liability handlers and canonical constructors, fixture-only authorization shim, exact inference/provider table schemas and indexes, synthetic related schemas and offline canonical qualifications, real local Convex backend. No external provider calls, real billing, full-app authorization, full application schema deployment, or real human acceptance proof.', dispatchSharedSha256: hash(readFileSync(path.join(repo, 'packages/shared/src/classifyInferenceDispatch.ts'))), profileGuardSha256: hash(readFileSync(path.join(repo, 'convex/lib/attemptExecutionProfile.ts'))), tests: [], cleanup: {} };
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
 await cliRun(['deploy', '--yes', '--typecheck', 'disable', '--codegen', 'disable'], 'deployment.log');
 const sha = letter => 'sha256:' + letter.repeat(64);
 const get = id => api('query', 'fixture:get', { id });
 const patch = (id, values) => api('mutation', 'fixture:patch', { id, values });
 const clear = id => api('mutation', 'fixture:clearSnapshot', { id });
 const all = table => api('query', 'fixture:all', { table });
 async function chain(overrides = {}) {
   const f = await seed(), reservation = await reserve({ ...f.args, ...overrides });
   const persist = (ordinal, prior, changed = {}) => api('mutation', 'gateway:persistIntentInternal', {
     workflowRunId: f.args.workflowRunId, reservationId: reservation.reservationId,
     logicalRequestKey: f.args.logicalRequestKey, physicalOrdinal: ordinal,
     ...(prior ? { retryOfIntentId: prior } : {}), route: ordinal === 1 ? f.args.primaryRoute : f.fallback,
     requestDigest: sha('f'), intentKey: 'logical-intent-' + ordinal, ...changed,
   });
   const claim = intentId => api('mutation', 'gateway:claimIntentInternal', {
     workflowRunId: f.args.workflowRunId, intentId, leaseId: f.args.leaseId, claimId: 'claim:' + intentId,
   });
   const receiptArgs = async (intentId, failed) => {
     const row = await get(intentId);
     return { workflowRunId: f.args.workflowRunId, intentId,
       resolvedProvider: f.args.primaryRoute.provider, resolvedModelId: failed ? f.args.primaryRoute.modelId : f.fallback.modelId,
       providerRequestId: 'fixture-provider-request:' + intentId,
       delivery: failed ? 'NOT_DELIVERED' : 'DELIVERED', status: failed ? 'FAILED' : 'SUCCEEDED',
       usage: { inputTokens: failed ? 0 : 1, outputTokens: failed ? 0 : 1, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
       startedAt: row.claimedAt, completedAt: Date.now() };
   };
   const append = args => api('mutation', 'gateway:appendReceiptInternal', args);
   const project = cohortDigest => api('mutation', 'gateway:createOutcomeProjection', {
     workflowRunId: f.args.workflowRunId, cohortDigest, routeDigest: f.args.primaryRoute.routeDigest,
   });
   const compare = cohortDigest => api('mutation', 'gateway:freezeRouteComparison', {
     projectId: f.args.projectId, leftRouteDigest: f.args.primaryRoute.routeDigest,
     rightRouteDigest: f.fallback.routeDigest, cohortDigest, minimumSampleSize: 1, maximumAgeMs: 600000,
   });
   return { ...f, reservation, persist, claim, receiptArgs, append, project, compare };
 }
 const f = await chain();
 const frozenReservation = (await get(f.reservation.reservationId)).immutableSnapshot;
 const primary = await f.persist(1);
 const frozenPrimary = (await get(primary.intentId)).immutableSnapshot;
 assert.notEqual(primary.intentId, frozenPrimary.intentId);
 assert.notEqual(f.reservation.reservationId, frozenPrimary.reservationId);
 assert.equal((await f.persist(1)).created, false);
 await assert.rejects(f.persist(1, undefined, { intentKey: 'changed-key' }), /immutable history/);
 record('logical intent identity and exact replay', { passed: true });
 const claims = await Promise.all(Array.from({ length: 8 }, () => f.claim(primary.intentId)));
 assert.equal(claims.filter(x => x.claimed).length, 1);
 record('single claim under eight concurrent requests', { passed: true, successfulClaims: 1, deniedClaims: 7 });
 const failedArgs = await f.receiptArgs(primary.intentId, true);
 const failedReceipt = await f.append(failedArgs);
 const fallback = await f.persist(2, primary.intentId);
 const frozenFallback = (await get(fallback.intentId)).immutableSnapshot;
 assert.equal(frozenFallback.retryOfIntentId, frozenPrimary.intentId);
 await f.claim(fallback.intentId);
 const successArgs = await f.receiptArgs(fallback.intentId, false);
 const success = await f.append(successArgs);
 assert.equal((await f.append(successArgs)).created, false);
 const receipt = (await get(success.receiptId)).immutableSnapshot;
 const { receiptDigest, ...receiptBytes } = receipt;
 assert.equal(canonicalDigest(receipt.schema, receiptBytes), receiptDigest);
 assert.equal(receipt.intentId, frozenFallback.intentId);
 assert.notEqual(receipt.receiptId, success.receiptId);
 record('failed primary and successful fallback retain canonical snapshots', { passed: true });
 const reconciliationArgs = { workflowRunId: f.args.workflowRunId, receiptId: success.receiptId,
   providerEventId: 'fixture-billing-event', providerRequestId: receipt.providerRequestId,
   providerBillingId: 'fixture-billing-id', observedCostMicrousd: 7, completeness: 'COMPLETE',
   sourceDigest: sha('a'), reconciledBy: 'fixture-billing-service' };
 const reconciled = await api('mutation', 'gateway:appendReconciliationInternal', reconciliationArgs);
 const replay = await api('mutation', 'gateway:appendReconciliationInternal', reconciliationArgs);
 assert.equal(replay.created, false); assert.equal(replay.reconciliationId, reconciled.reconciliationId);
 record('synthetic reconciliation is idempotent', { passed: true });
 const decisions = await api('mutation', 'fixture:decisions', { workOrderId: f.args.workOrderId, workflowRunId: f.args.workflowRunId });
 for (const [kind, stage, sourceType] of [['verification', 'VERIFICATION_PASSED', 'verification-receipt'], ['approval', 'HUMAN_ACCEPTED', 'approval-decision']]) {
   const { _id, ...facts } = decisions[kind];
   const sourceDigest = canonicalOutcomeSourceDigest({ sourceType, sourceId: _id, ...facts, ...(kind === 'verification' ? { sourceAttemptId: undefined } : {}) });
   await api('mutation', 'gateway:recordOutcomeEvent', { projectId: f.args.projectId, workOrderId: f.args.workOrderId,
     workflowRunId: f.args.workflowRunId, stage, sourceType, sourceId: _id, sourceDigest, occurredAt: kind === 'verification' ? facts.recordedAt : facts.decidedAt });
 }
 const projected = await f.project(sha('d'));
 const projectionRow = await get(projected.projectionId), projection = projectionRow.immutableSnapshot;
 const { digest, ...projectionBytes } = projection;
 assert.equal(canonicalDigest(projection.schema, projectionBytes), digest);
 assert.equal(projection.projectionId, f.args.workflowRunId + ':v1');
 assert.equal(projection.outcome, 'ACCEPTED'); assert.equal(projection.totalCostMicrousd, 7);
 assert.ok(projection.receiptIds.includes(receipt.receiptId));
 assert.deepEqual(projectionRow.receiptIds, [failedReceipt.receiptId, success.receiptId]);
 assert.equal(projection.stages.HUMAN_ACCEPTED.eventId, 'approval-decision:' + decisions.approval._id);
 const comparison = await f.compare(sha('d'));
 assert.equal(comparison.status, 'NO_GO'); assert.equal(comparison.automaticPromotionAuthorized, false);
 record('synthetic accepted projection and NO_GO comparison preserve source identities', { passed: true, actualHumanAcceptance: false, syntheticCostMicrousd: 7 });
 assert.deepEqual((await get(f.reservation.reservationId)).immutableSnapshot, frozenReservation);
 assert.deepEqual((await get(primary.intentId)).immutableSnapshot, frozenPrimary);
 record('original reservation and intent snapshots remain immutable after claim and receipt', { passed: true });
 await patch(success.receiptId, { providerRequestId: 'drifted-request' });
 await assert.rejects(f.append({ ...successArgs, providerRequestId: 'drifted-request' }), /immutable history/);
 assert.equal((await f.append(successArgs)).created, false);
 record('canonical replay rejects duplicated row drift', { passed: true });
 for (const changed of [{ batch: true }, { serviceTier: 'changed-tier' }]) await assert.rejects(f.append({ ...successArgs, ...changed }), /immutable history/);
 record('receipt replay binds pricing context', { passed: true });
 const legacy = await api('mutation', 'fixture:cloneLegacyProjection', { id: projected.projectionId, cohortDigest: sha('a') });
 assert.equal((await f.compare(sha('d'))).status, 'NO_GO');
 await assert.rejects(f.compare(sha('a')), /snapshot/);
 record('legacy snapshots block only their selected cohort', { passed: true });
 await clear(success.receiptId);
 await assert.rejects(f.project(sha('d')), /snapshot/);
 record('missing receipt snapshot prevents invented projection identity', { passed: true });
 for (const kind of ['missing', 'corrupted']) {
   const x = await chain(), first = await x.persist(1);
   if (kind === 'missing') await clear(first.intentId);
   else { const row = await get(first.intentId); await patch(first.intentId, { immutableSnapshot: { ...row.immutableSnapshot, intentId: 'changed-canonical-id' } }); }
   await assert.rejects(x.claim(first.intentId), /snapshot/);
   assert.equal((await get(first.intentId)).state, 'PERSISTED');
   record(kind + ' frozen intent cannot claim', { passed: true });
 }
 {
   const x = await chain({ leaseExpiresAt: Date.now() + 1500 }), first = await x.persist(1);
   await x.claim(first.intentId);
   await delay(1700);
   const receipt = await x.append(await x.receiptArgs(first.intentId, true));
   assert.equal(receipt.created, true);
   record('late receipt survives frozen lease expiry using committed claim time', { passed: true });
 }
async function dispatchChain() {
  const f = await api('mutation', 'fixture:seedDispatch', {});
  const reservation = await reserve(f.args);
  const intent = await api('mutation', 'gateway:persistIntentInternal', {
    workflowRunId: f.args.workflowRunId, reservationId: reservation.reservationId,
    logicalRequestKey: f.args.logicalRequestKey, physicalOrdinal: 1,
    route: f.args.primaryRoute, requestDigest: sha('f'), intentKey: 'dispatch-intent:' + f.args.workflowRunId,
  });
  const claimArgs = { workflowRunId: f.args.workflowRunId, intentId: intent.intentId,
    leaseId: f.args.leaseId, claimId: 'dispatch-claim:' + intent.intentId,
    dispatch: { contract: 'classify-text/v1', payloadBytes: 200, maximumOutputTokens: 1024 } };
  return { ...f, reservation, intent, claimArgs,
    claim: () => api('mutation', 'gateway:claimIntentInternal', claimArgs) };
}
{
  const f = await dispatchChain();
  const frozen = (await get(f.reservation.reservationId)).immutableSnapshot;
  const results = await Promise.all(Array.from({ length: 8 }, () => f.claim()));
  const granted = results.filter(result => result.claimed);
  assert.equal(granted.length, 1);
  assert.ok(results.filter(result => !result.claimed).every(result => !result.dispatchAllowance));
  const stored = await get(f.intent.intentId);
  assert.deepEqual(stored.dispatchAllowance, granted[0].dispatchAllowance);
  const { digest, ...bytes } = stored.dispatchAllowance;
  assert.equal(canonicalDigest('classify-inference-dispatch/v1', bytes), digest);
  assert.equal(bytes.intentLogicalId, stored.immutableSnapshot.intentId);
  assert.equal(bytes.reservationLogicalId, frozen.reservationId);
  assert.equal(bytes.maximumInputTokens, 128_000);
  assert.equal(bytes.maximumCacheReadTokens, 128_000);
  assert.equal(bytes.maximumOutputTokens, 1024);
  assert.equal(bytes.temperature, null);
  assert.ok(bytes.validUntil <= bytes.issuedAt + 30_000);
  assert.deepEqual((await get(f.reservation.reservationId)).immutableSnapshot, frozen);
  record('real durable selected allowance and eight-way concurrent claim', { passed: true, granted: 1, denied: 7, canonicalRoundtrip: true });
}
for (const fault of ['revision', 'profile', 'worker', 'factory', 'qualification', 'price', 'parameters', 'budget', 'cancel']) {
  const f = await dispatchChain();
  switch (fault) {
    case 'revision': await patch(f.args.workOrderId, { currentRevisionNumber: 2 }); break;
    case 'profile': await patch(f.args.executionProfileId, { enabled: false }); break;
    case 'worker': await patch(f.hostId, { workerRuntime: { sessionId: 'new-session', generation: 2 } }); break;
    case 'factory': await patch(f.args.workflowRunId, { factoryConfigurationDigest: sha('a') }); break;
    case 'qualification': await patch(f.args.workflowRunId, { executionProfileQualificationDigest: sha('a') }); break;
    case 'price': await patch(f.args.priceBookId, { state: 'RETIRED' }); break;
    case 'parameters': f.claimArgs.dispatch.maximumOutputTokens = 512; break;
    case 'budget': await patch(f.args.workOrderId, { metadata: { implementationPolicy: { maxCostUsd: 0.2 } } }); break;
    case 'cancel': await patch(f.args.workflowRunId, { cancellationRequestedAt: Date.now() }); break;
  }
  if (fault === 'cancel') assert.equal((await f.claim()).claimed, false);
  else await assert.rejects(f.claim());
  const stored = await get(f.intent.intentId);
  assert.notEqual(stored.state, 'CLAIMED');
  assert.equal(stored.dispatchAllowance, undefined);
  assert.equal((await get(f.reservation.reservationId)).maxCostMicrousd, 300_000);
  record('real selected dispatch denies ' + fault + ' and retains allocation', { passed: true });
}

 const browserFixtures = await runObservationScenarios({ api, get, patch, all, chain, dispatchChain, reserve, seed, list, record, sha, canonicalDigest, liabilityDigest, delay });
 if (withPersistedBrowser) {
   assert.ok(existsSync(browserCallbackPath), 'The requested persisted-browser callback is unavailable');
   const fixturePath = path.join(runRoot, 'persisted-browser-fixtures.json');
   writeFileSync(fixturePath, JSON.stringify({ backendUrl: url, fixtures: browserFixtures }, null, 2));
   const callbackHash = hash(readFileSync(browserCallbackPath));
   // Public fixture-authorized queries need no administrative credentials.
   // Do not inherit the backend/CLI environment into the browser callback.
   const callback = await new Promise((resolve, reject) => {
     const child = spawn(process.execPath, [browserCallbackPath, fixturePath], {
       cwd: '/private/tmp', env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR,
         NODE_OPTIONS: '--import=/private/tmp/fdlc-observation-authority-harness/loopback-only.mjs' },
       stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
     });
     let output = '';
     child.stdout.on('data', data => { output += data; });
     child.stderr.on('data', data => { output += data; });
     child.once('error', reject);
     child.once('close', (code, signal) => resolve({ code, signal, output: redact(output) }));
   });
   writeFileSync(path.join(runRoot, 'persisted-browser-callback.log'), callback.output);
   report.persistedBrowser = { requested: true, callbackPath: browserCallbackPath, callbackSha256: callbackHash,
     fixturePath, reportPath: path.join(runRoot, 'persisted-browser/report.json'),
     fixtureCount: browserFixtures.length, exitCode: callback.code, signal: callback.signal,
     callbackSourceUnchanged: hash(readFileSync(browserCallbackPath)) === callbackHash };
   assert.equal(callback.code, 0, 'Persisted browser callback failed; see retained callback log');
   assert.ok(report.persistedBrowser.callbackSourceUnchanged, 'Persisted browser callback source changed during proof');
 } else report.persistedBrowser = { requested: false };
 assert.ok(sourcesUnchanged(), 'Bundled production source changed during proof');
 report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.error = redact(error?.stack ?? error); process.exitCode = 1; }
finally {
 backend.kill('SIGTERM');
 await Promise.race([new Promise(resolve => backend.once('close', resolve)), delay(10000)]);
 if (backend.exitCode === null && backend.signalCode === null) { backend.kill('SIGKILL'); await new Promise(resolve => backend.once('close', resolve)); }
 await new Promise(resolve => backendLog.end(redact(backendOutput), resolve));
 const reachable = async port => await new Promise(resolve => { const socket = net.createConnection({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); });
 report.cleanup = { backendExitCode: backend.exitCode, backendSignal: backend.signalCode, cloudPortClosed: !(await reachable(cloudPort)), sitePortClosed: !(await reachable(sitePort)), originalDatabasesUsed: false, ephemeralKeyPersisted: false, sourceUnchanged: sourcesUnchanged() };
 if (!report.cleanup.cloudPortClosed || !report.cleanup.sitePortClosed || !report.cleanup.sourceUnchanged) { report.status = 'FAIL'; report.error = [report.error, 'Cleanup or exact source binding failed'].filter(Boolean).join('\n'); process.exitCode = 1; }
 report.completedAt = new Date().toISOString();
 writeFileSync(path.join(runRoot, 'report.json'), JSON.stringify(report, null, 2));
 console.log(JSON.stringify({ status: report.status, passedTests: report.tests.filter(t => t.passed).length, runRoot, sourceSha256: report.sourceSha256, cleanup: report.cleanup, error: report.error }, null, 2));
}

process.exit(process.exitCode ?? 0);
