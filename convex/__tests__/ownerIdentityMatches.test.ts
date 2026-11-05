import { it, expect } from 'vitest';
import { ownerIdentityMatches } from '../lib/executionPermitAuthority';
const clerk = { ownerSubject: 'owner', clerkIssuer: 'https://dear-sunbird-98.clerk.accounts.dev', clerkAudience: 'convex', clerkAuthorizedParty: 'https://mc.example.test' };
const LOCAL = 'https://owner-local-identity.myeve.invalid';
const local = { ...clerk, clerkIssuer: LOCAL };
const pin = { applicationId: 'convex', localIssuer: LOCAL };
const id = (e: typeof clerk, over: Record<string, unknown> = {}) => ({ subject: 'owner', issuer: e.clerkIssuer, azp: e.clerkAuthorizedParty, tokenIdentifier: `${e.clerkIssuer}|owner`, ...over });
it('hosted Clerk: unchanged — aud must equal the enrolled audience, even with the local pins set', () => {
  expect(ownerIdentityMatches(id(clerk, { aud: 'convex' }), clerk, pin)).toBe(true);
  expect(ownerIdentityMatches(id(clerk), clerk, pin)).toBe(false);
  expect(ownerIdentityMatches(id(clerk), clerk, { applicationId: 'convex', localIssuer: clerk.clerkIssuer })).toBe(false);
  expect(ownerIdentityMatches(id(clerk, { aud: 'other' }), clerk, pin)).toBe(false);
});
it('the disposable local issuer without aud is accepted only with both pins and the scoped tokenIdentifier', () => {
  expect(ownerIdentityMatches(id(local), local, pin)).toBe(true);
  expect(ownerIdentityMatches(id(local), local, { applicationId: 'convex' })).toBe(false);
  expect(ownerIdentityMatches(id(local), local, { localIssuer: LOCAL })).toBe(false);
  expect(ownerIdentityMatches(id(local), local, { applicationId: 'other', localIssuer: LOCAL })).toBe(false);
  expect(ownerIdentityMatches(id(local, { tokenIdentifier: 'x|owner' }), local, pin)).toBe(false);
  for (const over of [{ subject: 'x' }, { azp: 'https://x.invalid' }, { issuer: 'https://other.invalid' }]) expect(ownerIdentityMatches(id(local, over), local, pin)).toBe(false);
  expect(ownerIdentityMatches(null, local, pin)).toBe(false);
});
