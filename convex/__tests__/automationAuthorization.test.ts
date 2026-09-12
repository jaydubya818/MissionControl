import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  acceptCandidate,
  activate,
  getControlPlane,
  getDefinition,
  pause,
  previewNextRun,
  rejectCandidate,
  requestCandidateEvidence,
  retire,
} from "../automations";
import { evaluateDue, evaluateNow } from "../automationScheduler";

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
  permissions = ["factory.read", "factory.automation.manage"],
}: {
  identity?: { subject: string; tokenIdentifier: string } | null;
  permissions?: string[];
} = {}) {
  const tenantId = "tenant-a" as Id<"tenants">;
  const projectId = "project-a" as Id<"projects">;
  const otherProjectId = "project-b" as Id<"projects">;
  const operatorId = "operator-a" as Id<"operators">;
  const roleId = "role-a" as Id<"roles">;
  const definitionId = "automation-a" as Id<"automationDefinitions">;
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
      name: "Workspace operator",
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
    automationDefinitions: [{
      _id: definitionId,
      _creationTime: 7,
      projectId,
      definitionVersion: 1,
      name: "Weekly review",
      workflowId: "review-workflow",
      workflowVersion: "v1",
      triggerType: "SCHEDULE",
      triggerConfig: { cron: "0 8 * * 1", timezone: "America/Los_Angeles" },
      scope: "repository:primary",
      repositoryIds: [],
      autonomyLevel: "LEVEL_1",
      isMutating: false,
      riskLevel: "LOW",
      requiredApprovalTypes: ["operator"],
      verificationContract: { receiptRequired: true, independentValidatorRequired: true },
      maxDurationSeconds: 1800,
      status: "DISABLED",
      reliabilityState: "PROBATION",
      health: "UNKNOWN",
      createdAt: 1,
      updatedAt: 1,
    }],
    automationDecisions: [],
    automationEvaluations: [],
    metaLoopSuggestions: [],
    workOrders: [],
    verificationReceipts: [],
    scheduledJobs: [],
    workflows: [],
    workflowRuns: [],
    runEvents: [],
    runArtifacts: [],
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
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const builder: any = {
        withIndex: (_name: string, apply: (q: any) => any) => {
          const conditions: Array<{ field: string; value: unknown }> = [];
          const q: any = {
            eq: (field: string, value: unknown) => {
              conditions.push({ field, value });
              return q;
            },
          };
          apply(q);
          rows = rows.filter((row) => conditions.every(({ field, value }) => row[field] === value));
          return builder;
        },
        collect: async () => [...rows],
        first: async () => rows[0] ?? null,
      };
      return builder;
    },
  };

  return {
    ctx: {
      auth: { getUserIdentity: async () => identity },
      db,
      runMutation: async () => ({
        workOrder: { _id: "work-order-new" as Id<"workOrders"> },
        created: true,
      }),
    } as any,
    tables,
    projectId,
    otherProjectId,
    operatorId,
    definitionId,
  };
}

function mutationInputs(state: ReturnType<typeof createContext>) {
  return [
    [acceptCandidate, { projectId: state.projectId, candidateId: "candidate-a", reason: "Approved evidence" }],
    [rejectCandidate, { projectId: state.projectId, candidateId: "candidate-a", reason: "Insufficient value" }],
    [requestCandidateEvidence, { projectId: state.projectId, candidateId: "candidate-a", reason: "Need another receipt" }],
    [activate, { projectId: state.projectId, automationDefinitionId: state.definitionId, reason: "Approved activation" }],
    [pause, { projectId: state.projectId, automationDefinitionId: state.definitionId, reason: "Operator pause" }],
    [retire, { projectId: state.projectId, automationDefinitionId: state.definitionId, reason: "No longer required" }],
    [evaluateNow, { projectId: state.projectId, automationDefinitionId: state.definitionId, reason: "Manual verification run" }],
  ] as const;
}

describe("Automation control-plane authorization", () => {
  it("rejects anonymous reads and every human control before accessing workspace data", async () => {
    const state = createContext({ identity: null });
    await expect(functionHandler(getControlPlane)(state.ctx, { projectId: state.projectId }))
      .rejects.toThrow("unavailable or unauthorized");
    await expect(functionHandler(getDefinition)(state.ctx, {
      projectId: state.projectId,
      automationDefinitionId: state.definitionId,
    })).rejects.toThrow("unavailable or unauthorized");
    await expect(functionHandler(previewNextRun)(state.ctx, {
      projectId: state.projectId,
      automationDefinitionId: state.definitionId,
    })).rejects.toThrow("unavailable or unauthorized");
    for (const [registered, args] of mutationInputs(state)) {
      await expect(functionHandler(registered)(state.ctx, args)).rejects.toThrow(
        "unavailable or unauthorized",
      );
    }
  });

  it("rejects cross-workspace and insufficient-role controls", async () => {
    const insufficient = createContext({ permissions: ["factory.read"] });
    for (const [registered, args] of mutationInputs(insufficient)) {
      await expect(functionHandler(registered)(insufficient.ctx, args)).rejects.toThrow(
        "does not permit",
      );
    }

    const crossWorkspace = createContext();
    await expect(functionHandler(activate)(crossWorkspace.ctx, {
      projectId: crossWorkspace.otherProjectId,
      automationDefinitionId: crossWorkspace.definitionId,
      reason: "Cross workspace attempt",
    })).rejects.toThrow("unavailable or unauthorized");
  });

  it("derives lifecycle attribution from the authenticated operator", async () => {
    const state = createContext();
    await functionHandler(activate)(state.ctx, {
      projectId: state.projectId,
      automationDefinitionId: state.definitionId,
      reason: "Approved activation",
      actorId: "spoofed-browser-actor",
      policyVersion: "spoofed-policy",
    } as any);
    expect(state.tables.automationDefinitions[0]).toMatchObject({
      status: "ACTIVE",
      activatedBy: state.operatorId,
      activationPolicyVersion: "automation-v1",
    });
    expect(state.tables.automationDecisions.at(-1)).toMatchObject({
      actorId: state.operatorId,
      actorIdentitySource: "AUTHENTICATED_OPERATOR",
      policyVersion: "automation-v1",
    });

    await functionHandler(pause)(state.ctx, {
      projectId: state.projectId,
      automationDefinitionId: state.definitionId,
      reason: "Operator pause",
      actorId: "spoofed-browser-actor",
    } as any);
    expect(state.tables.automationDefinitions[0]).toMatchObject({
      status: "PAUSED",
      pausedBy: state.operatorId,
    });
    expect(state.tables.automationDecisions.at(-1)).toMatchObject({
      actorId: state.operatorId,
      actorIdentitySource: "AUTHENTICATED_OPERATOR",
    });
  });

  it("attributes manual evaluation to the operator and scheduled evaluation to the system", async () => {
    const manual = createContext();
    manual.tables.automationDefinitions[0].status = "ACTIVE";
    await functionHandler(evaluateNow)(manual.ctx, {
      projectId: manual.projectId,
      automationDefinitionId: manual.definitionId,
      reason: "Manual verification run",
    });
    expect(manual.tables.automationDecisions.at(-1)).toMatchObject({
      decisionType: "EVALUATED",
      actorId: manual.operatorId,
      actorIdentitySource: "AUTHENTICATED_OPERATOR",
    });

    const scheduled = createContext({ identity: null });
    scheduled.tables.automationDefinitions[0].status = "ACTIVE";
    scheduled.tables.automationDefinitions[0].nextRunAt = 0;
    await functionHandler(evaluateDue)(scheduled.ctx, {});
    expect(scheduled.tables.automationDecisions.at(-1)).toMatchObject({
      decisionType: "EVALUATED",
      actorId: "automation-policy",
      actorIdentitySource: "SYSTEM",
    });
  });
});
