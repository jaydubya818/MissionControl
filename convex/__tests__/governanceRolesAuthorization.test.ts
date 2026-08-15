import { afterEach, describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { createRole } from "../governance/roles";

const originalDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;

afterEach(() => {
  if (originalDemoFlag === undefined) {
    delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
  } else {
    process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = originalDemoFlag;
  }
});

function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

function createContext(permissions: string[]) {
  const tenantId = "tenant-a" as Id<"tenants">;
  const tables: Record<string, any[]> = {
    tenants: [{ _id: tenantId, _creationTime: 1, name: "Company A", slug: "company-a", active: true }],
    operators: [{ _id: "operator-a", _creationTime: 2, tenantId, authId: "identity-a", name: "A", email: "a@example.com", active: true, createdAt: 1 }],
    roles: [{ _id: "role-a", _creationTime: 3, tenantId, name: "Company Owner", permissions }],
    roleAssignments: [{ _id: "assignment-a", _creationTime: 4, operatorId: "operator-a", roleId: "role-a", scope: { type: "tenant", id: tenantId }, assignedAt: 1 }],
    activities: [],
  };
  let sequence = 100;
  const allRows = () => Object.values(tables).flat();
  return {
    tenantId,
    tables,
    ctx: {
      auth: { getUserIdentity: async () => ({ subject: "identity-a", tokenIdentifier: "issuer|identity-a" }) },
      db: {
        get: async (id: string) => allRows().find((row) => row._id === id) ?? null,
        insert: async (table: string, value: Record<string, unknown>) => {
          const id = `${table}-${sequence++}`;
          (tables[table] ??= []).push({ _id: id, _creationTime: sequence, ...value });
          return id;
        },
        query: (table: string) => {
          let rows = [...(tables[table] ?? [])];
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
            collect: async () => [...rows],
            first: async () => rows[0] ?? null,
          };
          return builder;
        },
      },
    } as any,
  };
}

describe("governance role authorization", () => {
  it("prevents a company owner from minting platform authority", async () => {
    const state = createContext(["members.manage"]);
    await expect(
      functionHandler(createRole)(state.ctx, {
        tenantId: state.tenantId,
        name: "Platform administrator",
        permissions: ["platform.tenants.create"],
      })
    ).rejects.toThrow("Platform permissions cannot be granted");
    expect(state.tables.roles).toHaveLength(1);
  });

  it("allows an existing platform administrator to delegate its exact platform permission", async () => {
    const state = createContext(["members.manage", "platform.tenants.create"]);
    await functionHandler(createRole)(state.ctx, {
      tenantId: state.tenantId,
      name: "Tenant provisioner",
      description: "Creates governed company accounts",
      permissions: [" platform.tenants.create ", "platform.tenants.create"],
    });
    expect(state.tables.roles.at(-1)).toMatchObject({
      name: "Tenant provisioner",
      permissions: ["platform.tenants.create"],
    });
    expect(state.tables.activities.at(-1)).toMatchObject({
      actorId: "operator-a",
      action: "COMPANY_ROLE_CREATED",
    });
  });

  it("preserves normal company role creation", async () => {
    const state = createContext(["members.manage"]);
    await functionHandler(createRole)(state.ctx, {
      tenantId: state.tenantId,
      name: " Release reviewer ",
      permissions: ["factory.read", "factory.approve"],
    });
    expect(state.tables.roles.at(-1)).toMatchObject({
      name: "Release reviewer",
      permissions: ["factory.read", "factory.approve"],
    });
  });
});
