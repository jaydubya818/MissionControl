import { describe, it, expect } from 'vitest';
import { validateNativeControls, settlementControlChecks, gateControlChecks } from './native-control-evidence.mjs';
import { qualifySettlementControls } from './native-settlement-controls.mts';

const source = 'a'.repeat(40);
const complete = () => ({
  controllerSourceSha: source, controllerDirty: false, classification: 'ISOLATED_QUALIFICATION',
  productionIntegration: 'NOT_RUN', paidOperations: 0, externalAlphaChanges: 0, executableProductionGrants: 0,
  repositoryCleanup: 'VERIFIED', databaseCleanup: 'VERIFIED', nativeExecution: 'PASS', nativeSettlement: 'PASS',
  stages: {
    mission: { mission: { _id: 'separate-control-mission' } },
    settlementControls: { adversarialControls: 'PASS', checks: [...settlementControlChecks], passed: settlementControlChecks.length },
    gateControls: { checks: [...gateControlChecks], passed: gateControlChecks.length },
    gateBeforeSettlement: { current: { eligible: false } }, gateAfterSettlement: { current: { eligible: true, current: true } },
    productionAcceptanceDenied: { accepted: false }, isolatedAcceptance: { accepted: true },
    durableReadback: { projectExposureMicrousd: 0 },
  },
});
describe('separate native control evidence is required for the linked owner journey', () => {
  it('accepts the full exact-source check set and identifies its separate Mission', () => {
    const result = validateNativeControls(complete(), source);
    expect(result.controlMissionId).toBe('separate-control-mission');
    expect(result.settlementChecks).toHaveLength(47); expect(result.gateChecks).toHaveLength(22);
  });
  for (const field of ['settlementControls', 'gateControls']) {
    it(`rejects absent, incomplete, duplicate and label-only ${field}`, () => {
      for (const change of [j => delete j.stages[field], j => j.stages[field].checks.pop(),
        j => { j.stages[field].checks[0] = j.stages[field].checks[1]; }, j => { j.stages[field] = { status: 'PASS' }; }]) {
        const j = complete(); change(j); expect(() => validateNativeControls(j, source)).toThrow();
      }
    });
  }
  for (const [name, change] of [
    ['wrong source', j => { j.controllerSourceSha = 'b'.repeat(40); }],
    ['dirty source', j => { j.controllerDirty = true; }],
    ['skipped fault drills', j => { j.stages.settlementControls.adversarialControls = 'NOT_RUN'; }],
    ['expired positive gate', j => { j.stages.gateAfterSettlement.current.current = false; }],
    ['unreleased exposure', j => { j.stages.durableReadback.projectExposureMicrousd = 1; }],
    ['failed cleanup', j => { j.databaseCleanup = 'FAILED'; }],
    ['production acceptance', j => { j.stages.productionAcceptanceDenied.accepted = true; }],
    ['missing expired-observation regression', j => { j.stages.gateControls.checks = j.stages.gateControls.checks.filter(c => !c.startsWith('expired-custody')); }],
    ['missing forged-refresh regression', j => { j.stages.gateControls.checks = j.stages.gateControls.checks.filter(c => !c.startsWith('rehashed-observation')); }],
  ]) it(`rejects ${name}`, () => { const j = complete(); change(j); expect(() => validateNativeControls(j, source)).toThrow(); });
});

function settlementFixture() {
  const runs = [0, 1].map(i => ({ _id: `run-${i}`, executionCostAuthorization: { enterprise: { digest: `reservation-${i}`, ceilingMicrousd: 80 } } }));
  const artifacts = runs.map(r => ({ _id: `artifact-${r._id}`, workflowRunId: r._id, metadata: { schema: 'factory-offline-attempt-evidence/v1' } }));
  const committed = new Map(), calls = [], recorded = {};
  let restarts = 0;
  const db = { owner: 'owner', peer: 'peer', other: 'other', anonymous: 'anonymous',
    client: () => ({}), restart: async () => { restarts++; } };
  const query = async (name, args) => {
    expect(name).toBe('factory/nativeAccounting:readback');
    return { attemptExposureMicrousd: committed.has(args.workflowRunId) ? 0 : 80, settlement: committed.get(args.workflowRunId) };
  };
  const mutate = async (name, args, client) => {
    calls.push({ name, args, client });
    if (['peer', 'other', 'anonymous'].includes(client)) throw Error('DENIED');
    expect(name).toBe('factory/nativeAccounting:settle');
    const duplicate = committed.has(args.workflowRunId);
    if (!duplicate) committed.set(args.workflowRunId, { digest: `settled-${args.workflowRunId}` });
    return { duplicate, settlement: committed.get(args.workflowRunId) };
  };
  return { db, runs, artifacts, mutate, query, step: async (name, fn) => (recorded[name] = await fn()),
    inspect: () => ({ calls, recorded, restarts, committed }) };
}
it('hybrid preserves real settlement, four-client retries and ACK-loss durable recovery without fault drills', async () => {
  const f = settlementFixture();
  const result = await qualifySettlementControls({ ...f, adversarialControls: false });
  expect(result.adversarialControls).toBe('NOT_RUN'); expect(result.requiredSuite).toBe('native-execution');
  expect(result.checks).toEqual(['concurrent-single-settlement-0', 'exact-duplicate-retry-0',
    'lost-settlement-ack-restart-readback-1', 'concurrent-recovery-retries-1', 'exact-duplicate-retry-1']);
  const { calls, recorded, restarts, committed } = f.inspect();
  expect(restarts).toBe(1); expect(committed.size).toBe(2); expect(calls).toHaveLength(11);
  expect(Object.keys(recorded)).toHaveLength(4);
  expect(new Set(calls.filter(c => c.client && typeof c.client === 'object').map(c => c.client)).size).toBe(8);
});
it('fault/access drills remain enabled by default', async () => {
  const f = settlementFixture();
  // Stop after the very first negative assertion; omitting the option cannot skip it.
  await expect(qualifySettlementControls({ ...f, mutate: async (_name, _args, client) => {
    expect(client).toBe('peer'); return {}; // A wrongly allowed foreign owner must fail the harness.
  } })).rejects.toThrow(/Missing expected rejection/);
});
