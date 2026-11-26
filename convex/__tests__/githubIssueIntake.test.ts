import { afterEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import * as github from "../github";
import { assertAuthenticated } from "../companyContext";

type Row = Record<string, any> & { _id: string };

function handler(fn: unknown) {
  return (fn as { _handler: (ctx: any, args: any) => Promise<any> })._handler;
}

const issue = { number: 7, title: "Fix the task list", body: "Observed failure", state: "open", labels: ["bug"] };
const input = { projectId: "project-a", repoOwner: "example", repoName: "repo", issue };
const syncInput = { projectId: "project-a", repoOwner: "example", repoName: "repo", accessToken: "test-token" };
const apiUrl = "https://api.github.com/repos/example/repo/issues?state=all&per_page=100";

function task(overrides: Partial<Row> = {}): Row {
  return {
    _id: "task-a", projectId: "project-a", status: "IN_PROGRESS", title: "Original",
    description: "Original body", labels: ["old"], source: "GITHUB",
    idempotencyKey: "github:example/repo#7",
    metadata: { githubIssueNumber: 7, githubRepoUrl: "https://github.com/example/repo" },
    ...overrides,
  };
}

function context({ authenticated = true, projects = ["project-a"], role = "Developer", tasks = [] as Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    tenants: [{ _id: "tenant-a", active: true }],
    projects: ["project-a", "project-b"].map(_id => ({ _id, tenantId: "tenant-a" })),
    operators: [{ _id: "operator-a", authId: "user-a", tenantId: "tenant-a", active: true }],
    roles: [{ _id: "role-a", tenantId: "tenant-a", name: role, permissions: [] }],
    roleAssignments: projects.map(id => ({ _id: `assignment-${id}`, operatorId: "operator-a", roleId: "role-a", scope: { type: "project", id } })),
    tasks: tasks.map(row => structuredClone(row)),
    activities: [],
  };
  const writes: Array<{ kind: string; id?: string; table?: string; value: any }> = [];
  const queryCalls: string[] = [];
  const mutations: Array<{ name: string; args: any }> = [];
  const ctx: any = {
    auth: { getUserIdentity: vi.fn(async () => authenticated ? { subject: "user-a", tokenIdentifier: "issuer|user-a", issuer: "issuer" } : null) },
    db: {
      get: vi.fn(async (id: string) => Object.values(tables).flat().find(row => row._id === id) ?? null),
      query: (table: string) => {
        let rows = [...(tables[table] ?? [])];
        const builder: any = {
          withIndex: (_name: string, apply: (q: any) => any) => {
            const conditions: Array<[string, unknown]> = [];
            const q: any = { eq: (field: string, value: unknown) => { conditions.push([field, value]); return q; } };
            apply(q);
            rows = rows.filter(row => conditions.every(([field, value]) => row[field] === value));
            return builder;
          },
          first: async () => rows[0] ?? null,
          filter: (apply: (q: any) => { field: string; value: unknown }) => {
            const condition = apply({ field: (field: string) => field, eq: (field: string, value: unknown) => ({ field, value }) });
            rows = rows.filter(row => row[condition.field] === condition.value);
            return builder;
          },
          collect: async () => rows,
        };
        return builder;
      },
      patch: vi.fn(async (id: string, value: any) => {
        const row = Object.values(tables).flat().find(item => item._id === id);
        if (!row) throw new Error("Missing fixture row");
        Object.assign(row, value);
        writes.push({ kind: "patch", id, value });
      }),
      insert: vi.fn(async (table: string, value: any) => {
        const row = { _id: `${table}-${tables[table]?.length ?? 0}`, ...value };
        (tables[table] ??= []).push(row);
        writes.push({ kind: "insert", table, value });
        return row._id;
      }),
    },
    runQuery: async (ref: any, args: any) => {
      const name = getFunctionName(ref);
      queryCalls.push(name);
      if (name === "companyContext:assertAuthenticated") return handler(assertAuthenticated)(ctx, args);
      if (name.startsWith("github:")) return handler((github as any)[name.split(":")[1]])(ctx, args);
      throw new Error(`Unexpected query ${name}`);
    },
    runMutation: async (ref: any, args: any) => {
      const name = getFunctionName(ref);
      mutations.push({ name, args });
      if (name === "companyContext:consumeProviderBudget") return { allowed: true };
      if (name === "github:upsertTaskFromIssue") return handler(github.upsertTaskFromIssue)(ctx, args);
      if (name === "tasks:create") {
        const existing = tables.tasks.find(row => row.idempotencyKey === args.idempotencyKey);
        if (existing) return { task: existing, created: false };
        const row = { _id: `import-${tables.tasks.length}`, status: "INBOX", ...args };
        tables.tasks.push(row);
        writes.push({ kind: "createTask", value: row });
        return { task: row, created: true };
      }
      throw new Error(`Unexpected mutation ${name}`);
    },
  };
  return { ctx, tables, writes, queryCalls, mutations };
}

function page(numbers: number[], next?: string, status = 200) {
  return new Response(JSON.stringify(numbers.map(number => ({ ...issue, number, labels: [{ name: "bug" }] }))), {
    status,
    headers: next ? { Link: `<${next}>; rel="next"` } : {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("legacy GitHub task authorization", () => {
  it.each([
    ["upsert", github.upsertTaskFromIssue, input],
    ["list", github.listGitHubLinkedTasks, { projectId: "project-a" }],
    ["config", github.getGitHubConfig, { projectId: "project-a" }],
    ["issue link", github.linkTaskToGitHubIssue, { taskId: "task-a", issueNumber: 7, repoUrl: "https://github.com/example/repo" }],
    ["PR link", github.linkTaskToGitHubPR, { taskId: "task-a", prNumber: 8, branch: "fix", repoUrl: "https://github.com/example/repo" }],
  ])("denies unauthenticated %s before any task writes", async (_name, fn, args) => {
    vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "1");
    const { ctx, writes } = context({ authenticated: false, tasks: [task()] });
    await expect(handler(fn)(ctx, args)).rejects.toThrow(/authenticat|unauthorized/i);
    expect(writes).toEqual([]);
  });

  it("denies updates when the operator lacks the requested project", async () => {
    const { ctx, writes } = context({ tasks: [task({ projectId: "project-b" })] });
    await expect(handler(github.upsertTaskFromIssue)(ctx, { ...input, projectId: "project-b" })).rejects.toThrow(/unauthorized|permit/i);
    expect(writes).toEqual([]);
  });

  it("lets an authorized second project import the same issue without touching the first", async () => {
    const original = task();
    const { ctx, tables, writes } = context({ projects: ["project-b"], tasks: [original] });
    const result = await handler(github.upsertTaskFromIssue)(ctx, { ...input, projectId: "project-b" });
    expect(result.created).toBe(true);
    expect(tables.tasks[0]).toEqual(original);
    expect(tables.tasks).toHaveLength(2);
    expect(tables.tasks[1]).toMatchObject({ projectId: "project-b", status: "INBOX" });
    expect(writes.every(write => write.id !== "task-a")).toBe(true);
  });

  it("adopts the same-project legacy issue and preserves its workflow state", async () => {
    const { ctx, tables } = context({ tasks: [task()] });
    const first = await handler(github.upsertTaskFromIssue)(ctx, input);
    const second = await handler(github.upsertTaskFromIssue)(ctx, input);
    expect(first).toEqual({ taskId: "task-a", created: false });
    expect(second).toEqual(first);
    expect(tables.tasks).toHaveLength(1);
    expect(tables.tasks[0]).toMatchObject({ status: "IN_PROGRESS", projectId: "project-a", title: "[GH-7] Fix the task list" });
    expect(tables.activities.every(row => row.projectId === "project-a")).toBe(true);
  });

  it("deduplicates new imports within one project", async () => {
    const { ctx, tables } = context();
    const first = await handler(github.upsertTaskFromIssue)(ctx, input);
    const second = await handler(github.upsertTaskFromIssue)(ctx, input);
    expect(first.created).toBe(true);
    expect(second).toEqual({ taskId: first.taskId, created: false });
    expect(tables.tasks).toHaveLength(1);
    expect(tables.tasks[0].status).toBe("INBOX");
  });

  it("adopts a legacy spelling then deduplicates case-insensitive repository requests", async () => {
    const { ctx, tables } = context({ tasks: [task({ idempotencyKey: "github:Example/Repo#7" })] });
    await handler(github.upsertTaskFromIssue)(ctx, { ...input, repoOwner: "Example", repoName: "Repo" });
    await handler(github.upsertTaskFromIssue)(ctx, input);
    expect(tables.tasks).toHaveLength(1);
    expect(tables.tasks[0]._id).toBe("task-a");
  });

  it("refuses a corrupt scoped key that points into a different project", async () => {
    const { ctx, writes } = context({ tasks: [task({ projectId: "project-b", idempotencyKey: "github:project-a:example/repo#7" })] });
    await expect(handler(github.upsertTaskFromIssue)(ctx, input)).rejects.toThrow(/unauthorized/i);
    expect(writes).toEqual([]);
  });

  it("allows a workspace viewer to read but not import", async () => {
    const { ctx, writes } = context({ role: "Viewer", tasks: [task()] });
    await expect(handler(github.listGitHubLinkedTasks)(ctx, { projectId: "project-a" })).resolves.toHaveLength(1);
    await expect(handler(github.upsertTaskFromIssue)(ctx, input)).rejects.toThrow(/permit|unauthorized/i);
    expect(writes).toEqual([]);
  });

  it.each([
    [github.linkTaskToGitHubIssue, { taskId: "task-a", issueNumber: 7, repoUrl: "https://github.com/example/repo" }],
    [github.linkTaskToGitHubPR, { taskId: "task-a", prNumber: 8, branch: "fix", repoUrl: "https://github.com/example/repo" }],
  ])("authorizes links using the stored task workspace", async (fn, args) => {
    const { ctx, writes } = context({ tasks: [task({ projectId: "project-b" })] });
    await expect(handler(fn)(ctx, args)).rejects.toThrow(/permit|unauthorized/i);
    expect(writes).toEqual([]);
  });

  it("denies reads of another workspace", async () => {
    const { ctx } = context({ tasks: [task({ projectId: "project-b" })] });
    await expect(handler(github.listGitHubLinkedTasks)(ctx, { projectId: "project-b" })).rejects.toThrow(/unauthorized/i);
  });

  it("requires authenticated scoped authority for direct webhook replay", async () => {
    const { ctx, writes } = context({ authenticated: false, tasks: [task()] });
    await expect(handler(github.handleIssueWebhook)(ctx, { ...input, action: "edited", issue: { ...issue, labels: [{ name: "bug" }] } })).rejects.toThrow(/authenticat|unauthorized/i);
    expect(writes).toEqual([]);
  });
});

describe("GitHub sync boundaries and pagination", () => {
  it("requires a real authenticated identity even if anonymous demo mode is enabled", async () => {
    vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "1");
    const { ctx, mutations } = context({ authenticated: false });
    const fetcher = vi.fn(async () => page([1]));
    vi.stubGlobal("fetch", fetcher);
    await expect(handler(github.syncGitHubIssues)(ctx, syncInput)).rejects.toThrow(/authenticat/i);
    expect(fetcher).not.toHaveBeenCalled();
    expect(mutations).toEqual([]);
  });

  it("denies a different workspace before consuming budget or fetching", async () => {
    const { ctx, writes, mutations } = context();
    const fetcher = vi.fn(async () => page([1]));
    vi.stubGlobal("fetch", fetcher);
    await expect(handler(github.syncGitHubIssues)(ctx, { ...syncInput, projectId: "project-b" })).rejects.toThrow(/unauthorized/i);
    expect(fetcher).not.toHaveBeenCalled();
    expect(mutations).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("imports all 101 issues across both pages and reports the actual counts", async () => {
    const { ctx, tables, mutations } = context();
    const fetcher = vi.fn().mockResolvedValueOnce(page(Array.from({ length: 100 }, (_, i) => i + 1), `${apiUrl}&page=2`)).mockResolvedValueOnce(page([101]));
    vi.stubGlobal("fetch", fetcher);
    const result = await handler(github.syncGitHubIssues)(ctx, syncInput);
    expect(result).toMatchObject({ success: true, issuesFound: 101, tasksCreated: 101, tasksUpdated: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(tables.tasks).toHaveLength(101);
    expect(mutations.find(call => call.name === "companyContext:consumeProviderBudget")?.args).toEqual({ operation: "github.syncIssues", actorId: "operator-a" });
  });

  it.each([
    "https://api.github.com/repositories/1300192/issues?page=2",
    "https://api.github.com/repositories/9876/issues?state=all&per_page=100&page=2",
    "https://api.github.com/repos/example/repo/issues?page=2",
  ])("uses canonical pagination metadata without changing the authorized repository", async next => {
    const { ctx, tables } = context();
    const fetcher = vi.fn().mockResolvedValueOnce(page([1], next)).mockResolvedValueOnce(page([2]));
    vi.stubGlobal("fetch", fetcher);
    await expect(handler(github.syncGitHubIssues)(ctx, syncInput)).resolves.toMatchObject({ success: true, issuesFound: 2 });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([apiUrl, `${apiUrl}&page=2`]);
    expect(tables.tasks).toHaveLength(2);
  });

  it.each([
    "https://attacker.example/steal?page=2",
    "http://api.github.com/repos/example/repo/issues?state=all&per_page=100&page=2",
    "https://api.github.com/repos/another/repo/issues?state=all&per_page=100&page=2",
    "https://user:password@api.github.com/repos/example/repo/issues?state=all&per_page=100&page=2",
    `${apiUrl}&page=1`,
    `${apiUrl}&page=3`,
  ])("rejects an unsafe or incomplete next page without forwarding the bearer token", async next => {
    const { ctx, writes } = context();
    const fetcher = vi.fn(async () => page([1], next));
    vi.stubGlobal("fetch", fetcher);
    await expect(handler(github.syncGitHubIssues)(ctx, syncInput)).rejects.toThrow(/pagination/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(apiUrl);
    expect(writes).toEqual([]);
  });

  it("fails a later provider page before importing any issues", async () => {
    const { ctx, writes } = context();
    const fetcher = vi.fn().mockResolvedValueOnce(page([1], `${apiUrl}&page=2`)).mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(handler(github.syncGitHubIssues)(ctx, syncInput)).rejects.toThrow(/503/);
    expect(writes).toEqual([]);
  });

  it("rejects a malformed later page before importing any issues", async () => {
    const { ctx, writes } = context();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(page([1], `${apiUrl}&page=2`)).mockResolvedValueOnce(new Response(JSON.stringify([{ number: 2, title: "Missing state and labels" }]))));
    await expect(handler(github.syncGitHubIssues)(ctx, syncInput)).rejects.toThrow(/Invalid GitHub issue/);
    expect(writes).toEqual([]);
  });

  it("rejects an oversized page before imports", async () => {
    const { ctx, writes } = context();
    vi.stubGlobal("fetch", vi.fn(async () => page(Array.from({ length: 101 }, (_, i) => i + 1))));
    await expect(handler(github.syncGitHubIssues)(ctx, syncInput)).rejects.toThrow(/Invalid GitHub issue page/);
    expect(writes).toEqual([]);
  });

  it("reports a write failure and resumes idempotently after completed imports", async () => {
    const { ctx, tables } = context();
    const originalRunMutation = ctx.runMutation;
    let failed = false;
    ctx.runMutation = async (ref: any, args: any) => {
      if (getFunctionName(ref) === "github:upsertTaskFromIssue" && args.issue.number === 2 && !failed) {
        failed = true;
        throw new Error("Controlled second import failure");
      }
      return originalRunMutation(ref, args);
    };
    vi.stubGlobal("fetch", vi.fn(async () => page([1, 2])));
    await expect(handler(github.syncGitHubIssues)(ctx, syncInput)).rejects.toThrow("Controlled second import failure");
    expect(tables.tasks).toHaveLength(1);
    await expect(handler(github.syncGitHubIssues)(ctx, syncInput)).resolves.toMatchObject({ success: true, tasksCreated: 1, tasksUpdated: 1 });
    expect(tables.tasks).toHaveLength(2);
  });

  it("fails explicitly when another page remains at the resource cap", async () => {
    const { ctx, writes } = context();
    const fetcher = vi.fn(async (url: string) => {
      const current = Number(new URL(url).searchParams.get("page") ?? 1);
      return page([current], `${apiUrl}&page=${current + 1}`);
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(handler(github.syncGitHubIssues)(ctx, syncInput)).rejects.toThrow(/pagination.*limit|limit.*pages/i);
    expect(fetcher).toHaveBeenCalledTimes(10);
    expect(writes).toEqual([]);
  });

  it("disallows redirects at the authenticated fetch boundary", async () => {
    const { ctx, writes } = context();
    let forwarded = false;
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.redirect !== "error") forwarded = true;
      return new Response("Moved", { status: 301 });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(handler(github.syncGitHubIssues)(ctx, syncInput)).rejects.toThrow(/301/);
    expect(forwarded).toBe(false);
    expect(writes).toEqual([]);
  });

  it("retains pull-request filtering across pages", async () => {
    const { ctx, tables } = context();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ ...issue, number: 1, pull_request: {} }]), { headers: { Link: `<${apiUrl}&page=2>; rel="next"` } })).mockResolvedValueOnce(page([2])));
    const result = await handler(github.syncGitHubIssues)(ctx, syncInput);
    expect(result).toMatchObject({ issuesFound: 1, tasksCreated: 1 });
    expect(tables.tasks[0].metadata.githubIssueNumber).toBe(2);
  });
});

describe("GitHub remote issue state", () => {
  const update = { taskId: "task-a", repoOwner: "example", repoName: "repo", issueNumber: 7, state: "closed", accessToken: "test-token" };

  it.each([
    { projectId: "project-b" },
    { metadata: { githubIssueNumber: 8, githubRepoUrl: "https://github.com/example/repo" } },
    { metadata: { githubIssueNumber: 7, githubRepoUrl: "https://github.com/another/repo" } },
  ])("denies a stored task scope or linkage mismatch before provider effects", async override => {
    const { ctx, mutations } = context({ tasks: [task(override)] });
    const fetcher = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await expect(handler(github.updateGitHubIssueStatus)(ctx, update)).rejects.toThrow(/unauthorized|linked|match/i);
    expect(fetcher).not.toHaveBeenCalled();
    expect(mutations).toEqual([]);
  });

  it("updates the linked issue for an authorized task without transitioning the task", async () => {
    const { ctx, tables } = context({ tasks: [task()] });
    const fetcher = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await expect(handler(github.updateGitHubIssueStatus)(ctx, update)).resolves.toEqual({ success: true });
    expect(fetcher).toHaveBeenCalledWith("https://api.github.com/repos/example/repo/issues/7", expect.objectContaining({ method: "PATCH", redirect: "error", body: JSON.stringify({ state: "closed" }) }));
    expect(tables.tasks[0].status).toBe("IN_PROGRESS");
  });

  it("keeps the issue target intact when linking a PR from another repository", async () => {
    const { ctx, tables } = context({ tasks: [task()] });
    await handler(github.linkTaskToGitHubPR)(ctx, { taskId: "task-a", prNumber: 8, branch: "fix", repoUrl: "https://github.com/another/repo" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    await expect(handler(github.updateGitHubIssueStatus)(ctx, update)).resolves.toEqual({ success: true });
    expect(tables.tasks[0].metadata).toMatchObject({ githubRepoUrl: "https://github.com/example/repo", githubPrRepoUrl: "https://github.com/another/repo" });
  });
});
