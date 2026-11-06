import { expect, it } from 'vitest';
import { existingHandlers } from '../sofieConfirmationState';
import { approvePlan } from '../missions';

// The bridge runs MissionControl's registered functions' own handlers (their authorization wrappers included), never re-implementations,
// and validates arguments against each function's own exported validator first.
it('wires the confirmation bridge to the existing registered handlers', () => {
  const handlers = existingHandlers();
  expect(Object.keys(handlers).sort()).toEqual(['approvePlan', 'approvePrepared', 'assignMissionMember', 'decide', 'savePlanDraft', 'submit', 'submitPlan', 'updateDraft']);
  for (const handler of Object.values(handlers)) expect(typeof handler).toBe('function');
  expect(JSON.parse((approvePlan as any).exportArgs()).type).toBe('object');
});

it('refuses arguments the registered validator would refuse, before any handler code runs', async () => {
  const { savePlanDraft: save, approvePlan: approve } = existingHandlers();
  const ctx: any = { db: { normalizeId: () => 'ok' }, auth: { getUserIdentity: async () => { throw Error('HANDLER_RAN'); } } };
  const base = { projectId: 'p', missionId: 'm', idempotencyKey: 'k', summary: 's', rollbackApproach: 'r', workOrderBlueprints: [], assertions: [] };
  expect(() => save(ctx, { ...base, injected: true })).toThrow('SOFIE_CONFIRMATION_ARGUMENT_INVALID:args');
  expect(() => save(ctx, { ...base, workOrderBlueprints: [{ id: 'x', unexpected: 1 }] })).toThrow('SOFIE_CONFIRMATION_ARGUMENT_INVALID:args.workOrderBlueprints[0]');
  expect(() => approve(ctx, { projectId: 'p', missionId: 'm', planId: 'x', decisionReason: 1, idempotencyKey: 'k' })).toThrow('SOFIE_CONFIRMATION_ARGUMENT_INVALID:args.decisionReason');
  const wrongTable: any = { db: { normalizeId: () => null }, auth: ctx.auth };
  expect(() => approve(wrongTable, { projectId: 'p', missionId: 'm', planId: 'x', decisionReason: 'r', idempotencyKey: 'k' })).toThrow('SOFIE_CONFIRMATION_ARGUMENT_INVALID:args.projectId');
  // Valid arguments reach the existing handler, which then runs its own authorization (here: the identity lookup throws).
  await expect(save(ctx, base)).rejects.toThrow();
});
