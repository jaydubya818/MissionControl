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
