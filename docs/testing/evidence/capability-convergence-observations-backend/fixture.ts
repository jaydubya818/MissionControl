import { classifyAuthorityRecords } from "/private/tmp/fdlc-program-observations/convex/__tests__/helpers/classifyAuthority.fixture.ts";
import { bedrockAuthorityRecords } from "/private/tmp/fdlc-observation-authority-harness/bedrockAuthority.ts";
import { liabilityDigest } from "/private/tmp/fdlc-program-observations/convex/lib/providerLiability.ts";
import { canonicalDigest } from "/private/tmp/fdlc-program-observations/packages/shared/src/canonicalDigest.ts";
export const seedDispatch = mutation({ args: {}, handler: async ctx => {
  const now = Date.now();
  const projectId = await ctx.db.insert('projects', { fixtureOnly: true });
  const repositoryId = await ctx.db.insert('workspaceRepositories', { projectId });
  const workOrderId = await ctx.db.insert('workOrders', { projectId, repositoryId,
    approvalStatus: 'APPROVED', currentRevisionNumber: 1, metadata: { implementationPolicy: { maxCostUsd: 1 } } });
  const taskId = await ctx.db.insert('tasks', { projectId });
  const profileId = await ctx.db.insert('factoryExecutionProfiles', { projectId });
  const modelCatalogId = await ctx.db.insert('modelCatalog', { projectId });
  const factoryVersionId = await ctx.db.insert('factoryDefinitionVersions', { projectId });
  const workflowRunId = await ctx.db.insert('workflowRuns', { projectId });
  const hostId = await ctx.db.insert('workspaceHostBindings', { projectId, hostId: 'fixture-worker',
    workerRuntime: { sessionId: 'fixture-session', generation: 1 } });
  const records = classifyAuthorityRecords({ projectId, repositoryId, profileId, modelCatalogId,
    now, workOrderId, taskId, attemptId: workflowRunId, factoryVersionId });
  await ctx.db.patch(profileId, records.profile);
  await ctx.db.patch(modelCatalogId, records.modelRoute);
  await ctx.db.patch(factoryVersionId, records.versionBindings);
  await ctx.db.patch(workflowRunId, { ...records.runBindings, parentTaskId: taskId, workOrderId,
    workOrderRevisionNumber: 1, status: 'RUNNING', hostBindingId: hostId, factoryDefinitionVersionId: factoryVersionId,
    lease: { leaseId: 'dispatch-lease', expiresAt: now + 60_000,
      workerId: 'fixture-worker', workerSessionId: 'fixture-session', workerGeneration: 1 } });
  await ctx.db.patch(workOrderId, { currentExecutionRunId: workflowRunId });
  const route = { provider: 'openai', providerRoute: 'openai-chat-completions', modelId: 'gpt-4o-mini-2024-07-18',
    routeDigest: records.modelRoute.routeDigest, adapter: 'mission-control-openai-chat-completions',
    adapterVersion: '1.0.0', endpoint: 'https://api.openai.com/v1/chat/completions' };
  const price = inferencePriceBook({ priceBookId: 'dispatch-price', version: 1, currency: 'USD',
    source: { kind: 'OPERATOR_APPROVED', reference: 'synthetic offline', digest: sha('a') },
    effectiveFrom: now - 1000, effectiveUntil: now + 60_000,
    rates: [{ routeDigest: route.routeDigest, inputMicrousdPerMillionTokens: 1_000_000,
      outputMicrousdPerMillionTokens: 1_000_000, cacheReadMicrousdPerMillionTokens: 1_000_000, serviceTier: 'default' }] });
  const priceBookId = await ctx.db.insert('inferencePriceBooks', { projectId, state: 'ACTIVE',
    effectiveFrom: price.effectiveFrom, effectiveUntil: price.effectiveUntil, immutableSnapshot: price, priceBookDigest: price.digest,
    priceBookKey: price.priceBookId, version: price.version, currency: price.currency, sourceKind: price.source.kind,
    sourceReference: price.source.reference, sourceDigest: price.source.digest, rates: price.rates,
    registrationIdempotencyKey: 'dispatch-price', createdBy: 'synthetic-fixture', createdAt: now });
  return { hostId, factoryVersionId, modelCatalogId, args: { projectId, workOrderId, taskId, workflowRunId,
    executionProfileId: profileId, executionProfileDigest: records.profile.profileDigest,
    primaryRoute: route, allowedFallbacks: [], maxPhysicalCalls: 1, maxInputTokens: 128_000,
    maxOutputTokens: 1024, maxCacheReadTokens: 128_000, maxCacheWriteTokens: 0, maxReasoningTokens: 0,
    maxCostMicrousd: 300_000, logicalRequestKey: 'fixture-dispatch:' + workflowRunId,
    deadlineAt: now + 60_000, priceBookId, policyDigest: records.runBindings.executionManifestDigest,
    leaseId: 'dispatch-lease', leaseExpiresAt: now + 60_000, registrationIdempotencyKey: 'fixture-dispatch-registration' } };
} });

// Real allocated IDs and real canonical constructors. Qualification records are
// explicitly synthetic; no service or admission function is mocked here.
export const seedBedrock = mutation({ args: { lifetimeMs: v.optional(v.number()) }, handler: async (ctx, args) => {
  const now = Date.now(), expiresAt = now + (args.lifetimeMs ?? 60_000);
  const projectId = await ctx.db.insert('projects', { fixtureOnly: true });
  const repositoryId = await ctx.db.insert('workspaceRepositories', { projectId });
  const workOrderId = await ctx.db.insert('workOrders', { projectId, repositoryId,
    approvalStatus: 'APPROVED', currentRevisionNumber: 1, metadata: { implementationPolicy: { maxCostUsd: 1 } } });
  const taskId = await ctx.db.insert('tasks', { projectId });
  const profileId = await ctx.db.insert('factoryExecutionProfiles', { projectId });
  const modelCatalogId = await ctx.db.insert('modelCatalog', { projectId });
  const sandboxProfileId = await ctx.db.insert('factorySandboxProfiles', { projectId });
  const factoryVersionId = await ctx.db.insert('factoryDefinitionVersions', { projectId });
  const workflowRunId = await ctx.db.insert('workflowRuns', { projectId });
  const hostId = await ctx.db.insert('workspaceHostBindings', { projectId, hostId: 'observation-worker',
    workerRuntime: { sessionId: 'observation-session', generation: 1 } });
  const records = bedrockAuthorityRecords({ projectId, repositoryId, profileId, modelCatalogId,
    sandboxProfileId, now, workOrderId, taskId, attemptId: workflowRunId, factoryVersionId });
  await ctx.db.patch(profileId, records.profile);
  await ctx.db.patch(modelCatalogId, records.modelRoute);
  await ctx.db.patch(sandboxProfileId, records.sandboxRecord);
  await ctx.db.patch(factoryVersionId, records.versionBindings);
  const runData = { ...records.runBindings, parentTaskId: taskId, workOrderId,
    workOrderRevisionNumber: 1, status: 'RUNNING', hostBindingId: hostId, factoryDefinitionVersionId: factoryVersionId,
    lease: { leaseId: 'observation-lease', expiresAt, workerId: 'observation-worker',
      workerSessionId: 'observation-session', workerGeneration: 1 } };
  await ctx.db.patch(workflowRunId, runData);
  const replacementRunId = await ctx.db.insert('workflowRuns', runData);
  await ctx.db.patch(workOrderId, { currentExecutionRunId: workflowRunId });
  const price = { schema: 'factory-provider-price/v1', provider: 'aws-bedrock', model: 'anthropic.claude-sonnet-4-6',
    api: 'CONVERSE', currency: 'USD', effectiveAt: now - 1000, expiresAt,
    source: 'https://fixture.invalid/observation-price', evidenceDigest: sha('a'),
    inputNanoUsdPerToken: 1000, outputNanoUsdPerToken: 1000,
    maximumInputTokens: 10, maximumOutputTokens: 10, maximumPayloadBytes: 4096,
    inputBound: 'CONSERVATIVELY_BOUNDED', outputIncludesReasoning: true,
    inclusiveCacheWorstCase: true, otherBillableDimensions: 'NONE' };
  const rate = { routeDigest: records.modelRoute.routeDigest,
    inputMicrousdPerMillionTokens: 1_000_000, outputMicrousdPerMillionTokens: 1_000_000,
    cacheReadMicrousdPerMillionTokens: 0, cacheWriteMicrousdPerMillionTokens: 0, reasoningMicrousdPerMillionTokens: 0 };
  const book = inferencePriceBook({ priceBookId: 'observation-price:' + workflowRunId, version: 1, currency: 'USD',
    source: { kind: 'OPERATOR_APPROVED', reference: price.source, digest: price.evidenceDigest },
    effectiveFrom: price.effectiveAt, effectiveUntil: expiresAt, rates: [rate] });
  const priceBookId = await ctx.db.insert('inferencePriceBooks', { projectId, state: 'ACTIVE',
    priceBookKey: book.priceBookId, version: 1, currency: 'USD', sourceKind: book.source.kind,
    sourceReference: book.source.reference, sourceDigest: book.source.digest,
    effectiveFrom: book.effectiveFrom, effectiveUntil: book.effectiveUntil, rates: book.rates,
    immutableSnapshot: book, priceBookDigest: book.digest,
    registrationIdempotencyKey: 'observation-book', createdBy: 'synthetic-fixture', createdAt: now });
  const snapshot = records.profile.immutableSnapshot;
  return { projectId, repositoryId, workOrderId, taskId, profileId, modelCatalogId, sandboxProfileId,
    factoryVersionId, workflowRunId, replacementRunId, hostId, priceBookId, price, expiresAt,
    bridgeIdentity: { schema: 'factory-bedrock-inference/v1', workOrderId, workOrderRevision: 1,
      executionProfileId: profileId, executionProfileDigest: records.profile.profileDigest,
      harnessDigest: snapshot.harness.capabilityManifestDigest, runtimeDigest: snapshot.runtimeArtifact.digest,
      backend: 'remote-sandbox', modelRouteDigest: snapshot.modelRoute.routeDigest,
      priceDigest: liabilityDigest(price), provider: 'aws-bedrock', model: 'anthropic.claude-sonnet-4-6', retryGeneration: 0 } };
} });

// A historical snapshot fixture preserves the exact old v2 representation.
// The current constructor is never asked to rewrite that historical identity.
export const historicalV2 = mutation({ args: { receiptId: v.id('inferencePhysicalReceipts') }, handler: async (ctx, args) => {
  const row = await ctx.db.get(args.receiptId);
  const { costClassification, violationCodes, receiptDigest, ...fields } = row.immutableSnapshot;
  const snapshot = { ...fields, schema: 'inference-physical-receipt/v2' };
  const digest = canonicalDigest(snapshot.schema, snapshot);
  await ctx.db.patch(args.receiptId, { immutableSnapshot: { ...snapshot, receiptDigest: digest },
    receiptDigest: digest, costClassification: undefined, violationCodes: undefined });
  return digest;
} });

export const cloneRun = mutation({ args: { workflowRunId: v.id('workflowRuns'), values: v.any() }, handler: async (ctx, args) => {
  const { _id, _creationTime, ...row } = await ctx.db.get(args.workflowRunId);
  return ctx.db.insert('workflowRuns', { ...row, ...args.values });
} });

export const repriceFixture = mutation({ args: { priceBookId: v.id('inferencePriceBooks'), changes: v.any(), omitCachePrice: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  const row = await ctx.db.get(args.priceBookId);
  const { schema, digest, ...input } = row.immutableSnapshot;
  input.rates = input.rates.map(rate => {
    const updated = { ...rate, ...args.changes };
    if (args.omitCachePrice) delete updated.cacheReadMicrousdPerMillionTokens;
    return updated;
  });
  const book = inferencePriceBook(input);
  await ctx.db.patch(row._id, { immutableSnapshot: book, priceBookDigest: book.digest, rates: book.rates });
} });
