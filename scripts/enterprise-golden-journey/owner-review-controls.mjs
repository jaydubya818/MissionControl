import assert from 'node:assert/strict';

export function ownerReviewChecks(decision) {
  assert.ok(['ACCEPT', 'REJECT'].includes(decision), 'Known owner decision required');
  return [
    'anonymous-cross-owner-cross-tenant-and-wrong-digest-denied',
    'service-cannot-self-authorize',
    'concurrent-submissions-one-canonical-Mission',
    'proposal-Mission-identity-bound',
    'current-three-WorkOrder-Result-bound',
    'wrong-owner-Mission-Plan-Result-denied',
    'concurrent-owner-decision-one-audit',
    'conflicting-replay-denied',
    decision === 'ACCEPT' ? 'Sofie-canonical-accepted-readback' : 'Sofie-canonical-rejected-readback',
  ];
}

export function validateOwnerReview(report, decision, expectedMissionId) {
  assert.ok(typeof expectedMissionId === 'string' && expectedMissionId.length > 0, 'Expected Mission is required');
  assert.equal(report?.status, 'PASS');
  assert.equal(report.missionId, expectedMissionId, 'Owner controls cover a different Mission');
  assert.ok(typeof report.proposalId === 'string' && report.proposalId.length > 0, 'Proposal identity is required');
  assert.ok(Array.isArray(report.checks), 'Owner control manifest is required');
  assert.deepEqual([...report.checks].sort(), ownerReviewChecks(decision).sort(), 'Owner control manifest is incomplete or invalid');
  assert.equal(report.authentication, 'SYNTHETIC_API_FIXTURE');
  assert.equal(report.browserOwnerJourney, 'NOT_RUN');
  assert.equal(report.releaseGate, 'ADVISORY');
  return report;
}
