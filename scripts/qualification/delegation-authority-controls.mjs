import assert from 'node:assert/strict';

export const delegationAuthorityChecks = Object.freeze([
  'wrong-execution-profile',
  'changed-workflow',
  'changed-plan',
  'revoked-exact-approval',
  'stale-workorder',
  'changed-source-mapping',
  'revoked-policy-after-reservation',
  'changed-policy-after-reservation',
  'expired-exact-approval',
]);

export function validateDelegationAuthorityControls(execution) {
  assert.ok(Array.isArray(execution?.authorityControls), 'Delegation authority control manifest is required');
  assert.deepEqual([...execution.authorityControls].sort(), [...delegationAuthorityChecks].sort(),
    'Delegation authority control manifest is incomplete or invalid');
  assert.equal(execution.admissionRequests, 1, 'Exactly one actual delegation admission is required');
}
