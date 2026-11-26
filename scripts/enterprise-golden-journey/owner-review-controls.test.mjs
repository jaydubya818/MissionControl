import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerReviewChecks, validateOwnerReview } from './owner-review-controls.mjs';
const report = decision => ({ status: 'PASS', missionId: 'mission', proposalId: 'proposal', checks: ownerReviewChecks(decision), authentication: 'SYNTHETIC_API_FIXTURE', browserOwnerJourney: 'NOT_RUN', releaseGate: 'ADVISORY' });
for (const decision of ['ACCEPT', 'REJECT']) {
  test(`${decision} requires every named control on the expected Mission`, () => {
    assert.equal(validateOwnerReview(report(decision), decision, 'mission').status, 'PASS');
    for (let index = 0; index < ownerReviewChecks(decision).length; index++) {
      const missing = report(decision); missing.checks.splice(index, 1);
      assert.throws(() => validateOwnerReview(missing, decision, 'mission'), /manifest/);
      const duplicate = report(decision); duplicate.checks[index] = duplicate.checks[(index + 1) % duplicate.checks.length];
      assert.throws(() => validateOwnerReview(duplicate, decision, 'mission'), /manifest/);
    }
    for (const changed of [{ missionId: 'other' }, { proposalId: undefined }, { status: 'NOT_RUN' }, { checks: [] }, { authentication: 'OWNER' }, { browserOwnerJourney: 'PASS' }, { releaseGate: 'REQUIRED' }])
      assert.throws(() => validateOwnerReview({ ...report(decision), ...changed }, decision, 'mission'));
    assert.throws(() => validateOwnerReview(report(decision), decision, undefined), /Expected Mission/);
    assert.throws(() => validateOwnerReview(report(decision), decision === 'ACCEPT' ? 'REJECT' : 'ACCEPT', 'mission'), /manifest/);
  });
}

test('local browser evidence requires actual loopback transport and never qualifies hosted Clerk', () => {
 const local={status:'PASS',authentication:'LOCAL_SYNTHETIC_ADMIN_IMPERSONATION',transport:'REAL_LOOPBACK_CONVEX',hostedClerk:'NOT_RUN',checks:['actual-dashboard-and-owner-navigation','proposal-authorized-in-owner-UI','exact-Plan-approved-in-owner-UI','current-Result-read-authorized-in-owner-UI','current-Result-accepted-in-owner-UI']};
 const candidate={...report('ACCEPT'),browserOwnerJourney:'LOCAL_SYNTHETIC_UI',localOwnerUi:local};
 assert.equal(validateOwnerReview(candidate,'ACCEPT','mission').releaseGate,'ADVISORY');
 for(const patch of [{transport:'MOCK'},{hostedClerk:'PASS'},{checks:local.checks.slice(1)},{authentication:'UNVERIFIED'}])
  assert.throws(()=>validateOwnerReview({...candidate,localOwnerUi:{...local,...patch}},'ACCEPT','mission'));
});
