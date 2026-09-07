import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  authorizeRepositoryDispatchRestoration,
  attemptRepositoryDispatchAdmission,
  executeRepositoryDispatchControl,
  requestRepositoryDispatchControl,
  requireRepositoryDispatchAdmission,
} from "../factory/incidentControls";
import { observeRepositoryDispatchControl } from "../factory/incidentControlObserver";

function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

function createContext() {
  const tenantId = "tenant-a" as Id<"tenants">;
  const projectId = "project-a" as Id<"projects">;
  const repositoryId = "repository-a" as Id<"workspaceRepositories">;
  const otherRepositoryId = "repository-b" as Id<"workspaceRepositories">;
  const incidentId = "incident-a" as Id<"factoryIncidents">;
  const operatorId = "operator-a" as Id<"operators">;
  const tables: Record<string, any[]> = {
    tenants: [{ _id: tenantId, active: true }],
    projects: [{ _id: projectId, tenantId, name: "Mission Control" }],
    workspaceRepositories: [
      { _id: repositoryId, projectId, repository: "jaydubya818/MissionControl" },
      { _id: otherRepositoryId, projectId, repository: "jaydubya818/Unrelated" },
    ],
    operators: [{ _id: operatorId, tenantId, authId: "auth-user", active: true }],
    roles: [{ _id: "role-a", tenantId, name: "Incident commander", permissions: ["factory.read", "factory.approve", "factory.incident.control"] }],
    roleAssignments: [{ _id: "assignment-a", operatorId, roleId: "role-a", scope: { type: "project", id: projectId } }],
    teamMemberships: [],
    orgMembers: [],
    factoryIncidents: [{
      _id: incidentId,
      tenantId,
      projectId,
      repositoryId,
      phase: "CLARIFY",
      status: "OPEN",
      currentSequence: 1,
      commanderActorId: operatorId,
    }],
    repositoryDispatchControls: [],
    factoryIncidentControlReceipts: [],
    factoryIncidentControlAuthorizations: [],
    workflowRuns: [],
    activities: [],
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
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const builder: any = {
        withIndex: (_name: string, apply: (query: any) => any) => {
          const conditions: Array<{ field: string; value: unknown }> = [];
          const query: any = { eq: (field: string, value: unknown) => {
            conditions.push({ field, value });
            return query;
          } };
          apply(query);
          rows = rows.filter((row) => conditions.every(({ field, value }) => row[field] === value));
          return builder;
        },
        collect: async () => [...rows],
        order: () => builder,
        take: async (count: number) => rows.slice(0, count),
        first: async () => rows[0] ?? null,
        unique: async () => {
          if (rows.length > 1) throw new Error("not unique");
          return rows[0] ?? null;
        },
      };
      return builder;
    },
  };
  return {
    ctx: { auth: { getUserIdentity: async () => ({ subject: "auth-user", tokenIdentifier: "issuer|auth-user" }) }, db } as any,
    tables,
    projectId,
    repositoryId,
    otherRepositoryId,
    incidentId,
    operatorId,
  };
}

function commandArgs(state: ReturnType<typeof createContext>, operation: "PAUSE_REPOSITORY_DISPATCH" | "RESUME_REPOSITORY_DISPATCH", overrides: Record<string, unknown> = {}) {
  return {
    incidentId: state.incidentId,
    repositoryId: state.repositoryId,
    operation,
    expectedSequence: state.tables.factoryIncidents[0].currentSequence,
    expectedCommanderActorId: state.operatorId,
    authorityExpiresAt: Date.now() + 60_000,
    requestId: `incident-control:${operation.toLowerCase()}:123456`,
    ...overrides,
  };
}

async function requestAndExecute(state: ReturnType<typeof createContext>, operation: "PAUSE_REPOSITORY_DISPATCH" | "RESUME_REPOSITORY_DISPATCH", overrides: Record<string, unknown> = {}) {
  const args = commandArgs(state, operation, overrides);
  const requested = await functionHandler(requestRepositoryDispatchControl)(state.ctx, args);
  return await functionHandler(executeRepositoryDispatchControl)(state.ctx, {
    ...args,
    requestReceiptId: requested.requestReceipt._id,
  });
}

describe("canonical repository dispatch actuator", () => {
  it("persists command and acknowledgment, denies dispatch, and requires the independent observer", async () => {
    const state = createContext();
    const executed = await requestAndExecute(state, "PAUSE_REPOSITORY_DISPATCH");
    expect(executed.commandReceipt.receiptType).toBe("COMMAND_ISSUED");
    expect(executed.acknowledgment.receiptType).toBe("ACKNOWLEDGED");
    expect(state.tables.factoryIncidentControlReceipts).toHaveLength(3);
    await expect(requireRepositoryDispatchAdmission(state.ctx, state.projectId, state.repositoryId))
      .rejects.toThrow("repository-dispatch-paused");
    await expect(requireRepositoryDispatchAdmission(state.ctx, state.projectId, undefined, "jaydubya818/MissionControl"))
      .rejects.toThrow("repository-dispatch-paused");
    await expect(requireRepositoryDispatchAdmission(state.ctx, state.projectId, state.otherRepositoryId)).resolves.toBeUndefined();

    const observed = await functionHandler(observeRepositoryDispatchControl)(state.ctx, {
      incidentId: state.incidentId,
      repositoryId: state.repositoryId,
      commandReceiptId: executed.commandReceipt._id,
      acknowledgmentReceiptId: executed.acknowledgment._id,
      expectedSequence: 1,
    });
    expect(observed.effectReceipt.receiptType).toBe("EFFECT_OBSERVED");
    expect(observed.effectReceipt.producerId).toBe("repository-dispatch-admission-observer/v1");
    expect(observed.effectReceipt.predecessorReceiptId).toBe(executed.acknowledgment._id);

    Object.assign(state.tables.factoryIncidents[0], { phase: "CONTAIN", currentSequence: 2, status: "CONTAINED" });
    await expect(functionHandler(attemptRepositoryDispatchAdmission)(state.ctx, {
      incidentId: state.incidentId,
      repositoryId: state.repositoryId,
      expectedSequence: 2,
      expectedCommanderActorId: state.operatorId,
      requestId: executed.commandReceipt.requestId,
    })).rejects.toThrow("request ID distinct from the PAUSE command lineage");
    const admission = await functionHandler(attemptRepositoryDispatchAdmission)(state.ctx, {
      incidentId: state.incidentId,
      repositoryId: state.repositoryId,
      expectedSequence: 2,
      expectedCommanderActorId: state.operatorId,
      requestId: "dispatch-admission:incident-a:000002",
    });
    expect(admission.denialReceipt).toMatchObject({
      receiptType: "DISPATCH_DENIED",
      expectedAdmission: "DENIED",
      observedAdmission: "DENIED",
      result: "PASS",
      producerId: "repository-dispatch-admission-gate/v1",
      predecessorReceiptId: observed.effectReceipt._id,
    });
    expect(state.tables.workflowRuns).toHaveLength(0);
    expect(state.tables.activities.at(-1)?.metadata).toMatchObject({
      attemptCreated: false,
      workflowRunCreated: false,
      workerLaunchRequested: false,
    });
  });

  it("refuses to manufacture a denial receipt when the canonical gate admits dispatch", async () => {
    const state = createContext();
    Object.assign(state.tables.factoryIncidents[0], { phase: "CONTAIN", currentSequence: 2, status: "CONTAINED" });
    await expect(functionHandler(attemptRepositoryDispatchAdmission)(state.ctx, {
      incidentId: state.incidentId,
      repositoryId: state.repositoryId,
      expectedSequence: 2,
      expectedCommanderActorId: state.operatorId,
      requestId: "dispatch-admission:incident-a:enabled",
    })).rejects.toThrow("was not denied by the canonical pause gate");
    expect(state.tables.factoryIncidentControlReceipts).toHaveLength(0);
    expect(state.tables.workflowRuns).toHaveLength(0);
  });

  it("rejects stale active lineage and denial replay after restoration", async () => {
    const state = createContext();
    const executed = await requestAndExecute(state, "PAUSE_REPOSITORY_DISPATCH");
    await functionHandler(observeRepositoryDispatchControl)(state.ctx, {
      incidentId: state.incidentId,
      repositoryId: state.repositoryId,
      commandReceiptId: executed.commandReceipt._id,
      acknowledgmentReceiptId: executed.acknowledgment._id,
      expectedSequence: 1,
    });
    Object.assign(state.tables.factoryIncidents[0], { phase: "CONTAIN", currentSequence: 2, status: "CONTAINED" });
    const args = {
      incidentId: state.incidentId,
      repositoryId: state.repositoryId,
      expectedSequence: 2,
      expectedCommanderActorId: state.operatorId,
      requestId: "dispatch-admission:incident-a:replay",
    };
    await functionHandler(attemptRepositoryDispatchAdmission)(state.ctx, args);

    state.tables.repositoryDispatchControls[0].activeRequestId = "different-pause-request";
    await expect(functionHandler(attemptRepositoryDispatchAdmission)(state.ctx, {
      ...args,
      requestId: "dispatch-admission:incident-a:stale",
    })).rejects.toThrow("exact active independently observed PAUSE lineage");

    Object.assign(state.tables.factoryIncidents[0], { phase: "ISOLATE", currentSequence: 2 });
    Object.assign(state.tables.repositoryDispatchControls[0], { admission: "ENABLED", activeRequestId: "resume-request" });
    await expect(functionHandler(attemptRepositoryDispatchAdmission)(state.ctx, args))
      .rejects.toThrow("was not denied by the canonical pause gate");
  });

  it("does not let ACK certify containment when the target effect is absent", async () => {
    const state = createContext();
    const executed = await requestAndExecute(state, "PAUSE_REPOSITORY_DISPATCH");
    state.tables.repositoryDispatchControls[0].admission = "ENABLED";
    await expect(functionHandler(observeRepositoryDispatchControl)(state.ctx, {
      incidentId: state.incidentId,
      repositoryId: state.repositoryId,
      commandReceiptId: executed.commandReceipt._id,
      acknowledgmentReceiptId: executed.acknowledgment._id,
      expectedSequence: 1,
    })).rejects.toThrow("effect is not observed");
    expect(state.tables.factoryIncidentControlReceipts.some((row) => row.receiptType === "EFFECT_OBSERVED")).toBe(false);
  });

  it("requires separate restoration authority and restores admission", async () => {
    const state = createContext();
    const paused = await requestAndExecute(state, "PAUSE_REPOSITORY_DISPATCH");
    await functionHandler(observeRepositoryDispatchControl)(state.ctx, {
      incidentId: state.incidentId,
      repositoryId: state.repositoryId,
      commandReceiptId: paused.commandReceipt._id,
      acknowledgmentReceiptId: paused.acknowledgment._id,
      expectedSequence: 1,
    });
    Object.assign(state.tables.factoryIncidents[0], { phase: "ISOLATE", currentSequence: 4 });
    const resumeArgs = commandArgs(state, "RESUME_REPOSITORY_DISPATCH");
    await expect(functionHandler(requestRepositoryDispatchControl)(state.ctx, resumeArgs))
      .rejects.toThrow("requires unused durable current authority");
    const authorization = await functionHandler(authorizeRepositoryDispatchRestoration)(state.ctx, {
      incidentId: state.incidentId,
      repositoryId: state.repositoryId,
      expectedSequence: 4,
      expectedCommanderActorId: state.operatorId,
      authorityExpiresAt: resumeArgs.authorityExpiresAt,
      reason: "Restore the independently verified known-safe dispatch state.",
      idempotencyKey: "restore-authority:incident-a:000004",
    });
    const resumed = await requestAndExecute(state, "RESUME_REPOSITORY_DISPATCH", {
      authorityExpiresAt: resumeArgs.authorityExpiresAt,
      restorationAuthorizationId: authorization.authorization._id,
    });
    await functionHandler(observeRepositoryDispatchControl)(state.ctx, {
      incidentId: state.incidentId,
      repositoryId: state.repositoryId,
      commandReceiptId: resumed.commandReceipt._id,
      acknowledgmentReceiptId: resumed.acknowledgment._id,
      expectedSequence: 4,
    });
    await expect(requireRepositoryDispatchAdmission(state.ctx, state.projectId, state.repositoryId)).resolves.toBeUndefined();
  });

  it("rejects stale, wrong-commander, cross-incident restoration, and rebound request authority", async () => {
    const state = createContext();
    const args = commandArgs(state, "PAUSE_REPOSITORY_DISPATCH");
    await expect(functionHandler(requestRepositoryDispatchControl)(state.ctx, { ...args, expectedSequence: 0 }))
      .rejects.toThrow("authority-stale");
    await expect(functionHandler(requestRepositoryDispatchControl)(state.ctx, { ...args, expectedCommanderActorId: "other" }))
      .rejects.toThrow("commander-mismatch");
    await requestAndExecute(state, "PAUSE_REPOSITORY_DISPATCH");
    await expect(functionHandler(requestRepositoryDispatchControl)(state.ctx, { ...args, repositoryId: state.otherRepositoryId }))
      .rejects.toThrow("target or lifecycle is invalid");
  });
});
