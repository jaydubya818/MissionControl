import assert from 'node:assert/strict';

// These are the actual assertions in the isolated settlement and gate drills.
// A success label or a count alone cannot satisfy the linked journey prerequisite.
export const settlementControlChecks = [0, 1].flatMap(index => [
  ...['cross-owner', 'cross-tenant', 'anonymous'].flatMap(actor =>
    ['settlement', 'readback', 'release'].map(operation => `${actor}-${operation}-${index}`)),
  ...['stale-reservation-writer', 'other-attempt-response', 'claimed-exposure-cannot-release',
    'missing-tariff', 'changed-tariff', 'changed-manifest', 'missing-cleanup', 'missing-image',
    'truncated-response', 'missing-execution-evidence', 'wrong-lease', 'second-historical-claim']
    .map(name => `${name}-${index}`),
  ...(index === 1 ? ['lost-settlement-ack-restart-readback-1', 'concurrent-recovery-retries-1']
    : ['concurrent-single-settlement-0']),
  `exact-duplicate-retry-${index}`,
]);
export const gateControlChecks = [
  ...['cross-owner', 'cross-tenant', 'anonymous'].map(actor => `${actor}-gate-and-acceptance`),
  ...['stale-work-order-revision', 'wrong-quality-contract', 'weakened-verification-contract',
    'changed-negative-constraints', 'revoked-plan', 'changed-approved-plan', 'removed-tariff-policy',
    'legacy-contract-fallback', 'missing-current-plan', 'revoked-verifier-profile',
    'missing-qualification-activation', 'expired-qualification-activation', 'changed-factory-configuration',
    'wrong-candidate', 'missing-settlement', 'stale-verifier-writer', 'invalidated-verification-receipt',
    'expired-custody-observation', 'rehashed-observation-refresh'].map(name => `${name}-evaluation-and-acceptance`),
];
export function validateNativeControls(journey, expectedSourceSha) {
  assert.match(expectedSourceSha, /^[a-f0-9]{40}$/);
  assert.equal(journey.controllerSourceSha, expectedSourceSha, 'Native controls cover a different source');
  assert.equal(journey.controllerDirty, false, 'Native controls require committed source');
  assert.equal(journey.error, undefined); assert.equal(journey.failure, undefined);
  assert.equal(journey.classification, 'ISOLATED_QUALIFICATION');
  assert.equal(journey.productionIntegration, 'NOT_RUN'); assert.equal(journey.paidOperations, 0);
  assert.equal(journey.executableProductionGrants, 0); assert.equal(journey.externalAlphaChanges, 0);
  assert.equal(journey.repositoryCleanup, 'VERIFIED'); assert.equal(journey.databaseCleanup, 'VERIFIED');
  assert.equal(journey.nativeExecution, 'PASS'); assert.equal(journey.nativeSettlement, 'PASS');
  const { settlementControls, gateControls, gateBeforeSettlement, gateAfterSettlement,
    productionAcceptanceDenied, isolatedAcceptance, durableReadback, mission } = journey.stages;
  assert.equal(settlementControls.adversarialControls, 'PASS');
  for (const [actual, expected] of [[settlementControls, settlementControlChecks], [gateControls, gateControlChecks]]) {
    assert.equal(actual.passed, expected.length);
    assert.deepEqual([...actual.checks].sort(), [...expected].sort(), 'Missing or unexpected native fault drill');
  }
  assert.equal(gateBeforeSettlement.current.eligible, false);
  assert.equal(gateAfterSettlement.current.eligible, true); assert.equal(gateAfterSettlement.current.current, true);
  assert.equal(productionAcceptanceDenied.accepted, false); assert.equal(isolatedAcceptance.accepted, true);
  assert.equal(durableReadback.projectExposureMicrousd, 0);
  assert.ok(mission.mission._id);
  return { status: 'PASS', sourceSha: expectedSourceSha, controlMissionId: mission.mission._id,
    scope: 'SEPARATE_NATIVE_FAULT_CONTROL_FIXTURE', settlementChecks: settlementControls.checks,
    gateChecks: gateControls.checks };
}
