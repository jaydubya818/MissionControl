import { it, expect } from 'vitest';
import { ownerIdentityMatches } from '../lib/executionPermitAuthority';
const e = { ownerSubject: 'owner', clerkIssuer: 'https://issuer.example.test', clerkAudience: 'convex', clerkAuthorizedParty: 'https://mc.example.test' };
const base = { subject: 'owner', issuer: e.clerkIssuer, azp: e.clerkAuthorizedParty, tokenIdentifier: `${e.clerkIssuer}|owner` };
it('accepts a present exact aud, as before', () => expect(ownerIdentityMatches({ ...base, aud: 'convex' }, e, undefined)).toBe(true));
it('rejects a present foreign aud even with the pin', () => expect(ownerIdentityMatches({ ...base, aud: 'other' }, e, 'convex')).toBe(false));
it('accepts a real Convex identity (no aud) only with the matching applicationID pin', () => {
  expect(ownerIdentityMatches(base, e, 'convex')).toBe(true);
  expect(ownerIdentityMatches(base, e, undefined)).toBe(false);
  expect(ownerIdentityMatches(base, e, 'other')).toBe(false);
});
it('keeps subject, issuer, azp and tokenIdentifier binding', () => {
  for (const changed of [{ subject: 'x' }, { issuer: 'https://x.example.test' }, { azp: 'https://x.example.test' }, { tokenIdentifier: 'https://x|owner' }])
    expect(ownerIdentityMatches({ ...base, ...changed }, e, 'convex')).toBe(false);
  expect(ownerIdentityMatches(null, e, 'convex')).toBe(false);
});
