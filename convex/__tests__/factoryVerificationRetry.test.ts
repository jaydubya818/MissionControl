import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitVerificationSubject } from "@mission-control/workflow-engine/verification-subject";
import { retryVerificationHandler } from "../factory/attempts";
import { syncExecutionOutcome } from "../workOrders";

type Row = Record<string, any>;
const CONTRACT = `sha256:${"d".repeat(64)}`;
const SOURCE_SHA = "a".repeat(40);
const CANDIDATE_SHA = "b".repeat(40);

function fixture(staleSource = false) {
  let sequence = 1;
  const subject = createGitVerificationSubject({ version: 1, kind: "GIT_CANDIDATE",
    workOrderId: "work-order-1", workOrderRevisionNumber: 4, verificationContractDigest: CONTRACT,
    sourceAttemptId: "source-1", repositoryId: "repository-1", provider: "GITHUB",
    providerRepositoryId: "provider-repository-1", candidateSha: CANDIDATE_SHA, treeSha: "c".repeat(40),
    pullRequest: { providerPullRequestId: "provider-pr-1", number: 1,
      url: "https://github.com/acme/repo/pull/1", baseRef: "main", headRef: "mc/work-order-1",
      headSha: CANDIDATE_SHA, draftAtPublication: true } });
  const tables: Record<string, Row[]> = {
    tenants: [{ _id: "tenant-1", active: true }],
    projects: [{ _id: "project-1", tenantId: "tenant-1" }],
    workOrders: [{ _id: "work-order-1", tenantId: "tenant-1", projectId: "project-1",
      currentRevisionNumber: 4, verificationContractDigest: CONTRACT,
      state: "AWAITING_VERIFICATION", verificationStatus: "PENDING", approvalStatus: "APPROVED",
      riskLevel: "LOW", requiredApprovals: [], isMutating: true,
      acceptanceCriteria: [{ id: "criterion-1", description: "Foundation passes", verificationMethod: "TEST",
        required: true, status: "FAILED" }] }],
    workflowRuns: [
      { _id: "source-1", runId: "source-run", tenantId: "tenant-1", projectId: "project-1",
        workOrderId: "work-order-1", repositoryId: "repository-1", workOrderRevisionNumber: 4,
        verificationContractDigest: CONTRACT, attemptPurpose: "IMPLEMENTATION", status: "FAILED",
        executionPhase: "TERMINAL", candidateReadyAt: 100, startedAt: 10, executionBaseSha: SOURCE_SHA,
        headSha: CANDIDATE_SHA, treeSha: "c".repeat(40), branch: "mc/work-order-1",
        executionManifest: { causation: { workflowRunId: "source-run" }, repository: { baseSha: SOURCE_SHA } },
        executionManifestDigest: `sha256:${"e".repeat(64)}`, verificationSubject: subject },
      { _id: "verifier-1", runId: "verifier-run", tenantId: "tenant-1", projectId: "project-1",
        workOrderId: "work-order-1", workOrderRevisionNumber: 4, verificationContractDigest: CONTRACT,
        attemptPurpose: "VERIFICATION", status: "COMPLETED", startedAt: 200,
        verificationAttemptBinding: { sourceAttemptId: "source-1", workOrderId: "work-order-1",
          workOrderRevisionNumber: 4, verificationContractDigest: CONTRACT,
          verificationSubjectDigest: subject.digest, verificationSubject: subject } },
      ...(staleSource ? [{ _id: "source-2", runId: "source-run-2", workOrderId: "work-order-1",
        workOrderRevisionNumber: 4, attemptPurpose: "IMPLEMENTATION", status: "COMPLETED",
        candidateReadyAt: 300, startedAt: 300 }] : []),
    ],
    verificationRuns: [{ _id: "verification-run-1", workflowRunId: "verifier-1",
      workOrderId: "work-order-1", sourceAttemptId: "source-1", workOrderRevisionNumber: 4,
      verificationContractDigest: CONTRACT, verificationSubjectId: subject.subjectId,
      verificationSubjectDigest: subject.digest, sourceRevision: SOURCE_SHA, candidateRevision: CANDIDATE_SHA,
      status: "COMPLETED", verdict: "NOT_VERIFIED" }],
    verificationReceipts: [{ _id: "criterion-receipt-1", workOrderId: "work-order-1",
      workflowRunId: "verifier-1", receiptScope: "ACCEPTANCE_CRITERION",
      acceptanceCriterionId: "criterion-1", status: "FAILED", recordedAt: 500 }],
    evidenceEnvelopes: [{ _id: "evidence-1", workflowRunId: "verifier-1", summary: "Original failure evidence" }],
  };
  const find = (id: string) => Object.values(tables).flat().find(row => row._id === id);
  const db = {
    get: async (id: string) => structuredClone(find(id) ?? null),
    insert: async (table: string, value: Row) => {
      const id = value._id ?? `${table}-${sequence++}`;
      (tables[table] ??= []).push(structuredClone({ ...value, _id: id, _creationTime: sequence }));
      return id;
    },
    patch: async (id: string, value: Row) => Object.assign(find(id)!, structuredClone(value)),
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const query: any = {
        withIndex: (_name: string, select: (q: any) => unknown) => {
          const predicates: Array<[string, unknown]> = [];
          const index: any = { eq: (field: string, value: unknown) => { predicates.push([field, value]); return index; } };
          select(index); rows = rows.filter(row => predicates.every(([field, value]) => row[field] === value)); return query;
        },
        collect: async () => structuredClone(rows),
        first: async () => structuredClone(rows[0] ?? null),
        take: async (count: number) => structuredClone(rows.slice(0, count)),
        filter: (select: (q: any) => (row: Row) => boolean) => {
          const predicate = select({ field: (name: string) => (row: Row) => row[name],
            eq: (field: (row: Row) => unknown, value: unknown) => (row: Row) => field(row) === value });
          rows = rows.filter(predicate); return query;
        },
        order: (direction: "asc" | "desc") => {
          if (direction === "desc") rows.reverse();
          return query;
        },
      };
      return query;
    },
  };
  const ctx = { db, auth: { getUserIdentity: async () => null }, runMutation: async () => undefined };
  let scheduled = 0;
  const schedule = async (_ctx: any, workOrder: any, sourceAttempt: any) => {
    scheduled += 1;
    const workflowRun = { _id: `retry-${scheduled}`, runId: `retry-run-${scheduled}`,
      tenantId: workOrder.tenantId, projectId: workOrder.projectId, workOrderId: workOrder._id,
      attemptPurpose: "VERIFICATION", status: "PENDING", startedAt: 400,
      isMutating: false, steps: [{ isolation: "READ_ONLY" }],
      verificationAttemptBinding: { sourceAttemptId: sourceAttempt._id,
        verificationSubjectDigest: sourceAttempt.verificationSubject.digest },
      metadata: { sourceAttemptId: sourceAttempt._id } };
    await db.insert("workflowRuns", workflowRun);
    return { created: true as const, workflowRun };
  };
  return { ctx, db, tables, schedule, scheduled: () => scheduled };
}

afterEach(() => vi.unstubAllEnvs());

describe("governed completed verification retry", () => {
  it("supersedes one NOT_VERIFIED verifier, preserves evidence, and idempotently returns the active retry", async () => {
    vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "1");
    const f = fixture();
    const args = { workOrderId: "work-order-1", failedVerificationAttemptId: "verifier-1",
      reason: "Retry after a governed verifier infrastructure correction." };
    const evidenceBefore = structuredClone(f.tables.evidenceEnvelopes);
    const first = await retryVerificationHandler(f.ctx, args, f.schedule as any);
    expect(first).toMatchObject({ created: true, workflowRun: { isMutating: false,
      steps: [{ isolation: "READ_ONLY" }], verificationAttemptBinding: {
        sourceAttemptId: "workflowRuns-1", verificationSubjectDigest: expect.stringMatching(/^sha256:/) } } });
    expect(await f.db.get("verifier-1")).toMatchObject({ status: "COMPLETED",
      metadata: { verificationSupersededAt: expect.any(Number), verificationSupersededBy: "human:demo:company-administrator" } });
    expect(await f.db.get("source-1")).toMatchObject({ status: "FAILED", executionPhase: "TERMINAL" });
    expect(await f.db.get("workflowRuns-1")).toMatchObject({ status: "COMPLETED", isMutating: false,
      executionBaseSha: SOURCE_SHA, headSha: CANDIDATE_SHA, treeSha: "c".repeat(40),
      steps: [{ isolation: "READ_ONLY" }], metadata: { verificationCandidateContinuation: {
        sourceAttemptId: "source-1", failedVerificationAttemptId: "verifier-1",
        failedVerificationRunId: "verification-run-1", executorReplay: false } } });
    expect((await f.db.get("workflowRuns-1")).verificationSubject).toMatchObject({
      sourceAttemptId: "workflowRuns-1", candidateSha: CANDIDATE_SHA, treeSha: "c".repeat(40) });
    expect(f.tables.evidenceEnvelopes).toEqual(evidenceBefore);
    const second = await retryVerificationHandler(f.ctx, args, f.schedule as any);
    expect(second).toMatchObject({ created: false, workflowRun: { _id: "retry-1", status: "PENDING" } });
    expect(f.scheduled()).toBe(1);
  });

  it("rejects a stale source without superseding it or scheduling a retry", async () => {
    vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "1");
    const f = fixture(true);
    await expect(retryVerificationHandler(f.ctx, { workOrderId: "work-order-1",
      failedVerificationAttemptId: "verifier-1", reason: "Retry after a governed verifier infrastructure correction." },
    f.schedule as any)).rejects.toThrow(/exact current candidate/);
    expect((await f.db.get("verifier-1")).metadata).toBeUndefined();
    expect(f.scheduled()).toBe(0);
  });

  it("keeps a completed NOT_VERIFIED lifecycle truthfully blocked", async () => {
    const f = fixture();
    await (syncExecutionOutcome as any)._handler(f.ctx, { workflowRunId: "verifier-1",
      eventType: "RUN_COMPLETED", summary: "Verifier completed with NOT_VERIFIED" });
    expect(await f.db.get("work-order-1")).toMatchObject({ state: "BLOCKED", verificationStatus: "FAIL",
      blockingIssue: expect.stringContaining("Failed criteria"),
      requiredHumanAction: expect.stringContaining("Verification failed") });
  });
});
