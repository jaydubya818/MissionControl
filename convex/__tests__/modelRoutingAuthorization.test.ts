import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  initializeDefaults,
  list as listCatalog,
  reportHealth,
  syncLocalModels,
} from "../modelCatalog";
import {
  getAgentOverride,
  save,
  setAgentOverride,
  simulate,
} from "../modelRoutingPolicies";
import {
  getForTask,
  getForWorkflowRun,
  listRecent,
} from "../modelRoutingDecisions";
import { setFlag } from "../featureFlags";
import { setAuthorizedModelOverride } from "../workOrders";
import { promoteGuardedAuto, setPinnedTuple } from "../executionRouting";

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
  permissions = ["factory.read", "factory.improve", "factory.automation.manage"],
}: {
  identity?: { subject: string; tokenIdentifier: string } | null;
  permissions?: string[];
} = {}) {
  const tenantId = "tenant-a" as Id<"tenants">;
  const projectId = "project-a" as Id<"projects">;
  const otherProjectId = "project-b" as Id<"projects">;
  const operatorId = "operator-a" as Id<"operators">;
  const roleId = "role-a" as Id<"roles">;
  const agentId = "agent-a" as Id<"agents">;
  const otherAgentId = "agent-b" as Id<"agents">;
  const modelId = "approved-model";
  const tables: TableState = {
    tenants: [{
      _id: tenantId,
      _creationTime: 1,
      name: "Mission Control",
      slug: "mission-control",
      active: true,
    }],
    projects: [
      { _id: projectId, _creationTime: 2, tenantId, name: "Primary", slug: "primary" },
      { _id: otherProjectId, _creationTime: 3, tenantId, name: "Other", slug: "other" },
    ],
    operators: [{
      _id: operatorId,
      _creationTime: 4,
      tenantId,
      authId: "auth-user",
      email: "operator@example.com",
      name: "Operator",
      active: true,
      createdAt: 1,
    }],
    roles: [{
      _id: roleId,
      _creationTime: 5,
      tenantId,
      name: "Factory operator",
      permissions,
    }],
    roleAssignments: [{
      _id: "assignment-a",
      _creationTime: 6,
      operatorId,
      roleId,
      scope: { type: "project", id: projectId },
      assignedAt: 1,
    }],
    teamMemberships: [],
    orgMembers: [],
    agents: [
      { _id: agentId, _creationTime: 7, projectId, name: "Builder" },
      { _id: otherAgentId, _creationTime: 8, projectId: otherProjectId, name: "Other builder" },
    ],
    modelCatalog: [{
      _id: "model-a",
      _creationTime: 9,
      provider: "test",
      modelId,
      displayName: "Approved model",
      tier: "BALANCED",
      capabilities: ["text", "code", "tools"],
      supportsTools: true,
      riskApproved: true,
      contextWindow: 128_000,
      availability: "HEALTHY",
      estimatedCostPerRunUsd: 0.1,
      deprecated: false,
      updatedAt: 1,
    }],
    modelRoutingPolicies: [],
    agentModelOverrides: [],
    modelRoutingDecisions: [],
    activities: [],
    featureFlags: [],
    workflowRuns: [],
    tasks: [],
    workOrders: [],
    workflows: [],
    factoryDefinitions: [],
    factoryDefinitionVersions: [],
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
        withIndex: (_name: string, apply: (q: any) => any) => {
          const conditions: Array<{ field: string; operation: "eq" | "gte"; value: unknown }> = [];
          const q: any = {
            eq: (field: string, value: unknown) => {
              conditions.push({ field, operation: "eq", value });
              return q;
            },
            gte: (field: string, value: unknown) => {
              conditions.push({ field, operation: "gte", value });
              return q;
            },
          };
          apply(q);
          rows = rows.filter((row) => conditions.every((condition) =>
            condition.operation === "eq"
              ? row[condition.field] === condition.value
              : row[condition.field] >= condition.value
          ));
          return builder;
        },
        filter: (apply: (q: any) => any) => {
          const q = {
            field: (field: string) => ({ field }),
            eq: (left: { field: string }, right: unknown) => ({ operation: "eq", left, right }),
          };
          const condition = apply(q);
          if (condition?.operation === "eq" && condition.left?.field) {
            rows = rows.filter((row) => row[condition.left.field] === condition.right);
          }
          return builder;
        },
        order: (direction: "asc" | "desc") => {
          const multiplier = direction === "desc" ? -1 : 1;
          rows.sort((left, right) =>
            ((left.createdAt ?? left._creationTime) - (right.createdAt ?? right._creationTime)) * multiplier
          );
          return builder;
        },
        collect: async () => [...rows],
        first: async () => rows[0] ?? null,
        take: async (limit: number) => rows.slice(0, limit),
      };
      return builder;
    },
  };

  return {
    ctx: {
      auth: { getUserIdentity: async () => identity },
      db,
    } as any,
    tables,
    tenantId,
    projectId,
    otherProjectId,
    operatorId,
    agentId,
    otherAgentId,
    modelId,
  };
}

describe("Model Routing authorization", () => {
  it("fails catalog reads closed when the caller is anonymous", async () => {
    const { ctx, projectId } = createContext({ identity: null });
    await expect(functionHandler(listCatalog)(ctx, { projectId })).rejects.toThrow(
      "unavailable or unauthorized"
    );
  });

  it("allows an authorized workspace viewer and denies another workspace", async () => {
    const { ctx, projectId, otherProjectId } = createContext({ permissions: ["factory.read"] });
    await expect(functionHandler(listCatalog)(ctx, { projectId })).resolves.toHaveLength(1);
    await expect(functionHandler(listCatalog)(ctx, { projectId: otherProjectId })).rejects.toThrow(
      "Workspace is unavailable or unauthorized"
    );
  });

  it("requires automation authority and derives catalog audit attribution on the server", async () => {
    const denied = createContext({ permissions: ["factory.read"] });
    await expect(
      functionHandler(initializeDefaults)(denied.ctx, { projectId: denied.projectId })
    ).rejects.toThrow("does not permit");

    const allowed = createContext();
    await functionHandler(initializeDefaults)(allowed.ctx, {
      projectId: allowed.projectId,
      actorId: "spoofed-browser-actor",
    } as any);
    const activity = allowed.tables.activities.at(-1);
    expect(activity).toMatchObject({
      tenantId: allowed.tenantId,
      projectId: allowed.projectId,
      actorId: allowed.operatorId,
      action: "MODEL_CATALOG_INITIALIZED",
    });
  });

  it("keeps provider health and local catalog synchronization internal-only", async () => {
    expect((reportHealth as any).isInternal).toBe(true);
    expect((reportHealth as any).isPublic).not.toBe(true);
    expect((syncLocalModels as any).isInternal).toBe(true);
    expect((syncLocalModels as any).isPublic).not.toBe(true);
    const allowed = createContext();
    await functionHandler(syncLocalModels)(allowed.ctx, {
      projectId: allowed.projectId,
      provider: "OLLAMA",
      models: [],
    });
    expect(allowed.tables.activities.at(-1)).toMatchObject({
      actorType: "SYSTEM",
      actorId: "orchestration-service",
      action: "LOCAL_MODEL_CATALOG_SYNCED",
    });
  });

  it("confines discovered local models to the authorized workspace", async () => {
    const state = createContext();
    state.tables.modelCatalog.push({
      _id: "other-local-model",
      _creationTime: 10,
      tenantId: state.tenantId,
      projectId: state.otherProjectId,
      provider: "local:ollama",
      modelId: "local:ollama:qwen",
      displayName: "Other workspace model",
      tier: "FAST",
      capabilities: ["local", "text"],
      supportsTools: false,
      riskApproved: false,
      contextWindow: 32_000,
      availability: "HEALTHY",
      estimatedCostPerRunUsd: 0,
      deprecated: false,
      updatedAt: 1,
    });

    await functionHandler(syncLocalModels)(state.ctx, {
      projectId: state.projectId,
      provider: "OLLAMA",
      models: [{
        modelId: "qwen",
        displayName: "Primary workspace model",
        capabilities: ["text"],
        supportsTools: true,
        contextWindow: 64_000,
      }],
    });

    expect(state.tables.modelCatalog.find((model) => model._id === "other-local-model")?.displayName)
      .toBe("Other workspace model");
    expect(state.tables.modelCatalog).toContainEqual(expect.objectContaining({
      projectId: state.projectId,
      modelId: "local:ollama:qwen",
      displayName: "Primary workspace model",
    }));
    const visible = await functionHandler(listCatalog)(state.ctx, { projectId: state.projectId });
    expect(visible.some((model: any) => model.projectId === state.otherProjectId)).toBe(false);
  });

  it("derives agent override attribution and rejects a cross-workspace agent", async () => {
    const state = createContext();
    await functionHandler(setAgentOverride)(state.ctx, {
      projectId: state.projectId,
      agentId: state.agentId,
      modelId: state.modelId,
      reason: "Bounded exception",
      actorId: "spoofed-browser-actor",
    } as any);
    expect(state.tables.agentModelOverrides[0].createdBy).toBe(state.operatorId);
    expect(state.tables.activities.at(-1)).toMatchObject({
      actorId: state.operatorId,
      action: "AGENT_MODEL_OVERRIDE_SET",
    });
    await expect(
      functionHandler(setAgentOverride)(state.ctx, {
        projectId: state.projectId,
        agentId: state.otherAgentId,
        modelId: state.modelId,
        reason: "Cross workspace",
      })
    ).rejects.toThrow("unavailable or unauthorized");
  });

  it("protects policy reads and rejects unavailable policy models", async () => {
    const state = createContext();
    state.tables.modelCatalog[0].availability = "UNAVAILABLE";
    const input = {
      projectId: state.projectId,
      name: "Workspace policy",
      defaultModelId: state.modelId,
      fallbackChain: [],
      rules: [],
      lanePools: [],
      canaryPercent: 0,
      killSwitch: false,
    };
    await expect(functionHandler(save)(state.ctx, input)).rejects.toThrow("unavailable");

    const anonymous = createContext({ identity: null });
    await expect(functionHandler(simulate)(anonymous.ctx, {
      projectId: anonymous.projectId,
      riskLevel: "LOW",
      requiredCapabilities: [],
    })).rejects.toThrow("unavailable or unauthorized");
  });

  it("authorizes decision reads through their parent workspace", async () => {
    const state = createContext();
    state.tables.tasks.push({
      _id: "task-a",
      _creationTime: 20,
      projectId: state.projectId,
      title: "Task",
    });
    state.tables.workflowRuns.push({
      _id: "run-a",
      _creationTime: 21,
      projectId: state.projectId,
      runId: "run-a",
    });
    await expect(functionHandler(listRecent)(state.ctx, { projectId: state.projectId })).resolves.toEqual([]);
    await expect(functionHandler(getForTask)(state.ctx, { taskId: "task-a" })).resolves.toMatchObject({
      projectId: state.projectId,
    });
    await expect(functionHandler(getForWorkflowRun)(state.ctx, { workflowRunId: "run-a" })).resolves.toBeNull();

    const denied = createContext({ identity: null });
    denied.tables.tasks.push({ _id: "task-a", _creationTime: 20, projectId: denied.projectId });
    await expect(functionHandler(getForTask)(denied.ctx, { taskId: "task-a" })).rejects.toThrow(
      "unavailable or unauthorized"
    );
  });

  it("derives Model Routing enforcement attribution despite a spoofed actor argument", async () => {
    const state = createContext();
    await functionHandler(setFlag)(state.ctx, {
      key: "model-routing.enabled",
      enabled: true,
      projectId: state.projectId,
      actorId: "spoofed-browser-actor",
    });
    expect(state.tables.featureFlags[0].updatedBy).toBe(state.operatorId);
    expect(state.tables.activities.at(-1)).toMatchObject({
      actorId: state.operatorId,
      action: "FEATURE_FLAG_SET",
    });
  });

  it("requires approval authority and derives Work Order override attribution", async () => {
    const denied = createContext({ permissions: ["factory.read", "factory.improve"] });
    denied.tables.workOrders.push({
      _id: "work-order-a",
      _creationTime: 30,
      tenantId: denied.tenantId,
      projectId: denied.projectId,
      title: "Guarded delivery",
      riskLevel: "MEDIUM",
    });
    await expect(functionHandler(setAuthorizedModelOverride)(denied.ctx, {
      workOrderId: "work-order-a",
      modelId: denied.modelId,
      reason: "One dispatch only",
    })).rejects.toThrow("does not permit");

    const allowed = createContext({
      permissions: ["factory.read", "factory.approve", "delivery.approve"],
    });
    allowed.tables.orgMembers.push({
      _id: "member-a",
      _creationTime: 29,
      tenantId: allowed.tenantId,
      operatorId: allowed.operatorId,
      projectAccess: [{ projectId: allowed.projectId, accessLevel: "ADMIN" }],
      active: true,
    });
    allowed.tables.workOrders.push({
      _id: "work-order-a",
      _creationTime: 30,
      tenantId: allowed.tenantId,
      projectId: allowed.projectId,
      ownerMemberId: "member-a",
      title: "Guarded delivery",
      riskLevel: "MEDIUM",
    });
    await functionHandler(setAuthorizedModelOverride)(allowed.ctx, {
      workOrderId: "work-order-a",
      modelId: allowed.modelId,
      reason: "One dispatch only",
      actorId: "spoofed-browser-actor",
    } as any);
    expect(allowed.tables.activities.at(-1)).toMatchObject({
      actorId: allowed.operatorId,
      action: "WORK_ORDER_MODEL_OVERRIDE_SET",
    });
  });

  it("requires a real agent in the authorized workspace before returning an override", async () => {
    const state = createContext();
    await expect(functionHandler(getAgentOverride)(state.ctx, {
      projectId: state.projectId,
      agentId: state.otherAgentId,
    })).rejects.toThrow("unavailable or unauthorized");
  });

  it("requires approval authority and server attribution for exact tuple pins", async () => {
    const state = createContext({
      permissions: ["factory.read", "factory.approve", "delivery.approve"],
    });
    state.tables.orgMembers.push({
      _id: "member-a",
      _creationTime: 39,
      tenantId: state.tenantId,
      operatorId: state.operatorId,
      projectAccess: [{ projectId: state.projectId, accessLevel: "ADMIN" }],
      active: true,
    });
    const repositoryId = "repository-a";
    const workflowId = "workflow-a";
    const versionId = "factory-version-a";
    state.tables.workflows.push({
      _id: workflowId,
      _creationTime: 40,
      workflowId: "feature-dev",
      active: true,
    });
    state.tables.workOrders.push({
      _id: "work-order-a",
      _creationTime: 41,
      tenantId: state.tenantId,
      projectId: state.projectId,
      ownerMemberId: "member-a",
      repositoryId,
      workflowId: "feature-dev",
      title: "Pinned delivery",
      riskLevel: "MEDIUM",
    });
    state.tables.factoryDefinitions.push({
      _id: "factory-a",
      _creationTime: 42,
      projectId: state.projectId,
      repositoryId,
      workflowId,
      status: "ACTIVE",
      activeVersionId: versionId,
    });
    state.tables.factoryDefinitionVersions.push({
      _id: versionId,
      _creationTime: 43,
      factoryDefinitionId: "factory-a",
      projectId: state.projectId,
      repositoryId,
      workflowId,
      version: 1,
      configurationDigest: "sha256:exact",
    });

    await functionHandler(setPinnedTuple)(state.ctx, {
      workOrderId: "work-order-a",
      factoryDefinitionVersionId: versionId,
      reason: "Operator-reviewed exact Factory Version",
    });
    expect(state.tables.workOrders[0].executionRoutingPin).toMatchObject({
      factoryDefinitionVersionId: versionId,
      pinnedBy: state.operatorId,
    });
    expect(state.tables.activities.at(-1)).toMatchObject({
      actorId: state.operatorId,
      action: "WORK_ORDER_EXECUTION_ROUTE_PINNED",
    });

    const denied = createContext({ permissions: ["factory.read"] });
    denied.tables.workflows.push(...state.tables.workflows);
    denied.tables.workOrders.push(...state.tables.workOrders.map((row) => ({ ...row, executionRoutingPin: undefined })));
    denied.tables.factoryDefinitions.push(...state.tables.factoryDefinitions);
    denied.tables.factoryDefinitionVersions.push(...state.tables.factoryDefinitionVersions);
    await expect(functionHandler(setPinnedTuple)(denied.ctx, {
      workOrderId: "work-order-a",
      factoryDefinitionVersionId: versionId,
      reason: "Unauthorized pin",
    })).rejects.toThrow("does not permit");
  });

  it("requires automation authority and reproducible evidence for Guarded Auto promotion", async () => {
    const state = createContext();
    state.tables.modelRoutingPolicies.push({
      _id: "policy-a",
      _creationTime: 50,
      projectId: state.projectId,
      name: "Advisory baseline",
      status: "ACTIVE",
      rules: [],
      lanePools: [],
      fallbackChain: [],
      canaryPercent: 0,
      killSwitch: false,
      version: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    state.tables.modelRoutingDecisions.push({
      _id: "decision-a",
      _creationTime: 51,
      projectId: state.projectId,
      algorithmVersion: "execution-routing/v1",
      decisionDigest: "sha256:reproducible",
    });

    const promoted = await functionHandler(promoteGuardedAuto)(state.ctx, {
      projectId: state.projectId,
      reason: "Reviewed evidence clears staged promotion",
      evidenceDecisionIds: ["decision-a"],
    });
    expect(promoted).toMatchObject({
      status: "ACTIVE",
      version: 2,
      executionRouting: expect.objectContaining({ mode: "GUARDED_AUTO" }),
    });
    expect(state.tables.activities.at(-1)).toMatchObject({
      actorId: state.operatorId,
      action: "EXECUTION_ROUTING_GUARDED_AUTO_PROMOTED",
    });

    const denied = createContext({ permissions: ["factory.read"] });
    await expect(functionHandler(promoteGuardedAuto)(denied.ctx, {
      projectId: denied.projectId,
      reason: "Unauthorized promotion",
      evidenceDecisionIds: ["decision-a"],
    })).rejects.toThrow("does not permit");
  });
});
