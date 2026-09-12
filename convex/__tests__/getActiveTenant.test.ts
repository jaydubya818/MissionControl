import { describe, expect, it } from "vitest";
import { resolveActiveTenantId } from "../lib/getActiveTenant";

type Row = Record<string, any> & { _id: string };

function makeDb(rows: Row[], options: { allowInsert?: boolean } = {}) {
  const inserted: Array<{ table: string; value: Record<string, unknown> }> = [];
  const db: any = {
    get: async (id: string) => rows.find((row) => row._id === id) ?? null,
    query: (table: string) => ({
      withIndex: (index: string, cb: (q: any) => any) => {
        const { field, value } = cb({ eq: (field: string, value: unknown) => ({ field, value }) });
        const matches = rows.filter((row) => row._table === table && row[field] === value);
        return {
          first: async () => matches[0] ?? null,
          collect: async () => matches,
        };
      },
    }),
  };
  if (options.allowInsert) {
    db.insert = async (table: string, value: Record<string, unknown>) => {
      inserted.push({ table, value });
      return "tenant_new";
    };
  }
  return { db, inserted };
}

const tenant = (id: string, slug: string, active = true): Row => ({ _table: "tenants", _id: id, slug, active });

describe("resolveActiveTenantId", () => {
  it("returns an explicit tenantId without consulting the database", async () => {
    const { db } = makeDb([]);
    const result = await resolveActiveTenantId({ db }, { tenantId: "tenant_explicit" as any });
    expect(result).toBe("tenant_explicit");
  });

  it("does not check that an explicit tenantId agrees with the referenced project", async () => {
    // Callers that accept tenantId from the client are responsible for that check.
    const { db } = makeDb([{ _table: "projects", _id: "project_1", tenantId: "tenant_of_project" }]);
    const result = await resolveActiveTenantId(
      { db },
      { tenantId: "tenant_from_client" as any, projectId: "project_1" as any }
    );
    expect(result).toBe("tenant_from_client");
  });

  it("walks project -> template -> version -> instance -> environment in that order", async () => {
    const rows: Row[] = [
      { _table: "projects", _id: "project_1", tenantId: "tenant_project" },
      { _table: "agentTemplates", _id: "template_1", tenantId: "tenant_template" },
      { _table: "agentVersions", _id: "version_1", tenantId: "tenant_version" },
      { _table: "agentInstances", _id: "instance_1", tenantId: "tenant_instance" },
      { _table: "environments", _id: "env_1", tenantId: "tenant_env" },
    ];
    const { db } = makeDb(rows);
    const all = {
      projectId: "project_1",
      templateId: "template_1",
      versionId: "version_1",
      instanceId: "instance_1",
      environmentId: "env_1",
    } as any;
    expect(await resolveActiveTenantId({ db }, all)).toBe("tenant_project");
    expect(await resolveActiveTenantId({ db }, { ...all, projectId: undefined })).toBe("tenant_template");
    expect(await resolveActiveTenantId({ db }, { ...all, projectId: undefined, templateId: undefined })).toBe(
      "tenant_version"
    );
    expect(await resolveActiveTenantId({ db }, { instanceId: "instance_1", environmentId: "env_1" } as any)).toBe(
      "tenant_instance"
    );
    expect(await resolveActiveTenantId({ db }, { environmentId: "env_1" } as any)).toBe("tenant_env");
  });

  it("skips a referenced record that has no tenantId and keeps walking", async () => {
    const { db } = makeDb([
      { _table: "projects", _id: "project_legacy" },
      { _table: "agentVersions", _id: "version_1", tenantId: "tenant_version" },
    ]);
    const result = await resolveActiveTenantId(
      { db },
      { projectId: "project_legacy" as any, versionId: "version_1" as any }
    );
    expect(result).toBe("tenant_version");
  });

  it("skips a referenced id that does not exist", async () => {
    const { db } = makeDb([tenant("tenant_default", "default")]);
    const result = await resolveActiveTenantId({ db }, { projectId: "project_missing" as any });
    expect(result).toBe("tenant_default");
  });

  it("falls back to the active tenant with slug 'default'", async () => {
    const { db } = makeDb([tenant("tenant_other", "other"), tenant("tenant_default", "default")]);
    expect(await resolveActiveTenantId({ db }, {})).toBe("tenant_default");
  });

  it("ignores an inactive 'default' tenant and falls back to the first active tenant", async () => {
    const { db } = makeDb([
      tenant("tenant_default", "default", false),
      tenant("tenant_a", "a"),
      tenant("tenant_b", "b"),
    ]);
    expect(await resolveActiveTenantId({ db }, {})).toBe("tenant_a");
  });

  it("falls back to whichever active tenant the index returns first, even when several exist", async () => {
    // A legacy record with no tenantId is therefore attributed to an arbitrary active tenant.
    const { db } = makeDb([tenant("tenant_b", "b"), tenant("tenant_a", "a")]);
    expect(await resolveActiveTenantId({ db }, { projectId: "project_legacy" as any })).toBe("tenant_b");
  });

  it("returns undefined when there is no active tenant and creation is not requested", async () => {
    const { db, inserted } = makeDb([tenant("tenant_default", "default", false)], { allowInsert: true });
    expect(await resolveActiveTenantId({ db }, {})).toBeUndefined();
    expect(inserted).toEqual([]);
  });

  it("creates an active 'default' tenant only when asked and only on a writable ctx", async () => {
    const readOnly = makeDb([]);
    expect(await resolveActiveTenantId({ db: readOnly.db }, { createDefaultIfMissing: true })).toBeUndefined();

    const writable = makeDb([], { allowInsert: true });
    expect(await resolveActiveTenantId({ db: writable.db }, { createDefaultIfMissing: true })).toBe("tenant_new");
    expect(writable.inserted).toEqual([
      {
        table: "tenants",
        value: expect.objectContaining({ slug: "default", active: true, metadata: expect.objectContaining({ autoCreated: true }) }),
      },
    ]);
  });

  it("does not create a tenant when an active one already exists", async () => {
    const { db, inserted } = makeDb([tenant("tenant_a", "a")], { allowInsert: true });
    expect(await resolveActiveTenantId({ db }, { createDefaultIfMissing: true })).toBe("tenant_a");
    expect(inserted).toEqual([]);
  });
});
