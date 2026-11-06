import { it, expect } from 'vitest';
import authConfig from '../auth.config';
import { ownerIdentityMatches } from '../lib/executionPermitAuthority';

// The deployed provider pin (convex/auth.config.ts): the production Clerk issuer and its Convex applicationID.
const [provider] = authConfig.providers as Array<{ domain: string; applicationID: string }>;
const clerk = { ownerSubject: 'user_owner', clerkIssuer: provider.domain, clerkAudience: provider.applicationID, clerkAuthorizedParty: 'https://mc.example.test' };
const id = (e: typeof clerk, over: Record<string, unknown> = {}) =>
  ({ subject: e.ownerSubject, issuer: e.clerkIssuer, azp: e.clerkAuthorizedParty, tokenIdentifier: `${e.clerkIssuer}|${e.ownerSubject}`, ...over });

it('pins to the production Clerk issuer and applicationID from auth.config', () => {
  expect(provider).toEqual({ domain: 'https://dear-sunbird-98.clerk.accounts.dev', applicationID: 'convex' });
});
it('a present aud keeps the original exact check', () => {
  expect(ownerIdentityMatches(id(clerk, { aud: clerk.clerkAudience }), clerk)).toBe(true);
  expect(ownerIdentityMatches(id(clerk, { aud: 'other' }), clerk)).toBe(false);
  expect(ownerIdentityMatches(id(clerk, { aud: null }), clerk)).toBe(false);
});
it('accepts a real Convex identity without aud only for the auth.config-pinned issuer and applicationID', () => {
  expect(ownerIdentityMatches(id(clerk), clerk)).toBe(true);
  expect(ownerIdentityMatches(id(clerk), { ...clerk, clerkAudience: 'other' })).toBe(false);
  const foreign = { ...clerk, clerkIssuer: 'https://other-app.clerk.accounts.dev' };
  expect(ownerIdentityMatches(id(foreign), foreign)).toBe(false);
  expect(ownerIdentityMatches(id(clerk), clerk, [])).toBe(false);
  expect(ownerIdentityMatches(id(clerk), clerk, [{ domain: clerk.clerkIssuer, applicationID: 'other' }])).toBe(false);
});
it('has no local-issuer or environment exception', () => {
  const local = { ...clerk, clerkIssuer: 'https://owner-local-identity.myeve.invalid' };
  process.env.MC_OWNER_LOCAL_ISSUER = local.clerkIssuer; process.env.MC_OWNER_AUTH_APPLICATION_ID = local.clerkAudience;
  try { expect(ownerIdentityMatches(id(local), local)).toBe(false); }
  finally { delete process.env.MC_OWNER_LOCAL_ISSUER; delete process.env.MC_OWNER_AUTH_APPLICATION_ID; }
});
it('without aud the issuer-scoped tokenIdentifier is required; subject, issuer and azp stay bound', () => {
  expect(ownerIdentityMatches(id(clerk, { tokenIdentifier: undefined }), clerk)).toBe(false);
  expect(ownerIdentityMatches(id(clerk, { tokenIdentifier: 'https://x|user_owner' }), clerk)).toBe(false);
  for (const over of [{ subject: 'user_x' }, { issuer: 'https://x.clerk.accounts.dev' }, { azp: 'https://x.example.test' }, { azp: undefined }])
    expect(ownerIdentityMatches(id(clerk, over), clerk)).toBe(false);
  expect(ownerIdentityMatches(null, clerk)).toBe(false);
});
