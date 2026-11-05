import assert from 'node:assert/strict';

// Consumer contract fixture only. No MyEve runtime or model is invoked.
export class SofieEnterpriseContractFixture {
  constructor(transport) { this.transport = transport; this.authorized = false; }
  propose(intent) {
    assert.equal(intent, 'Build an Agentic HR platform.');
    return { schema: 'sofie-enterprise-proposal-fixture/v1', tier: 'MISSION_CONTROL',
      title: 'Build the Employee Core, Recruiting and Onboarding foundation.',
      requiresOwnerPlanningAuthorization: true, executionAuthority: 'NONE',
      preservedTiers: ['SOFIE_NATIVE', 'MYFACTORY_STANDALONE', 'MISSION_CONTROL'],
      liveSofieIntegration: 'NOT_RUN' };
  }
  async authorizePlanning(authorized, args) {
    assert.equal(authorized, true, 'Explicit owner planning authorization required');
    const result = await this.transport.createDraft(args);
    this.authorized = true;
    return result;
  }
  async readback(missionId) {
    assert.equal(this.authorized, true);
    const detail = await this.transport.get(missionId);
    assert.equal(detail.mission._id, missionId);
    return { missionId, state: detail.mission.state,
      planId: detail.mission.currentPlanId ?? null,
      workOrders: detail.workOrders.map(wo => ({ id: wo._id, state: wo.state })),
      assertions: detail.assertions.map(a => ({ id: a.assertionId, status: a.status,
        verificationReceiptId: a.verificationReceiptId ?? null })),
      needsYou: detail.mission.requiredHumanAction ?? null,
      acceptanceEligible: detail.acceptance.eligible,
      source: 'missions:get', liveSofieIntegration: 'NOT_RUN' };
  }
  async accept(missionId, acceptedBy) {
    const current = await this.readback(missionId);
    assert.equal(current.state, 'AWAITING_ACCEPTANCE');
    assert.equal(current.acceptanceEligible, true);
    assert.ok(current.needsYou);
    return this.transport.accept({ missionId, acceptedBy, idempotencyKey: 'golden-owner-accept' });
  }
}
