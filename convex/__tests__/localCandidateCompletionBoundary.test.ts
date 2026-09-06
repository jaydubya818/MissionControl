import { describe, expect, it } from "vitest";
import { reportInternal, scheduleVerificationInternal } from "../factory/attempts";
import { getFunctionName } from "convex/server";
import { syncExecutionOutcome, accept } from "../workOrders";

/** Exercise the existing mutation bodies with persisted synthetic rows. This
 * is structural lifecycle evidence, never observed canonical execution. */
function fixture() {
  const rows = new Map<string, any>();
  const tables = new Map<string, string[]>();
  const put = (table: string, value: any) => {
    const id = value._id ?? `${table}-${rows.size}`;
    rows.set(id, { ...value, _id: id }); tables.set(table, [...tables.get(table) ?? [], id]); return id;
  };
  const db: any = { get: async (id: string) => structuredClone(rows.get(id) ?? null),
    insert: async (table: string, value: any) => put(table, value),
    patch: async (id: string, value: any) => { rows.set(id, { ...rows.get(id), ...value }); },
    query: (table: string) => {
      const predicates: Array<(row: any) => boolean> = [];
      const q: any = { field: (key: string) => ({ field: key }),
        eq: (key: any, value: any) => { const test = (row: any) => row[typeof key === "string" ? key : key.field] === value;
          predicates.push(test); return q; },
        neq: (key: any, value: any) => { predicates.push(row => row[key.field ?? key] !== value); return q; } };
      const values = () => (tables.get(table) ?? []).map(id => structuredClone(rows.get(id))).filter(row => predicates.every(test => test(row)));
      const query: any = { withIndex: (_: string, fn?: any) => { fn?.(q); return query; },
        filter: (fn: any) => { fn(q); return query; }, order: () => query,
        collect: async () => values(), first: async () => values()[0] ?? null, take: async (n: number) => values().slice(0, n) };
      return query;
    } };
  const ctx: any = { db, runMutation: async (reference: any, args: any) => {
    if (getFunctionName(reference) === "factory/attempts:scheduleVerificationInternal") {
      return (scheduleVerificationInternal as any)._handler(ctx, args);
    }
    return (syncExecutionOutcome as any)._handler(ctx, args);
  } };
  const sha = "a".repeat(40), candidateSha = "b".repeat(40), treeSha = "c".repeat(40), digest = `sha256:${"d".repeat(64)}`;
  put("workspaceRepositories", { _id: "repository", projectId: "project", providerRepositoryId: "synthetic-repo", defaultBranch: "main" });
  put("workOrders", { _id: "work-order", projectId: "project", state: "IN_PROGRESS", currentRevisionNumber: 1,
    title: "Synthetic candidate", riskLevel: "LOW", isMutating: true, requiredApprovals: [], requirements: [], acceptanceCriteria: [],
    verificationStatus: "PENDING", approvalStatus: "APPROVED", verificationContractDigest: digest, qualityContractDigest: digest,
    verificationContract: { schemaVersion: 2, enforcementMode: "ENFORCED" } });
  put("workflowRuns", { _id: "attempt", runId: "run", projectId: "project", repositoryId: "repository", workOrderId: "work-order",
    status: "RUNNING", attemptPurpose: "IMPLEMENTATION", isMutating: true, branch: "mc/synthetic", workOrderRevisionNumber: 1,
    qualityContractDigest: digest, verificationContractDigest: digest, executionManifestDigest: digest,
    executionManifest: { version: "factory-execution-manifest/v1", repository: { baseSha: sha } },
    lease: { leaseId: "lease", ownerId: "owner", expiresAt: Date.now() + 60000 },
    startedAt: Date.now(), currentStepIndex: 0, totalSteps: 1, steps: [{ stepId: "build", status: "RUNNING" }] });
  const packet = { artifacts: [{ idempotencyKey: "code-diff", artifactType: "CODE_DIFF", name: "Candidate", contentHash: `git:${candidateSha}`,
    metadata: { headSha: candidateSha, treeSha, sourceRevision: sha, changedFiles: ["docs/synthetic.md"] } }],
    candidateReady: { transport: "LOCAL_GIT", candidateSha, treeSha, baseRef: "main", headRef: "mc/synthetic" },
    terminal: { status: "COMPLETED" } };
  return { ctx, rows, tables, packet };
}

describe("producer completion retains independent acceptance boundary", () => {
  it.each(["AGENT", "SYSTEM"])("producer completion cannot grant %s human acceptance authority", async actorType => {
    const { ctx, rows, packet } = fixture();
    await (reportInternal as any)._handler(ctx, { workflowRunId: "attempt", leaseId: "lease", ownerId: "owner", packet });
    await expect((accept as any)._handler(ctx, { workOrderId: "work-order", actorType,
      actorId: "producer", idempotencyKey: "synthetic-acceptance" })).rejects.toThrow("authenticated human operator");
    expect(rows.get("work-order").state).toBe("AWAITING_VERIFICATION");
  });
  it.each(["repository", "work-order", "revision"])("rejects changed %s scope at candidate handoff", async changed => {
    const { ctx, rows, packet } = fixture();
    if (changed === "revision") rows.get("work-order").currentRevisionNumber = 2;
    else rows.get(changed).projectId = "other-project";
    await expect((reportInternal as any)._handler(ctx, { workflowRunId: "attempt", leaseId: "lease", ownerId: "owner", packet }))
      .rejects.toThrow("lineage is stale");
    expect(rows.get("attempt").status).toBe("RUNNING");
  });
  it("retains a local candidate and blocks the WorkOrder when no independent verifier is configured", async () => {
    const { ctx, rows, tables, packet } = fixture();
    await (reportInternal as any)._handler(ctx, { workflowRunId: "attempt", leaseId: "lease", ownerId: "owner", packet });
    expect(rows.get("attempt")).toMatchObject({ status: "COMPLETED", verificationSubject: { provider: "LOCAL_GIT", sourceAttemptId: "attempt" } });
    expect(rows.get("work-order")).toMatchObject({ state: "AWAITING_VERIFICATION", verificationStatus: "PENDING" });
    expect(rows.get("work-order").blockingIssue).toContain("Independent verification dispatch is blocked");
    expect(tables.get("verificationReceipts") ?? []).toHaveLength(0);
    expect(rows.get("attempt").factoryContinuation).toBeUndefined();
    expect([...rows.values()].some(row => row.artifactType === "PULL_REQUEST")).toBe(false);
  });
  it("rejects changed candidate identity before producer completion", async () => {
    const { ctx, rows, packet } = fixture(); packet.candidateReady.treeSha = "e".repeat(40);
    await expect((reportInternal as any)._handler(ctx, { workflowRunId: "attempt", leaseId: "lease", ownerId: "owner", packet }))
      .rejects.toThrow("exact unpublished local Git candidate");
    expect(rows.get("attempt").status).toBe("RUNNING");
  });
  it("rejects producer-supplied verification regardless of claimed PASS labels", async () => {
    const { ctx, tables } = fixture();
    await expect((reportInternal as any)._handler(ctx, { workflowRunId: "attempt", leaseId: "lease", ownerId: "owner",
      packet: { verification: { verdict: "VERIFIED", independenceValid: true, status: "PASS" } } }))
      .rejects.toThrow("separate subject-bound Verification Attempt");
    expect(tables.get("verificationReceipts") ?? []).toHaveLength(0);
  });
});
