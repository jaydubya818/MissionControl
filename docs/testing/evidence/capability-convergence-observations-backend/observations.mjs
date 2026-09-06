import assert from 'node:assert/strict';

// All provider observations below are synthetic input to real Convex handlers.
// No transport is instantiated and no external provider is contacted.
export async function runObservationScenarios(c) {
  const { api, get, patch, all, chain, reserve, seed, list, record, sha,
    canonicalDigest, liabilityDigest, delay } = c;
  const browserFixtures = [];
  const mutate = (fn, args) => api('mutation', fn, args);
  const zeroUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
  const canonicalReceipt = async id => {
    const row = await get(id), snapshot = row.immutableSnapshot;
    const { receiptDigest, ...bytes } = snapshot;
    assert.equal(canonicalDigest(snapshot.schema, bytes), receiptDigest);
    assert.equal(row.receiptDigest, receiptDigest);
    return { row, snapshot };
  };
  const spendingDenied = async action => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, action));
    assert.ok(results.every(result => result.status === 'rejected'
      ? /SPENDING_FENCED/.test(String(result.reason)) : result.value.claimed === false));
  };
  async function observedChain(overrides = {}) {
    const f = await chain(overrides), intent = await f.persist(1);
    assert.equal((await f.claim(intent.intentId)).claimed, true);
    const claimed = await get(intent.intentId);
    const args = { workflowRunId: f.args.workflowRunId, intentId: intent.intentId,
      resolvedProvider: f.args.primaryRoute.provider, resolvedModelId: f.args.primaryRoute.modelId,
      providerRequestId: 'observed:' + intent.intentId, responseDigest: sha('c'),
      delivery: 'DELIVERED', status: 'SUCCEEDED', usage: { ...zeroUsage, inputTokens: 1, outputTokens: 1 },
      startedAt: claimed.claimedAt, completedAt: Date.now() };
    return { ...f, intent, observation: args, observe: changed => f.append({ ...args, ...changed }) };
  }

  for (const [dimension, code] of [
    ['inputTokens', 'INPUT'], ['outputTokens', 'OUTPUT'], ['cacheReadTokens', 'CACHE_READ'],
    ['cacheWriteTokens', 'CACHE_WRITE'], ['reasoningTokens', 'REASONING'],
  ]) {
    const f = await observedChain(), usage = { ...zeroUsage, [dimension]: 2 };
    const receipt = await f.observe({ usage }), { snapshot } = await canonicalReceipt(receipt.receiptId);
    assert.equal(snapshot.schema, 'inference-physical-receipt/v3');
    assert.deepEqual(snapshot.usage, usage);
    assert.ok(snapshot.violationCodes.includes(`RESERVATION_${code}_TOKEN_LIMIT_EXCEEDED`));
    assert.equal(snapshot.responseDigest, sha('c'));
    const wo = await get(f.args.workOrderId);
    assert.equal(wo.inferenceSpendingFence.receiptId, receipt.receiptId);
    assert.equal(wo.inferenceSpendingFence.sourceDigest, receipt.receiptDigest);
    assert.equal((await get(f.reservation.reservationId)).immutableSnapshot.maxCostMicrousd, 100);
    record('v3 stores ' + dimension + ' overrun atomically with spending fence', {
      passed: true, receiptId: receipt.receiptId, receiptDigest: receipt.receiptDigest,
      retainedCounters: snapshot.usage, violationCodes: snapshot.violationCodes,
    });
  }
  for (const [field, value, code] of [
    ['resolvedProvider', 'different-provider', 'RESOLVED_PROVIDER_DRIFT'],
    ['resolvedModelId', 'different-model', 'RESOLVED_MODEL_DRIFT'],
  ]) {
    const f = await observedChain();
    const receipt = await f.observe({ [field]: value }), { snapshot } = await canonicalReceipt(receipt.receiptId);
    assert.equal(snapshot[field], value);
    assert.equal(snapshot.costMicrousd, undefined);
    assert.equal(snapshot.costCompleteness, 'UNKNOWN');
    assert.equal(snapshot.costClassification, 'UNKNOWN');
    assert.ok(snapshot.violationCodes.includes(code));
    record('v3 retains ' + field + ' drift without requested-route pricing', {
      passed: true, receiptDigest: snapshot.receiptDigest, classification: snapshot.costClassification,
    });
  }
  {
    const f = await observedChain({ maxCostMicrousd: 50 });
    // The incident must fence an intent that was already persisted elsewhere in
    // the same WorkOrder, without deleting either immutable monetary allocation.
    const second = await reserve({ ...f.args, maxCostMicrousd: 50,
      logicalRequestKey: 'pending:' + f.args.workflowRunId, registrationIdempotencyKey: 'pending' });
    const pending = await mutate('gateway:persistIntentInternal', { workflowRunId: f.args.workflowRunId,
      reservationId: second.reservationId, logicalRequestKey: 'pending:' + f.args.workflowRunId,
      physicalOrdinal: 1, route: f.args.primaryRoute, requestDigest: sha('d'), intentKey: 'pending' });
    const originals = (await list(f.args.workOrderId)).map(row => row.immutableSnapshot);
    // Mutating a duplicated ceiling cannot enlarge the frozen allocation.
    await patch(f.reservation.reservationId, { maxCostMicrousd: 10_000 });
    const receipt = await f.observe({ usage: { ...zeroUsage, inputTokens: 51 } });
    const { snapshot } = await canonicalReceipt(receipt.receiptId);
    assert.equal(snapshot.costMicrousd, 51);
    assert.equal(snapshot.costClassification, 'ESTIMATED');
    assert.ok(snapshot.violationCodes.includes('RESERVATION_COST_LIMIT_EXCEEDED'));
    await spendingDenied(() => mutate('gateway:claimIntentInternal', { workflowRunId: f.args.workflowRunId,
      intentId: pending.intentId, leaseId: f.args.leaseId, claimId: 'pending-claim' }));
    await assert.rejects(reserve({ ...f.args, registrationIdempotencyKey: 'after-fence',
      logicalRequestKey: 'after-fence' }), /SPENDING_FENCED/);
    await assert.rejects(f.persist(2, f.intent.intentId), /SPENDING_FENCED/);
    assert.deepEqual((await list(f.args.workOrderId)).map(row => row.immutableSnapshot), originals);
    const economics = await api('query', 'gateway:getAttemptEconomics', { workflowRunId: f.args.workflowRunId });
    assert.equal(economics.inferenceSpendingFence.sourceDigest, receipt.receiptDigest);
    record('canonical cost ceiling and incident fence deny eight existing-intent claims plus new admission', {
      passed: true, successfulSubsequentClaims: 0, retainedAllocationCount: originals.length,
      retainedAllocationMicrousd: originals.reduce((sum, value) => sum + value.maxCostMicrousd, 0),
    });
  }
  {
    const f = await observedChain();
    const first = await f.observe({ delivery: 'NOT_DELIVERED', status: 'FAILED' });
    const original = (await get(first.receiptId)).immutableSnapshot;
    assert.deepEqual(original.violationCodes, []);
    const fallback = await f.persist(2, f.intent.intentId);
    await f.claim(fallback.intentId);
    // Duplicated usage/cost are not accounting evidence.
    await patch(first.receiptId, { usage: { ...zeroUsage }, costMicrousd: 0 });
    const observed = await f.receiptArgs(fallback.intentId, false);
    const results = await Promise.all(Array.from({ length: 8 }, () => f.append(observed)));
    assert.equal(results.filter(r => r.created).length, 1);
    const { snapshot } = await canonicalReceipt(results[0].receiptId);
    assert.ok(snapshot.violationCodes.includes('RESERVATION_INPUT_TOKEN_LIMIT_EXCEEDED'));
    assert.ok(snapshot.violationCodes.includes('RESERVATION_OUTPUT_TOKEN_LIMIT_EXCEEDED'));
    assert.deepEqual((await get(first.receiptId)).immutableSnapshot, original);
    assert.equal((await all('inferencePhysicalReceipts')).filter(r => r.reservationId === f.reservation.reservationId).length, 2);
    record('cumulative v3 usage ignores row drift and eight concurrent appends store one receipt', {
      passed: true, originalReceiptDigest: original.receiptDigest, createdReceipts: 1, exactDuplicates: 7,
      cumulativeInputTokens: original.usage.inputTokens + snapshot.usage.inputTokens,
    });
  }
  {
    const f = await observedChain({ maxCostMicrousd: 2 });
    await f.observe({ delivery: 'NOT_DELIVERED', status: 'FAILED' });
    const next = await f.persist(2, f.intent.intentId); await f.claim(next.intentId);
    const receipt = await f.append(await f.receiptArgs(next.intentId, false));
    const { snapshot } = await canonicalReceipt(receipt.receiptId);
    assert.ok(snapshot.violationCodes.includes('RESERVATION_COST_LIMIT_EXCEEDED'));
    assert.equal(snapshot.costMicrousd, 2);
    assert.equal((await get(f.reservation.reservationId)).immutableSnapshot.maxCostMicrousd, 2);
    record('cumulative observed cost exceeds retained reservation without clipping', { passed: true, secondCostMicrousd: 2, maximumCostMicrousd: 2 });
  }
  {
    const f = await observedChain({ maxCostMicrousd: 50 });
    const second = await reserve({ ...f.args, maxCostMicrousd: 50, logicalRequestKey: 'concurrent-second', registrationIdempotencyKey: 'concurrent-second' });
    const intent = await mutate('gateway:persistIntentInternal', { workflowRunId: f.args.workflowRunId,
      reservationId: second.reservationId, logicalRequestKey: 'concurrent-second', physicalOrdinal: 1,
      route: f.args.primaryRoute, requestDigest: sha('b'), intentKey: 'concurrent-second' });
    await f.claim(intent.intentId);
    const row = await get(intent.intentId), originalAllocations = (await list(f.args.workOrderId)).map(r => r.immutableSnapshot);
    const results = await Promise.all([
      f.observe({ usage: { ...zeroUsage, inputTokens: 51 } }),
      f.append({ ...f.observation, intentId: intent.intentId, providerRequestId: 'second:' + intent.intentId,
        usage: { ...zeroUsage, outputTokens: 51 }, startedAt: row.claimedAt, completedAt: Date.now() }),
    ]);
    assert.equal(results.filter(r => r.created).length, 2);
    const workOrder = await get(f.args.workOrderId);
    assert.ok(results.some(r => r.receiptDigest === workOrder.inferenceSpendingFence.sourceDigest
      && r.receiptId === workOrder.inferenceSpendingFence.receiptId));
    assert.deepEqual((await list(f.args.workOrderId)).map(r => r.immutableSnapshot), originalAllocations);
    for (const result of results) assert.ok((await canonicalReceipt(result.receiptId)).snapshot.violationCodes.length > 0);
    record('two previously claimed concurrent overruns both persist and retain one atomic incident fence', {
      passed: true, retainedObservations: 2, fenceSourceDigest: workOrder.inferenceSpendingFence.sourceDigest,
    });
  }
  for (const mode of ['overflow', 'missing-price']) {
    const f = await seed();
    await mutate('fixture:repriceFixture', { priceBookId: f.args.priceBookId,
      changes: mode === 'overflow' ? { inputMicrousdPerMillionTokens: Number.MAX_SAFE_INTEGER } : {},
      ...(mode === 'missing-price' ? { omitCachePrice: true } : {}) });
    await patch(f.args.workOrderId, { metadata: { implementationPolicy: { maxCostUsd: 20_000 } } });
    const reservation = await reserve({ ...f.args, maxCacheReadTokens: 0, maxCostMicrousd: 20_000_000_000 });
    const intent = await mutate('gateway:persistIntentInternal', { workflowRunId: f.args.workflowRunId,
      reservationId: reservation.reservationId, logicalRequestKey: f.args.logicalRequestKey,
      physicalOrdinal: 1, route: f.args.primaryRoute, requestDigest: sha('f'), intentKey: 'unpriced' });
    await mutate('gateway:claimIntentInternal', { workflowRunId: f.args.workflowRunId,
      intentId: intent.intentId, leaseId: f.args.leaseId, claimId: 'unpriced-claim:' + intent.intentId });
    const row = await get(intent.intentId), usage = { ...zeroUsage,
      ...(mode === 'overflow' ? { inputTokens: Number.MAX_SAFE_INTEGER } : { cacheReadTokens: 1 }) };
    const result = await mutate('gateway:appendReceiptInternal', { workflowRunId: f.args.workflowRunId,
      intentId: intent.intentId, resolvedProvider: f.args.primaryRoute.provider, resolvedModelId: f.args.primaryRoute.modelId,
      providerRequestId: 'unknown-price:' + intent.intentId, usage, delivery: 'DELIVERED', status: 'SUCCEEDED',
      startedAt: row.claimedAt, completedAt: Date.now() });
    const { snapshot } = await canonicalReceipt(result.receiptId);
    assert.deepEqual(snapshot.usage, usage);
    assert.equal(snapshot.costMicrousd, undefined);
    assert.equal(snapshot.costClassification, 'UNKNOWN');
    assert.ok(snapshot.violationCodes.includes('REQUESTED_ROUTE_COST_UNKNOWN'));
    record('v3 stores ' + mode + ' observation with absent unknown cost', { passed: true, receiptDigest: snapshot.receiptDigest });
  }
  {
    const f = await observedChain();
    for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(f.observe({ usage: { ...zeroUsage, inputTokens: invalid } }), /safe integer/);
    }
    assert.equal((await all('inferencePhysicalReceipts')).filter(r => r.intentId === f.intent.intentId).length, 0);
    assert.equal((await get(f.intent.intentId)).state, 'CLAIMED');
    assert.equal((await get(f.args.workOrderId)).inferenceSpendingFence, undefined);
    record('malformed observed counters are rejected without an invented receipt', { passed: true, negativeCases: 3 });
  }
  {
    const f = await observedChain();
    const receipt = await f.observe({});
    await mutate('fixture:historicalV2', { receiptId: receipt.receiptId });
    const { snapshot } = await canonicalReceipt(receipt.receiptId);
    assert.equal(snapshot.schema, 'inference-physical-receipt/v2');
    const replay = await f.observe({});
    assert.equal(replay.created, false); assert.equal(replay.receiptDigest, snapshot.receiptDigest);
    await f.project(sha('a'));
    assert.deepEqual((await get(receipt.receiptId)).immutableSnapshot, snapshot);
    await assert.rejects(f.observe({ responseDigest: sha('d') }), /immutable history/);
    record('historical v2 storage replays and projects without rewriting old bytes', { passed: true, historicalReceiptDigest: snapshot.receiptDigest });
  }
  {
    const f = await observedChain(), receipt = await f.observe({});
    const base = { workflowRunId: f.args.workflowRunId, receiptId: receipt.receiptId,
      providerEventId: 'invalid-correction:' + receipt.receiptId, providerRequestId: f.observation.providerRequestId,
      completeness: 'PARTIAL', sourceDigest: sha('d'), reconciledBy: 'synthetic-service' };
    for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(mutate('gateway:appendReconciliationInternal', { ...base, observedUsage: { inputTokens: invalid } }), /safe integer/);
      await assert.rejects(mutate('gateway:appendReconciliationInternal', { ...base, observedCostMicrousd: invalid }), /cost is invalid/);
    }
    assert.equal((await all('inferenceReconciliations')).filter(r => r.receiptId === receipt.receiptId).length, 0);
    record('invalid reconciliation counters and costs cannot enter durable accounting', { passed: true, deniedCases: 6 });
  }

  async function aggregateChain(options = {}) {
    const f = await mutate('fixture:seedBedrock', options.lifetimeMs ? { lifetimeMs: options.lifetimeMs } : {});
    const priceId = await mutate('provider:registerPriceVersion', { projectId: f.projectId,
      price: f.price, registrationKey: 'observation-price' });
    const reservationArgs = { projectId: f.projectId, workOrderId: f.workOrderId,
      executionProfileId: f.profileId, priceId, maximumNanoUsd: 100_000,
      expiresAt: f.expiresAt, maximumRequests: 4, idempotencyKey: 'observation-aggregate' };
    const reservationId = await mutate('provider:createReservation', reservationArgs);
    const request = { reservationId, workflowRunId: f.workflowRunId, leaseId: 'observation-lease', generation: 1,
      requestId: 'request:' + f.workflowRunId, requestDigest: sha('f'), payloadBytes: 200, outputTokens: 10,
      bridgeIdentity: f.bridgeIdentity };
    const usage = { requestId: request.requestId, requestDigest: request.requestDigest,
      provider: f.price.provider, model: f.price.model, providerRequestId: 'provider:' + f.workflowRunId,
      usageId: 'usage:' + f.workflowRunId, inputTokens: 3, outputTokens: 2,
      classification: 'ACTUAL', expectedReceiptRevision: 0 };
    const settleArgs = { reservationId, workflowRunId: f.workflowRunId, leaseId: request.leaseId, generation: 1, usage };
    return { ...f, priceId, reservationId, reservationArgs, request, usage, settleArgs,
      reserve: changed => mutate('provider:reserveRequestInternal', { ...request, ...changed }),
      settle: changed => mutate('provider:recordUsageInternal', { ...settleArgs, ...changed }) };
  }
  const ownedReceipts = async f => (await all('inferencePhysicalReceipts')).filter(r => r.workflowRunId === f.workflowRunId);
  {
    const f = await observedChain({ maxInputTokens: 2 });
    const receipt = await f.observe({ delivery: 'NOT_DELIVERED', status: 'FAILED', usage: { ...zeroUsage } });
    const correction = { workflowRunId: f.args.workflowRunId, receiptId: receipt.receiptId,
      providerEventId: 'prior-correction:' + receipt.receiptId, providerRequestId: f.observation.providerRequestId,
      observedUsage: { inputTokens: 2 }, observedCostMicrousd: 2, completeness: 'PARTIAL',
      sourceDigest: sha('d'), reconciledBy: 'synthetic-service' };
    const reconciliation = await mutate('gateway:appendReconciliationInternal', correction);
    const stored = await get(reconciliation.reconciliationId);
    assert.deepEqual(stored.observedUsage, { inputTokens: 2 });
    assert.equal(stored.observedUsage.outputTokens, undefined);
    assert.equal((await get(f.args.workOrderId)).inferenceSpendingFence, undefined);
    const fallback = await f.persist(2, f.intent.intentId); await f.claim(fallback.intentId);
    await patch(reconciliation.reconciliationId, { observedUsage: { inputTokens: 0 } });
    const nextArgs = await f.receiptArgs(fallback.intentId, false);
    await assert.rejects(f.append(nextArgs), /Canonical reconciliation history is invalid/);
    await patch(reconciliation.reconciliationId, { observedUsage: stored.observedUsage });
    const next = await f.append(nextArgs), { snapshot } = await canonicalReceipt(next.receiptId);
    assert.ok(snapshot.violationCodes.includes('RESERVATION_INPUT_TOKEN_LIMIT_EXCEEDED'));
    assert.deepEqual((await get(receipt.receiptId)).immutableSnapshot.usage, zeroUsage);
    record('stored corrections enter cumulative limits and tampered correction bytes fail closed', {
      passed: true, originalInputTokens: 0, correctedPriorInputTokens: 2,
      newInputTokens: snapshot.usage.inputTokens, missingOutputCounterPreserved: true,
    });
  }
  {
    const f = await aggregateChain();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => f.reserve({})));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const aggregate = await get(f.reservationId);
    assert.equal(aggregate.snapshot.holds.length, 1);
    const reservations = await list(f.workOrderId);
    assert.equal(reservations.length, 1);
    const intents = (await all('inferencePhysicalIntents')).filter(r => r.workflowRunId === f.workflowRunId);
    assert.equal(intents.length, 1); assert.equal(intents[0].state, 'CLAIMED');
    assert.equal(aggregate.creationDigest, liabilityDigest({ ...aggregate.snapshot, frozen: false, holds: [] }));
    record('real Bedrock composed admission creates one hold and canonical claim under eight concurrent requests', {
      passed: true, successfulAdmissions: 1, deniedAdmissions: 7, maximumHeldNanoUsd: aggregate.snapshot.holds[0].maximumNanoUsd,
      canonicalReservationId: reservations[0]._id, fixtureQualificationOnly: true,
    });
  }
  for (const fault of ['expiry', 'cancel', 'completion', 'replacement', 'worker-rotation', 'profile-revocation', 'retired-book']) {
    const f = await aggregateChain(fault === 'expiry' ? { lifetimeMs: 2500 } : {});
    await f.reserve({});
    const before = await get(f.reservationId);
    if (fault === 'expiry') await delay(Math.max(1, f.expiresAt - Date.now() + 50));
    if (fault === 'cancel') await patch(f.workflowRunId, { cancellationRequestedAt: Date.now() });
    if (fault === 'completion') await patch(f.workflowRunId, { status: 'COMPLETED' });
    if (fault === 'replacement') await patch(f.workOrderId, { currentExecutionRunId: f.replacementRunId, currentRevisionNumber: 2 });
    if (fault === 'worker-rotation') await patch(f.hostId, { workerRuntime: { sessionId: 'rotated', generation: 2 } });
    if (fault === 'profile-revocation') await patch(f.profileId, { enabled: false });
    if (fault === 'retired-book') await patch(f.priceBookId, { state: 'RETIRED' });
    const runBefore = await get(f.workflowRunId);
    const results = await Promise.all(Array.from({ length: 8 }, () => f.settle({})));
    assert.equal(results.filter(r => !r.duplicate).length, 1);
    assert.ok(results.every(r => !r.incident));
    const after = await get(f.reservationId), receipts = await ownedReceipts(f);
    assert.equal(receipts.length, 1);
    const { snapshot } = await canonicalReceipt(receipts[0]._id);
    assert.deepEqual(snapshot.usage, { inputTokens: 3, outputTokens: 2 });
    assert.equal(snapshot.costMicrousd, 5); assert.equal(snapshot.schema, 'inference-physical-receipt/v3');
    assert.equal(after.snapshot.holds[0].state, 'SETTLED');
    assert.equal(after.snapshot.holds[0].accountedNanoUsd, 5000);
    assert.equal(after.snapshot.holds[0].maximumNanoUsd, before.snapshot.holds[0].maximumNanoUsd);
    assert.equal(after.snapshot.maximumNanoUsd, before.snapshot.maximumNanoUsd);
    assert.equal(after.creationDigest, before.creationDigest);
    assert.deepEqual(await get(f.workflowRunId), runBefore);
    await assert.rejects(f.reserve({ requestId: 'later:' + f.workflowRunId, requestDigest: sha('a') }));
    assert.equal((await get(f.reservationId)).snapshot.holds.length, 1);
    record('first composed settlement after ' + fault + ' is historical and idempotent, without new spending authority', {
      passed: true, createdSettlements: 1, exactDuplicates: 7, receiptDigest: snapshot.receiptDigest,
      retainedMaximumNanoUsd: before.snapshot.holds[0].maximumNanoUsd,
    });
  }
  {
    const f = await aggregateChain(); await f.reserve({});
    const before = await get(f.reservationId);
    for (const changes of [{ workflowRunId: f.replacementRunId }, { leaseId: 'other-lease' }, { generation: 2 },
      { usage: { ...f.usage, requestDigest: sha('b') } }, { usage: { ...f.usage, requestId: 'other-request' } }]) {
      await assert.rejects(f.settle(changes), /scope mismatch|Attempt mismatch/);
    }
    for (const [id, changed] of [
      [f.workflowRunId, { executionProfileDigest: sha('b') }],
      [f.workflowRunId, { workOrderRevisionNumber: 2 }],
      [f.reservationId, { creationDigest: sha('b') }],
      [f.reservationId, { snapshot: { ...before.snapshot, maximumNanoUsd: 200_000 } }],
      [f.priceId, { snapshot: { ...f.price, inputNanoUsdPerToken: 2000 } }],
    ]) {
      const original = await get(id);
      await patch(id, changed); await assert.rejects(f.settle({}), /scope mismatch|price identity mismatch/);
      const restore = Object.fromEntries(Object.keys(changed).map(key => [key, original[key]]));
      await patch(id, restore);
    }
    assert.deepEqual((await get(f.reservationId)).snapshot, before.snapshot);
    assert.equal((await ownedReceipts(f)).length, 0);
    await f.settle({});
    await assert.rejects(f.settle({ usage: { ...f.usage, inputTokens: 4 } }), /REVISION_CONFLICT/);
    await assert.rejects(f.settle({ usage: { ...f.usage, providerRequestId: 'changed-provider-id' } }), /IDENTITY_CHANGED/);
    record('historical settlement rejects scope, lease, generation, request, creation, price and conflicting replay substitutions', {
      passed: true, deniedHistoricalSubstitutions: 10, deniedReceiptConflicts: 2,
    });
  }
  {
    const first = await aggregateChain(); await first.reserve({}); await first.settle({});
    const second = await aggregateChain(); await second.reserve({});
    const original = await get(second.reservationId);
    for (const collision of [{ providerRequestId: first.usage.providerRequestId }, { usageId: first.usage.usageId }]) {
      await assert.rejects(second.settle({ usage: { ...second.usage, ...collision } }), /PROVIDER_RECEIPT_ALREADY_OWNED/);
    }
    assert.deepEqual((await get(second.reservationId)).snapshot, original.snapshot);
    assert.equal((await ownedReceipts(second)).length, 0);
    record('provider request and usage identities cannot settle another reservation', { passed: true, deniedOwnershipCollisions: 2 });
  }
  {
    const f = await aggregateChain(); await f.reserve({});
    const usage = { ...f.usage, inputTokens: 11, outputTokens: 11 };
    const result = await f.settle({ usage }); assert.equal(result.incident, true);
    const before = await get(f.reservationId), woBefore = await get(f.workOrderId), receipts = await ownedReceipts(f);
    assert.equal(before.snapshot.frozen, true); assert.equal(before.snapshot.holds[0].state, 'OVERRUN');
    const { snapshot } = await canonicalReceipt(receipts[0]._id);
    assert.deepEqual(snapshot.usage, { inputTokens: 11, outputTokens: 11 });
    assert.ok(snapshot.violationCodes.includes('RESERVATION_INPUT_TOKEN_LIMIT_EXCEEDED'));
    assert.ok(snapshot.violationCodes.includes('RESERVATION_COST_LIMIT_EXCEEDED'));
    const correction = { ...f.usage, inputTokens: 1, outputTokens: 1, expectedReceiptRevision: 1 };
    await assert.rejects(mutate('provider:reconcileUsage', { reservationId: f.reservationId, usage: correction, evidenceReference: '' }), /evidence/);
    await assert.rejects(mutate('provider:reconcileUsage', { reservationId: f.reservationId,
      usage: { ...correction, expectedReceiptRevision: 0 }, evidenceReference: 'synthetic correction' }), /REVISION_CONFLICT/);
    await mutate('provider:reconcileUsage', { reservationId: f.reservationId, usage: correction, evidenceReference: 'offline-fixture://bounded-correction' });
    const after = await get(f.reservationId);
    assert.equal(after.snapshot.frozen, true);
    assert.equal(after.snapshot.holds[0].maximumNanoUsd, before.snapshot.holds[0].maximumNanoUsd);
    assert.equal(after.snapshot.maximumNanoUsd, before.snapshot.maximumNanoUsd);
    assert.deepEqual((await get(f.workOrderId)).inferenceSpendingFence, woBefore.inferenceSpendingFence);
    assert.deepEqual((await get(receipts[0]._id)).immutableSnapshot, snapshot);
    await assert.rejects(f.reserve({ requestId: 'after-correction', requestDigest: sha('a') }), /SPENDING_FENCED/);
    await assert.rejects(mutate('provider:createReservation', { ...f.reservationArgs, idempotencyKey: 'after-correction' }), /SPENDING_FENCED/);
    const reconciliations = (await all('inferenceReconciliations')).filter(r => r.receiptId === receipts[0]._id);
    assert.equal(reconciliations.length, 1); assert.deepEqual(reconciliations[0].observedUsage, { inputTokens: 1, outputTokens: 1 });
    record('composed overrun and evidence correction retain original observation, hold, aggregate and monotonic fence', {
      passed: true, originalReceiptDigest: snapshot.receiptDigest, correctionCount: reconciliations.length,
      heldMaximumNanoUsd: after.snapshot.holds[0].maximumNanoUsd,
    });
  }
  {
    const f = await aggregateChain(); await f.reserve({}); await f.settle({});
    const receipt = (await ownedReceipts(f))[0], original = receipt.immutableSnapshot;
    assert.equal(original.costMicrousd, 5);
    const correction = { ...f.usage, model: 'different-model', expectedReceiptRevision: 1 };
    const result = await mutate('provider:reconcileUsage', { reservationId: f.reservationId, usage: correction,
      evidenceReference: 'offline-fixture://wrong-model-observation' });
    assert.equal(result.incident, true);
    const corrections = (await all('inferenceReconciliations')).filter(r => r.receiptId === receipt._id);
    assert.equal(corrections.length, 1);
    assert.equal(corrections[0].completeness, 'UNKNOWN');
    assert.equal(corrections[0].observedCostMicrousd, undefined);
    const projection = await mutate('gateway:createOutcomeProjection', { workflowRunId: f.workflowRunId,
      cohortDigest: sha('a'), routeDigest: f.bridgeIdentity.modelRouteDigest });
    const view = (await get(projection.projectionId)).immutableSnapshot;
    assert.equal(view.costCompleteness, 'UNKNOWN');
    assert.equal(view.totalCostMicrousd, undefined);
    assert.equal(view.knownCostMicrousd, 0);
    assert.deepEqual((await get(receipt._id)).immutableSnapshot, original);
    const aggregate = await get(f.reservationId), workOrder = await get(f.workOrderId);
    assert.equal(aggregate.snapshot.frozen, true);
    assert.equal(aggregate.snapshot.holds[0].costClassification, 'UNKNOWN');
    assert.equal(aggregate.snapshot.holds[0].maximumNanoUsd, 20_000);
    assert.ok(workOrder.inferenceSpendingFence);
    await assert.rejects(f.reserve({ requestId: 'after-unknown-correction', requestDigest: sha('a') }), /SPENDING_FENCED/);
    record('wrong-model correction keeps latest projected money unknown without rewriting original receipt or releasing hold', {
      passed: true, originalCostMicrousd: 5, effectiveMoneyClassification: 'UNKNOWN',
      retainedHoldNanoUsd: aggregate.snapshot.holds[0].maximumNanoUsd, originalReceiptDigest: original.receiptDigest,
    });
  }
  // Both calls are committed before the first observation. This models finite
  // in-flight authority which a later WorkOrder fence cannot retroactively undo.
  async function twoCommittedCalls(separateAttempts = false) {
    const f = await observedChain({ maxCostMicrousd: 50 });
    const workflowRunId = separateAttempts ? f.secondAttemptId : f.args.workflowRunId;
    const key = 'overflow:' + workflowRunId;
    const reservation = await reserve({ ...f.args, workflowRunId, maxCostMicrousd: 50,
      logicalRequestKey: key, registrationIdempotencyKey: key });
    const intent = await mutate('gateway:persistIntentInternal', { workflowRunId,
      reservationId: reservation.reservationId, logicalRequestKey: key, physicalOrdinal: 1,
      route: f.args.primaryRoute, requestDigest: sha('b'), intentKey: key });
    await mutate('gateway:claimIntentInternal', { workflowRunId, intentId: intent.intentId,
      leaseId: f.args.leaseId, claimId: key });
    const row = await get(intent.intentId);
    const secondObservation = { ...f.observation, workflowRunId, intentId: intent.intentId,
      providerRequestId: 'overflow-second:' + intent.intentId, startedAt: row.claimedAt, completedAt: Date.now() };
    return { f, secondObservation, workflowRunId };
  }
  const maximumSafeUsage = { ...zeroUsage, inputTokens: Number.MAX_SAFE_INTEGER };
  {
    const { f, secondObservation } = await twoCommittedCalls();
    const originals = (await list(f.args.workOrderId)).map(r => r.immutableSnapshot);
    const receipts = await Promise.all([f.observe({ usage: maximumSafeUsage }),
      f.append({ ...secondObservation, usage: maximumSafeUsage })]);
    for (const receipt of receipts) assert.equal((await canonicalReceipt(receipt.receiptId)).snapshot.costMicrousd, Number.MAX_SAFE_INTEGER);
    const projection = await f.project(sha('e')), row = await get(projection.projectionId), view = row.immutableSnapshot;
    assert.equal(view.formulaVersion, 'accepted-outcome-economics/v2');
    assert.equal(view.knownCostMicrousd, undefined); assert.equal(view.totalCostMicrousd, undefined);
    assert.equal(view.costCompleteness, 'UNKNOWN'); assert.equal(view.confidence, 'NONE');
    assert.equal(row.knownCostMicrousd, undefined); assert.equal(view.receiptIds.length, 2);
    const { digest, ...bytes } = view; assert.equal(canonicalDigest(view.schema, bytes), digest);
    assert.deepEqual((await list(f.args.workOrderId)).map(r => r.immutableSnapshot), originals);
    const comparison = await f.compare(sha('e'));
    assert.equal(comparison.status, 'NO_GO'); assert.equal(comparison.automaticPromotionAuthorized, false);
    const economics = await api('query', 'gateway:getAttemptEconomics', { workflowRunId: f.args.workflowRunId });
    assert.equal(economics.receipts.length, 2); assert.ok(economics.inferenceSpendingFence);
    assert.equal(economics.latestProjection.costCompleteness, 'UNKNOWN');
    browserFixtures.push({ name: 'aggregate-cost-unknown', workflowRunId: f.args.workflowRunId,
      expected: { spendingStopped: true, unknownAggregate: true, historicalProjection: false } });
    record('aggregate overflow persists an UNKNOWN v2 projection with both canonical receipts and held allocations', {
      passed: true, workflowRunId: f.args.workflowRunId, receiptDigests: receipts.map(r => r.receiptDigest),
      projectionDigest: digest, representedMoney: false, retainedReceiptCount: 2,
    });
  }
  {
    const { f, secondObservation, workflowRunId } = await twoCommittedCalls(true);
    await Promise.all([f.observe({ usage: maximumSafeUsage }), f.append({ ...secondObservation, usage: maximumSafeUsage })]);
    const projections = await Promise.all([f.project(sha('e')),
      mutate('gateway:createOutcomeProjection', { workflowRunId, cohortDigest: sha('e'), routeDigest: f.args.primaryRoute.routeDigest })]);
    for (const projection of projections) {
      const value = (await get(projection.projectionId)).immutableSnapshot;
      assert.equal(value.knownCostMicrousd, Number.MAX_SAFE_INTEGER); assert.equal(value.costCompleteness, 'COMPLETE');
    }
    const compared = await f.compare(sha('e')), comparison = await get(compared.comparisonId);
    assert.equal(compared.status, 'NO_GO'); assert.equal(compared.automaticPromotionAuthorized, false);
    assert.equal(comparison.leftSummary.sampleSize, 2);
    assert.equal(comparison.leftSummary.totalKnownCostMicrousd, undefined);
    assert.equal(comparison.leftSummary.costPerAcceptedOutcomeMicrousd, undefined);
    assert.equal(comparison.leftSummary.confidence, 'NONE');
    assert.equal(comparison.leftSummary.eligibleForPromotion, false);
    assert.ok(comparison.leftSummary.blockers.includes('AGGREGATE_COST_UNKNOWN'));
    record('cohort overflow stores a non-promotable comparison without rounding individually representable projections', {
      passed: true, sampleSize: 2, monetaryBlocker: 'AGGREGATE_COST_UNKNOWN', automaticPromotionAuthorized: false,
    });
  }
  for (const field of ['observedCostMicrousd', 'completeness']) {
    const f = await observedChain(), receipt = await f.observe({});
    const originalReceipt = (await get(receipt.receiptId)).immutableSnapshot;
    const correction = await mutate('gateway:appendReconciliationInternal', {
      workflowRunId: f.args.workflowRunId, receiptId: receipt.receiptId, providerEventId: 'projection-tamper:' + field,
      providerRequestId: f.observation.providerRequestId, observedCostMicrousd: 5, completeness: 'PARTIAL',
      sourceDigest: sha('a'), reconciledBy: 'synthetic-reconciliation-service' });
    const original = await get(correction.reconciliationId);
    await patch(correction.reconciliationId, { [field]: field === 'completeness' ? 'COMPLETE' : 1 });
    await assert.rejects(f.project(sha('e')), /Canonical reconciliation history is invalid/);
    assert.equal((await all('factoryOutcomeProjections')).filter(r => r.workflowRunId === f.args.workflowRunId).length, 0);
    assert.deepEqual((await get(receipt.receiptId)).immutableSnapshot, originalReceipt);
    assert.equal((await get(correction.reconciliationId)).reconciliationDigest, original.reconciliationDigest);
    await patch(correction.reconciliationId, { [field]: original[field] });
    const projection = await f.project(sha('e')), view = (await get(projection.projectionId)).immutableSnapshot;
    assert.equal(view.knownCostMicrousd, 5); assert.equal(view.costCompleteness, 'PARTIAL');
    assert.equal(view.reconciliationIds.length, 1);
    record('projection rejects raw reconciliation ' + field + ' tamper and accepts exact restored canonical bytes', {
      passed: true, originalReconciliationDigest: original.reconciliationDigest, projectedKnownCostMicrousd: 5,
    });
  }
  {
    const { f, secondObservation } = await twoCommittedCalls();
    await f.observe({});
    const projected = await f.project(sha('e')), originalProjection = (await get(projected.projectionId)).immutableSnapshot;
    assert.equal(originalProjection.costCompleteness, 'COMPLETE'); assert.equal(originalProjection.knownCostMicrousd, 2);
    const overrun = await f.append({ ...secondObservation, usage: { ...zeroUsage, inputTokens: 51 } });
    const economics = await api('query', 'gateway:getAttemptEconomics', { workflowRunId: f.args.workflowRunId });
    assert.equal(economics.inferenceSpendingFence.receiptId, overrun.receiptId);
    assert.equal(economics.receipts.length, 2);
    assert.deepEqual(economics.latestProjection.immutableSnapshot, originalProjection);
    browserFixtures.push({ name: 'spending-fence-with-older-projection', workflowRunId: f.args.workflowRunId,
      expected: { spendingStopped: true, unknownAggregate: false, historicalProjection: true } });
    record('stored WorkOrder fence remains visible beside an unchanged older complete projection', {
      passed: true, workflowRunId: f.args.workflowRunId, oldProjectionDigest: originalProjection.digest,
      newObservationDigest: overrun.receiptDigest,
    });
  }
  return browserFixtures;
}
