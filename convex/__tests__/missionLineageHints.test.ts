import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';
import schema from '../schema';
import { missionLineage } from '../lib/missionLineage';
import { missionScopedContext } from '../lib/missionScopedFunctions';

// Exercise the installed SDK's real synchronous normalizeId syscall boundary.
// Its transport is deterministic here; these are operation counts, not timing.
const { setupReader } = createRequire(import.meta.url)('../../node_modules/convex/dist/cjs/server/impl/database_impl.js');
const tables = Object.keys(schema.tables);
const id = (n: number) => String(n).padStart(32, '0');
function fixture() {
  const identities = new Map<string, string>();
  const rows = new Map<string, any>();
  const calls: { table: string; idString: string }[] = [];
  const add = (table: string, row: any = {}) => {
    const key = id(identities.size + 1);
    identities.set(key, table); rows.set(key, { ...row, _id: key }); return key;
  };
  vi.stubGlobal('Convex', { syscall: (op: string, args: string) => {
    expect(op).toBe('1.0/db/normalizeId');
    const input = JSON.parse(args); calls.push(input);
    return JSON.stringify({ id: identities.get(input.idString) === input.table ? input.idString : null });
  } });
  const db = { normalizeId: setupReader().normalizeId, get: async (key: string) => rows.get(key) ?? null };
  return { add, rows, calls, db, lineage: missionLineage(db as any) };
}
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['qcArtifacts', 'qcRunId', 'qcRuns', 'metadata'],
  ['contextPackageVersions', 'packageId', 'contextPackages', 'compatibility'],
])('does not scan user tables for typed storage references in %s', (table, parentField, parentTable, opaqueField) => {
  const f = fixture(), parent = f.add(parentTable), storage = f.add('_storage');
  const document = f.add(table, { [parentField]: parent, storageId: storage });
  const row = f.rows.get(document);
  expect(f.lineage.references(row, table)).toEqual([parent]);
  expect(f.calls.filter(c => c.idString === storage)).toEqual([]);
  expect(f.calls).toHaveLength(2); // The query row and its user-table parent.

  // The same value in opaque content still follows the exhaustive fallback.
  expect(f.lineage.references({ ...row, [opaqueField]: { parent: storage } }, table)).toEqual([parent]);
  expect(f.calls.filter(c => c.idString === storage).map(c => c.table)).toEqual(tables);
});

it('validates schema and query-row hints once and preserves ordered opaque references', () => {
  const f = fixture(), tenant = f.add('tenants'), project = f.add('projects'), wo = f.add('workOrders');
  const foreign = f.add('missions'), document = f.add('factoryMemoryDocuments', {
    tenantId: tenant, projectId: project, workOrderId: wo,
    metadata: { nested: [{ parent: foreign }, { duplicate: wo }] },
  });
  expect(f.lineage.references(f.rows.get(document), 'factoryMemoryDocuments')).toEqual([tenant, project, wo, foreign]);
  for (const [key, table] of [[document, 'factoryMemoryDocuments'], [tenant, 'tenants'], [project, 'projects'], [wo, 'workOrders']]) {
    expect(f.lineage.tableOf(key)).toBe(table);
    expect(f.calls.filter(c => c.idString === key)).toEqual([{ table, idString: key }]);
  }
  expect(f.calls.filter(c => c.idString === foreign)).toHaveLength(tables.indexOf('missions') + 1);
});

it('falls back on a wrong hint and never overwrites an already validated table', () => {
  const f = fixture(), mission = f.add('missions');
  expect(f.lineage.tableOf(mission, 'workOrders')).toBe('missions');
  const count = f.calls.length;
  expect(f.lineage.tableOf(mission, 'workOrders')).toBe('missions');
  expect(f.lineage.tableOf(mission, 'workflowRuns')).toBe('missions');
  expect(f.calls).toHaveLength(count);
  expect(f.calls[0]).toEqual({ table: 'workOrders', idString: mission });
});

it('does not treat a mismatched typed field as proof of the hinted table', () => {
  const f = fixture(), mission = f.add('missions');
  expect(f.lineage.references({ workOrderId: mission }, 'factoryMemoryDocuments')).toEqual([mission]);
  expect(f.lineage.tableOf(mission)).toBe('missions');
});

it('retains complete opaque scans and caches an unknown result only within this request', () => {
  const f = fixture(), unknown = 'z'.repeat(32);
  expect(f.lineage.references({ metadata: { parent: unknown } }, 'factoryMemoryDocuments')).toEqual([]);
  expect(f.calls.map(c => c.table)).toEqual(tables);
  expect(f.lineage.tableOf(unknown)).toBeNull();
  expect(f.calls).toHaveLength(tables.length);
  expect(missionLineage(f.db as any).tableOf(unknown)).toBeNull();
  expect(f.calls).toHaveLength(tables.length * 2);
});

it.each(['not-a-schema-table', '__proto__', 'toString'])('does not use unrecognized hint %s as authority', hint => {
  const f = fixture(), mission = f.add('missions');
  expect(f.lineage.tableOf(mission, hint)).toBe('missions');
  expect(f.calls.some(c => c.table === hint)).toBe(false);
});

it('fails closed when the database cannot validate a hint', () => {
  const f = fixture(), mission = f.add('missions');
  vi.stubGlobal('Convex', { syscall: () => { throw Error('database unavailable'); } });
  expect(() => f.lineage.tableOf(mission, 'missions')).toThrow('database unavailable');
});

it('preserves cross-owner and missing-parent denial through the scoped database', async () => {
  const f = fixture(), tenant = f.add('tenants'), project = f.add('projects');
  const owner = f.add('operators'), peer = f.add('operators');
  const own = f.add('missions', { tenantId: tenant, projectId: project, ownerOperatorId: owner });
  const foreign = f.add('missions', { tenantId: tenant, projectId: project, ownerOperatorId: peer });
  const doc = (mission: string) => f.add('factoryMemoryDocuments', { tenantId: tenant, projectId: project, metadata: { mission } });
  const good = doc(own), bad = doc(foreign), missing = f.add('workOrders');
  const broken = f.add('factoryMemoryDocuments', { tenantId: tenant, projectId: project, workOrderId: missing });
  f.rows.delete(missing); // normalizeId proves table identity, not row existence.
  const ctx: any = { db: f.db, auth: { getUserIdentity: async () => null } };
  const scope = () => missionScopedContext(ctx, 'OWNER', undefined, undefined, {
    missionId: own, connection: { ownerId: owner, tenantId: tenant, projectId: project }, request: { operation: 'enterprise.result' },
  } as any);
  expect(await scope().db.get(good as any)).not.toBeNull();
  expect(await scope().db.get(bad as any)).toBeNull();
  expect(await scope().db.get(broken as any)).toBeNull();
  f.rows.get(own).ownerOperatorId = peer;
  expect(await scope().db.get(good as any)).toBeNull();
});
