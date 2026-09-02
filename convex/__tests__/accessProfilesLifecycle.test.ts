import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  assignPrimaryPersona,
  ensureSystemProfiles,
  getMyAccessContext,
  setAccessControlMode,
  updateProfile,
} from "../accessProfiles";
import { ACCESS_PROFILE_DEFAULTS } from "@mission-control/shared";

function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

type Tables = Record<string, any[]>;

function createContext({ admin = true }: { admin?: boolean } = {}) {
  const tenantId = "tenant-a" as Id<"tenants">;
  const operatorId = "operator-a" as Id<"operators">;
  const secondOperatorId = "operator-b" as Id<"operators">;
  const legacyRoleId = "role-legacy" as Id<"roles">;
  const projectId = "project-a" as Id<"projects">;
  const tables: Tables = {
    tenants: [{
      _id: tenantId,
      _creationTime: 1,
      name: "Mission Control",
      slug: "mission-control",
      active: true,
      accessControlMode: "LEGACY",
      accessControlVersion: 0,
    }],
    operators: [
      {
        _id: operatorId,
        _creationTime: 2,
        tenantId,
        name: "Primary operator",
        email: "primary@example.com",
        authId: "auth-primary",
        active: true,
        createdAt: 1,
      },
      {
        _id: secondOperatorId,
        _creationTime: 3,
        tenantId,
        name: "Second operator",
        email: "second@example.com",
        authId: "auth-second",
        active: true,
        createdAt: 1,
      },
    ],
    roles: [{
      _id: legacyRoleId,
      _creationTime: 4,
      tenantId,
      name: admin ? "Company Owner" : "Viewer",
      permissions: admin ? ["settings.manage", "company.manage"] : ["tasks.read"],
    }],
    roleAssignments: [{
      _id: "assignment-legacy",
      _creationTime: 5,
      operatorId,
      roleId: legacyRoleId,
      scope: { type: "tenant", id: tenantId },
      assignedAt: 1,
    }],
    projects: [{
      _id: projectId,
      _creationTime: 6,
      tenantId,
      name: "Primary workspace",
      slug: "primary",
      status: "ACTIVE",
    }],
    scrumTeams: [],
    accessProfileRevisions: [],
    activities: [],
  };
  let sequence = 100;

  const db = {
    get: async (id: string) =>
      Object.values(tables).flat().find((row) => row._id === id) ?? null,
    insert: async (table: string, value: Record<string, unknown>) => {
      const id = `${table}-${sequence++}`;
      (tables[table] ??= []).push({ _id: id, _creationTime: sequence, ...value });
      return id;
    },
    patch: async (id: string, value: Record<string, unknown>) => {
      const row = Object.values(tables).flat().find((candidate) => candidate._id === id);
      if (!row) throw new Error(`Missing row ${id}`);
      Object.assign(row, value);
    },
    delete: async (id: string) => {
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index >= 0) rows.splice(index, 1);
      }
    },
    normalizeId: (table: string, id: string) =>
      (tables[table] ?? []).some((row) => row._id === id) ? id : null,
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      let descending = false;
      const builder: any = {
        withIndex: (_name: string, apply: (q: any) => any) => {
          const conditions: Array<[string, unknown]> = [];
          const q: any = {
            eq: (field: string, value: unknown) => {
              conditions.push([field, value]);
              return q;
            },
          };
          apply(q);
          rows = rows.filter((row) =>
            conditions.every(([field, value]) => row[field] === value)
          );
          return builder;
        },
        order: (direction: "asc" | "desc") => {
          descending = direction === "desc";
          return builder;
        },
        collect: async () => descending ? [...rows].reverse() : rows,
        first: async () => (descending ? [...rows].reverse() : rows)[0] ?? null,
      };
      return builder;
    },
  };

  return {
    tenantId,
    operatorId,
    secondOperatorId,
    projectId,
    tables,
    ctx: {
      auth: {
        getUserIdentity: async () => ({
          subject: "auth-primary",
          tokenIdentifier: "issuer|auth-primary",
        }),
      },
      db,
    } as any,
  };
}

describe("access profile lifecycle", () => {
  it("initializes exactly four immutable system profiles idempotently", async () => {
    const state = createContext();
    const first = await functionHandler(ensureSystemProfiles)(state.ctx, {
      tenantId: state.tenantId,
    });
    const second = await functionHandler(ensureSystemProfiles)(state.ctx, {
      tenantId: state.tenantId,
    });

    expect(first.created).toEqual(["EXECUTIVE", "ARCHITECT", "BUILDER", "ADMIN"]);
    expect(second.created).toEqual([]);
    expect(state.tables.roles.filter((role) => role.systemKey)).toHaveLength(4);
    expect(state.tables.accessProfileRevisions).toHaveLength(4);
    expect(new Set(state.tables.accessProfileRevisions.map((revision) => revision.digest)).size).toBe(4);
  });

  it("requires shadow rollout, blocks uncovered enforcement, and preserves final-Admin safety", async () => {
    const state = createContext();
    await functionHandler(ensureSystemProfiles)(state.ctx, { tenantId: state.tenantId });

    await expect(functionHandler(setAccessControlMode)(state.ctx, {
      tenantId: state.tenantId,
      expectedMode: "LEGACY",
      nextMode: "ENFORCED",
      reason: "Skip shadow",
    })).rejects.toThrow(/SHADOW/);

    await functionHandler(assignPrimaryPersona)(state.ctx, {
      tenantId: state.tenantId,
      operatorId: state.operatorId,
      systemKey: "ADMIN",
      scope: { type: "tenant", id: state.tenantId },
    });
    await functionHandler(setAccessControlMode)(state.ctx, {
      tenantId: state.tenantId,
      expectedMode: "LEGACY",
      nextMode: "SHADOW",
      reason: "Compare authorization decisions",
    });
    await expect(functionHandler(setAccessControlMode)(state.ctx, {
      tenantId: state.tenantId,
      expectedMode: "SHADOW",
      nextMode: "ENFORCED",
      reason: "Authorization parity confirmed",
    })).rejects.toThrow(/server coverage is complete/);

    const access = await functionHandler(getMyAccessContext)(state.ctx, {
      tenantId: state.tenantId,
      projectId: undefined,
    });
    expect(access).toMatchObject({ status: "READY", persona: "ADMIN", enforced: false, mode: "SHADOW" });
    expect(access.effectivePermissions).toContain("accessProfiles.manage");

    await expect(functionHandler(assignPrimaryPersona)(state.ctx, {
      tenantId: state.tenantId,
      operatorId: state.operatorId,
      systemKey: "EXECUTIVE",
      scope: { type: "tenant", id: state.tenantId },
    })).rejects.toThrow(/final Admin/);
  });

  it("rejects invalid persona scope and stale profile writes", async () => {
    const state = createContext();
    await functionHandler(ensureSystemProfiles)(state.ctx, { tenantId: state.tenantId });

    await expect(functionHandler(assignPrimaryPersona)(state.ctx, {
      tenantId: state.tenantId,
      operatorId: state.secondOperatorId,
      systemKey: "BUILDER",
      scope: { type: "tenant", id: state.tenantId },
    })).rejects.toThrow(/cannot be assigned at tenant scope/);

    const otherTenantId = "tenant-b" as Id<"tenants">;
    const otherProjectId = "project-b" as Id<"projects">;
    state.tables.tenants.push({
      _id: otherTenantId,
      _creationTime: 7,
      name: "Other company",
      slug: "other-company",
      active: true,
    });
    state.tables.projects.push({
      _id: otherProjectId,
      _creationTime: 8,
      tenantId: otherTenantId,
      name: "Other workspace",
      slug: "other-workspace",
      status: "ACTIVE",
    });

    await expect(functionHandler(assignPrimaryPersona)(state.ctx, {
      tenantId: state.tenantId,
      operatorId: state.secondOperatorId,
      systemKey: "ARCHITECT",
      scope: { type: "project", id: otherProjectId },
    })).rejects.toThrow(/must belong to the selected company/);

    const proposed = {
      permissions: [...ACCESS_PROFILE_DEFAULTS.EXECUTIVE.permissions],
      visibleViews: [...ACCESS_PROFILE_DEFAULTS.EXECUTIVE.visibleViews],
      defaultLandingView: ACCESS_PROFILE_DEFAULTS.EXECUTIVE.defaultLandingView,
      defaultScopeLens: ACCESS_PROFILE_DEFAULTS.EXECUTIVE.defaultScopeLens,
    };
    const updated = await functionHandler(updateProfile)(state.ctx, {
      tenantId: state.tenantId,
      systemKey: "EXECUTIVE",
      expectedVersion: 1,
      proposed,
      reason: "Confirm the canonical executive profile",
    });
    expect(updated.version).toBe(2);
    expect(state.tables.accessProfileRevisions.filter((item) => item.systemKey === "EXECUTIVE")).toHaveLength(2);

    await expect(functionHandler(updateProfile)(state.ctx, {
      tenantId: state.tenantId,
      systemKey: "EXECUTIVE",
      expectedVersion: 1,
      proposed,
      reason: "Stale concurrent change",
    })).rejects.toThrow(/changed in another session/);
  });

  it("denies profile administration to a non-admin role", async () => {
    const state = createContext({ admin: false });
    await expect(functionHandler(ensureSystemProfiles)(state.ctx, {
      tenantId: state.tenantId,
    })).rejects.toThrow(/does not permit/);
  });
});
