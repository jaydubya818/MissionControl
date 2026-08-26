import { v } from "convex/values";
import { createGitVerificationSubject } from "@mission-control/workflow-engine/verification-subject";
import {
  deriveVerificationIndependence,
  verificationIsolationBindingDigest,
} from "@mission-control/workflow-engine/verification-independence";
import { evaluateVerificationDecision } from "@mission-control/workflow-engine/verification-decision";
import { internalMutation } from "./_generated/server";
import {
  compilePolicyV2VerificationPlan,
  effectivePolicyV2VerificationChecks,
  normalizePolicyV2VerificationResults,
} from "./lib/policyV2Verification";
import {
  appendCurrentVerificationQualityGateDecision,
  getCurrentVerificationResult,
} from "./lib/currentVerification";

const MISSION_KEY = "mc-demo:mission:spec-intake-golden-path";
const WORK_ORDER_KEY = "mc-demo:mission-work-order:spec-intake-golden";
const SOURCE_RUN_ID = "v1-golden-recovered";
const FAILED_RUN_ID = "v1-golden-failed";
const VERIFICATION_RUN_ID = "v1-golden-verification";
const REPOSITORY_NAME = "jaydubya818/MissionControl";
const PROVIDER_REPOSITORY_ID = "mission-control-ci-repository";
const INSTALLATION_ID = "152563527";
const PULL_REQUEST_ID = "mission-control-ci-pr-999";
const PULL_REQUEST_NUMBER = 999;
const PULL_REQUEST_URL = `${"https://github.com"}/${REPOSITORY_NAME}/pull/${PULL_REQUEST_NUMBER}`;
const BRANCH = "codex/ci-v1-golden-path";
const BASE_SHA = "1".repeat(40);
const FAILED_CANDIDATE_SHA = "2".repeat(40);
const CANDIDATE_SHA = "3".repeat(40);
const TREE_SHA = "4".repeat(40);
const EVIDENCE_VALIDITY_MS = 24 * 60 * 60_000;

function digest(character: string) {
  return `sha256:${character.repeat(64)}`;
}

function runStep(stepId: string, status: "DONE" | "FAILED", now: number, error?: string) {
  return {
    stepId,
    status,
    kind: "AGENT" as const,
    isolation: "WORKTREE" as const,
    retryCount: 0,
    startedAt: now - 12 * 60_000,
    completedAt: now - 11 * 60_000,
    ...(error ? { error } : {}),
  };
}

async function ensureFactoryVersion(
  ctx: any,
  input: {
    tenantId: any;
    projectId: any;
    repositoryId: any;
    workflowId: any;
    purpose: "SOFTWARE" | "VERIFICATION";
    name: string;
    configurationDigest: string;
    now: number;
  },
) {
  const definitions = await ctx.db
    .query("factoryDefinitions")
    .withIndex("by_project", (q: any) => q.eq("projectId", input.projectId))
    .collect();
  let definition = definitions.find((row: any) =>
    row.repositoryId === input.repositoryId
      && row.purpose === input.purpose
      && row.name === input.name,
  );
  if (!definition) {
    const definitionId = await ctx.db.insert("factoryDefinitions", {
      tenantId: input.tenantId,
      projectId: input.projectId,
      repositoryId: input.repositoryId,
      purpose: input.purpose,
      name: input.name,
      status: "ACTIVE",
      latestVersion: 1,
      createdBy: "seedV1GoldenPathQualification",
      createdAt: input.now - 30 * 60_000,
      updatedAt: input.now - 30 * 60_000,
    });
    definition = await ctx.db.get(definitionId);
  }

  let version = await ctx.db
    .query("factoryDefinitionVersions")
    .withIndex("by_factory_version", (q: any) =>
      q.eq("factoryDefinitionId", definition._id).eq("version", 1),
    )
    .first();
  if (!version) {
    const versionId = await ctx.db.insert("factoryDefinitionVersions", {
      tenantId: input.tenantId,
      projectId: input.projectId,
      factoryDefinitionId: definition._id,
      version: 1,
      configurationDigest: input.configurationDigest,
      repositoryId: input.repositoryId,
      purpose: input.purpose,
      workflowId: input.workflowId,
      executor: {
        adapter: input.purpose === "VERIFICATION" ? "deterministic-verifier" : "codex",
        version: "v1",
      },
      executionBackend: "persistent-worker",
      budget: { maxCostUsd: 5, maxRuntimeMinutes: 30, maxAttempts: 2 },
      verifierIds: [],
      riskBoundary: "YELLOW",
      recovery: { pause: true, cancel: true, retry: true, resume: true },
      createdBy: "seedV1GoldenPathQualification",
      createdAt: input.now - 29 * 60_000,
    });
    version = await ctx.db.get(versionId);
    await ctx.db.patch(definition._id, {
      activeVersionId: versionId,
      updatedAt: input.now - 29 * 60_000,
    });
  }
  return { definition, version };
}

async function syncMissionAssertions(
  ctx: any,
  missionId: any,
  workOrderId: any,
  verificationAttemptId: any,
  now: number,
) {
  const [assertions, receipts] = await Promise.all([
    ctx.db.query("validationAssertions")
      .withIndex("by_mission", (q: any) => q.eq("missionId", missionId))
      .collect(),
    ctx.db.query("verificationReceipts")
      .withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrderId))
      .collect(),
  ]);
  for (const assertion of assertions) {
    const receipt = receipts.find((row: any) =>
      row.receiptScope === "ACCEPTANCE_CRITERION"
        && row.acceptanceCriterionId === assertion.assertionId
        && row.status === "PASSED",
    );
    if (!receipt) continue;
    await ctx.db.patch(assertion._id, {
      linkedWorkOrderIds: [...new Set([...(assertion.linkedWorkOrderIds ?? []), workOrderId])],
      status: "PASS",
      validatorWorkflowRunId: verificationAttemptId,
      verificationReceiptId: receipt._id,
      updatedAt: now,
    });
  }
}

/**
 * Deterministic local-only qualification fixture for the blocking browser lane.
 *
 * The ordinary demo seed owns intent and approved-Plan lineage. This mutation
 * adds canonical failure/recovery, exact GitHub projection, policy-v2 evidence,
 * and an acceptance-eligible WorkOrder without calling an external provider.
 * It proves the stored identity graph before returning, so malformed fixtures
 * fail during setup instead of producing a misleading browser pass.
 */
export const run = internalMutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx: any) => {
    const now = Date.now();
    const existingSource = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q: any) => q.eq("runId", SOURCE_RUN_ID))
      .first();
    if (existingSource) {
      const existingVerification = await ctx.db
        .query("workflowRuns")
        .withIndex("by_run_id", (q: any) => q.eq("runId", VERIFICATION_RUN_ID))
        .first();
      const existingFailed = await ctx.db
        .query("workflowRuns")
        .withIndex("by_run_id", (q: any) => q.eq("runId", FAILED_RUN_ID))
        .first();
      if (!existingVerification || !existingFailed || !existingSource.workOrderId || !existingSource.missionId) {
        throw new Error("V1 golden-path qualification fixture is only partially materialized.");
      }
      await syncMissionAssertions(
        ctx,
        existingSource.missionId,
        existingSource.workOrderId,
        existingVerification._id,
        now,
      );
      const existingPullRequestArtifact = await ctx.db
        .query("runArtifacts")
        .withIndex("by_run_type", (q: any) =>
          q.eq("workflowRunId", existingSource._id).eq("artifactType", "PULL_REQUEST"),
        )
        .first();
      if (existingPullRequestArtifact
        && existingPullRequestArtifact.metadata?.installationId !== INSTALLATION_ID) {
        await ctx.db.patch(existingPullRequestArtifact._id, {
          metadata: {
            ...(existingPullRequestArtifact.metadata ?? {}),
            installationId: INSTALLATION_ID,
          },
        });
      }
      const existingVerificationResult = await ctx.db
        .query("verificationRuns")
        .withIndex("by_run", (q: any) => q.eq("workflowRunId", existingVerification._id))
        .first();
      return {
        created: false,
        projectId: existingSource.projectId,
        missionId: existingSource.missionId,
        workOrderId: existingSource.workOrderId,
        failedAttemptId: existingFailed._id,
        sourceAttemptId: existingSource._id,
        verificationAttemptId: existingVerification._id,
        failedAttemptRunId: FAILED_RUN_ID,
        sourceAttemptRunId: SOURCE_RUN_ID,
        verificationAttemptRunId: VERIFICATION_RUN_ID,
        verificationSubjectDigest: existingSource.verificationSubject?.digest,
        verificationPlanId: existingVerificationResult?.verificationPlanId,
        candidateSha: existingSource.headSha,
        previousCandidateSha: FAILED_CANDIDATE_SHA,
        productPullRequestNumber: PULL_REQUEST_NUMBER,
      };
    }

    const mission = await ctx.db
      .query("missions")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", MISSION_KEY))
      .first();
    const workOrder = await ctx.db
      .query("workOrders")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", WORK_ORDER_KEY))
      .first();
    if (!mission || !workOrder || !mission.projectId || !workOrder.repositoryId) {
      throw new Error("Run seedMissionControlDemo before the V1 golden-path qualification seed.");
    }
    if (workOrder.verificationContract?.schemaVersion !== 2
      || !workOrder.verificationContractDigest
      || !workOrder.qualityContractDigest) {
      throw new Error("V1 golden-path qualification requires the policy-v2 WorkOrder fixture.");
    }

    const [project, repository, workflow] = await Promise.all([
      ctx.db.get(mission.projectId),
      ctx.db.get(workOrder.repositoryId),
      ctx.db.query("workflows")
        .withIndex("by_workflow_id", (q: any) => q.eq("workflowId", workOrder.workflowId))
        .first(),
    ]);
    if (!project || !repository || !workflow || !workOrder.tenantId) {
      throw new Error("Qualification fixture requires tenant, project, repository, and workflow lineage.");
    }

    await ctx.db.patch(repository._id, {
      providerRepositoryId: PROVIDER_REPOSITORY_ID,
      updatedAt: now,
    });

    const installation = await ctx.db
      .query("githubAppInstallations")
      .withIndex("by_repository", (q: any) => q.eq("repositoryId", repository._id))
      .first();
    if (!installation) {
      await ctx.db.insert("githubAppInstallations", {
        tenantId: workOrder.tenantId,
        projectId: project._id,
        repositoryId: repository._id,
        installationId: INSTALLATION_ID,
        appId: "mission-control-ci-app",
        accountLogin: "jaydubya818",
        accountType: "User",
        repositorySelection: "SELECTED",
        permissions: [
          { name: "contents", access: "write" },
          { name: "pull_requests", access: "write" },
          { name: "checks", access: "read" },
        ],
        subscribedEvents: ["pull_request", "check_suite"],
        status: "CONNECTED",
        installedAt: now - 30 * 60_000,
        verifiedAt: now - 30 * 60_000,
        updatedAt: now - 30 * 60_000,
      });
    } else if (installation.status !== "CONNECTED") {
      await ctx.db.patch(installation._id, {
        status: "CONNECTED",
        verifiedAt: now - 30 * 60_000,
        updatedAt: now - 30 * 60_000,
      });
    }

    const softwareFactory = await ensureFactoryVersion(ctx, {
      tenantId: workOrder.tenantId,
      projectId: project._id,
      repositoryId: repository._id,
      workflowId: workflow._id,
      purpose: "SOFTWARE",
      name: "feature-dev",
      configurationDigest: digest("5"),
      now,
    });
    const verificationFactory = await ensureFactoryVersion(ctx, {
      tenantId: workOrder.tenantId,
      projectId: project._id,
      repositoryId: repository._id,
      workflowId: workflow._id,
      purpose: "VERIFICATION",
      name: "independent-verifier",
      configurationDigest: digest("6"),
      now,
    });

    const taskId = await ctx.db.insert("tasks", {
      tenantId: workOrder.tenantId,
      projectId: project._id,
      idempotencyKey: "v1-golden-path:task",
      identifier: "MC-CI-001",
      title: "Implement the approved Mission candidate",
      description: "Deterministic qualification task bound to the approved WorkOrder.",
      type: "ENGINEERING",
      status: "DONE",
      stateEnteredAt: now - 10 * 60_000,
      priority: 1,
      assigneeIds: [],
      workOrderId: workOrder._id,
      reviewCycles: 0,
      actualCost: 0.42,
      startedAt: now - 24 * 60_000,
      submittedAt: now - 12 * 60_000,
      completedAt: now - 10 * 60_000,
      labels: ["qualification", "golden-path"],
      source: "SEED",
      createdBy: "SYSTEM",
      createdByRef: "seedV1GoldenPathQualification",
      metadata: { fixture: "v1-factory-golden-path", deterministic: true },
    });

    const failedAttemptId = await ctx.db.insert("workflowRuns", {
      tenantId: workOrder.tenantId,
      projectId: project._id,
      missionId: mission._id,
      missionRole: "WORKER",
      workOrderId: workOrder._id,
      workOrderRevisionNumber: 1,
      verificationContractDigest: workOrder.verificationContractDigest,
      factoryDefinitionVersionId: softwareFactory.version._id,
      factoryConfigurationDigest: softwareFactory.version.configurationDigest,
      factoryPurpose: "SOFTWARE",
      attemptPurpose: "IMPLEMENTATION",
      executorInvocationId: "v1-golden-source-invocation-1",
      qualityContractDigest: workOrder.qualityContractDigest,
      repositoryId: repository._id,
      executorAdapter: "codex",
      executorVersion: "v1",
      branch: BRANCH,
      isMutating: true,
      parentTaskId: taskId,
      runId: FAILED_RUN_ID,
      workflowId: workOrder.workflowId,
      workflowVersion: workflow.version,
      status: "FAILED",
      currentStepIndex: 0,
      totalSteps: 1,
      steps: [runStep("implement", "FAILED", now, "Transient worker lease loss")],
      context: { fixture: "v1-factory-golden-path", recovery: "source-attempt" },
      initialInput: workOrder.desiredOutcome,
      runtime: "node",
      model: "codex",
      executionEnvironment: "LOCAL",
      executorHostId: "qualification-worker",
      budgetUsd: 5,
      spentUsd: 0.12,
      executionBaseSha: BASE_SHA,
      headSha: FAILED_CANDIDATE_SHA,
      treeSha: digest("2").slice("sha256:".length, 40),
      executionClaimedBy: "service:factory-worker",
      executionAttemptNumber: 1,
      executionStaleRecoveryCount: 1,
      failureReason: "Worker lease expired after the first candidate was produced.",
      failureClass: "RETRYABLE_INFRA",
      failureCode: "WORKER_LEASE_LOST",
      failureStage: "EXECUTOR",
      retryable: true,
      retryDecision: {
        allowed: true,
        reason: "Durable checkpoint permits a bounded replacement Attempt.",
        evaluatedAt: now - 15 * 60_000,
      },
      returnHandoff: {
        summary: `Candidate ${FAILED_CANDIDATE_SHA} was not publication-ready.`,
        changedArtifacts: ["scripts/local-golden-path-candidate.mjs"],
        failedChecks: ["worker lease continuity"],
        unresolvedRisks: ["candidate must be regenerated from the approved base"],
        nextDecision: "Retry from the durable WorkOrder checkpoint.",
        createdAt: now - 15 * 60_000,
      },
      evidenceState: "FAILING",
      worktree: "/tmp/mission-control-v1-source-failed",
      startedAt: now - 24 * 60_000,
      completedAt: now - 15 * 60_000,
      metadata: { fixture: "v1-factory-golden-path", terminal: true },
    });

    const sourceAttemptId = await ctx.db.insert("workflowRuns", {
      tenantId: workOrder.tenantId,
      projectId: project._id,
      missionId: mission._id,
      missionRole: "WORKER",
      workOrderId: workOrder._id,
      workOrderRevisionNumber: 1,
      verificationContractDigest: workOrder.verificationContractDigest,
      factoryDefinitionVersionId: softwareFactory.version._id,
      factoryConfigurationDigest: softwareFactory.version.configurationDigest,
      factoryPurpose: "SOFTWARE",
      attemptPurpose: "IMPLEMENTATION",
      executorInvocationId: "v1-golden-source-invocation-2",
      qualityContractDigest: workOrder.qualityContractDigest,
      repositoryId: repository._id,
      executorAdapter: "codex",
      executorVersion: "v1",
      branch: BRANCH,
      isMutating: true,
      parentTaskId: taskId,
      runId: SOURCE_RUN_ID,
      workflowId: workOrder.workflowId,
      workflowVersion: workflow.version,
      status: "COMPLETED",
      currentStepIndex: 0,
      totalSteps: 1,
      steps: [runStep("implement", "DONE", now)],
      context: { fixture: "v1-factory-golden-path", retryOf: String(failedAttemptId) },
      initialInput: workOrder.desiredOutcome,
      runtime: "node",
      model: "codex",
      executionEnvironment: "LOCAL",
      executorHostId: "qualification-worker",
      budgetUsd: 5,
      spentUsd: 0.3,
      executionBaseSha: BASE_SHA,
      headSha: CANDIDATE_SHA,
      treeSha: TREE_SHA,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestProviderId: PULL_REQUEST_ID,
      pullRequestUrl: PULL_REQUEST_URL,
      pullRequestDraftAtPublication: true,
      publishedAt: now - 9 * 60_000,
      candidateReadyAt: now - 9 * 60_000,
      executionClaimedBy: "service:factory-worker",
      executionAttemptNumber: 2,
      executionStaleRecoveryCount: 1,
      executionRetryReason: "Recovered from the durable failed Attempt checkpoint.",
      returnHandoff: {
        summary: "Recovered candidate is ready for independent verification.",
        changedArtifacts: ["scripts/local-golden-path-candidate.mjs"],
        failedChecks: [],
        unresolvedRisks: [],
        nextDecision: "Run the frozen policy-v2 Verification Plan.",
        createdAt: now - 9 * 60_000,
      },
      evidenceState: "PASSING",
      worktree: "/tmp/mission-control-v1-source-recovered",
      startedAt: now - 14 * 60_000,
      completedAt: now - 9 * 60_000,
      metadata: {
        fixture: "v1-factory-golden-path",
        retryOfAttemptId: String(failedAttemptId),
        completedLeaseId: "v1-golden-source-lease",
      },
    });

    const subject = createGitVerificationSubject({
      version: 1,
      kind: "GIT_CANDIDATE",
      workOrderId: String(workOrder._id),
      workOrderRevisionNumber: 1,
      verificationContractDigest: workOrder.verificationContractDigest,
      sourceAttemptId: String(sourceAttemptId),
      repositoryId: String(repository._id),
      provider: "GITHUB",
      providerRepositoryId: PROVIDER_REPOSITORY_ID,
      candidateSha: CANDIDATE_SHA,
      treeSha: TREE_SHA,
      pullRequest: {
        providerPullRequestId: PULL_REQUEST_ID,
        number: PULL_REQUEST_NUMBER,
        url: PULL_REQUEST_URL,
        baseRef: "main",
        headRef: BRANCH,
        headSha: CANDIDATE_SHA,
        draftAtPublication: true,
      },
    });
    await ctx.db.patch(sourceAttemptId, { verificationSubject: subject });

    const codeDiffArtifactId = await ctx.db.insert("runArtifacts", {
      tenantId: workOrder.tenantId,
      projectId: project._id,
      missionId: mission._id,
      workOrderId: workOrder._id,
      workflowRunId: sourceAttemptId,
      idempotencyKey: "v1-golden-path:artifact:code-diff",
      artifactType: "CODE_DIFF",
      name: "Deterministic golden-path candidate diff",
      repositoryPath: "scripts/local-golden-path-candidate.mjs",
      contentHash: digest("7"),
      producer: "service:factory-worker",
      createdAt: now - 9 * 60_000,
      metadata: {
        changedFiles: ["scripts/local-golden-path-candidate.mjs"],
        sourceRevision: BASE_SHA,
        headSha: CANDIDATE_SHA,
      },
    });
    const pullRequestArtifactId = await ctx.db.insert("runArtifacts", {
      tenantId: workOrder.tenantId,
      projectId: project._id,
      missionId: mission._id,
      workOrderId: workOrder._id,
      workflowRunId: sourceAttemptId,
      idempotencyKey: "v1-golden-path:artifact:pull-request",
      artifactType: "PULL_REQUEST",
      name: `Draft pull request #${PULL_REQUEST_NUMBER}`,
      externalLocation: PULL_REQUEST_URL,
      producer: "service:factory-worker",
      createdAt: now - 9 * 60_000,
      metadata: {
        installationId: INSTALLATION_ID,
        pullRequestUrl: PULL_REQUEST_URL,
        pullRequestNumber: PULL_REQUEST_NUMBER,
        sourceRevision: BASE_SHA,
        headSha: CANDIDATE_SHA,
        changedFiles: ["scripts/local-golden-path-candidate.mjs"],
      },
    });

    const tuple = {
      sourceAttemptId,
      workOrderId: workOrder._id,
      workOrderRevisionNumber: 1,
      verificationContractDigest: workOrder.verificationContractDigest,
      verificationSubject: subject,
      verificationSubjectDigest: subject.digest,
    };
    const verificationAttemptId = await ctx.db.insert("workflowRuns", {
      tenantId: workOrder.tenantId,
      projectId: project._id,
      missionId: mission._id,
      missionRole: "VALIDATOR",
      workOrderId: workOrder._id,
      workOrderRevisionNumber: 1,
      verificationContractDigest: workOrder.verificationContractDigest,
      factoryDefinitionVersionId: verificationFactory.version._id,
      factoryConfigurationDigest: verificationFactory.version.configurationDigest,
      factoryPurpose: "VERIFICATION",
      attemptPurpose: "VERIFICATION",
      executorInvocationId: "v1-golden-verification-invocation",
      qualityContractDigest: workOrder.qualityContractDigest,
      repositoryId: repository._id,
      executorAdapter: "deterministic-verifier",
      executorVersion: "v1",
      branch: BRANCH,
      isMutating: false,
      parentTaskId: taskId,
      runId: VERIFICATION_RUN_ID,
      workflowId: workOrder.workflowId,
      workflowVersion: workflow.version,
      status: "COMPLETED",
      currentStepIndex: 0,
      totalSteps: 1,
      steps: [{ ...runStep("verify", "DONE", now), kind: "VERIFY" as const, isolation: "READ_ONLY" as const }],
      context: { fixture: "v1-factory-golden-path", subjectDigest: subject.digest },
      initialInput: `Verify exact subject ${subject.digest}`,
      runtime: "node",
      model: "deterministic",
      executionEnvironment: "LOCAL",
      executorHostId: "qualification-verifier",
      budgetUsd: 2,
      spentUsd: 0,
      executionClaimedBy: "service:verification-worker",
      executionAttemptNumber: 1,
      verificationAttemptBinding: tuple,
      evidenceState: "PASSING",
      worktree: "/tmp/mission-control-v1-verification",
      startedAt: now - 8 * 60_000,
      completedAt: now - 5 * 60_000,
      metadata: {
        fixture: "v1-factory-golden-path",
        completedLeaseId: "v1-golden-verification-lease",
      },
    });

    const verificationPlan = compilePolicyV2VerificationPlan({
      now: now - 8 * 60_000,
      workOrder,
      sourceAttempt: { ...await ctx.db.get(sourceAttemptId), _id: sourceAttemptId },
      verificationAttemptId: String(verificationAttemptId),
      verificationSubject: subject,
      factoryDefinitionId: String(verificationFactory.definition._id),
      factoryDefinitionVersionId: String(verificationFactory.version._id),
      executorInvocationId: "v1-golden-verification-invocation",
    });
    const verificationResultId = await ctx.db.insert("verificationRuns", {
      tenantId: workOrder.tenantId,
      projectId: project._id,
      missionId: mission._id,
      workOrderId: workOrder._id,
      workflowRunId: verificationAttemptId,
      sourceAttemptId,
      idempotencyKey: "v1-golden-path:verification-result",
      engineVersion: "policy-v2-qualification/v1",
      workOrderRevisionNumber: 1,
      verificationContractDigest: workOrder.verificationContractDigest,
      verificationSubject: subject,
      verificationSubjectId: subject.subjectId,
      verificationSubjectDigest: subject.digest,
      verificationPlan,
      verificationPlanId: verificationPlan.planId,
      verificationPlanDigest: verificationPlan.planDigest,
      sourceRevision: BASE_SHA,
      candidateRevision: CANDIDATE_SHA,
      status: "PLANNED",
      checks: [],
      criterionCoverage: [],
      requirementsPassed: 0,
      requirementsFailed: 0,
      violations: [],
      approvalRequirements: [],
      riskLevel: workOrder.riskLevel,
      riskReasons: [],
      verdictReasons: [],
      startedAt: now - 8 * 60_000,
      createdAt: now - 8 * 60_000,
    });

    const checkSpecs = new Map(
      effectivePolicyV2VerificationChecks(workOrder).map((check: any) => [check.id, check]),
    );
    const envelopeIds: any[] = [];
    const evidenceIdsByCheck = new Map<string, any[]>();
    const decisionEvidence: any[] = [];
    for (const [index, requiredEvidence] of verificationPlan.requiredEvidence.entries()) {
      const check = checkSpecs.get(requiredEvidence.id) as any;
      const envelopeId = await ctx.db.insert("evidenceEnvelopes", {
        tenantId: workOrder.tenantId,
        projectId: project._id,
        missionId: mission._id,
        workOrderId: workOrder._id,
        workflowRunId: verificationAttemptId,
        verificationRunId: verificationResultId,
        sourceAttemptId,
        verificationAttemptId,
        verificationSubjectId: subject.subjectId,
        verificationSubjectDigest: subject.digest,
        verificationContractDigest: workOrder.verificationContractDigest,
        verificationPlanId: verificationPlan.planId,
        verificationPlanDigest: verificationPlan.planDigest,
        workOrderRevisionNumber: 1,
        idempotencyKey: `v1-golden-path:evidence:${requiredEvidence.id}`,
        evidenceKey: `v1-golden-path:${requiredEvidence.id}`,
        checkId: requiredEvidence.id,
        category: check?.evidenceCategory ?? "POLICY_RESULT",
        result: "PASS",
        summary: `${check?.name ?? requiredEvidence.description} passed for the exact candidate.`,
        acceptanceCriterionIds: [...(check?.acceptanceCriterionIds ?? [])],
        primaryCriterionId: check?.acceptanceCriterionIds?.[0],
        requirementIds: requiredEvidence.requirementIds,
        requiredRiskIds: requiredEvidence.requiredRiskIds,
        discoveredRiskIds: [],
        requiredEvidenceIds: [requiredEvidence.id],
        producer: {
          actorType: "SERVICE",
          actorId: "service:verification-worker",
          role: "INDEPENDENT_VERIFIER",
          independent: true,
          factoryPurpose: "VERIFICATION",
          factoryDefinitionId: verificationFactory.definition._id,
          factoryDefinitionVersionId: verificationFactory.version._id,
          attemptId: verificationAttemptId,
          executorInvocationId: "v1-golden-verification-invocation",
          executorAdapter: "deterministic-verifier",
        },
        tool: {
          name: requiredEvidence.id,
          version: "v1",
          command: check?.command
            ? [check.command.executable, ...(check.command.args ?? [])]
            : ["mission-control-policy", requiredEvidence.id],
          exitCode: 0,
          durationMs: 1_000 + index,
        },
        artifactIds: [codeDiffArtifactId, pullRequestArtifactId],
        artifactReferences: [PULL_REQUEST_URL],
        sourceRevision: BASE_SHA,
        candidateRevision: CANDIDATE_SHA,
        contentHash: digest(String((index + 8) % 10)),
        provenance: "DEMO",
        recordedAt: now - 6 * 60_000 + index,
        metadata: { fixture: "v1-factory-golden-path", canonical: true },
      });
      envelopeIds.push(envelopeId);
      evidenceIdsByCheck.set(requiredEvidence.id, [envelopeId]);
      decisionEvidence.push({
        id: String(envelopeId),
        requiredEvidenceIds: [requiredEvidence.id],
        requirementIds: requiredEvidence.requirementIds,
        requiredRiskIds: requiredEvidence.requiredRiskIds,
        discoveredRiskIds: [],
        conclusion: "PASSED",
        usable: true,
      });
    }

    const normalized = normalizePolicyV2VerificationResults({
      workOrder,
      plan: verificationPlan,
      packetChecks: effectivePolicyV2VerificationChecks(workOrder).map((check: any, index: number) => ({
        checkId: check.id,
        status: "PASS",
        summary: `${check.name} passed for the exact candidate.`,
        startedAt: now - 7 * 60_000 + index,
        completedAt: now - 6 * 60_000 + index,
        durationMs: 60_000,
        violations: [],
      })),
      evidenceIdsByCheck,
    });
    const exactTuple = {
      workOrderId: String(workOrder._id),
      workOrderRevisionNumber: 1,
      verificationContractDigest: workOrder.verificationContractDigest,
      sourceAttemptId: String(sourceAttemptId),
      verificationSubjectDigest: subject.digest,
    };
    const isolationBase = {
      mode: "DETACHED_GIT_WORKTREE" as const,
      sandboxId: "v1-golden-verification-worktree",
      subjectDigest: subject.digest,
      verifierRoot: "/tmp/mission-control-v1-verification",
      sourceRoot: "/tmp/mission-control-v1-source-recovered",
      initialClean: true,
      finalSubjectMatch: true,
      repositoryId: String(repository._id),
      headSha: CANDIDATE_SHA,
      treeSha: TREE_SHA,
    };
    const isolation = {
      ...isolationBase,
      rootBindingDigest: verificationIsolationBindingDigest(isolationBase),
    };
    const independence = deriveVerificationIndependence({
      expected: {
        ...exactTuple,
        verificationAttemptId: String(verificationAttemptId),
        verificationRunId: String(verificationResultId),
        verificationSubjectId: subject.subjectId,
        verificationPlanId: verificationPlan.planId,
        verificationPlanDigest: verificationPlan.planDigest,
      },
      subject,
      sourceAttempt: {
        id: String(sourceAttemptId),
        attemptPurpose: "IMPLEMENTATION",
        executorInvocationId: "v1-golden-source-invocation-2",
        leaseId: "v1-golden-source-lease",
        worktree: "/tmp/mission-control-v1-source-recovered",
      },
      verificationAttempt: {
        id: String(verificationAttemptId),
        attemptPurpose: "VERIFICATION",
        factoryPurpose: "VERIFICATION",
        factoryDefinitionVersionId: String(verificationFactory.version._id),
        executorInvocationId: "v1-golden-verification-invocation",
        leaseId: "v1-golden-verification-lease",
        worktree: "/tmp/mission-control-v1-verification",
        binding: exactTuple,
      },
      factoryVersion: {
        id: String(verificationFactory.version._id),
        purpose: "VERIFICATION",
      },
      verificationRun: {
        id: String(verificationResultId),
        workflowRunId: String(verificationAttemptId),
        ...exactTuple,
        verificationSubjectId: subject.subjectId,
        verificationPlanId: verificationPlan.planId,
        verificationPlanDigest: verificationPlan.planDigest,
      },
      isolation,
      reportCapability: "verification:report",
      authorityStatus: "PASS",
    });
    if (!independence.passed) {
      throw new Error(`Qualification fixture failed verifier independence: ${independence.reasons.join(" ")}`);
    }
    const decision = evaluateVerificationDecision({
      plan: verificationPlan,
      evidence: decisionEvidence,
      runStatus: "COMPLETED",
      independence,
      requireHumanReview: false,
      evaluatedAt: now - 5 * 60_000,
    });
    if (decision.verdict !== "VERIFIED") {
      throw new Error(`Qualification fixture did not verify: ${decision.reasons.join(" ")}`);
    }
    await ctx.db.patch(verificationResultId, {
      status: "COMPLETED",
      checks: normalized.checks,
      criterionCoverage: normalized.criterionCoverage,
      coverage: decision.coverage,
      requiredRisks: verificationPlan.requiredRisks,
      discoveredRisks: verificationPlan.discoveredRisks,
      requirementsPassed: decision.passedRequirementIds.length,
      requirementsFailed: decision.failedRequirementIds.length,
      violations: [],
      approvalRequirements: [],
      riskReasons: [],
      verdict: "VERIFIED",
      verdictReasons: decision.reasons,
      independence,
      independenceValid: true,
      decisionInputDigest: decision.decisionInputDigest,
      isolationAttestation: {
        ...isolation,
        repositoryId: repository._id,
        attestedAt: now - 5 * 60_000,
      },
      completedAt: now - 5 * 60_000,
      durationMs: 3 * 60_000,
      evaluatedAt: now - 5 * 60_000,
    });
    await ctx.db.patch(verificationAttemptId, {
      verificationIsolationAttestation: {
        ...isolation,
        repositoryId: repository._id,
        attestedAt: now - 5 * 60_000,
      },
    });

    const criterionReceiptIds: any[] = [];
    for (const criterion of workOrder.acceptanceCriteria) {
      const criterionEnvelopeIds = envelopeIds.filter((_id, index) => {
        const requiredEvidence = verificationPlan.requiredEvidence[index];
        return (checkSpecs.get(requiredEvidence.id) as any)?.acceptanceCriterionIds?.includes(criterion.id);
      });
      const receiptId = await ctx.db.insert("verificationReceipts", {
        tenantId: workOrder.tenantId,
        projectId: project._id,
        missionId: mission._id,
        workOrderId: workOrder._id,
        receiptScope: "ACCEPTANCE_CRITERION",
        acceptanceCriterionId: criterion.id,
        workflowRunId: verificationAttemptId,
        verificationRunId: verificationResultId,
        sourceAttemptId,
        verificationAttemptId,
        verificationSubjectId: subject.subjectId,
        verificationSubjectDigest: subject.digest,
        verificationContractDigest: workOrder.verificationContractDigest,
        verificationPlanId: verificationPlan.planId,
        verificationPlanDigest: verificationPlan.planDigest,
        workOrderRevisionNumber: 1,
        idempotencyKey: `v1-golden-path:criterion-receipt:${criterion.id}`,
        verificationMethod: "TEST",
        commandOrCheck: "pnpm test",
        result: `${criterion.title} passed for the exact candidate.`,
        evidenceLocation: PULL_REQUEST_URL,
        artifactReference: PULL_REQUEST_URL,
        verifier: "service:verification-worker",
        status: "PASSED",
        linkedRunArtifactIds: [codeDiffArtifactId, pullRequestArtifactId],
        evidenceEnvelopeIds: criterionEnvelopeIds,
        verdict: "VERIFIED",
        independenceValid: true,
        decisionInputDigest: decision.decisionInputDigest,
        verdictReasons: decision.reasons,
        sourceRevision: BASE_SHA,
        candidateRevision: CANDIDATE_SHA,
        validUntil: now + EVIDENCE_VALIDITY_MS,
        recordedAt: now - 4 * 60_000,
        metadata: { fixture: "v1-factory-golden-path", canonical: true },
      });
      criterionReceiptIds.push(receiptId);
    }
    await syncMissionAssertions(
      ctx,
      mission._id,
      workOrder._id,
      verificationAttemptId,
      now - 2 * 60_000,
    );
    const gateReceiptId = await ctx.db.insert("verificationReceipts", {
      tenantId: workOrder.tenantId,
      projectId: project._id,
      missionId: mission._id,
      workOrderId: workOrder._id,
      receiptScope: "WORK_ORDER",
      workflowRunId: verificationAttemptId,
      verificationRunId: verificationResultId,
      sourceAttemptId,
      verificationAttemptId,
      verificationSubjectId: subject.subjectId,
      verificationSubjectDigest: subject.digest,
      verificationContractDigest: workOrder.verificationContractDigest,
      verificationPlanId: verificationPlan.planId,
      verificationPlanDigest: verificationPlan.planDigest,
      workOrderRevisionNumber: 1,
      idempotencyKey: "v1-golden-path:work-order-receipt",
      verificationMethod: "TEST",
      commandOrCheck: "frozen policy-v2 verification plan",
      result: "All exact-bound checks passed with independent evidence.",
      evidenceLocation: PULL_REQUEST_URL,
      artifactReference: PULL_REQUEST_URL,
      verifier: "service:verification-worker",
      status: "PASSED",
      linkedRunArtifactIds: [codeDiffArtifactId, pullRequestArtifactId],
      evidenceEnvelopeIds: envelopeIds,
      verdict: "VERIFIED",
      independenceValid: true,
      decisionInputDigest: decision.decisionInputDigest,
      verdictReasons: decision.reasons,
      checks: normalized.checks,
      criterionCoverage: normalized.criterionCoverage,
      requirementsPassed: decision.passedRequirementIds.length,
      requirementsFailed: decision.failedRequirementIds.length,
      violations: [],
      approvalRequirements: [],
      riskLevel: workOrder.riskLevel,
      riskReasons: [],
      sourceRevision: BASE_SHA,
      candidateRevision: CANDIDATE_SHA,
      validUntil: now + EVIDENCE_VALIDITY_MS,
      recordedAt: now - 4 * 60_000,
      metadata: { fixture: "v1-factory-golden-path", canonical: true },
    });

    const approvalDecisionId = await ctx.db.insert("approvalDecisions", {
      tenantId: workOrder.tenantId,
      projectId: project._id,
      workOrderId: workOrder._id,
      idempotencyKey: "v1-golden-path:approval:human-review",
      approvalType: "HUMAN_REVIEW",
      requestedAction: "Approve exact WorkOrder revision for implementation and verification.",
      riskLevel: workOrder.riskLevel,
      requestedBy: "seedV1GoldenPathQualification",
      approver: "qualification-operator",
      status: "APPROVED",
      decision: "APPROVE",
      reason: "Approved deterministic qualification fixture.",
      workOrderRevisionNumber: 1,
      expiresAt: now + EVIDENCE_VALIDITY_MS,
      createdAt: now - 20 * 60_000,
      decidedAt: now - 19 * 60_000,
      metadata: { fixture: "v1-factory-golden-path", actorSource: "QUALIFICATION" },
    });

    const prCheckId = await ctx.db.insert("harnessPrChecks", {
      projectId: project._id,
      repositoryId: repository._id,
      installationId: INSTALLATION_ID,
      workOrderId: workOrder._id,
      workflowRunId: sourceAttemptId,
      taskId,
      prUrl: PULL_REQUEST_URL,
      prNumber: PULL_REQUEST_NUMBER,
      repoFullName: REPOSITORY_NAME,
      branch: BRANCH,
      title: "V1 Mission-to-PR qualification candidate",
      prState: "OPEN",
      ciStatus: "PASS",
      ciRunUrl: `${PULL_REQUEST_URL}/checks`,
      ciProvider: "github-actions",
      source: "GITHUB",
      sourceRef: `qualification:${PULL_REQUEST_ID}`,
      provider: "GITHUB",
      providerRepositoryId: PROVIDER_REPOSITORY_ID,
      providerPullRequestId: PULL_REQUEST_ID,
      draft: true,
      headSha: CANDIDATE_SHA,
      attestationExpiresAt: now + EVIDENCE_VALIDITY_MS,
      changeReviewLenses: [
        { id: "correctness", label: "Correctness", enabled: true, score: 100 },
        { id: "security", label: "Security", enabled: true, score: 100 },
      ],
      syncedAt: now - 3 * 60_000,
      createdAt: now - 3 * 60_000,
      metadata: { fixture: "v1-factory-golden-path", canonical: true },
    });

    const passedCriteria = workOrder.acceptanceCriteria.map((criterion: any) => ({
      ...criterion,
      status: "PASS" as const,
    }));
    await ctx.db.patch(workOrder._id, {
      acceptanceCriteria: passedCriteria,
      approvalStatus: "APPROVED",
      verificationStatus: "PASS",
      state: "AWAITING_VERIFICATION",
      currentExecutionRunId: verificationAttemptId,
      blockingIssue: undefined,
      requiredHumanAction: "Ready for explicit acceptance.",
      updatedAt: now - 2 * 60_000,
    });
    await ctx.db.patch(mission._id, {
      activeWorkOrderId: workOrder._id,
      state: "AWAITING_ACCEPTANCE",
      requiredHumanAction: "Review the exact candidate evidence and accept the WorkOrder.",
      updatedAt: now - 2 * 60_000,
    });

    const updatedWorkOrder = await ctx.db.get(workOrder._id);
    const currentVerification = await getCurrentVerificationResult(ctx, updatedWorkOrder, now);
    if (!currentVerification.eligible || !currentVerification.current) {
      throw new Error(`Qualification fixture is not exact-current: ${currentVerification.reasons.join(" ")}`);
    }
    const qualityGateDecision = await appendCurrentVerificationQualityGateDecision(
      ctx,
      updatedWorkOrder,
      currentVerification,
      "v1-golden-path:quality-gate",
      now - 60_000,
    );

    return {
      created: true,
      projectId: project._id,
      missionId: mission._id,
      workOrderId: workOrder._id,
      taskId,
      failedAttemptId,
      sourceAttemptId,
      verificationAttemptId,
      failedAttemptRunId: FAILED_RUN_ID,
      sourceAttemptRunId: SOURCE_RUN_ID,
      verificationAttemptRunId: VERIFICATION_RUN_ID,
      verificationResultId,
      verificationSubjectDigest: subject.digest,
      verificationPlanId: verificationPlan.planId,
      verificationPlanDigest: verificationPlan.planDigest,
      candidateSha: CANDIDATE_SHA,
      previousCandidateSha: FAILED_CANDIDATE_SHA,
      productPullRequestNumber: PULL_REQUEST_NUMBER,
      approvalDecisionId,
      criterionReceiptIds,
      gateReceiptId,
      evidenceEnvelopeIds: envelopeIds,
      prCheckId,
      qualityGateDecisionId: qualityGateDecision._id,
      currentVerification,
    };
  },
});
