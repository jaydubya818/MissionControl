import { afterEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import * as members from "../orgMembers";
import * as webhooks from "../webhooks";
import * as jobs from "../scheduledJobs";
import { reversePrompt } from "../mission";
import { assertAuthenticated } from "../companyContext";

type Row = Record<string, any> & { _id: string };
type Role = "workspace-admin" | "member-admin" | "developer" | "viewer";

function handler(fn: unknown) {
  return (fn as { _handler: (ctx: any, args: any) => Promise<any> })._handler;
}

function fixture({ authenticated = true, role = "workspace-admin" as Role } = {}) {
  const permissions: Record<Role, string[]> = {
    "workspace-admin": ["workspaces.manage", "delivery.dispatch"],
    "member-admin": ["members.manage"],
    developer: ["delivery.write", "delivery.dispatch"],
    viewer: [],
  };
  const tables: Record<string, Row[]> = {
    tenants: ["a", "b"].map(s => ({ _id: `tenant-${s}`, active: true, missionStatement: "Maintain the test workspace" })),
    projects: [
      { _id: "project-a", tenantId: "tenant-a" },
      { _id: "project-a2", tenantId: "tenant-a" },
      { _id: "project-b", tenantId: "tenant-b" },
    ],
    operators: [{ _id: "operator-a", tenantId: "tenant-a", authId: "user-a", active: true }],
    roles: [{ _id: "role-a", tenantId: "tenant-a", name: "Scoped test role", permissions: permissions[role] }],
    roleAssignments: [{
      _id: "assignment-a", operatorId: "operator-a", roleId: "role-a",
      scope: role === "member-admin" ? { type: "tenant", id: "tenant-a" } : { type: "project", id: "project-a" },
    }],
    orgMembers: ["a", "a2", "b"].map(s => ({
      _id: `member-${s}`, tenantId: s === "b" ? "tenant-b" : "tenant-a", projectId: `project-${s}`,
      name: s, role: "Engineer", level: 0, active: true, projectAccess: [], systemRole: "MEMBER",
    })),
    agents: ["a", "a2", "b"].map(s => ({ _id: `agent-${s}`, projectId: `project-${s}`, tenantId: s === "b" ? "tenant-b" : "tenant-a", name: s, role: "SPECIALIST", status: "ACTIVE" })),
    webhooks: ["a", "a2", "b"].map(s => ({
      _id: `hook-${s}`, projectId: `project-${s}`, tenantId: s === "b" ? "tenant-b" : "tenant-a",
      name: s, url: `https://hooks.example/${s}`, secret: `secret-${s}`, events: ["test"], active: true, deliveryCount: 0, failureCount: 0,
    })),
    webhookDeliveries: ["a", "b"].map(s => ({ _id: `delivery-${s}`, webhookId: `hook-${s}`, projectId: `project-${s}`, url: `https://hooks.example/${s}`, status: "PENDING", event: "test", payload: { value: s }, attempts: 0, maxAttempts: 3 })),
    scheduledJobs: ["a", "a2", "b"].map(s => ({
      _id: `job-${s}`, tenantId: s === "b" ? "tenant-b" : "tenant-a", projectId: `project-${s}`, jobId: `job-${s}`, name: s,
      jobType: "mission_prompt", cronExpression: "*/5 * * * *", nextRun: 0, enabled: true, targetId: "", autoRerunFlaky: false, createdBy: "operator-a",
    })),
    activities: [],
  };
  const writes: Array<{ kind: string; id?: string; table?: string; value?: any }> = [];
  const scheduled: Array<{ name: string; args: any }> = [];
  const ctx: any = {
    auth: { getUserIdentity: vi.fn(async () => authenticated ? { subject: "user-a", tokenIdentifier: "issuer|user-a" } : null) },
    db: {
      get: vi.fn(async (id: string) => Object.values(tables).flat().find(row => row._id === id) ?? null),
      query: (table: string) => {
        let rows = [...(tables[table] ?? [])];
        const builder: any = {
          withIndex: (_name: string, apply: (q: any) => any) => {
            const conditions: Array<[string, string, any]> = [];
            const q: any = {};
            for (const op of ["eq", "gte", "lte"]) q[op] = (field: string, value: unknown) => { conditions.push([op, field, value]); return q; };
            apply(q);
            rows = rows.filter(row => conditions.every(([op, field, value]) => op === "eq" ? row[field] === value : op === "gte" ? row[field] >= value : row[field] <= value));
            return builder;
          },
          filter: (apply: (q: any) => any) => {
            const q: any = { field: (field: string) => ({ field }), and: (...items: any[]) => ({ op: "and", items }) };
            for (const op of ["eq", "lt", "lte"]) q[op] = (left: any, right: any) => ({ op, left, right });
            const condition = apply(q);
            const evaluate = (node: any, row: Row): any => {
              if (node && typeof node === "object" && "field" in node) return row[node.field];
              if (!node || typeof node !== "object" || !node.op) return node;
              if (node.op === "and") return node.items.every((item: any) => evaluate(item, row));
              const left = evaluate(node.left, row), right = evaluate(node.right, row);
              return node.op === "eq" ? left === right : node.op === "lt" ? left < right : left <= right;
            };
            rows = rows.filter(row => evaluate(condition, row));
            return builder;
          },
          order: (direction: string) => { if (direction === "desc") rows.reverse(); return builder; },
          collect: async () => rows,
          take: async (limit: number) => rows.slice(0, limit),
          first: async () => rows[0] ?? null,
        };
        return builder;
      },
      insert: vi.fn(async (table: string, value: any) => {
        const id = `${table}-${tables[table]?.length ?? 0}`;
        (tables[table] ??= []).push({ _id: id, ...value });
        writes.push({ kind: "insert", table, value });
        return id;
      }),
      patch: vi.fn(async (id: string, value: any) => {
        if (writes.length >= 100) throw new Error("Fixture write budget exhausted");
        const row = Object.values(tables).flat().find(r => r._id === id);
        if (!row) throw new Error("Missing fixture row");
        Object.assign(row, value);
        writes.push({ kind: "patch", id, value });
      }),
      delete: vi.fn(async (id: string) => {
        for (const [table, rows] of Object.entries(tables)) tables[table] = rows.filter(r => r._id !== id);
        writes.push({ kind: "delete", id });
      }),
    },
    scheduler: { runAfter: vi.fn(async (_delay: number, ref: any, args: any) => { scheduled.push({ name: getFunctionName(ref), args }); }) },
    runMutation: async (ref: any, args: any) => {
      const [module, name] = getFunctionName(ref).split(":");
      if (module === "webhooks") return handler((webhooks as any)[name])(ctx, args);
      throw new Error(`Unexpected mutation ${module}:${name}`);
    },
  };
  return { ctx, tables, writes, scheduled };
}

const memberCreate = { projectId: "project-a", name: "New member", role: "Engineer", level: 0 };
const hookCreate = { projectId: "project-a", name: "Hook", url: "https://hooks.example/new", secret: "test-secret", events: ["test"], createdBy: "forged-owner" };
const jobCreate = { projectId: "project-a", name: "Job", jobType: "mission_prompt", cronExpression: "*/5 * * * *", enabled: false, createdBy: "forged-owner" };
const publicCalls: Array<[string, unknown, Record<string, unknown>]> = [
  ["members.list", members.list, { projectId: "project-a" }],
  ["members.listAll", members.listAll, {}],
  ["members.getHierarchy", members.getHierarchy, { projectId: "project-a" }],
  ["members.getUnifiedHierarchy", members.getUnifiedHierarchy, { projectId: "project-a" }],
  ["members.get", members.get, { id: "member-a" }],
  ["members.create", members.create, memberCreate],
  ["members.update", members.update, { id: "member-a", name: "Changed" }],
  ["members.updatePermissions", members.updatePermissions, { id: "member-a", systemRole: "ADMIN" }],
  ["members.addProjectAccess", members.addProjectAccess, { memberId: "member-a", projectId: "project-a2", accessLevel: "ADMIN" }],
  ["members.removeProjectAccess", members.removeProjectAccess, { memberId: "member-a", projectId: "project-a2" }],
  ["members.remove", members.remove, { id: "member-a" }],
  ["members.move", members.move, { id: "member-a", newLevel: 1 }],
  ["hooks.list", webhooks.list, { projectId: "project-a" }],
  ["hooks.get", webhooks.get, { webhookId: "hook-a" }],
  ["hooks.getDeliveries", webhooks.getDeliveries, { webhookId: "hook-a" }],
  ["hooks.create", webhooks.create, hookCreate],
  ["hooks.update", webhooks.update, { webhookId: "hook-a", url: "https://hooks.example/changed" }],
  ["hooks.remove", webhooks.remove, { webhookId: "hook-a" }],
  ["jobs.list", jobs.list, { projectId: "project-a" }],
  ["jobs.create", jobs.create, jobCreate],
  ["jobs.update", jobs.update, { id: "job-a", name: "Changed" }],
  ["jobs.evaluatePolicy", jobs.evaluatePolicy, { id: "job-a" }],
  ["jobs.setEnabled", jobs.setEnabled, { id: "job-a", enabled: false }],
  ["jobs.remove", jobs.remove, { id: "job-a" }],
  ["jobs.runNow", jobs.runNow, { id: "job-a" }],
];

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("public configuration boundaries", () => {
  it.each(publicCalls)("permits the properly scoped operator in %s", async (name, fn, args) => {
    const state = fixture({ role: name.startsWith("members.") ? "member-admin" : "workspace-admin" });
    const result = await handler(fn)(state.ctx, args);
    expect(result).toBeDefined();
    if (/\.(create|update|updatePermissions|addProjectAccess|removeProjectAccess|remove|move|setEnabled)$/.test(name)) {
      expect(state.writes.length).toBeGreaterThan(0);
      expect(state.tables.activities).toEqual(expect.arrayContaining([expect.objectContaining({ actorType: "HUMAN", actorId: "operator-a" })]));
    }
    if (name === "jobs.runNow") {
      expect(result).toMatchObject({ success: false, skipped: true, outcome: "NOT_EXECUTED", code: "DELEGATED_HANDLER_UNAVAILABLE" });
      expect(state.scheduled).toEqual([]);
      expect(state.writes).toEqual([]);
    }
  });

  it.each(publicCalls)("rejects anonymous %s even in demo mode", async (_name, fn, args) => {
    vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "1");
    const state = fixture({ authenticated: false });
    await expect(handler(fn)(state.ctx, args)).rejects.toThrow(/authenticat|unauthorized/i);
    expect(state.writes).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it.each(publicCalls.filter(([name]) => !name.endsWith("listAll") && !name.endsWith("create")))("rejects inaccessible records in %s", async (_name, fn, args) => {
    const state = fixture({ role: "member-admin" });
    const foreign = Object.fromEntries(Object.entries(args).map(([key, value]) => [key, typeof value === "string" ? value.replace(/-a2?$/, "-b") : value]));
    await expect(handler(fn)(state.ctx, foreign)).rejects.toThrow(/authenticat|unauthorized|permit|company|workspace/i);
    expect(state.writes).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it.each(publicCalls.filter(([name]) => /\.(create|update|updatePermissions|addProjectAccess|removeProjectAccess|remove|move|setEnabled|runNow)$/.test(name)))("rejects read-only callers in %s", async (_name, fn, args) => {
    const state = fixture({ role: "viewer" });
    await expect(handler(fn)(state.ctx, args)).rejects.toThrow(/permit|administrator|unauthorized/i);
    expect(state.writes).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it.each([["members", members.list], ["hooks", webhooks.list], ["jobs", jobs.list]])("scopes unfiltered %s lists to accessible projects", async (_name, fn) => {
    const state = fixture();
    const rows = await handler(fn)(state.ctx, {});
    expect(rows.map((row: Row) => row.projectId)).toEqual(["project-a"]);
  });

  it("protects company membership grants from delivery writers", async () => {
    const state = fixture({ role: "developer" });
    await expect(handler(members.updatePermissions)(state.ctx, { id: "member-a", systemRole: "OWNER", permissions: ["company.manage"] })).rejects.toThrow(/permit|administrator/);
    expect(state.writes).toEqual([]);
  });

  it("allows a member administrator to grant access only within the stored company", async () => {
    const state = fixture({ role: "member-admin" });
    await handler(members.addProjectAccess)(state.ctx, { memberId: "member-a", projectId: "project-a2", accessLevel: "VIEW" });
    expect(state.tables.orgMembers[0].projectAccess).toEqual([{ projectId: "project-a2", accessLevel: "VIEW" }]);
    const count = state.writes.length;
    await expect(handler(members.addProjectAccess)(state.ctx, { memberId: "member-a", projectId: "project-b", accessLevel: "ADMIN" })).rejects.toThrow(/company|workspace|scope/i);
    expect(state.writes).toHaveLength(count);
    expect(state.tables.orgMembers[0].projectId).toBe("project-a");
  });

  it.each([members.create, members.update, members.updatePermissions])("rejects a foreign projectAccess grant", async fn => {
    const state = fixture({ role: "member-admin" });
    await expect(handler(fn)(state.ctx, { ...memberCreate, id: "member-a", projectAccess: [{ projectId: "project-b", accessLevel: "ADMIN" }] })).rejects.toThrow(/company|workspace|scope/i);
    expect(state.writes).toEqual([]);
  });

  it("rejects parent moves outside the stored workspace", async () => {
    const state = fixture({ role: "member-admin" });
    await expect(handler(members.move)(state.ctx, { id: "member-a", newParentId: "member-a2", newLevel: 1 })).rejects.toThrow(/workspace|scope|parent/i);
    expect(state.writes).toEqual([]);
  });

  it("keeps immutable member scope even when a direct caller supplies an extra field", async () => {
    const state = fixture({ role: "member-admin" });
    await handler(members.update)(state.ctx, { id: "member-a", name: "Updated", projectId: "project-b", tenantId: "tenant-b", operatorId: "operator-forged" });
    expect(state.tables.orgMembers[0]).toMatchObject({ projectId: "project-a", tenantId: "tenant-a", name: "Updated" });
    expect(state.tables.orgMembers[0]).not.toHaveProperty("operatorId");
  });

  it.each([
    ["member", members.get, { id: "member-a" }, "orgMembers"],
    ["hook", webhooks.get, { webhookId: "hook-a" }, "webhooks"],
    ["job", jobs.evaluatePolicy, { id: "job-a" }, "scheduledJobs"],
  ])("rejects a %s with a conflicting stored company", async (_name, fn, args, table) => {
    const state = fixture();
    state.tables[String(table)][0].tenantId = "tenant-b";
    await expect(handler(fn)(state.ctx, args)).rejects.toThrow(/scope|company|unauthorized/i);
    expect(state.writes).toEqual([]);
  });

  it("rejects hierarchy cycles before writing", async () => {
    const state = fixture({ role: "member-admin" });
    state.tables.orgMembers.push({ _id: "child-a", tenantId: "tenant-a", projectId: "project-a", parentMemberId: "member-a", active: true, name: "Child", role: "Engineer", level: 1 });
    await expect(handler(members.move)(state.ctx, { id: "member-a", newParentId: "child-a", newLevel: 2 })).rejects.toThrow(/cycle|descendant/i);
    expect(state.writes).toEqual([]);
  });

  it("records the authenticated actor when administering a member", async () => {
    const state = fixture({ role: "member-admin" });
    await handler(members.update)(state.ctx, { id: "member-a", name: "Updated" });
    expect(state.tables.orgMembers[0].name).toBe("Updated");
    expect(state.tables.activities).toEqual(expect.arrayContaining([expect.objectContaining({ actorType: "HUMAN", actorId: "operator-a", targetId: "member-a" })]));
  });

  it("preserves duplicate-email checks for a scoped legacy member without a tenant field", async () => {
    const state = fixture({ role: "member-admin" });
    state.tables.orgMembers[0].email = "member@example.com";
    delete state.tables.orgMembers[0].tenantId;
    await expect(handler(members.create)(state.ctx, { ...memberCreate, email: "member@example.com" })).rejects.toThrow(/already exists/);
    expect(state.writes).toEqual([]);
  });

  it("does not reveal or block a member email belonging only to another company", async () => {
    const state = fixture({ role: "member-admin" });
    state.tables.orgMembers[2].email = "member@example.com";
    await handler(members.create)(state.ctx, { ...memberCreate, email: "member@example.com" });
    expect(state.tables.orgMembers.at(-1)).toMatchObject({ tenantId: "tenant-a", email: "member@example.com" });
  });

  it("returns webhook metadata without exposing signing secrets", async () => {
    const state = fixture();
    const one = await handler(webhooks.get)(state.ctx, { webhookId: "hook-a" });
    const many = await handler(webhooks.list)(state.ctx, { projectId: "project-a" });
    expect(one._id).toBe("hook-a");
    expect(one).not.toHaveProperty("secret");
    expect(many[0]).not.toHaveProperty("secret");
    expect(state.tables.webhooks[0].secret).toBe("secret-a");
  });

  it.each([["hook", webhooks.create, hookCreate, "webhooks"], ["job", jobs.create, jobCreate, "scheduledJobs"]])("binds new %s configuration and actor server-side", async (_name, fn, args, table) => {
    const state = fixture();
    await handler(fn)(state.ctx, args);
    const created = state.tables[String(table)].at(-1)!;
    expect(created).toMatchObject({ projectId: "project-a", tenantId: "tenant-a", createdBy: "operator-a" });
  });

  it.each([
    ["hook", webhooks.update, { webhookId: "hook-a" }, "webhooks"],
    ["job", jobs.update, { id: "job-a" }, "scheduledJobs"],
  ])("preserves existing %s scope and attribution on update", async (_name, fn, args, table) => {
    const state = fixture();
    state.tables[String(table)][0].createdBy = "operator-original";
    await handler(fn)(state.ctx, { ...args, name: "Updated", projectId: "project-b", tenantId: "tenant-b", createdBy: "forged" });
    expect(state.tables[String(table)][0]).toMatchObject({ name: "Updated", projectId: "project-a", tenantId: "tenant-a", createdBy: "operator-original" });
  });

  it.each([["hook", webhooks.create, hookCreate], ["job", jobs.create, jobCreate], ["member", members.create, memberCreate]])("rejects creating unbound %s configuration", async (_name, fn, args) => {
    const state = fixture({ role: "member-admin" });
    await expect(handler(fn)(state.ctx, { ...args, projectId: undefined })).rejects.toThrow(/project|workspace|scope/i);
    expect(state.writes).toEqual([]);
  });

  it("does not deliver a scoped event to another workspace or a legacy global hook", async () => {
    const state = fixture({ authenticated: false });
    state.tables.webhooks.push({ ...state.tables.webhooks[0], _id: "global-hook", projectId: undefined, tenantId: undefined });
    await handler(webhooks.triggerEvent)(state.ctx, { projectId: "project-a", event: "test", payload: { message: "private" } });
    const created = state.writes.filter(write => write.table === "webhookDeliveries");
    expect(created.map(write => write.value.webhookId)).toEqual(["hook-a"]);
  });

  it("rejects unscoped internal webhook events before delivery creation", async () => {
    const state = fixture({ authenticated: false });
    await expect(handler(webhooks.triggerEvent)(state.ctx, { event: "test", payload: {} })).rejects.toThrow(/project|workspace|scope/i);
    expect(state.writes).toEqual([]);
  });

  it("does not claim execution across the unauthenticated scheduled action boundary", async () => {
    vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "0");
    const state = fixture({ authenticated: false });
    state.tables.scheduledJobs = [state.tables.scheduledJobs[0]];
    const result = await handler(jobs.executeDue)(state.ctx, {});
    const providerBudget = vi.fn();
    const scheduledContext = {
      runQuery: async (ref: any, args: any) => {
        expect(getFunctionName(ref)).toBe("companyContext:assertAuthenticated");
        return handler(assertAuthenticated)(state.ctx, args);
      },
      runMutation: providerBudget,
    };
    await expect(handler(reversePrompt)(scheduledContext, {
      projectId: "project-a", autoCreate: true, maxSuggestions: 3,
    })).rejects.toThrow("Authentication is required.");
    expect(providerBudget).not.toHaveBeenCalled();
    expect(result).toMatchObject({ executed: 0, skipped: 1, outcome: "NOT_EXECUTED" });
    expect(state.scheduled).toEqual([]);
    expect(state.tables.scheduledJobs[0]).not.toHaveProperty("lastRun");
    expect(state.tables.activities).toEqual([expect.objectContaining({
      action: "SCHEDULED_JOB_SKIPPED",
      metadata: expect.objectContaining({ outcome: "NOT_EXECUTED", code: "DELEGATED_HANDLER_UNAVAILABLE" }),
    })]);
  });

  it.each([false, true])("reports unavailable delegated execution for manual mission prompt dryRun=%s", async dryRun => {
    const state = fixture();
    const result = await handler(jobs.runNow)(state.ctx, { id: "job-a", dryRun });
    expect(result).toMatchObject({ success: false, skipped: true, outcome: "NOT_EXECUTED", code: "DELEGATED_HANDLER_UNAVAILABLE" });
    expect(state.tables.scheduledJobs[0]).not.toHaveProperty("lastRun");
    expect(state.writes).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it.each(["mission_prompt", "test_suite", "qc_run", "workflow", "hybrid"].flatMap(jobType =>
    ["default-create", "enabled-create", "enable", "update"].map(operation => [jobType, operation])
  ))("rejects unsupported %s activation through %s before writes", async (jobType, operation) => {
    const state = fixture();
    state.tables.scheduledJobs[0].jobType = jobType;
    state.tables.scheduledJobs[0].enabled = false;
    const call = operation.endsWith("create")
      ? handler(jobs.create)(state.ctx, { ...jobCreate, jobType, enabled: operation === "enabled-create" ? true : undefined })
      : operation === "enable"
        ? handler(jobs.setEnabled)(state.ctx, { id: "job-a", enabled: true })
        : handler(jobs.update)(state.ctx, { id: "job-a", enabled: true, name: "Must not persist" });
    await expect(call).rejects.toThrow(jobType === "mission_prompt" ? "DELEGATED_HANDLER_UNAVAILABLE" : "UNSUPPORTED_JOB_TYPE");
    expect(state.tables.scheduledJobs[0]).toMatchObject({ enabled: false, name: "a" });
    expect(state.writes).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it.each(["mission_prompt", "test_suite", "qc_run", "workflow", "hybrid"])("preserves disabled creation and legacy %s editing and disabling", async jobType => {
    const state = fixture();
    const existing = state.tables.scheduledJobs[0];
    existing.jobType = jobType;
    existing.lastRun = 123;
    const created = await handler(jobs.create)(state.ctx, { ...jobCreate, jobType });
    expect(state.tables.scheduledJobs.find(row => row._id === created.id)).toMatchObject({ enabled: false, createdBy: "operator-a" });
    await handler(jobs.update)(state.ctx, { id: "job-a", name: "Retained for migration" });
    await handler(jobs.setEnabled)(state.ctx, { id: "job-a", enabled: false });
    expect(existing).toMatchObject({ enabled: false, name: "Retained for migration", lastRun: 123 });
    expect(state.scheduled).toEqual([]);
  });

  it.each(["test_suite", "qc_run", "workflow", "hybrid"])("does not report an unsupported %s as executed", async jobType => {
    const state = fixture();
    state.tables.scheduledJobs[0].jobType = jobType;
    const result = await handler(jobs.runNow)(state.ctx, { id: "job-a" });
    expect(result).toMatchObject({ success: false, skipped: true, outcome: "NOT_EXECUTED", code: "UNSUPPORTED_JOB_TYPE" });
    expect(result.reason).toMatch(/unsupported|no executor/i);
    expect(state.tables.scheduledJobs[0]).not.toHaveProperty("lastRun");
    expect(state.scheduled).toEqual([]);
    expect(state.writes).toEqual([]);
  });

  it("reports unsupported scheduled jobs in the existing readiness query", async () => {
    const state = fixture();
    state.tables.scheduledJobs[0].jobType = "workflow";
    expect(await handler(jobs.evaluatePolicy)(state.ctx, { id: "job-a" })).toMatchObject({ allowed: false, reason: expect.stringMatching(/unsupported|no executor/i) });
  });

  it("advances skipped scheduler polling without recording a successful unsupported run", async () => {
    const state = fixture({ authenticated: false });
    state.tables.scheduledJobs = [{ ...state.tables.scheduledJobs[0], jobType: "workflow", lastRun: 123 }];
    const result = await handler(jobs.executeDue)(state.ctx, {});
    expect(result).toMatchObject({ executed: 0, skipped: 1 });
    expect(state.tables.scheduledJobs[0].lastRun).toBe(123);
    expect(state.tables.scheduledJobs[0].nextRun).toBeGreaterThan(0);
    expect(state.tables.activities.map(row => row.action)).toEqual(["SCHEDULED_JOB_SKIPPED"]);
    expect(state.scheduled).toEqual([]);
  });

  it("preserves lastRun and polling cadence without attempting delegated enqueueing", async () => {
    const state = fixture({ authenticated: false });
    state.tables.scheduledJobs = [{ ...state.tables.scheduledJobs[0], lastRun: 123 }];
    state.ctx.scheduler.runAfter.mockRejectedValue(new Error("Controlled enqueue failure"));
    expect(await handler(jobs.executeDue)(state.ctx, {})).toMatchObject({ executed: 0, skipped: 1 });
    expect(state.tables.scheduledJobs[0].lastRun).toBe(123);
    expect(state.tables.scheduledJobs[0].nextRun).toBeGreaterThan(0);
    expect(state.tables.activities.map(row => row.action)).toEqual(["SCHEDULED_JOB_SKIPPED"]);
    expect(state.ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("allows idle policy when the job workspace has no active work", async () => {
    const state = fixture();
    state.tables.scheduledJobs[0].runPolicy = "run_if_idle";
    expect(await handler(jobs.evaluatePolicy)(state.ctx, { id: "job-a" })).toMatchObject({ allowed: false, code: "DELEGATED_HANDLER_UNAVAILABLE", policy: { allowed: true } });
  });

  it.each(["IN_PROGRESS", "ASSIGNED", "READY"])("blocks idle policy for %s work in the same workspace", async status => {
    const state = fixture();
    state.tables.scheduledJobs[0].runPolicy = "run_if_idle";
    state.tables.tasks = [{ _id: "busy-a", projectId: "project-a", status }];
    expect(await handler(jobs.evaluatePolicy)(state.ctx, { id: "job-a" })).toMatchObject({ allowed: false, code: "DELEGATED_HANDLER_UNAVAILABLE", policy: { allowed: false } });
  });

  it("does not let another workspace's work or conflict group block a scheduled job", async () => {
    const state = fixture();
    state.tables.scheduledJobs[0].runPolicy = "run_if_idle";
    state.tables.scheduledJobs[0].conflictGroup = "shared-label";
    state.tables.scheduledJobs[2].conflictGroup = "shared-label";
    state.tables.scheduledJobs[2].lastRun = Date.now();
    state.tables.tasks = [{ _id: "busy-b", projectId: "project-b", status: "IN_PROGRESS" }];
    expect(await handler(jobs.evaluatePolicy)(state.ctx, { id: "job-a" })).toMatchObject({ allowed: false, code: "DELEGATED_HANDLER_UNAVAILABLE", policy: { allowed: true } });
  });

  it.each(["retargeted", "different-project", "global", "disabled"])("does not send queued webhook data through a %s binding", async kind => {
    const state = fixture({ authenticated: false });
    state.tables.webhookDeliveries = [state.tables.webhookDeliveries[0]];
    const delivery = state.tables.webhookDeliveries[0];
    const hook = state.tables.webhooks[0];
    if (kind === "retargeted") delivery.url = "https://hooks.example/old-destination";
    if (kind === "different-project") delivery.projectId = "project-b";
    if (kind === "global") hook.projectId = undefined;
    if (kind === "disabled") hook.active = false;
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response("ok"));
    vi.stubGlobal("fetch", fetch);
    expect(await handler(webhooks.deliverPending)(state.ctx, {})).toEqual({ delivered: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(delivery.status).toBe("FAILED");
  });

  it("preserves the internal signed delivery path for a valid current binding", async () => {
    const state = fixture({ authenticated: false });
    state.tables.webhookDeliveries = [state.tables.webhookDeliveries[0]];
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response("ok"));
    vi.stubGlobal("fetch", fetch);
    expect(await handler(webhooks.deliverPending)(state.ctx, {})).toEqual({ delivered: 1 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("https://hooks.example/a");
    expect((fetch.mock.calls[0] as any)[1]).toMatchObject({ method: "POST", redirect: "error", headers: { "X-Webhook-Signature": expect.stringMatching(/^[a-f0-9]{64}$/) } });
    expect(state.tables.webhookDeliveries[0].status).toBe("DELIVERED");
  });

  it("makes a failed webhook eligible exactly when its retry delay elapses", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const state = fixture({ authenticated: false });
    state.tables.webhookDeliveries = [state.tables.webhookDeliveries[0]];
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response("retry", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    expect(await handler(webhooks.deliverPending)(state.ctx, {})).toEqual({ delivered: 0 });
    const failed = state.tables.webhookDeliveries[0];
    expect(failed).toMatchObject({ _id: "delivery-a", webhookId: "hook-a", projectId: "project-a", status: "RETRYING", attempts: 1, nextRetryAt: 12_000 });
    now.mockReturnValue(11_999);
    expect(await handler(webhooks.getPendingDeliveries)(state.ctx, {})).toEqual([]);
    now.mockReturnValue(12_000);
    expect((await handler(webhooks.getPendingDeliveries)(state.ctx, {})).map((row: Row) => row._id)).toEqual(["delivery-a"]);
    fetch.mockResolvedValue(new Response("ok"));
    expect(await handler(webhooks.deliverPending)(state.ctx, {})).toEqual({ delivered: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(state.tables.webhookDeliveries).toHaveLength(1);
    expect(failed.status).toBe("DELIVERED");
    expect(await handler(webhooks.getPendingDeliveries)(state.ctx, {})).toEqual([]);
  });

  it("excludes completed, exhausted, and not-yet-due webhook records", async () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    const state = fixture({ authenticated: false });
    const base = state.tables.webhookDeliveries[0];
    state.tables.webhookDeliveries = [
      { ...base, _id: "completed", status: "DELIVERED", nextRetryAt: 1 },
      { ...base, _id: "failed", status: "FAILED", nextRetryAt: 1 },
      { ...base, _id: "exhausted-pending", status: "PENDING", attempts: 3 },
      { ...base, _id: "exhausted-retry", status: "RETRYING", attempts: 3, nextRetryAt: 1 },
      { ...base, _id: "future", status: "RETRYING", attempts: 1, nextRetryAt: 10_001 },
      { ...base, _id: "missing-time", status: "RETRYING", attempts: 1 },
      { ...base, _id: "eligible", status: "RETRYING", attempts: 1, nextRetryAt: 10_000 },
    ];
    expect((await handler(webhooks.getPendingDeliveries)(state.ctx, {})).map((row: Row) => row._id)).toEqual(["eligible"]);
  });

  it("retains the retry backoff and terminal attempt cap", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const state = fixture({ authenticated: false });
    state.tables.webhookDeliveries = [state.tables.webhookDeliveries[0]];
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response("retry", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    await handler(webhooks.deliverPending)(state.ctx, {});
    now.mockReturnValue(12_000);
    await handler(webhooks.deliverPending)(state.ctx, {});
    expect(state.tables.webhookDeliveries[0]).toMatchObject({ status: "RETRYING", attempts: 2, nextRetryAt: 16_000 });
    now.mockReturnValue(16_000);
    await handler(webhooks.deliverPending)(state.ctx, {});
    expect(state.tables.webhookDeliveries[0]).toMatchObject({ status: "FAILED", attempts: 3 });
    now.mockReturnValue(100_000);
    await handler(webhooks.deliverPending)(state.ctx, {});
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps each combined pending/retry batch bounded to ten deliveries", async () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    const state = fixture({ authenticated: false });
    const base = state.tables.webhookDeliveries[0];
    state.tables.webhookDeliveries = Array.from({ length: 20 }, (_, index) => ({
      ...base, _id: `delivery-${index}`, _creationTime: index,
      status: index < 10 ? "PENDING" : "RETRYING", nextRetryAt: index < 10 ? undefined : index,
    }));
    const selected = await handler(webhooks.getPendingDeliveries)(state.ctx, {});
    expect(selected).toHaveLength(10);
    expect(new Set(selected.map((row: Row) => row._id)).size).toBe(10);
  });
});
