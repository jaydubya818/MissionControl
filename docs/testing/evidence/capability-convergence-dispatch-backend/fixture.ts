import { classifyAuthorityRecords } from "/private/tmp/fdlc-program-dispatch/convex/__tests__/helpers/classifyAuthority.fixture.ts";
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
    effectiveFrom: price.effectiveFrom, effectiveUntil: price.effectiveUntil, immutableSnapshot: price, priceBookDigest: price.digest });
  return { hostId, factoryVersionId, modelCatalogId, args: { projectId, workOrderId, taskId, workflowRunId,
    executionProfileId: profileId, executionProfileDigest: records.profile.profileDigest,
    primaryRoute: route, allowedFallbacks: [], maxPhysicalCalls: 1, maxInputTokens: 128_000,
    maxOutputTokens: 1024, maxCacheReadTokens: 128_000, maxCacheWriteTokens: 0, maxReasoningTokens: 0,
    maxCostMicrousd: 300_000, logicalRequestKey: 'fixture-dispatch:' + workflowRunId,
    deadlineAt: now + 60_000, priceBookId, policyDigest: records.runBindings.executionManifestDigest,
    leaseId: 'dispatch-lease', leaseExpiresAt: now + 60_000, registrationIdempotencyKey: 'fixture-dispatch-registration' } };
} });
