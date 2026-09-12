import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { canonicalHash } from '@mission-control/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HardLiabilityLedger, invokeBudgetFixture, maximumRequestLiability, scopeOf, type LiabilityPolicy, type BoundedProviderRequest } from '../hardLiabilityLedger.js';
const directories: string[] = [];
const hash = (v: unknown) => `sha256:${canonicalHash(v)}`;
const policy: LiabilityPolicy = { schema: 'factory-liability-policy/v1', workspace: 'fixture-workspace', workOrder: 'fixture-wo', executionProfile: 'fixture-profile', route: 'fixture-route', provider: 'offline', model: 'deterministic', priceIdentity: 'fixture-price-v1', currency: 'USD', priceEffectiveAt: '2026-09-05', priceSource: 'fixture://not-real-prices', priceExpiresAt: 2000, inputBoundClass: 'CONSERVATIVELY_BOUNDED', maximumInputTokens: 10, maximumPayloadBytes: 100, maximumOutputTokens: 10, inputNanoUsdPerToken: 1, outputNanoUsdPerToken: 2, billingDimensionsBounded: true, outputLimitEnforced: true, maximumRequests: 3, qualification: 'OFFLINE_FIXTURE' };
const request = (id = 'first'): BoundedProviderRequest => ({ reservationId: 'reservation', scope: scopeOf(policy), requestId: id, payload: 'fixture', maximumOutputTokens: 10 });
async function setup(maximum = 30) {
  const dir = await mkdtemp(path.join(tmpdir(), 'mc-liability-')); directories.push(dir);
  const ledger = new HardLiabilityLedger(dir, () => 1000);
  await ledger.create({ schema: 'factory-liability-reservation/v1', id: 'reservation', idempotencyKey: 'create-1', scope: scopeOf(policy), policyDigest: hash(policy), maximumNanoUsd: maximum, expiresAt: 1500 }, policy);
  return { dir, ledger };
}
afterEach(async () => { await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
describe('hard provider liability offline controls', () => {
  it.each(['workspace','workOrder','executionProfile','route','provider','model','priceIdentity'] as const)('denies wrong %s before fixture invocation', async field => {
    const { ledger } = await setup(); const r = request(); r.scope[field] = 'wrong'; const fixture = vi.fn();
    await expect(invokeBudgetFixture(ledger, policy, r, fixture)).rejects.toThrow(); expect(fixture).not.toHaveBeenCalled();
  });
  it('denies missing and expired reservation', async () => {
    const { dir, ledger } = await setup(); await expect(ledger.reserve({ ...request(), reservationId: 'absent' }, policy)).rejects.toThrow();
    await expect(new HardLiabilityLedger(dir, () => 1500).reserve(request(), policy)).rejects.toThrow();
  });
  it.each([{ payload: 'x'.repeat(101) }, { maximumOutputTokens: 11 }])('denies excessive request %j', async mutation => { const { ledger } = await setup(); await expect(ledger.reserve({ ...request(), ...mutation }, policy)).rejects.toThrow(); });
  it.each([{ inputBoundClass: 'ESTIMATED_ONLY' }, { inputBoundClass: 'UNAVAILABLE' }, { outputLimitEnforced: false }, { billingDimensionsBounded: false }, { priceExpiresAt: 1000 }, { inputNanoUsdPerToken: Number.MAX_SAFE_INTEGER }])('rejects an unproven bound %j', mutation => { expect(() => maximumRequestLiability({ ...policy, ...mutation } as LiabilityPolicy, request(), 1000)).toThrow(); });
  it('persists before send, forwards output cap, settles and rejects duplicate settlement', async () => {
    const { ledger, dir } = await setup();
    const fixture = vi.fn(async wire => { expect(wire.max_output_tokens).toBe(10); const s = JSON.parse(await readFile(path.join(dir, 'ledger.json'), 'utf8')); expect(s.state.holds.first.state).toBe('RESERVED'); return { usageId: 'usage1', actualNanoUsd: 20 }; });
    await invokeBudgetFixture(ledger, policy, request(), fixture);
    await expect(ledger.settle({ requestId: 'first', requestDigest: hash(request()), usageId: 'usage1', actualNanoUsd: 20 })).rejects.toThrow();
    await expect(ledger.reserve(request(), policy)).rejects.toThrow();
  });
  it('admits only one of two concurrent requests for all remaining capacity across ledger instances', async () => {
    const { ledger, dir } = await setup();
    const results = await Promise.allSettled([ledger.reserve(request('a'), policy), new HardLiabilityLedger(dir, () => 1000).reserve(request('b'), policy)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  });
  it('retains unknown liability across restart, denying a retry', async () => {
    const { ledger, dir } = await setup(); await ledger.reserve(request(), policy); await ledger.unknown('first');
    await expect(new HardLiabilityLedger(dir, () => 1000).reserve(request('retry'), policy)).rejects.toThrow();
  });
  it('retries consume the same reservation and unknown request is not free', async () => {
    const { ledger } = await setup(60); await ledger.reserve(request(), policy); await ledger.unknown('first'); await ledger.reserve(request('retry'), policy);
    await expect(ledger.reserve(request('retry2'), policy)).rejects.toThrow();
  });
  it('denies replayed usage across requests and wrong request linkage', async () => {
    const { ledger } = await setup(90); await ledger.reserve(request('a'), policy); await ledger.reserve(request('b'), policy);
    await ledger.settle({ requestId: 'a', requestDigest: hash(request('a')), usageId: 'one', actualNanoUsd: 10 });
    await expect(ledger.settle({ requestId: 'b', requestDigest: hash(request('b')), usageId: 'one', actualNanoUsd: 10 })).rejects.toThrow();
    await expect(ledger.settle({ requestId: 'b', requestDigest: hash(request('a')), usageId: 'two', actualNanoUsd: 10 })).rejects.toThrow();
  });
  it('rejects inherited keys in every transition', async () => { const { ledger } = await setup(); await expect(ledger.unknown('__proto__')).rejects.toThrow(); await expect(ledger.settle({ requestId: '__proto__', requestDigest: 'x', usageId: 'x', actualNanoUsd: 0 })).rejects.toThrow(); expect(Object.prototype).not.toHaveProperty('state'); });
  it('does not steal a crashed transaction lock', async () => { const { ledger, dir } = await setup(); await mkdir(path.join(dir, 'transaction.lock')); await expect(ledger.reserve(request(), policy)).rejects.toThrow('locked'); });
});
