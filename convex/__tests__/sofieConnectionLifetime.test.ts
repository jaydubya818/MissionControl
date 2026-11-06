import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { PRIVATE_BETA_SOFIE_CONNECTION_MAX_MS, SOFIE_CONNECTION_MAX_MS, connectionLifetimeCap } from '../lib/sofieConfirmation';

// Private beta connection option A: one long-lived connection per person (owner-renewed), only for enrolled installation owners.
const hex = (s: string) => createHash('sha256').update(s).digest('hex');
const installation = (owner: string) => ({ ownerSubject: `user_${owner}`, missionControlOwnerId: `op-${owner}`, repository: 'jay/app', repositoryId: 'repo-1',
  codeScopeIds: ['scope-1'], planner: { subject: `planner_${owner}`, memberId: `planner-member-${owner}` },
  keys: [{ keyId: hex(owner), publicKey: 'pem', activeFrom: 0, notAfter: Date.now() + 3600_000, revokedAt: null }] });
const config = JSON.stringify({ 'inst-jay': installation('jay'), 'inst-t1': installation('t1') });

describe('sofieEnterprise:connect lifetime cap (private beta option A)', () => {
  it('keeps the 1 h cap for ordinary connections', () => {
    expect(connectionLifetimeCap(undefined, 'op-anyone', config)).toBe(SOFIE_CONNECTION_MAX_MS);
    expect(SOFIE_CONNECTION_MAX_MS).toBe(3_600_000);
  });
  it('allows 7 days only for the owner of an enrolled confirmation installation', () => {
    expect(PRIVATE_BETA_SOFIE_CONNECTION_MAX_MS).toBe(7 * 24 * 3_600_000);
    expect(connectionLifetimeCap('PRIVATE_BETA_SOFIE', 'op-jay', config)).toBe(PRIVATE_BETA_SOFIE_CONNECTION_MAX_MS);
    expect(connectionLifetimeCap('PRIVATE_BETA_SOFIE', 'op-t1', config)).toBe(PRIVATE_BETA_SOFIE_CONNECTION_MAX_MS);
  });
  it('refuses the private-beta kind for anyone else, or when the installation config is absent or malformed', () => {
    expect(connectionLifetimeCap('PRIVATE_BETA_SOFIE', 'op-stranger', config)).toBeNull();
    expect(connectionLifetimeCap('PRIVATE_BETA_SOFIE', 'op-jay', undefined)).toBeNull();
    expect(connectionLifetimeCap('PRIVATE_BETA_SOFIE', 'op-jay', '{not json')).toBeNull();
    expect(connectionLifetimeCap('PRIVATE_BETA_SOFIE', 'op-jay', JSON.stringify({ 'inst-jay': { ...installation('jay'), extra: 1 } }))).toBeNull();
    expect(connectionLifetimeCap('OTHER' as never, 'op-jay', config)).toBeNull();
  });
});
