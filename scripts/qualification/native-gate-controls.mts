import assert from 'node:assert/strict';
import { canonicalDigest } from '@mission-control/shared';

export async function qualifyNativeGateControls({ db, workOrderId, mutate, query }: any) {
  const checks: string[] = [];
  const wo = await query('nativeFixture:inspectRecord', { id: workOrderId });
  const runs = await query('nativeFixture:inspect', { table: 'workflowRuns' });
  const source = runs.find((r: any) => r.workOrderId === workOrderId && r.attemptPurpose === 'IMPLEMENTATION');
  const verifier = runs.find((r: any) => r.workOrderId === workOrderId && r.attemptPurpose === 'VERIFICATION');
  const envelopes = (await query('nativeFixture:inspect', { table: 'evidenceEnvelopes' })).filter((e: any) => e.workOrderId === workOrderId);
  const receipts = (await query('nativeFixture:inspect', { table: 'verificationReceipts' })).filter((e: any) => e.workOrderId === workOrderId && e.receiptScope === 'WORK_ORDER');
  const version = await query('nativeFixture:inspectRecord', { id: verifier.factoryDefinitionVersionId });
  const definition = await query('nativeFixture:inspectRecord', { id: version.factoryDefinitionId });
  const refreshedObservation = { ...envelopes[0].metadata.nativeCandidateObservation, observedAt: envelopes[0].recordedAt + 1,
    expiresAt: envelopes[0].recordedAt + 60001 };
  let sequence = 0;
  const gate = (client = db.owner) => mutate('factory/enterpriseQualification:evaluate', { workOrderId, idempotencyKey: 'native-gate-control-' + sequence++ }, client);
  assert.equal((await gate()).current.eligible, true);
  for (const [name, client] of [['cross-owner', db.peer], ['cross-tenant', db.other], ['anonymous', db.anonymous]]) {
    await assert.rejects(() => gate(client));
    await assert.rejects(() => mutate('workOrders:accept', { workOrderId, actorType: 'HUMAN', isolatedEnterpriseQualification: true,
      idempotencyKey: 'native-denied-accept-' + name }, client));
    checks.push(name + '-gate-and-acceptance');
  }
  const cases: any[] = [
    ['stale-work-order-revision', workOrderId, { currentRevisionNumber: wo.currentRevisionNumber + 1 }],
    ['wrong-quality-contract', workOrderId, { qualityContractDigest: 'sha256:' + 'a'.repeat(64) }],
    ['weakened-verification-contract', workOrderId, { verificationContract: { ...wo.verificationContract, checks: [] } }],
    ['changed-negative-constraints', workOrderId, { negativeConstraints: [] }],
    ['revoked-plan', wo.missionPlanId, { status: 'SUPERSEDED' }],
    ['changed-approved-plan', wo.missionPlanId, { summary: 'Changed after execution' }],
    ['removed-tariff-policy', wo.missionPlanId, { metadata: {} }],
    ['legacy-contract-fallback', workOrderId, { verificationContract: { schemaVersion: 1, enforcementMode: 'OBSERVE_ONLY',
      checks: wo.verificationContract.checks, requireHumanReview: false } }],
    ['missing-current-plan', wo.missionId, {}, ['currentPlanId']],
    ['revoked-verifier-profile', verifier.executionProfileId, { admissionStatus: 'REVOKED' }],
    ['missing-qualification-activation', definition._id, {}, ['qualificationActivation']],
    ['expired-qualification-activation', definition._id, { qualificationActivation: { ...definition.qualificationActivation, expiresAt: 1 } }],
    ['changed-factory-configuration', version._id, { configurationDigest: 'factory-v1-00000000' }],
    ['wrong-candidate', source._id, { verificationSubject: { ...source.verificationSubject, candidateSha: 'a'.repeat(40) } }],
    ['missing-settlement', verifier._id, {}, ['enterpriseSettlement']],
    ['stale-verifier-writer', verifier._id, { workOrderRevisionNumber: verifier.workOrderRevisionNumber + 1 }],
    ['invalidated-verification-receipt', receipts[0]._id, { invalidatedAt: Date.now() }],
    ['expired-custody-observation', envelopes[0]._id, { metadata: { ...envelopes[0].metadata,
      nativeCandidateObservation: { ...envelopes[0].metadata.nativeCandidateObservation, expiresAt: 1 } } }],
    ['rehashed-observation-refresh', envelopes[0]._id, { metadata: { ...envelopes[0].metadata,
      nativeCandidateObservation: refreshedObservation, nativeCandidateObservationDigest: canonicalDigest('native-candidate-observation/v1', refreshedObservation) } }],
  ];
  for (const [name, id, patch, unset = []] of cases) {
    const original = await query('nativeFixture:inspectRecord', { id });
    const fields = [...Object.keys(patch), ...unset];
    await mutate('nativeFixture:fault', { id, patch, unset });
    try {
      const evaluated = await gate().catch(error => ({ denied: String(error) }));
      assert.equal(evaluated.current?.eligible === true, false, name);
      const accepted = await mutate('workOrders:accept', { workOrderId, actorType: 'HUMAN', isolatedEnterpriseQualification: true,
        idempotencyKey: 'native-negative-accept-' + name }).catch(error => ({ denied: String(error) }));
      assert.equal(accepted.accepted === true, false, name + '-acceptance');
      checks.push(name + '-evaluation-and-acceptance');
    }
    finally {
      await mutate('nativeFixture:fault', { id, patch: Object.fromEntries(fields.filter(k => original[k] !== undefined).map(k => [k, original[k]])),
        unset: fields.filter(k => original[k] === undefined) });
    }
  }
  assert.equal((await gate()).current.eligible, true);
  return { checks, passed: checks.length };
}
