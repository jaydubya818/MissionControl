import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitVerificationSubject, createPrepublicationGitVerificationSubject } from "@mission-control/workflow-engine/verification-subject";
import { retryVerification, retryVerificationHandler, reportVerificationInternal } from "../factory/attempts";
import { syncExecutionOutcome, decideApprovalDecision } from "../workOrders";

import { verificationIsolationBindingDigest, CODEX_V1_HARNESS_MANIFEST, CODEX_V1_RUNTIME_ARTIFACT, harnessCapabilityManifestDigest, harnessRuntimeArtifactDigest } from "@mission-control/workflow-engine";
import { exactModelRouteSnapshot, exactModelRouteDigest, exactModelRouteQualificationSnapshot, modelRouteQualificationDigest } from "../lib/modelRouteAdmission";

import { effectivePolicyV2VerificationChecks } from "../lib/policyV2Verification";

type Row = Record<string, any>;
const CONTRACT = `sha256:${"d".repeat(64)}`;
const SOURCE_SHA = "a".repeat(40);
const CANDIDATE_SHA = "b".repeat(40);

function fixture(staleSource = false, version = 1) {
  let sequence = 1;
  const legacySubject = createGitVerificationSubject({ version: 1, kind: "GIT_CANDIDATE",
    workOrderId: "work-order-1", workOrderRevisionNumber: 4, verificationContractDigest: CONTRACT,
    sourceAttemptId: "source-1", repositoryId: "repository-1", provider: "GITHUB",
    providerRepositoryId: "provider-repository-1", candidateSha: CANDIDATE_SHA, treeSha: "c".repeat(40),
    pullRequest: { providerPullRequestId: "provider-pr-1", number: 1,
      url: "https://github.com/acme/repo/pull/1", baseRef: "main", headRef: "mc/work-order-1",
      headSha: CANDIDATE_SHA, draftAtPublication: true } });
  const { pullRequest: _pullRequest, subjectId: _subjectId, digest: _digest, ...identity } = legacySubject;
  const subject = version === 2 ? createPrepublicationGitVerificationSubject({ ...identity,
    version: 2, baseSha: SOURCE_SHA, rawDiffSha256: `sha256:${"9".repeat(64)}`,
    baseRef: "main", headRef: "mc/work-order-1",
  }) : legacySubject;
  const tables: Record<string, Row[]> = {
    tenants: [{ _id: "tenant-1", active: true }],
    projects: [{ _id: "project-1", tenantId: "tenant-1" }],
    workOrders: [{ _id: "work-order-1", tenantId: "tenant-1", projectId: "project-1",
      repositoryId: "repository-1", qualityContractDigest: CONTRACT, title: "Retry fixture", desiredOutcome: "Verified immutable candidate",
      currentRevisionNumber: 4, verificationContractDigest: CONTRACT,
      state: "AWAITING_VERIFICATION", verificationStatus: "PENDING", approvalStatus: "APPROVED",
      ownerMemberId: "member-1", riskLevel: "LOW", requiredApprovals: [], isMutating: true,
      acceptanceCriteria: [{ id: "criterion-1", description: "Foundation passes", verificationMethod: "TEST",
        required: true, status: "FAILED" }] }],
    workflowRuns: [
      { _id: "source-1", worktree: "/fixture/source", executorInvocationId: "builder-invocation", executionClaimId: "builder-lease", runId: "source-run", tenantId: "tenant-1", projectId: "project-1",
        workOrderId: "work-order-1", repositoryId: "repository-1", workOrderRevisionNumber: 4,
        qualityContractDigest: CONTRACT, verificationContractDigest: CONTRACT, attemptPurpose: "IMPLEMENTATION", status: "FAILED",
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
      tenantId: "tenant-1", projectId: "project-1",
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
        unique: async () => { if (rows.length > 1) throw new Error("Non-unique fixture query"); return structuredClone(rows[0] ?? null); },
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
  tables.operators = [{ _id: "operator-1", tenantId: "tenant-1", active: true, authId: "fixture-user" }];
  tables.orgMembers = [{ _id: "member-1", operatorId: "operator-1", tenantId: "tenant-1", active: true, projectAccess: [{ projectId: "project-1" }] }];
  tables.roles = [{ _id: "role-1", tenantId: "tenant-1", name: "Factory dispatcher", permissions: ["workorders.dispatch"] }];
  tables.roleAssignments = [{ _id: "assignment-1", operatorId: "operator-1", roleId: "role-1", scope: { type: "tenant", id: "tenant-1" } }];
  const jobs: unknown[][] = [];
  const ctx: any = { db, auth: { getUserIdentity: async () => ({ subject: "fixture-user" }) }, runMutation: async () => undefined,
    scheduler: { runAfter: async (...args: unknown[]) => { jobs.push(args); }, runAt: async (...args: unknown[]) => { jobs.push(args); } } };
  const invoke = async (mutation: any, args: any) => {
    const before = structuredClone(tables), beforeSequence = sequence, beforeJobs = jobs.length;
    try { return await mutation._handler(ctx, args); }
    catch (error) {
      for (const key of Object.keys(tables)) delete tables[key];
      Object.assign(tables, before); sequence = beforeSequence; jobs.length = beforeJobs;
      throw error;
    }
  };
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
  return { ctx, db, tables, invoke, jobs, schedule, scheduled: () => scheduled };
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
      metadata: { verificationSupersededAt: expect.any(Number), verificationSupersededBy: "human:operator-1" } });
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

async function configuredFixture() {
  const f = fixture(false, 2);
  const now = Date.now();
  const capabilityDigest = harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST);
  const artifactDigest = harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT);
  const route = exactModelRouteSnapshot({ provider: "openai", providerRoute: "openai", modelId: "fixture-explicit-model" });
  const routeDigest = exactModelRouteDigest(route);
  const qualification = exactModelRouteQualificationSnapshot({ routeDigest, evidenceReference: "synthetic-retry-test",
    evidenceDigest: `sha256:${"8".repeat(64)}`, workloadClasses: ["VERIFICATION"], riskClasses: ["GREEN"],
    promotedBy: "fixture-operator", promotedAt: 1, compatibility: { adapter: "codex", version: "v1",
      capabilityManifestDigest: capabilityDigest, effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifactDigest: artifactDigest, executionBackend: "persistent-worker" } });
  const qualificationDigest = modelRouteQualificationDigest(qualification);
  const scope = { tenantId: "tenant-1", projectId: "project-1", repositoryId: "repository-1" };
  await f.db.insert("workspaceRepositories", { _id: "repository-1", ...scope, provider: "GITHUB", providerRepositoryId: "provider-repository-1",
    repository: "synthetic/retry", defaultBranch: "main", status: "READY", dataClassification: "PUBLIC" });
  await f.db.insert("modelCatalog", { _id: "model-1", ...scope, routeSnapshot: route, routeDigest,
    qualificationSnapshot: qualification, qualificationDigest, enabled: true,
    qualificationStatus: "EVIDENCE_QUALIFIED", admissionStatus: "PRODUCTION_PILOT_ELIGIBLE" });
  await f.db.insert("agentVersions", { _id: "agent-version-1", version: 1, genomeHash: "fixture-genome",
    genome: { promptBundleHash: "fixture-prompt", toolManifestHash: "fixture-tools", modelConfig: { provider: "openai", modelId: route.modelId } } });
  await f.db.insert("workflows", { _id: "workflow-1", workflowId: "synthetic-verifier", version: 1, active: true,
    name: "Synthetic verifier", agents: [{ id: "verifier" }], steps: [{ id: "verify", agent: "verifier", kind: "EXECUTE", isolation: "READ_ONLY" }] });
  await f.db.insert("factoryDefinitions", { _id: "definition-1", ...scope, status: "ACTIVE", purpose: "VERIFICATION", activeVersionId: "version-1" });
  await f.db.insert("factoryDefinitionVersions", { _id: "version-1", ...scope, factoryDefinitionId: "definition-1", purpose: "VERIFICATION",
    configurationDigest: "config-1", workflowId: "workflow-1", executor: { adapter: "codex", version: "v1" },
    harnessRuntimeArtifact: CODEX_V1_RUNTIME_ARTIFACT, repositoryDataClassification: "PUBLIC",
    executionBackend: "persistent-worker", agentBindings: [{ workflowAgentId: "verifier", agentVersionId: "agent-version-1" }],
    codeScopeIds: [], modelCatalogId: "model-1", modelRouteSnapshot: route, modelRouteDigest: routeDigest,
    modelQualificationSnapshot: qualification, modelQualificationDigest: qualificationDigest,
    budget: { maxAttempts: 1, maxCostUsd: 1, maxRuntimeMinutes: 1 } });
  await f.db.insert("factoryReadinessAssessments", { factoryDefinitionVersionId: "version-1", assessedAt: now,
    status: "PASS", expiresAt: now + 60_000, configurationDigest: "config-1" });
  const executor = { adapter: "codex", version: "v1", capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
    capabilityManifestSha256: capabilityDigest, effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT, runtimeArtifactSha256: artifactDigest, isolationModes: ["READ_ONLY"] };
  await f.db.insert("workspaceHostBindings", { _id: "host-1", ...scope, hostId: "worker-1", repository: "synthetic/retry", status: "READY",
    dirty: false, checkedAt: now, checkoutRoot: "/fixture", capacity: { maxConcurrentRuns: 1 },
    workerRuntime: { sessionId: "worker-session", generation: 1, readiness: "READY", lastHeartbeatAt: now,
      supportedExecutors: [executor], executionBackends: ["persistent-worker"], sandboxCapabilities: ["git-worktree", "read-only"],
      repositoryAccess: [{ repositoryId: "repository-1", access: "READ_WRITE" }], factoryVersionBindings: [{
        factoryDefinitionVersionId: "version-1", factoryConfigurationDigest: "config-1", repositoryId: "repository-1",
        adapter: "codex", version: "v1", provider: "openai", model: route.modelId, capabilityManifestSha256: capabilityDigest,
        effectiveConfigSha256: executor.effectiveConfigSha256, runtimeArtifactSha256: artifactDigest,
        executionBackend: "persistent-worker", modelRouteDigest: routeDigest,
      }] } });
  await f.db.patch("work-order-1", { riskReasons: [], requiredApprovals: [], requirements: [], constraints: [],
    acceptanceCriteria: [{ id: "criterion-1", title: "Synthetic behavior passes", requiredEvidence: [{ category: "TEST_RESULT", minimumCount: 1, independent: true }] }],
    verificationContract: { schemaVersion: 2, enforcementMode: "ENFORCED", requiredRisks: [], checks: [{ id: "unit", name: "Unit check",
      category: "UNIT_TEST", verifierId: "factory-command/v1", mandatory: true, acceptanceCriterionIds: ["criterion-1"], evidenceCategory: "TEST_RESULT" }] } });
  return f;
}

const retryArgs = { workOrderId: "work-order-1", failedVerificationAttemptId: "verifier-1", reason: "Retry after correcting verifier infrastructure." };

describe("completed retry through the real scheduler", () => {
  it("creates an independently bound v2 verifier without executor replay", async () => {
    const f = await configuredFixture();
    const original = await f.db.get("source-1");
    const result = await f.invoke(retryVerification, retryArgs);
    expect(result).toMatchObject({ created: true, workflowRun: { status: "PENDING", isMutating: false, attemptPurpose: "VERIFICATION" } });
    const run = result.workflowRun;
    expect(run.verificationAttemptBinding.verificationSubject).toMatchObject({ version: 2, candidateSha: CANDIDATE_SHA });
    expect(run.verificationAttemptBinding.sourceAttemptId).not.toBe("source-1");
    expect(await f.db.get("source-1")).toEqual(original);
    expect(f.tables.verificationRuns).toHaveLength(2);
    expect(f.tables.evidenceEnvelopes).toHaveLength(1);
    expect(f.tables.runEvents.find(row => row.eventType === "RETRY_STARTED")).toMatchObject({
      metadata: {
        verificationSubjectDigest: run.verificationAttemptBinding.verificationSubjectDigest,
        retryOfVerificationSubjectDigest: original.verificationSubject.digest,
      },
    });
  });
});

async function reportVerdict(f: Awaited<ReturnType<typeof configuredFixture>>, run: Row, status: "PASS" | "FAIL") {
  const now = Date.now();
  const leaseId = `lease:${run._id}`;
  await f.db.patch(run._id, { status: "RUNNING", executionClaimId: leaseId,
    lease: { leaseId, ownerId: "verifier-service", workerId: "worker-1", workerSessionId: "worker-session", workerGeneration: 1,
      expiresAt: now + 60_000, claimedAt: now, heartbeatAt: now } });
  await f.db.patch("work-order-1", { currentExecutionRunId: run._id });
  const workOrder = await f.db.get("work-order-1");
  const subject = run.verificationAttemptBinding.verificationSubject;
  const isolation = { mode: "DETACHED_GIT_WORKTREE" as const, sandboxId: "fixture-verifier", subjectDigest: subject.digest,
    verifierRoot: run.worktree, sourceRoot: "/fixture/source", initialClean: true, finalSubjectMatch: true,
    repositoryId: "repository-1", headSha: CANDIDATE_SHA, treeSha: "c".repeat(40), attestedAt: now };
  return f.invoke(reportVerificationInternal, { workflowRunId: run._id, leaseId, ownerId: "verifier-service",
    workerId: "worker-1", workerSessionId: "worker-session", workerGeneration: 1,
    packet: { terminal: { status: "COMPLETED" }, isolation: { ...isolation, rootBindingDigest: verificationIsolationBindingDigest(isolation) },
      verification: { sourceRevision: SOURCE_SHA, candidateRevision: CANDIDATE_SHA,
        checks: effectivePolicyV2VerificationChecks(workOrder).map(check => ({ checkId: check.id, verifierId: check.verifierId,
          status: check.id === "unit" ? status : "PASS", summary: "Synthetic independent verification", evidence: [], violations: [] })) } } });
}

describe("retry evidence and authority boundaries", () => {
  it("reports a successful retry and requests fresh human review without changing failed evidence", async () => {
    const f = await configuredFixture();
    const evidenceBefore = structuredClone(f.tables.evidenceEnvelopes);
    const first = await f.invoke(retryVerification, retryArgs);
    const duplicate = await f.invoke(retryVerification, retryArgs);
    expect(duplicate).toMatchObject({ created: false, workflowRun: { _id: first.workflowRun._id } });
    const result = await reportVerdict(f, first.workflowRun, "PASS");
    expect(result).toMatchObject({ verdict: "VERIFIED", independenceValid: true });
    const continuation = await f.db.get(first.workflowRun.verificationAttemptBinding.sourceAttemptId);
    expect(continuation).toMatchObject({ status: "PAUSED", executionPhase: "AWAITING_HUMAN_REVIEW" });
    expect(await f.db.get(continuation.factoryContinuation.approvalDecisionId)).toMatchObject({ status: "PENDING", workflowRunId: continuation._id });
    expect(await f.db.get("source-1")).toMatchObject({ status: "FAILED" });
    expect(f.tables.evidenceEnvelopes.slice(0, evidenceBefore.length)).toEqual(evidenceBefore);
    expect(f.tables.runArtifacts?.some(row => row.artifactType === "PULL_REQUEST") ?? false).toBe(false);
    const decision = { approvalDecisionId: continuation.factoryContinuation.approvalDecisionId, decision: "APPROVE", reason: "Synthetic operator approves this exact verified candidate." };
    await expect(f.invoke(decideApprovalDecision, decision)).rejects.toThrow(/permit/);
    await f.db.patch("role-1", { permissions: ["workorders.dispatch", "approvals.decide"] });
    const approval = await f.invoke(decideApprovalDecision, decision);
    expect(approval).toMatchObject({ status: "APPROVED" });
    expect(await f.db.get(continuation._id)).toMatchObject({ status: "PENDING", factoryContinuation: { status: "READY_TO_PUBLISH" } });

  });

  it("preserves two failed candidates and evidence across repeated verification retries", async () => {
    const f = await configuredFixture();
    const first = await f.invoke(retryVerification, retryArgs);
    expect(await reportVerdict(f, first.workflowRun, "FAIL")).toMatchObject({ verdict: "NOT_VERIFIED" });
    const firstSource = first.workflowRun.verificationAttemptBinding.sourceAttemptId;
    expect(await f.db.get(firstSource)).toMatchObject({ status: "FAILED", executionPhase: "TERMINAL" });
    const evidenceBefore = structuredClone(f.tables.evidenceEnvelopes);
    const next = await f.invoke(retryVerification, { ...retryArgs, failedVerificationAttemptId: first.workflowRun._id });
    expect(next.workflowRun.verificationAttemptBinding.sourceAttemptId).not.toBe(firstSource);
    expect(await reportVerdict(f, next.workflowRun, "PASS")).toMatchObject({ verdict: "VERIFIED", independenceValid: true });
    expect(await f.db.get("source-1")).toMatchObject({ status: "FAILED" });
    expect(await f.db.get(firstSource)).toMatchObject({ status: "FAILED" });
    expect(f.tables.evidenceEnvelopes.slice(0, evidenceBefore.length)).toEqual(evidenceBefore);
  });

  it.each([
    ["source-1", { projectId: "other-project" }], ["source-1", { tenantId: "other-tenant" }],
    ["verifier-1", { projectId: "other-project" }], ["verification-run-1", { tenantId: "other-tenant" }],
    ["source-1", { headSha: "e".repeat(40) }], ["source-1", { treeSha: "e".repeat(40) }],
    ["work-order-1", { currentRevisionNumber: 5 }], ["work-order-1", { verificationContractDigest: `sha256:${"e".repeat(64)}` }],
  ])("rejects changed scope or identity on %s: %j", async (id, changes) => {
    const f = await configuredFixture();
    await f.db.patch(id as string, changes as Row);
    const before = structuredClone(f.tables);
    await expect(f.invoke(retryVerification, retryArgs)).rejects.toThrow();
    expect(f.tables).toEqual(before);
  });

  it.each(["anonymous", "missing-dispatch", "other-owner", "disabled-operator"])("denies %s callers before writes", async (fault) => {
    vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "0");
    const f = await configuredFixture();
    if (fault === "anonymous") f.ctx.auth.getUserIdentity = async () => null;
    if (fault === "missing-dispatch") await f.db.patch("role-1", { permissions: [] });
    if (fault === "other-owner") await f.db.patch("work-order-1", { ownerMemberId: "other-member" });
    if (fault === "disabled-operator") await f.db.patch("operator-1", { active: false });
    const before = structuredClone(f.tables);
    await expect(f.invoke(retryVerification, retryArgs)).rejects.toThrow(/unauthorized|permit/);
    expect(f.tables).toEqual(before);
  });

  it("rolls back supersession and continuation when real scheduler admission fails", async () => {
    const f = await configuredFixture();
    await f.db.patch("definition-1", { status: "DISABLED" });
    const before = structuredClone(f.tables);
    await expect(f.invoke(retryVerification, retryArgs)).rejects.toThrow(/no active Verification Factory/);
    expect(f.tables).toEqual(before);
    expect(f.jobs).toHaveLength(0);
  });

  it("rejects a competing active source before retrying", async () => {
    const f = await configuredFixture();
    await f.db.insert("workflowRuns", { _id: "competing-source", workOrderId: "work-order-1", attemptPurpose: "IMPLEMENTATION", status: "RUNNING" });
    const before = structuredClone(f.tables);
    await expect(f.invoke(retryVerification, retryArgs)).rejects.toThrow(/exact current candidate/);
    expect(f.tables).toEqual(before);
  });
});
