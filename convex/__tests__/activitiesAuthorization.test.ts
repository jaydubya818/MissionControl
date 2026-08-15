import { afterEach, describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  create,
  listByAction,
  listByAgent,
  listByTask,
  listRecent,
} from "../activities";

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

function createContext(subject: "identity-a" | "identity-b" | null) {
  const tenantA = "tenant-a" as Id<"tenants">;
  const tenantB = "tenant-b" as Id<"tenants">;
  const projectA = "project-a" as Id<"projects">;
  const projectB = "project-b" as Id<"projects">;
  const taskA = "task-a" as Id<"tasks">;
  const taskB = "task-b" as Id<"tasks">;
  const agentA = "agent-a" as Id<"agents">;
  const agentB = "agent-b" as Id<"agents">;
  const tables: Record<string, any[]> = {
    tenants: [
      { _id: tenantA, _creationTime: 1, name: "Company A", slug: "company-a", active: true },
      { _id: tenantB, _creationTime: 2, name: "Company B", slug: "company-b", active: true },
    ],
    projects: [
      { _id: projectA, _creationTime: 3, tenantId: tenantA, name: "Workspace A", slug: "workspace-a" },
      { _id: projectB, _creationTime: 4, tenantId: tenantB, name: "Workspace B", slug: "workspace-b" },
    ],
    operators: [
      { _id: "operator-a", _creationTime: 5, tenantId: tenantA, authId: "identity-a", name: "A", email: "a@example.com", active: true, createdAt: 1 },
      { _id: "operator-b", _creationTime: 6, tenantId: tenantB, authId: "identity-b", name: "B", email: "b@example.com", active: true, createdAt: 1 },
    ],
    roles: [
      { _id: "role-a", _creationTime: 7, tenantId: tenantA, name: "Company Owner", permissions: ["factory.read", "factory.improve"] },
      { _id: "role-b", _creationTime: 8, tenantId: tenantB, name: "Company Owner", permissions: ["factory.read", "factory.improve"] },
    ],
    roleAssignments: [
      { _id: "assignment-a", _creationTime: 9, operatorId: "operator-a", roleId: "role-a", scope: { type: "tenant", id: tenantA }, assignedAt: 1 },
      { _id: "assignment-b", _creationTime: 10, operatorId: "operator-b", roleId: "role-b", scope: { type: "tenant", id: tenantB }, assignedAt: 1 },
    ],
    teamMemberships: [],
    orgMembers: [],
    tasks: [
      { _id: taskA, _creationTime: 11, projectId: projectA, title: "Task A" },
      { _id: taskB, _creationTime: 12, projectId: projectB, title: "Task B" },
    ],
    agents: [
      { _id: agentA, _creationTime: 13, projectId: projectA, name: "Agent A" },
      { _id: agentB, _creationTime: 14, projectId: projectB, name: "Agent B" },
    ],
    activities: [
      { _id: "activity-a", _creationTime: 20, tenantId: tenantA, projectId: projectA, taskId: taskA, agentId: agentA, actorType: "HUMAN", action: "POLICY_READ", description: "A" },
      { _id: "activity-b", _creationTime: 21, tenantId: tenantB, projectId: projectB, taskId: taskB, agentId: agentB, actorType: "HUMAN", action: "POLICY_READ", description: "B" },
      { _id: "activity-company-b", _creationTime: 22, tenantId: tenantB, actorType: "HUMAN", action: "COMPANY_UPDATED", description: "B company" },
    ],
  };
  let sequence = 100;

  const allRows = () => Object.values(tables).flat();
  const db = {
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
        order: (direction: "asc" | "desc") => {
          const multiplier = direction === "desc" ? -1 : 1;
          rows.sort((left, right) =>
            (left._creationTime - right._creationTime) * multiplier
          );
          return builder;
        },
        filter: (apply: (q: any) => any) => {
          const conditions: Array<[string, unknown]> = [];
          const q: any = {
            field: (field: string) => field,
            eq: (field: string, value: unknown) => {
              conditions.push([field, value]);
              return true;
            },
          };
          apply(q);
          rows = rows.filter((row) =>
            conditions.every(([field, value]) => row[field] === value)
          );
          return builder;
        },
        collect: async () => [...rows],
        take: async (limit: number) => rows.slice(0, limit),
      };
      return builder;
    },
  };

  return {
    ctx: {
      auth: {
        getUserIdentity: async () => subject
          ? { subject, tokenIdentifier: `issuer|${subject}` }
          : null,
      },
      db,
    } as any,
    tables,
    tenantA,
    tenantB,
    projectA,
    projectB,
    taskA,
    taskB,
    agentA,
    agentB,
  };
}

describe("activity authorization", () => {
  it("fails closed for unauthenticated audit reads", async () => {
    delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    const state = createContext(null);
    await expect(
      functionHandler(listRecent)(state.ctx, { limit: 10 })
    ).rejects.toThrow("unavailable or unauthorized");
  });

  it("returns only the authenticated identity's workspace audit records", async () => {
    const state = createContext("identity-a");
    await expect(
      functionHandler(listRecent)(state.ctx, { projectId: state.projectA, limit: 10 })
    ).resolves.toMatchObject([{ _id: "activity-a" }]);
    await expect(
      functionHandler(listRecent)(state.ctx, { projectId: state.projectB, limit: 10 })
    ).rejects.toThrow("unavailable or unauthorized");

    const unscoped = await functionHandler(listRecent)(state.ctx, { limit: 10 });
    expect(unscoped.map((activity: any) => activity._id)).toEqual(["activity-a"]);
  });

  it("keeps action, task, and agent audit reads inside the authorized workspace", async () => {
    const state = createContext("identity-a");
    await expect(
      functionHandler(listByAction)(state.ctx, { action: "POLICY_READ", limit: 10 })
    ).resolves.toMatchObject([{ _id: "activity-a" }]);
    await expect(
      functionHandler(listByTask)(state.ctx, { taskId: state.taskB, limit: 10 })
    ).rejects.toThrow("unavailable or unauthorized");
    await expect(
      functionHandler(listByAgent)(state.ctx, { agentId: state.agentB, limit: 10 })
    ).rejects.toThrow("unavailable or unauthorized");
  });

  it("denies cross-company audit writes and derives scope and actor server-side", async () => {
    const state = createContext("identity-a");
    const input = {
      actorType: "SYSTEM" as const,
      actorId: "spoofed-browser-actor",
      action: "POLICY_UPDATED",
      description: "Policy updated",
    };
    await expect(
      functionHandler(create)(createContext(null).ctx, {
        ...input,
        projectId: state.projectA,
      })
    ).rejects.toThrow("unavailable or unauthorized");
    await expect(
      functionHandler(create)(state.ctx, {
        ...input,
        actorType: "HUMAN",
        projectId: state.projectA,
      })
    ).rejects.toThrow("service events only");
    await expect(
      functionHandler(create)(state.ctx, { ...input, projectId: state.projectB })
    ).rejects.toThrow("unavailable or unauthorized");
    await expect(
      functionHandler(create)(state.ctx, {
        ...input,
        projectId: state.projectA,
        taskId: state.taskB,
      })
    ).rejects.toThrow("unavailable or unauthorized");

    await functionHandler(create)(state.ctx, {
      ...input,
      projectId: state.projectA,
    });
    expect(state.tables.activities.at(-1)).toMatchObject({
      tenantId: state.tenantA,
      projectId: state.projectA,
      actorId: "operator-a",
      action: "POLICY_UPDATED",
    });
  });
});
