/**
 * Server-side authority regression tests for control-plane mutations that were
 * publicly callable without an identity.
 *
 * Convex `query`/`mutation` exports are internet-callable by anyone holding the
 * deployment URL, which ships in the client bundle as `VITE_CONVEX_URL`. Each
 * case below asserts that an anonymous caller is refused and that attribution
 * is derived from the server-resolved membership rather than from arguments.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { setFlag } from "../featureFlags";
import { approve, deny } from "../approvals";
import { setUrl } from "../gatewayConnection";
import { addProjectAccess, updatePermissions } from "../orgMembers";
import { create as createWebhook, list as listWebhooks } from "../webhooks";
import { requiredFlagWriteAuthority, flagRequiresWorkspaceScope } from "../lib/flags";

const originalDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;

beforeEach(() => {
  delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
});

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

type TableState = Record<string, any[]>;

function createContext({
  identity = { subject: "auth-user", tokenIdentifier: "issuer|auth-user" },
  // `isCompanyAdminRole` treats a role literally named "Owner"/"Admin" as a
  // company administrator regardless of its permission list, so a restricted
  // fixture must use a non-administrative role name.
  roleName = "Owner",
  permissions = [
    "settings.manage",
    "workspaces.manage",
    "members.manage",
    "delivery.approve",
  ],
}: {
  identity?: { subject: string; tokenIdentifier: string } | null;
  roleName?: string;
  permissions?: string[];
} = {}) {
  const tenantId = "tenant-a" as Id<"tenants">;
  const projectId = "project-a" as Id<"projects">;
  const operatorId = "operator-a" as Id<"operators">;
  const roleId = "role-a" as Id<"roles">;
  const agentId = "agent-a" as Id<"agents">;
  const approvalId = "approval-a" as Id<"approvals">;
  const memberId = "member-a" as Id<"orgMembers">;

  const tables: TableState = {
    tenants: [{ _id: tenantId, _creationTime: 1, name: "Mission Control", slug: "mc", active: true }],
    projects: [{ _id: projectId, _creationTime: 2, tenantId, name: "Primary", slug: "primary" }],
    operators: [{
      _id: operatorId,
      _creationTime: 3,
      tenantId,
      authId: "auth-user",
      email: "operator@example.com",
      name: "Operator",
      active: true,
      createdAt: 1,
    }],
    roles: [{ _id: roleId, _creationTime: 4, tenantId, name: roleName, permissions }],
    roleAssignments: [{
      _id: "assignment-a",
      _creationTime: 5,
      operatorId,
      roleId,
      scope: { type: "tenant", id: tenantId },
      assignedAt: 1,
    }],
    teamMemberships: [],
    orgMembers: [{
      _id: memberId,
      _creationTime: 6,
      tenantId,
      projectId,
      name: "Member",
      role: "Engineer",
      level: 1,
      active: true,
      projectAccess: [],
      systemRole: "VIEWER",
    }],
    agents: [{ _id: agentId, _creationTime: 7, projectId, name: "Builder" }],
    approvals: [{
      _id: approvalId,
      _creationTime: 8,
      tenantId,
      projectId,
      requestorAgentId: agentId,
      actionType: "DEPLOY",
      actionSummary: "Deploy release",
      riskLevel: "RED",
      justification: "Release",
      status: "PENDING",
      requiredDecisionCount: 2,
      expiresAt: Date.now() + 3_600_000,
    }],
    approvalRecords: [],
    activities: [],
    featureFlags: [],
    gatewayConnection: [],
    webhooks: [],
    taskEvents: [],
    tasks: [],
    changeRecords: [],
    opEvents: [],
    agentInstances: [],
    agentVersions: [],
  };
  let sequence = 100;

  const db = {
    get: async (id: string) => Object.values(tables).flat().find((row) => row._id === id) ?? null,
    insert: async (table: string, value: Record<string, unknown>) => {
      const id = `${table}-${sequence++}`;
      (tables[table] ??= []).push({ _id: id, _creationTime: sequence, ...value });
      return id;
    },
    patch: async (id: string, patch: Record<string, unknown>) => {
      const row = Object.values(tables).flat().find((item) => item._id === id);
      if (!row) throw new Error(`Missing row ${id}`);
      Object.assign(row, patch);
    },
    delete: async (id: string) => {
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index >= 0) {
          rows.splice(index, 1);
          return;
        }
      }
    },
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const builder: any = {
        withIndex: (_name: string, apply?: (q: any) => any) => {
          if (!apply) return builder;
          const conditions: Array<{ field: string; value: unknown }> = [];
          const q: any = {
            eq: (field: string, value: unknown) => {
              conditions.push({ field, value });
              return q;
            },
            gte: () => q,
          };
          apply(q);
          rows = rows.filter((row) => conditions.every((c) => row[c.field] === c.value));
          return builder;
        },
        filter: () => builder,
        order: () => builder,
        collect: async () => [...rows],
        first: async () => rows[0] ?? null,
        take: async (limit: number) => rows.slice(0, limit),
      };
      return builder;
    },
  };

  return {
    ctx: { auth: { getUserIdentity: async () => identity }, db } as any,
    tables,
    tenantId,
    projectId,
    operatorId,
    approvalId,
    memberId,
  };
}

describe("feature flag write authority", () => {
  it("classifies every key, including unregistered ones, as requiring an authority", () => {
    expect(requiredFlagWriteAuthority("factory-memory.hybrid", true)).toBe("WORKSPACE_FACTORY_AUTOMATION");
    expect(requiredFlagWriteAuthority("control-plane.team-authorization", true)).toBe("WORKSPACE_MANAGE");
    expect(requiredFlagWriteAuthority("company.context", true)).toBe("WORKSPACE_MANAGE");
    expect(requiredFlagWriteAuthority("company.context", false)).toBe("COMPANY_ADMIN");
    expect(requiredFlagWriteAuthority("some.unregistered.key", false)).toBe("COMPANY_ADMIN");
    expect(flagRequiresWorkspaceScope("model-routing.enabled")).toBe(true);
    expect(flagRequiresWorkspaceScope("company.context")).toBe(false);
  });

  it("refuses an anonymous caller for the gate flags that disable authorization", () => {
    // Regression: `company.context` and `control-plane.*` gate the server-side
    // authorization checks themselves. `setFlag` previously fell through to an
    // unauthenticated upsert for every key outside three Factory prefixes, so a
    // browser could switch the control plane's own access control off.
    const anonymous = createContext({ identity: null });
    return Promise.all([
      expect(functionHandler(setFlag)(anonymous.ctx, {
        key: "company.context",
        enabled: false,
      })).rejects.toThrow(/administrator/i),
      expect(functionHandler(setFlag)(anonymous.ctx, {
        key: "company.context",
        enabled: false,
        projectId: anonymous.projectId,
      })).rejects.toThrow(/unavailable or unauthorized/i),
    ]);
  });

  it("derives global flag attribution from the administrator membership", async () => {
    const state = createContext();
    await functionHandler(setFlag)(state.ctx, {
      key: "company.context",
      enabled: true,
      actorId: "spoofed-browser-actor",
    });
    expect(state.tables.featureFlags[0].updatedBy).toBe(state.operatorId);
    expect(state.tables.activities.at(-1)).toMatchObject({
      actorId: state.operatorId,
      action: "FEATURE_FLAG_SET",
    });
  });

  it("refuses a global flag write from a member without company administration", async () => {
    const member = createContext({ roleName: "Developer", permissions: ["delivery.write"] });
    await expect(functionHandler(setFlag)(member.ctx, {
      key: "company.context",
      enabled: false,
    })).rejects.toThrow(/administrator/i);
  });
});

describe("approval decision authority", () => {
  it("refuses an anonymous decider", async () => {
    const anonymous = createContext({ identity: null });
    await expect(functionHandler(approve)(anonymous.ctx, {
      approvalId: anonymous.approvalId,
      decidedByUserId: "alice",
    })).rejects.toThrow(/unavailable or unauthorized/i);
    await expect(functionHandler(deny)(anonymous.ctx, {
      approvalId: anonymous.approvalId,
      reason: "no",
    })).rejects.toThrow(/unavailable or unauthorized/i);
  });

  it("refuses a caller without delivery approval permission", async () => {
    const viewer = createContext({ roleName: "Developer", permissions: ["delivery.write"] });
    await expect(functionHandler(approve)(viewer.ctx, {
      approvalId: viewer.approvalId,
      decidedByUserId: "alice",
    })).rejects.toThrow(/does not permit/i);
  });

  it("cannot satisfy RED dual control with a client-named second decider", async () => {
    // Regression: `decidedByUserId` was a client-supplied string and dual
    // control was enforced only by comparing the first and second decider, so
    // one caller could approve twice under two invented identities.
    const state = createContext();
    const first = await functionHandler(approve)(state.ctx, {
      approvalId: state.approvalId,
      decidedByUserId: "alice",
    });
    expect(first).toMatchObject({ success: true, pendingSecondDecision: true });
    expect(state.tables.approvals[0].firstDecisionByUserId).toBe(state.operatorId);

    const second = await functionHandler(approve)(state.ctx, {
      approvalId: state.approvalId,
      decidedByUserId: "bob",
    });
    expect(second).toMatchObject({ success: false });
    expect(second.error).toMatch(/different approver/i);
    expect(state.tables.approvals[0].status).toBe("PENDING");
  });
});

describe("gateway connection authority", () => {
  it("refuses an anonymous writer for the URL the server attaches GATEWAY_TOKEN to", async () => {
    const anonymous = createContext({ identity: null });
    await expect(functionHandler(setUrl)(anonymous.ctx, {
      url: "https://attacker.example",
    })).rejects.toThrow(/administrator/i);
  });

  it("records the administrator as the server-derived author", async () => {
    const state = createContext();
    await functionHandler(setUrl)(state.ctx, {
      url: "http://localhost:18789",
      updatedBy: "spoofed",
    });
    expect(state.tables.gatewayConnection[0]).toMatchObject({
      url: "http://localhost:18789",
      updatedBy: state.operatorId,
    });
  });
});

describe("org member permission authority", () => {
  it("refuses an anonymous permission or project-access grant", async () => {
    // Regression: `orgMembers.projectAccess` is one of the grants
    // `requireWorkspaceAccess` accepts, so writing it is a permission grant.
    const anonymous = createContext({ identity: null });
    await expect(functionHandler(updatePermissions)(anonymous.ctx, {
      id: anonymous.memberId,
      systemRole: "OWNER",
    })).rejects.toThrow(/unavailable or unauthorized/i);
    await expect(functionHandler(addProjectAccess)(anonymous.ctx, {
      memberId: anonymous.memberId,
      projectId: anonymous.projectId,
      accessLevel: "ADMIN",
    })).rejects.toThrow(/unavailable or unauthorized/i);
  });

  it("refuses a member without members.manage", async () => {
    const member = createContext({ roleName: "Developer", permissions: ["delivery.write"] });
    await expect(functionHandler(addProjectAccess)(member.ctx, {
      memberId: member.memberId,
      projectId: member.projectId,
      accessLevel: "ADMIN",
    })).rejects.toThrow(/does not permit/i);
  });
});

describe("webhook authority and secret handling", () => {
  it("refuses an anonymous listing and never returns the signing secret", async () => {
    const anonymous = createContext({ identity: null });
    await expect(functionHandler(listWebhooks)(anonymous.ctx, {
      projectId: anonymous.projectId,
    })).rejects.toThrow(/unavailable or unauthorized/i);

    const state = createContext();
    state.tables.webhooks.push({
      _id: "webhook-a",
      _creationTime: 20,
      projectId: state.projectId,
      name: "Ops",
      url: "https://hooks.example.com/x",
      secret: "super-secret-signing-key",
      events: ["TASK_DONE"],
      active: true,
      deliveryCount: 0,
      failureCount: 0,
    });
    const rows = await functionHandler(listWebhooks)(state.ctx, { projectId: state.projectId });
    expect(rows).toHaveLength(1);
    expect(rows[0].secret).toBeUndefined();
    expect(rows[0].secretConfigured).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("super-secret-signing-key");
  });

  it("rejects a non-public webhook destination (SSRF)", async () => {
    const state = createContext();
    await expect(functionHandler(createWebhook)(state.ctx, {
      projectId: state.projectId,
      name: "Metadata",
      url: "https://169.254.169.254/latest/meta-data",
      secret: "0123456789abcdef0",
      events: ["TASK_DONE"],
    })).rejects.toThrow(/Webhook URL rejected/);
  });
});
