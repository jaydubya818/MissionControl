import { describe, expect, it, vi } from 'vitest';
import { capabilityWorkRestriction } from '../lib/capabilityWorkControl';
import { updateContext, advance } from '../workflowRuns';
const scope = 'exact-owner-installation-incarnation';
const authority = { scope, version: 3, policyId: 'admitted-3', capabilityId: 'enterprise.fleet' };
function context(controls: Array<Record<string, unknown>>, run: Record<string, unknown> = {}) {
  const writes = vi.fn();
  return { writes, db: {
    patch: writes,
    get: async () => null,
    query: (table: string) => ({ withIndex: (_name: string, filter: (q: unknown) => unknown) => {
      const conditions: Record<string, unknown> = {};
      const q = { eq: (key: string, value: unknown) => { conditions[key] = value; return q; } };
      filter(q);
      const rows = controls.filter(row => Object.entries(conditions).every(([key, value]) => row[key] === value));
      return { unique: async () => rows[0] ?? null, take: async () => rows,
        first: async () => table === 'workflowRuns' ? run : null };
    } }),
  } };
}
describe('admitted Work policy lineage', () => {
  it('does not fence another owner or unrelated capability', async () => {
    const ctx = context([{ scope: 'foreign-owner', capabilityId: 'work', operation: 'revoke', version: 9 },
      { scope, capabilityId: 'files', operation: 'revoke', version: 9 }]);
    expect(await capabilityWorkRestriction(ctx as never, { capabilityAuthorities: [authority] })).toBeUndefined();
  });
  it('preserves fresh admitted authority after earlier restrictions', async () => {
    expect(await capabilityWorkRestriction(context([{ scope, capabilityId: 'work', operation: 'revoke', version: 2 }]) as never,
      { capabilityAuthorities: [authority] })).toBeUndefined();
  });
  it('inherits Mission revocation in delegated Work', async () => {
    const ctx = context([{ scope, capabilityId: 'enterprise.missions', operation: 'revoke', version: 4 }]);
    expect(await capabilityWorkRestriction(ctx as never, { capabilityAuthorities: [authority,
      { ...authority, capabilityId: 'enterprise.missions', version: 1 }] })).toBe('CAPABILITY_AUTHORITY_FENCED');
  });
  it('labels pause as pending and gives revoke precedence', async () => {
    const controls = [{ scope, capabilityId: 'work', operation: 'pause', version: 4 }];
    expect(await capabilityWorkRestriction(context(controls) as never, { capabilityAuthorities: [authority] })).toBe('CAPABILITY_PAUSE_PENDING_BACKEND');
    controls.push({ scope, capabilityId: 'enterprise.fleet', operation: 'revoke', version: 5 });
    expect(await capabilityWorkRestriction(context(controls) as never, { capabilityAuthorities: [authority] })).toBe('CAPABILITY_AUTHORITY_FENCED');
  });
  it.each([['context', updateContext, { runId: 'run', context: { bypass: true } }],
    ['advance', advance, { runId: 'run' }]])('denies native %s writes even when the lease is absent', async (_name, mutation, args) => {
    const ctx = context([{ scope, capabilityId: 'work', operation: 'revoke', version: 4 }],
      { _id: 'run', capabilityAuthorities: [authority], reservedCostUsd: 12 });
    const handler = (mutation as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;
    await expect(handler(ctx, args)).rejects.toThrow('CAPABILITY_AUTHORITY_FENCED');
    expect(ctx.writes).not.toHaveBeenCalled();
  });
});
