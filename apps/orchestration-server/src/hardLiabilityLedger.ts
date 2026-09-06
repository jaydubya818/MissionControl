import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { canonicalHash } from '@mission-control/shared';

export type InputBoundClass = 'EXACTLY_ENFORCEABLE' | 'CONSERVATIVELY_BOUNDED' | 'ESTIMATED_ONLY' | 'UNAVAILABLE';
export interface LiabilityScope {
  workspace: string; workOrder: string; executionProfile: string; route: string;
  provider: string; model: string; priceIdentity: string;
}
export interface LiabilityPolicy extends LiabilityScope {
  schema: 'factory-liability-policy/v1';
  currency: 'USD'; priceEffectiveAt: string; priceSource: string; priceExpiresAt: number;
  inputBoundClass: InputBoundClass;
  maximumInputTokens: number; maximumPayloadBytes: number; maximumOutputTokens: number;
  // Worst-case inclusive rates, integer nano-USD/token. Overlapping categories
  // must be included in these rates, never added again during settlement.
  inputNanoUsdPerToken: number; outputNanoUsdPerToken: number;
  billingDimensionsBounded: boolean; outputLimitEnforced: boolean;
  maximumRequests: number;
  qualification: 'OFFLINE_FIXTURE';
}
export interface LiabilityReservation {
  schema: 'factory-liability-reservation/v1'; id: string; idempotencyKey: string;
  scope: LiabilityScope; policyDigest: string; maximumNanoUsd: number; expiresAt: number;
}
interface Hold { digest: string; maximumNanoUsd: number; state: 'RESERVED' | 'UNKNOWN' | 'SETTLED'; usageId?: string; actualNanoUsd?: number }
interface LedgerState { reservation: LiabilityReservation; holds: Record<string, Hold>; usedUsageIds: string[] }
export interface BoundedProviderRequest {
  reservationId: string; scope: LiabilityScope; requestId: string;
  payload: string; maximumOutputTokens: number;
}
export class LiabilityDenied extends Error {}
const digest = (value: unknown) => `sha256:${canonicalHash(value)}`;
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
export function maximumRequestLiability(policy: LiabilityPolicy, request: BoundedProviderRequest, now: number) {
  if (policy.schema !== 'factory-liability-policy/v1' || policy.qualification !== 'OFFLINE_FIXTURE'
    || policy.currency !== 'USD' || !policy.priceIdentity || !policy.priceSource || !policy.priceEffectiveAt || (!integer(policy.priceExpiresAt) || policy.priceExpiresAt <= now)
    || !['EXACTLY_ENFORCEABLE', 'CONSERVATIVELY_BOUNDED'].includes(policy.inputBoundClass)
    || !policy.billingDimensionsBounded || !policy.outputLimitEnforced
    || ![policy.maximumInputTokens, policy.maximumPayloadBytes, policy.maximumOutputTokens, policy.inputNanoUsdPerToken, policy.outputNanoUsdPerToken, policy.maximumRequests, request.maximumOutputTokens].every(integer)
    || policy.maximumRequests < 1 || request.maximumOutputTokens < 1
    || Buffer.byteLength(request.payload, 'utf8') > policy.maximumPayloadBytes
    || request.maximumOutputTokens > policy.maximumOutputTokens || digest(request.scope) !== digest(scopeOf(policy))) throw new LiabilityDenied('Request cannot establish a governed maximum liability');
  // Reserve the full admitted model input bound. Bytes/4 and generic tokenizers
  // cannot establish this bound. Real provider proof is deliberately not available.
  const maximum = policy.maximumInputTokens * policy.inputNanoUsdPerToken + request.maximumOutputTokens * policy.outputNanoUsdPerToken;
  if (!integer(maximum) || maximum <= 0) throw new LiabilityDenied('Unsafe liability arithmetic');
  return maximum;
}
export function scopeOf(p: LiabilityScope): LiabilityScope { return { workspace: p.workspace, workOrder: p.workOrder, executionProfile: p.executionProfile, route: p.route, provider: p.provider, model: p.model, priceIdentity: p.priceIdentity }; }

/** Controller-owned, single-reservation durable ledger. Atomic mkdir serializes
 * cooperating processes; a crashed lock is NEVER stolen automatically. Failure
 * or ambiguity denies dispatch. Persist and fsync the hold before provider I/O.
 * This qualification storage adapter is not a Convex admission authority.
 */
export class HardLiabilityLedger {
  constructor(private readonly directory: string, private readonly now: () => number = Date.now) {}
  private async transaction<T>(operation: (state: LedgerState | undefined) => { state: LedgerState; value: T }): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = path.join(this.directory, 'transaction.lock');
    try { await mkdir(lock, { mode: 0o700 }); } catch { throw new LiabilityDenied('Ledger locked or unavailable; dispatch denied'); }
    try {
      let state: LedgerState | undefined;
      try {
        const stored = JSON.parse(await readFile(path.join(this.directory, 'ledger.json'), 'utf8'));
        if (stored.schema !== 'factory-liability-ledger/v1' || stored.digest !== digest(stored.state)) throw new LiabilityDenied('Ledger integrity mismatch');
        state = stored.state;
      }
      catch (error: any) { if (error.code !== 'ENOENT') throw new LiabilityDenied('Unreadable ledger; dispatch denied'); }
      const next = operation(state);
      const temp = path.join(lock, 'next.json');
      const file = await open(temp, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify({ schema: 'factory-liability-ledger/v1', state: next.state, digest: digest(next.state) })); await file.sync(); } finally { await file.close(); }
      await rename(temp, path.join(this.directory, 'ledger.json'));
      const parent = await open(this.directory, 'r');
      try { await parent.sync(); } finally { await parent.close(); }
      return next.value;
    } finally { await rm(lock, { recursive: true, force: true }); }
  }
  async create(reservation: LiabilityReservation, policy: LiabilityPolicy) {
    return this.transaction(state => {
      if (state) { if (digest(state.reservation) !== digest(reservation)) throw new LiabilityDenied('Reservation identity conflict'); return { state, value: undefined }; }
      if (reservation.schema !== 'factory-liability-reservation/v1' || !reservation.id || !reservation.idempotencyKey
        || reservation.policyDigest !== digest(policy) || digest(reservation.scope) !== digest(scopeOf(policy))
        || !integer(reservation.maximumNanoUsd) || reservation.maximumNanoUsd <= 0 || (!integer(reservation.expiresAt) || reservation.expiresAt <= this.now())) throw new LiabilityDenied('Invalid reservation');
      return { state: { reservation: structuredClone(reservation), holds: {}, usedUsageIds: [] }, value: undefined };
    });
  }
  async reserve(request: BoundedProviderRequest, policy: LiabilityPolicy) {
    return this.transaction(state => {
      if (!state || state.reservation.id !== request.reservationId || (!integer(state.reservation.expiresAt) || state.reservation.expiresAt <= this.now())
        || state.reservation.policyDigest !== digest(policy) || digest(state.reservation.scope) !== digest(request.scope)
        || !/^[a-zA-Z0-9_-]{1,128}$/.test(request.requestId) || ['__proto__', 'constructor', 'prototype'].includes(request.requestId)) throw new LiabilityDenied('Missing, expired or mismatched reservation');
      const maximum = maximumRequestLiability(policy, request, this.now());
      // Same request ID cannot authorize a second send, even if payload is identical.
      if (Object.hasOwn(state.holds, request.requestId)) throw new LiabilityDenied('Request replay denied');
      const holds = Object.values(state.holds);
      const encumbered = holds.reduce((sum, hold) => sum + (hold.state === 'SETTLED' ? hold.actualNanoUsd! : hold.maximumNanoUsd), 0);
      if (!integer(encumbered) || holds.length >= policy.maximumRequests || maximum > state.reservation.maximumNanoUsd - encumbered) throw new LiabilityDenied('Insufficient remaining liability or retry allowance');
      state.holds[request.requestId] = { digest: digest(request), maximumNanoUsd: maximum, state: 'RESERVED' };
      return { state, value: { requestId: request.requestId, maximumNanoUsd: maximum } };
    });
  }
  async unknown(requestId: string) {
    return this.transaction(state => { const hold = state && Object.hasOwn(state.holds, requestId) ? state.holds[requestId] : undefined; if (!state || !hold || hold.state === 'SETTLED') throw new LiabilityDenied('Unknown hold'); hold.state = 'UNKNOWN'; return { state, value: undefined }; });
  }
  async settle(input: { requestId: string; requestDigest: string; usageId: string; actualNanoUsd: number }) {
    return this.transaction(state => {
      const hold = state && Object.hasOwn(state.holds, input.requestId) ? state.holds[input.requestId] : undefined;
      if (!state || !hold || hold.state === 'SETTLED' || hold.digest !== input.requestDigest || !input.usageId
        || state.usedUsageIds.includes(input.usageId) || !integer(input.actualNanoUsd) || input.actualNanoUsd > hold.maximumNanoUsd) throw new LiabilityDenied('Invalid, duplicated or out-of-bound usage settlement');
      Object.assign(hold, { state: 'SETTLED', usageId: input.usageId, actualNanoUsd: input.actualNanoUsd });
      state.usedUsageIds.push(input.usageId); return { state, value: undefined };
    });
  }
}

/** No network implementation is supplied. This exercises the pre-send contract
 * with deterministic fixtures; it is not evidence that any provider honors it.
 */
export async function invokeBudgetFixture(ledger: HardLiabilityLedger, policy: LiabilityPolicy, request: BoundedProviderRequest,
  fixture: (wire: { payload: string; max_output_tokens: number }) => Promise<{ usageId: string; actualNanoUsd: number }>) {
  await ledger.reserve(request, policy);
  try {
    const result = await fixture({ payload: request.payload, max_output_tokens: request.maximumOutputTokens });
    await ledger.settle({ requestId: request.requestId, requestDigest: digest(request), ...result });
    return result;
  } catch (error) { await ledger.unknown(request.requestId).catch(() => {}); throw error; }
}
