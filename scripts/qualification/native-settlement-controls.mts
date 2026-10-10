import assert from 'node:assert/strict';
import { canonicalJson, sha256Hex } from '@mission-control/shared';

/** Faults affect only the disposable database. Every response used for positive
 * settlement comes from the actual canonical producer/verifier execution. */
export async function qualifySettlementControls({ db, runs, artifacts, mutate, query, step }: any) {
  const checks: string[] = [];
  const deny = async (name: string, fn: () => Promise<any>, pattern?: RegExp) => {
    if (pattern) await assert.rejects(fn, pattern); else await assert.rejects(fn);
    checks.push(name);
  };
  const fault = (id: string, patch: any, unset: string[] = []) => mutate('nativeFixture:fault', { id, patch, unset });
  const responses = runs.map((r: any) => artifacts.find((a: any) => a.workflowRunId === r._id && a.metadata?.schema === 'factory-offline-attempt-evidence/v1'));
  assert.equal(responses.length, 2); assert.ok(responses.every(Boolean));
  for (const [index, run] of runs.entries()) {
    const response = responses[index], reservation = run.executionCostAuthorization.enterprise;
    const args = { workflowRunId: run._id, responseArtifactId: response._id, expectedReservationDigest: reservation.digest };
    const settle = (changes = {}, client = db.owner) => mutate('factory/nativeAccounting:settle', { ...args, ...changes }, client);
    const held = async () => assert.equal((await query('factory/nativeAccounting:readback', { workflowRunId: run._id })).attemptExposureMicrousd, reservation.ceilingMicrousd);
    await held();
    for (const [name, client] of [['cross-owner', db.peer], ['cross-tenant', db.other], ['anonymous', db.anonymous]]) {
      await deny(name + '-settlement-' + index, () => settle({}, client));
      await deny(name + '-readback-' + index, () => query('factory/nativeAccounting:readback', { workflowRunId: run._id }, client));
      await deny(name + '-release-' + index, () => mutate('factory/nativeAccounting:releaseUndispatched', { workflowRunId: run._id, expectedReservationDigest: reservation.digest }, client));
    }
    await deny('stale-reservation-writer-' + index, () => settle({ expectedReservationDigest: 'stale' }));
    await deny('other-attempt-response-' + index, () => settle({ responseArtifactId: responses[1 - index]._id }));
    await deny('claimed-exposure-cannot-release-' + index, () => mutate('factory/nativeAccounting:releaseUndispatched', { workflowRunId: run._id, expectedReservationDigest: reservation.digest }));
    for (const name of ['missing-tariff', 'changed-tariff', 'changed-manifest', 'missing-cleanup', 'missing-image', 'truncated-response', 'missing-execution-evidence', 'wrong-lease']) {
      let expectedReservationDigest = reservation.digest;
      if (name.includes('tariff')) {
        const authorization = structuredClone(run.executionCostAuthorization);
        if (name === 'missing-tariff') delete authorization.enterprise.nativeTariff;
        else {
          authorization.enterprise.nativeTariff.approvedBy = db.seed.peerId;
          const { digest: _digest, ...tariff } = authorization.enterprise.nativeTariff;
          authorization.enterprise.nativeTariff.digest = sha256Hex(canonicalJson(tariff));
        }
        const { digest: _digest, ...body } = authorization.enterprise;
        authorization.enterprise.digest = sha256Hex(canonicalJson(body));
        expectedReservationDigest = authorization.enterprise.digest;
        const { authorizationDigest: _authorization, ...envelope } = authorization;
        authorization.authorizationDigest = sha256Hex(canonicalJson(envelope));
        await fault(run._id, { executionCostAuthorization: authorization });
      } else if (name === 'changed-manifest') {
        await fault(run._id, { executionManifest: { ...run.executionManifest, budgetReservationId: 'other-attempt' } });
      } else {
        const metadata = structuredClone(response.metadata);
        if (name === 'wrong-lease') metadata.leaseId = 'other-lease';
        else if (name === 'missing-cleanup') metadata.packet.evidence.cleanupVerified = false;
        else if (name === 'missing-image') metadata.packet.evidence.containerImageId = null;
        else if (name === 'truncated-response') metadata.packet.evidence.truncated = true;
        else delete metadata.packet.evidence;
        await fault(response._id, { metadata });
      }
      try { await deny(name + '-' + index, () => settle({ expectedReservationDigest }), name.includes('tariff') ? /ENTERPRISE_NATIVE_TARIFF/ : undefined); }
      finally {
        await fault(run._id, { executionCostAuthorization: run.executionCostAuthorization, executionManifest: run.executionManifest });
        await fault(response._id, { metadata: response.metadata });
      }
      await held();
    }
    const events = await query('nativeFixture:inspect', { table: 'runEvents' });
    const claim = events.find((e: any) => e.workflowRunId === run._id && e.idempotencyKey?.endsWith(':claimed'));
    const extra = await mutate('nativeFixture:extraClaim', { id: claim._id });
    try { await deny('second-historical-claim-' + index, () => settle()); }
    finally { await mutate('nativeFixture:removeExtraClaim', { id: extra }); }
    await held();
    // These are simultaneous HTTP requests from distinct authenticated clients,
    // not a client's serial mutation queue. Only one writes the settlement.
    let recovered: any;
    if (index === 1) {
      // The server commits; this transport boundary deliberately discards its
      // response. Reconstruct the client and recover only via durable readback.
      await assert.rejects(async () => { await settle(); throw Error('INJECTED_SETTLEMENT_ACK_LOSS'); }, /INJECTED_SETTLEMENT_ACK_LOSS/);
      await db.restart();
      recovered = await query('factory/nativeAccounting:readback', { workflowRunId: run._id }, db.client('user_SyntheticHandoffQualification'));
      assert.ok(recovered.settlement); assert.equal(recovered.attemptExposureMicrousd, 0);
      checks.push('lost-settlement-ack-restart-readback-' + index);
    }
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => settle({}, db.client('user_SyntheticHandoffQualification'))));
    assert.equal(outcomes.filter(r => !r.duplicate).length, index === 1 ? 0 : 1);
    assert.equal(new Set(outcomes.map(r => r.settlement.digest)).size, 1);
    assert.equal((await query('factory/nativeAccounting:readback', { workflowRunId: run._id })).attemptExposureMicrousd, 0);
    checks.push(index === 1 ? 'concurrent-recovery-retries-' + index : 'concurrent-single-settlement-' + index);
    await step('settlement-' + run._id, async () => recovered ?? outcomes.find(r => !r.duplicate));
    const duplicate = await settle(); assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.settlement.digest, outcomes[0].settlement.digest);
    checks.push('exact-duplicate-retry-' + index);
    await step('duplicateSettlement-' + run._id, async () => duplicate);
  }
  return { checks, passed: checks.length };
}
