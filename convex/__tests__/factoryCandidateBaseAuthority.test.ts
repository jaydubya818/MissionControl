import { describe, expect, it } from "vitest";
import { claimInternal, reportInternal, reportVerificationInternal, candidateVerificationDispatchFailedInternal } from "../factory/attempts";
import { compilePolicyV2VerificationPlan, effectivePolicyV2VerificationChecks } from "../lib/policyV2Verification";
import { computeCanonicalHash } from "../lib/genomeHash";
import { exactModelRouteSnapshot, exactModelRouteDigest, exactModelRouteQualificationSnapshot, modelRouteQualificationDigest } from "../lib/modelRouteAdmission";
import { CODEX_V1_HARNESS_MANIFEST, CODEX_V1_RUNTIME_ARTIFACT, harnessCapabilityManifestDigest, harnessRuntimeArtifactDigest } from "@mission-control/workflow-engine";
import { verificationIsolationBindingDigest } from "@mission-control/workflow-engine";

const BASE = "a".repeat(40);
const INTERMEDIATE = "b".repeat(40);
const CANDIDATE = "c".repeat(40);
const TREE = "d".repeat(40);

type Row = Record<string, any>;

/** Transactional fixture: exercise the actual mutation, without a deployed service. */
function fixture(prepublication = false) {
  const now = Date.now();
  let sequence = 1;
  let tables: Record<string, Row[]> = {
    workflowRuns: [{
      _id: "attempt-1", runId: "run-1", tenantId: "tenant-1", projectId: "project-1",
      repositoryId: "repository-1", workOrderId: "work-order-1", workOrderRevisionNumber: 1,
      status: "RUNNING", attemptPurpose: "IMPLEMENTATION", factoryPurpose: "SOFTWARE",
      isMutating: true, branch: "mc/candidate", steps: [], currentStepIndex: 0,
      startedAt: now - 1_000, hostBindingId: "host-binding-1",
      qualityContractDigest: `sha256:${"e".repeat(64)}`,
      verificationContractDigest: `sha256:${"f".repeat(64)}`,
      executionManifestDigest: `sha256:${"1".repeat(64)}`,
      executionManifest: {
        version: "factory-execution-manifest/v1",
        repository: { baseSha: BASE },
        workOrderSpecification: { verificationContract: { schemaVersion: 2, enforcementMode: "ENFORCED" } },
      },
      lease: {
        leaseId: "lease-1", ownerId: "service-1", workerId: "worker-1",
        workerSessionId: "session-1", workerGeneration: 1,
        claimedAt: now, heartbeatAt: now, expiresAt: now + 120_000,
      },
    }],
    workOrders: [{
      _id: "work-order-1", tenantId: "tenant-1", projectId: "project-1", repositoryId: "repository-1",
      currentRevisionNumber: 1, currentExecutionRunId: "attempt-1",
      qualityContractDigest: `sha256:${"e".repeat(64)}`,
      verificationContractDigest: `sha256:${"f".repeat(64)}`,
      verificationContract: { schemaVersion: 2, enforcementMode: "ENFORCED" },
    }],
    workspaceRepositories: [{
      _id: "repository-1", projectId: "project-1", repository: "qualification/repo",
      provider: "GITHUB", providerRepositoryId: "provider-repository-1", defaultBranch: "main", status: "READY",
    }],
    githubAppInstallations: [{
      _id: "installation-row-1", repositoryId: "repository-1", projectId: "project-1",
      installationId: "installation-1", status: "CONNECTED",
    }],
    workspaceHostBindings: [{
      _id: "host-binding-1", hostId: "worker-1", workerRuntime: { sessionId: "session-1", generation: 1 },
    }],
  };
  const find = (id: string) => Object.values(tables).flat().find(row => row._id === id);
  const db = {
    get: async (id: string) => structuredClone(find(id) ?? null),
    insert: async (table: string, value: Row) => {
      const id = value._id ?? `${table}-${sequence++}`;
      (tables[table] ??= []).push(structuredClone({ ...value, _id: id, _creationTime: sequence }));
      return id;
    },
    patch: async (id: string, patch: Row) => {
      const row = find(id);
      if (!row) throw new Error(`Missing fixture row ${id}`);
      Object.assign(row, structuredClone(patch));
    },
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const query: any = {
        withIndex: (_name: string, select: (q: any) => unknown) => {
          const predicates: Array<[string, unknown]> = [];
          const index: any = { eq: (field: string, value: unknown) => { predicates.push([field, value]); return index; } };
          select(index);
          rows = rows.filter(row => predicates.every(([field, value]) => row[field] === value));
          return query;
        },
        filter: (select: (q: any) => (row: Row) => boolean) => {
          const predicate = select({
            field: (name: string) => (row: Row) => row[name],
            eq: (field: (row: Row) => unknown, value: unknown) => (row: Row) => field(row) === value,
          });
          rows = rows.filter(predicate);
          return query;
        },
        order: (direction: string) => {
          rows.sort((a, b) => (a._creationTime - b._creationTime) * (direction === "desc" ? -1 : 1));
          return query;
        },
        first: async () => structuredClone(rows[0] ?? null),
        collect: async () => structuredClone(rows),
        take: async (count: number) => structuredClone(rows.slice(0, count)),
      };
      return query;
    },
  };
  if (prepublication) Object.assign(tables.workflowRuns[0].executionManifest.repository, {
    verificationPublicationOrder: "VERIFY_BEFORE_PUBLICATION", repositoryId: "repository-1", repository: "qualification/repo",
    providerRepositoryId: "provider-repository-1", branch: "mc/candidate", defaultBranch: "main",
  });
  const scheduled: any[] = [];
  const ctx = { db, runMutation: async () => undefined,
    scheduler: { runAfter: async (...args: any[]) => { scheduled.push(args); }, runAt: async (...args: any[]) => { scheduled.push(args); } } };
  const handler = (reportInternal as unknown as { _handler: (ctx: any, args: any) => Promise<any> })._handler;
  const report = async (packet: Row) => {
    const before = structuredClone(tables);
    try {
      return await handler(ctx, {
        workflowRunId: "attempt-1", leaseId: "lease-1", ownerId: "service-1",
        workerId: "worker-1", workerSessionId: "session-1", workerGeneration: 1, packet,
      });
    } catch (error) {
      tables = before;
      throw error;
    }
  };
  const invoke = async (mutation: any, args: any) => mutation._handler(ctx, args);
  return { db, report, scheduled, invoke };
}

async function recoveryClaimFixture() {
  const f = fixture();
  const harnessDigest = harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST);
  const runtimeDigest = harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT);
  const route = exactModelRouteSnapshot({ provider: "openai", providerRoute: "openai", modelId: "fixture-explicit-model" });
  const routeDigest = exactModelRouteDigest(route);
  const qualification = exactModelRouteQualificationSnapshot({ routeDigest, evidenceReference: "synthetic-fixture", evidenceDigest: `sha256:${"2".repeat(64)}`,
    workloadClasses: ["SOFTWARE_CHANGE"], riskClasses: ["GREEN"], promotedBy: "fixture-operator", promotedAt: 1,
    compatibility: { adapter: "codex", version: "v1", capabilityManifestDigest: harnessDigest,
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256, runtimeArtifactDigest: runtimeDigest, executionBackend: "persistent-worker" } });
  const qualificationDigest = modelRouteQualificationDigest(qualification);
  await f.db.insert("modelCatalog", { _id: "model-1", routeSnapshot: route, routeDigest, qualificationSnapshot: qualification, qualificationDigest,
    enabled: true, qualificationStatus: "EVIDENCE_QUALIFIED", admissionStatus: "PRODUCTION_PILOT_ELIGIBLE" });
  await f.db.insert("factoryDefinitionVersions", { _id: "version-1", factoryDefinitionId: "definition-1", configurationDigest: "config-1",
    executor: { adapter: "codex", version: "v1" }, harnessRuntimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
    modelCatalogId: "model-1", modelRouteSnapshot: route, modelRouteDigest: routeDigest, modelQualificationSnapshot: qualification,
    modelQualificationDigest: qualificationDigest, repositoryDataClassification: "PUBLIC" });
  await f.db.insert("factoryDefinitions", { _id: "definition-1", status: "ACTIVE", activeVersionId: "version-1" });
  await f.db.patch("repository-1", { dataClassification: "PUBLIC" });
  await f.db.patch("host-binding-1", { status: "READY", dirty: false, checkoutRoot: "/fixture", baseCommit: BASE, workerRuntime: undefined });
  const sourceManifest = { version: "factory-execution-manifest/v1", causation: { workflowRunId: "original-run" },
    repository: { baseSha: BASE, worktree: "/fixture/worktree", dataClassification: "PUBLIC" },
    harness: { adapter: "codex", version: "v1", capabilityManifestSha256: harnessDigest,
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256, executionBackend: "persistent-worker",
      modelCatalogId: "model-1", modelRouteDigest: routeDigest, modelRouteSnapshot: route, modelQualificationDigest: qualificationDigest },
    workflow: { steps: [{ kind: "EXECUTE", modelRoute: route.modelId, modelConfiguration: { provider: route.provider } }] },
    workOrderSpecification: { verificationContract: { schemaVersion: 2, enforcementMode: "ENFORCED" } } };
  const sourceDigest = `sha256:${computeCanonicalHash(sourceManifest)}`;
  await f.db.patch("attempt-1", { factoryDefinitionVersionId: "version-1", factoryConfigurationDigest: "config-1",
    executorAdapter: "codex", executorVersion: "v1", executorHostId: "worker-1", worktree: "/fixture/worktree" });
  const original = await f.db.get("attempt-1");
  await f.db.insert("workflowRuns", { ...original, _id: "original-attempt", runId: "original-run", status: "FAILED",
    failureReason: "Diagnostic wording may change without changing recovery authority.",
    failureCode: "GITHUB_APP_RUNTIME_CREDENTIALS_MISSING", executionManifest: sourceManifest, executionManifestDigest: sourceDigest });
  await f.db.insert("runArtifacts", { workflowRunId: "original-attempt", artifactType: "CODE_DIFF", metadata: {
    headSha: CANDIDATE, treeSha: TREE, sourceRevision: BASE, branch: "mc/candidate" } });
  const structuredResult = { schema: "factory-result/v1", status: "COMPLETED", summary: "Synthetic candidate complete.",
    completedAcceptanceCriterionIds: [], incompleteAcceptanceCriterionIds: [], unknownAcceptanceCriterionIds: [],
    verificationCommands: [], knownRisks: [], nextAction: "Publish for verification." };
  await f.db.insert("runArtifacts", { workflowRunId: "original-attempt", artifactType: "STRUCTURED_OUTPUT",
    metadata: { schema: "factory-result/v1", result: structuredResult } });
  const manifest = { ...sourceManifest, causation: { workflowRunId: "run-1" } };
  await f.db.patch("attempt-1", { executionManifest: manifest, executionManifestDigest: `sha256:${computeCanonicalHash(manifest)}`,
    lease: { leaseId: "expired-recovery", ownerId: "service-1", expiresAt: 1, claimedAt: 0, heartbeatAt: 0 },
    metadata: { localCandidateRecovery: { sourceAttemptId: "original-attempt", sourceExecutionManifestDigest: sourceDigest,
      sourceCandidateSha: CANDIDATE, sourceTreeSha: TREE, sourceRevision: BASE,
      structuredResult,
      previousLease: { leaseId: "original-lease", workerId: "worker-1", workerSessionId: "original-session", workerGeneration: 1 } } } });
  const claim = () => f.invoke(claimInternal, { workflowRunId: "attempt-1", ownerId: "service-1", leaseId: "new-recovery", leaseDurationMs: 60_000 });
  return { ...f, claim };
}

function pullRequestArtifact(sourceRevision: string, idempotencyKey: string) {
  return {
    idempotencyKey, artifactType: "PULL_REQUEST", name: "Controlled qualification PR",
    externalLocation: "https://github.com/qualification/repo/pull/1",
    metadata: {
      repositoryId: "repository-1", repository: "qualification/repo", installationId: "installation-1",
      branch: "mc/candidate", sourceRevision, headSha: CANDIDATE, treeSha: TREE,
      pullRequestNumber: 1, pullRequestUrl: "https://github.com/qualification/repo/pull/1",
      providerPullRequestId: "provider-pr-1", draftAtPublication: true,
      executionManifestDigest: `sha256:${"1".repeat(64)}`,
    },
  };
}

const candidateReady = {
  candidateSha: CANDIDATE, treeSha: TREE, providerPullRequestId: "provider-pr-1",
  pullRequestNumber: 1, pullRequestUrl: "https://github.com/qualification/repo/pull/1",
  baseRef: "main", headRef: "mc/candidate", draftAtPublication: true,
};

describe("Factory candidate source authority through the real report mutation", () => {
  it("reclaims an expired read-only attestation through the actual claim mutation without replaying the failed source", async () => {
    const f = await recoveryClaimFixture();
    const result = await f.claim();
    expect(result).toMatchObject({ claimed: true, reclaimed: true, lease: { leaseId: "new-recovery" },
      localCandidateRecovery: { sourceAttemptId: "original-attempt", sourceCandidateSha: CANDIDATE, sourceTreeSha: TREE } });
    expect(result.publicationCheckpoint).toBeUndefined();
    expect(await f.db.get("original-attempt")).toMatchObject({ status: "FAILED", failureCode: "GITHUB_APP_RUNTIME_CREDENTIALS_MISSING" });
    expect(await f.db.get("attempt-1")).toMatchObject({ status: "RUNNING", runtimeDispositionReason: expect.stringContaining("executor replay remains prohibited") });
  });
  it.each(["ordinary-executor", "substituted-candidate", "changed-source", "cancelled"])("does not reclaim an expired recovery with %s", async (fault) => {
    const f = await recoveryClaimFixture();
    if (fault === "ordinary-executor") await f.db.patch("attempt-1", { metadata: undefined });
    if (fault === "cancelled") await f.db.patch("attempt-1", { cancellationRequestedAt: Date.now() });
    if (fault === "changed-source") await f.db.patch("original-attempt", { workOrderRevisionNumber: 2 });
    if (fault === "substituted-candidate") { const run = await f.db.get("attempt-1"); run.metadata.localCandidateRecovery.sourceCandidateSha = INTERMEDIATE; await f.db.patch("attempt-1", { metadata: run.metadata }); }
    if (["changed-source", "substituted-candidate"].includes(fault)) await expect(f.claim()).rejects.toThrow(/immutable failed source/);
    else expect(await f.claim()).toMatchObject({ claimed: false });
    expect((await f.db.get("attempt-1")).lease?.leaseId).not.toBe("new-recovery");
  });

  for (const checkStatus of ["PASS", "FAIL", "SKIPPED", "AUTHORITY_REJECTED"] as const) it(`handles separate verifier ${checkStatus} through the actual mutation without orphaning or waiving evidence`, async () => {
    const f = fixture(true);
    await f.db.patch("work-order-1", { riskLevel: "LOW", riskReasons: [], requiredApprovals: [],
      requirements: [{ id: "req-1", description: "Candidate must preserve the required behavior", priority: "MUST" }],
      acceptanceCriteria: [{ id: "ac-1", title: "Candidate behavior works", requiredEvidence: [{ category: "TEST_RESULT", minimumCount: 1, independent: true }] }],
      verificationContract: { schemaVersion: 2, enforcementMode: "ENFORCED", requireHumanReview: false, requiredRisks: [],
        checks: [{ id: "unit", name: "Unit check", category: "UNIT_TEST", verifierId: "factory-command/v1", mandatory: true, acceptanceCriterionIds: ["ac-1"], evidenceCategory: "TEST_RESULT" }] } });
    await f.db.patch("attempt-1", { worktree: "/qualification/source", executorInvocationId: "builder-invocation", executionClaimId: "lease-1" });
    await f.report(prepublicationPacket());
    const source = await f.db.get("attempt-1"); const workOrder = await f.db.get("work-order-1");
    const subject = source.verificationSubject;
    const verifierId = "verifier-attempt";
    const plan = compilePolicyV2VerificationPlan({ now: Date.now(), workOrder, sourceAttempt: source, verificationAttemptId: verifierId,
      verificationSubject: subject, factoryDefinitionId: "verifier-definition", factoryDefinitionVersionId: "verifier-version", executorInvocationId: "verifier-invocation" });
    const tuple = { workOrderId: workOrder._id, workOrderRevisionNumber: 1, verificationContractDigest: workOrder.verificationContractDigest,
      sourceAttemptId: source._id, verificationSubjectDigest: subject.digest };
    await f.db.insert("factoryDefinitions", { _id: "verifier-definition", purpose: "VERIFICATION" });
    await f.db.insert("factoryDefinitionVersions", { _id: "verifier-version", factoryDefinitionId: "verifier-definition", purpose: "VERIFICATION" });
    await f.db.insert("workflowRuns", { ...source, _id: verifierId, runId: "verification-run-1", status: "RUNNING", startedAt: Date.now(),
      attemptPurpose: "VERIFICATION", factoryPurpose: "VERIFICATION", factoryDefinitionVersionId: "verifier-version", worktree: "/qualification/verifier",
      executorInvocationId: "verifier-invocation", executionClaimId: "verifier-lease", verificationAttemptBinding: { ...tuple, verificationSubject: subject },
      lease: { ...source.checkpointLease, leaseId: "verifier-lease" } });
    await f.db.insert("verificationRuns", { ...tuple, _id: "verification-result", workflowRunId: verifierId, status: "RUNNING", verificationPlan: plan,
      verificationSubjectId: subject.subjectId, verificationPlanId: plan.planId, verificationPlanDigest: plan.planDigest, startedAt: Date.now() });
    await f.db.patch("work-order-1", { currentExecutionRunId: verifierId });
    const isolation = { mode: "DETACHED_GIT_WORKTREE" as const, sandboxId: "verifier-worktree", subjectDigest: subject.digest,
      verifierRoot: "/qualification/verifier", sourceRoot: "/qualification/source", initialClean: true, finalSubjectMatch: true,
      repositoryId: "repository-1", headSha: CANDIDATE, treeSha: TREE, attestedAt: Date.now() };
    const result = await f.invoke(reportVerificationInternal, { workflowRunId: verifierId, leaseId: "verifier-lease", ownerId: "service-1",
      workerId: "worker-1", workerSessionId: "session-1", workerGeneration: 1,
      packet: { terminal: { status: "COMPLETED" }, isolation: { ...isolation, rootBindingDigest: verificationIsolationBindingDigest(isolation) },
        verification: { sourceRevision: BASE, candidateRevision: CANDIDATE, checks: effectivePolicyV2VerificationChecks(workOrder).map(check => ({
          checkId: check.id, verifierId: check.verifierId,
          status: checkStatus === "AUTHORITY_REJECTED"
            ? check.verifierId === "factory-verification-authority" ? "FAIL" : "NOT_CONFIGURED"
            : check.id === "unit" ? checkStatus : "PASS",
          summary: "Synthetic independent proof", evidence: [], violations: [],
        })) } } });
    expect(result.independenceValid).toBe(checkStatus !== "AUTHORITY_REJECTED");
    const after = await f.db.get("attempt-1");
    if (checkStatus === "PASS") {
      expect(result.verdict).toBe("VERIFIED"); expect(after).toMatchObject({ status: "PAUSED", executionPhase: "AWAITING_HUMAN_REVIEW" });
      const receipt = await f.db.get(after.factoryContinuation.verificationReceiptId);
      expect(receipt).toMatchObject({ workflowRunId: verifierId, sourceAttemptId: source._id, verificationAttemptId: verifierId });
      expect(await f.db.get(after.factoryContinuation.approvalDecisionId)).toMatchObject({ status: "PENDING", workflowRunId: source._id });
    } else {
      expect(result.verdict).toBe(checkStatus === "FAIL" ? "NOT_VERIFIED" : "BLOCKED");
      expect(after).toMatchObject({ status: "FAILED", executionPhase: "TERMINAL" });
      expect(after.factoryContinuation).toBeUndefined();
    }
  });
  it("durably pauses a v2 candidate without a PR and preserves its last workspace owner", async () => {
    const f = fixture(true);
    const before = await f.db.get("attempt-1");
    const result = await f.report(prepublicationPacket());
    expect(result).toMatchObject({ accepted: true, paused: true });
    const candidate = await f.db.get("attempt-1");
    expect(candidate).toMatchObject({ status: "PAUSED", executionPhase: "AWAITING_VERIFICATION", executionBaseSha: BASE, checkpointLease: before.lease });
    expect(candidate.lease).toBeUndefined();
    expect(candidate.verificationSubject).toMatchObject({ version: 2, baseSha: BASE, candidateSha: CANDIDATE, rawDiffSha256: `sha256:${"3".repeat(64)}` });
    expect(candidate.verificationSubject).not.toHaveProperty("pullRequest");
    expect(f.scheduled).toHaveLength(1);
    await f.invoke(candidateVerificationDispatchFailedInternal, { workflowRunId: "attempt-1" });
    expect(await f.db.get("work-order-1")).toMatchObject({ currentExecutionRunId: "attempt-1", blockingIssue: expect.stringContaining("dispatch failed") });
    await expect(f.report(prepublicationPacket())).rejects.toThrow(/active matching lease/);
  });

  it("rejects candidate subject tampering and inline publication transactionally", async () => {
    for (const patch of [{ sourceRevision: INTERMEDIATE }, { headRef: "mc/other" }, { rawDiffSha256: `sha256:${"4".repeat(64)}` }]) {
      const f = fixture(true); const packet = prepublicationPacket();
      Object.assign(packet.candidateReady, patch);
      await expect(f.report(packet)).rejects.toThrow();
      expect(await f.db.get("attempt-1")).toMatchObject({ status: "RUNNING" });
      expect((await f.db.get("attempt-1")).verificationSubject).toBeUndefined();
    }
    const f = fixture(true);
    await expect(f.report({ ...prepublicationPacket(), terminal: { status: "COMPLETED" } })).rejects.toThrow(/cannot include/);
  });

  it("rejects a local candidate transport for a GitHub-authorized repository before subject persistence", async () => {
    const f = fixture();
    await expect(f.report({ candidateReady: { ...candidateReady, transport: "LOCAL_GIT" }, artifacts: [] }))
      .rejects.toThrow(/transport must match the admitted repository authority/);
    expect(await f.db.get("attempt-1")).toMatchObject({ status: "RUNNING" });
    expect((await f.db.get("attempt-1")).verificationSubject).toBeUndefined();
  });

  it("accepts durable publication event types and keeps uncertain publication recoverable after its permit expires", async () => {
    const f = fixture(true); await f.report(prepublicationPacket());
    const paused = await f.db.get("attempt-1");
    await f.db.patch("attempt-1", { status: "RUNNING", lease: paused.checkpointLease, factoryContinuation: {
      status: "PUBLICATION_AUTHORIZED", candidateRevision: CANDIDATE, sourceRevision: BASE,
      publicationPermitId: "permit-1", publicationPermitLeaseId: "lease-1", publicationValidUntil: Date.now() - 1,
    } });
    for (const eventType of ["PUBLICATION_REQUESTED", "PUBLICATION_RECONCILED"]) {
      expect(await f.report({ events: [{ idempotencyKey: `event:${eventType}`, eventType, status: "PENDING" }] })).toMatchObject({ accepted: true });
    }
    expect(await f.report({ terminal: { status: "FAILED", failureReason: "Remote response lost" } })).toMatchObject({ accepted: true, paused: true, publicationOutcome: "UNKNOWN" });
    expect(await f.db.get("attempt-1")).toMatchObject({ status: "PAUSED", checkpointLease: paused.checkpointLease,
      factoryContinuation: { status: "PUBLICATION_AUTHORIZED", publicationPermitId: "permit-1" } });
  });

  it("keeps an infrastructure-failed verifier visible and restores the candidate for explicit verification retry", async () => {
    const f = fixture(true); await f.report(prepublicationPacket());
    const source = await f.db.get("attempt-1");
    const verifierId = await f.db.insert("workflowRuns", { ...source, _id: undefined, runId: "verification-run-1", status: "RUNNING",
      attemptPurpose: "VERIFICATION", factoryPurpose: "VERIFICATION", factoryDefinitionVersionId: "verifier-version",
      verificationAttemptBinding: { sourceAttemptId: "attempt-1", verificationSubject: source.verificationSubject },
      lease: { ...source.checkpointLease, leaseId: "verifier-lease" } });
    await f.db.insert("factoryDefinitionVersions", { _id: "verifier-version" });
    await f.db.insert("verificationRuns", { workflowRunId: verifierId, workOrderId: "work-order-1", verificationPlan: {}, startedAt: Date.now() });
    await f.db.patch("work-order-1", { currentExecutionRunId: verifierId });
    await f.invoke(reportVerificationInternal, { workflowRunId: verifierId, leaseId: "verifier-lease", ownerId: "service-1",
      workerId: "worker-1", workerSessionId: "session-1", workerGeneration: 1, packet: { terminal: { status: "FAILED", failureReason: "Controlled verification transport failure" } } });
    expect(await f.db.get(verifierId)).toMatchObject({ status: "FAILED", metadata: { verificationSupersededAt: expect.any(Number) } });
    expect(await f.db.get("attempt-1")).toMatchObject({ status: "PAUSED", executionPhase: "AWAITING_VERIFICATION" });
    expect(await f.db.get("work-order-1")).toMatchObject({ currentExecutionRunId: "attempt-1", requiredHumanAction: expect.stringContaining("retry verification") });
  });
  it("rejects a second report that tries to replace the frozen base after candidate-ready", async () => {
    const { db, report } = fixture();
    const ready = await report({ artifacts: [pullRequestArtifact(BASE, "pr:first")], candidateReady });
    expect(ready.accepted).toBe(true);
    const before = await db.get("attempt-1");
    expect(before).toMatchObject({ status: "RUNNING", executionBaseSha: BASE, headSha: CANDIDATE });
    expect(before.verificationSubject.candidateSha).toBe(CANDIDATE);

    await expect(report({
      artifacts: [pullRequestArtifact(INTERMEDIATE, "pr:second")],
      terminal: { status: "COMPLETED" },
    })).rejects.toThrow(/frozen|source.revision/i);

    const after = await db.get("attempt-1");
    expect(after).toMatchObject({ status: "RUNNING", executionBaseSha: BASE, headSha: CANDIDATE });
    expect(after.verificationSubject).toEqual(before.verificationSubject);
  });

  it("accepts a separate terminal report when its exact publication lineage still matches", async () => {
    const { db, report } = fixture();
    await report({ artifacts: [pullRequestArtifact(BASE, "pr:first")], candidateReady });
    const terminal = await report({
      artifacts: [pullRequestArtifact(BASE, "pr:second")], terminal: { status: "COMPLETED" },
    });
    expect(terminal).toMatchObject({ accepted: true, terminalStatus: "COMPLETED" });
    expect(await db.get("attempt-1")).toMatchObject({ status: "COMPLETED", executionBaseSha: BASE, headSha: CANDIDATE });
  });

  it("revalidates stored artifact lineage when an idempotency replay resolves to a conflicting historical row", async () => {
    const { db, report } = fixture();
    await report({ artifacts: [pullRequestArtifact(BASE, "pr:first")], candidateReady });
    await db.insert("runArtifacts", {
      ...pullRequestArtifact(INTERMEDIATE, "pr:historical"), workflowRunId: "attempt-1",
    });

    await expect(report({
      artifacts: [pullRequestArtifact(BASE, "pr:historical")], terminal: { status: "COMPLETED" },
    })).rejects.toThrow(/frozen|source.revision/i);
    expect(await db.get("attempt-1")).toMatchObject({ status: "RUNNING", executionBaseSha: BASE });
  });
});

function prepublicationPacket() {
  return { candidateReady: { version: 2, sourceRevision: BASE, candidateSha: CANDIDATE, treeSha: TREE,
    rawDiffSha256: `sha256:${"3".repeat(64)}`, baseRef: "main", headRef: "mc/candidate" },
    artifacts: [
      { idempotencyKey: `factory:run-1:code-diff:${CANDIDATE}`, artifactType: "CODE_DIFF", name: "Candidate diff",
        metadata: { sourceRevision: BASE, headSha: CANDIDATE, treeSha: TREE, rawDiffSha256: `sha256:${"3".repeat(64)}`, branch: "mc/candidate", changedFiles: ["src/feature.ts"] } },
      { idempotencyKey: "factory:run-1:structured-result", artifactType: "STRUCTURED_OUTPUT", name: "Producer result", metadata: { result: { status: "COMPLETED", summary: "Candidate ready" } } },
    ] };
}
