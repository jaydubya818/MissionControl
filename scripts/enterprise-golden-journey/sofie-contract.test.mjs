import test from 'node:test';
import assert from 'node:assert/strict';
import { SofieEnterpriseContractFixture } from './sofie-contract.mjs';

test('enterprise proposal carries no execution authority and preserves all three tiers', () => {
  const fixture = new SofieEnterpriseContractFixture({});
  const p = fixture.propose('Build an Agentic HR platform.');
  assert.equal(p.requiresOwnerPlanningAuthorization, true);
  assert.equal(p.executionAuthority, 'NONE');
  assert.deepEqual(p.preservedTiers, ['SOFIE_NATIVE', 'MYFACTORY_STANDALONE', 'MISSION_CONTROL']);
  assert.equal(p.liveSofieIntegration, 'NOT_RUN');
});
test('planning refusal never creates a Mission or grants readback', async () => {
  let writes = 0;
  const fixture = new SofieEnterpriseContractFixture({ createDraft: () => { writes++; } });
  await assert.rejects(fixture.authorizePlanning(false, {}));
  await assert.rejects(fixture.readback('m'));
  assert.equal(writes, 0);
});
test('readback follows fresh authoritative state and cannot accept partial proof', async () => {
  let accepted = 0;
  const detail = { mission: { _id: 'm', state: 'RUNNING', currentPlanId: 'p' }, workOrders: [{ _id: 'w', state: 'IN_PROGRESS' }],
    assertions: [{ assertionId: 'a', status: 'UNKNOWN' }], acceptance: { eligible: false } };
  const fixture = new SofieEnterpriseContractFixture({ createDraft: () => detail, get: () => detail, accept: () => { accepted++; return detail; } });
  await fixture.authorizePlanning(true, {});
  assert.equal((await fixture.readback('m')).assertions[0].status, 'UNKNOWN');
  await assert.rejects(fixture.accept('m', 'owner'));
  assert.equal(accepted, 0);
  detail.mission.state = 'AWAITING_ACCEPTANCE'; detail.mission.requiredHumanAction = 'Review proof'; detail.acceptance.eligible = true;
  detail.assertions[0].status = 'PASS'; detail.assertions[0].verificationReceiptId = 'receipt';
  assert.equal((await fixture.readback('m')).assertions[0].verificationReceiptId, 'receipt');
  await fixture.accept('m', 'owner'); assert.equal(accepted, 1);
  await assert.rejects(fixture.readback('other-mission'));
});
