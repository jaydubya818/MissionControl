import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { canonicalHash } from "@mission-control/shared";
import {
  assembleContextPackage,
  assessContextSufficiency,
  planContextRetrieval,
  type FactoryMemoryResult,
} from "@mission-control/memory";
import {
  createGitVerificationSubject,
  deriveVerificationIndependence,
  evaluateCurrentVerificationEligibility,
  evaluateVerificationDecision,
  verificationContractDigest,
  verificationIsolationBindingDigest,
  type VerificationIdentityTuple,
} from "@mission-control/workflow-engine";
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  DEEPSEEK_V1_HARNESS_MANIFEST,
  DEEPSEEK_V1_RUNTIME_ARTIFACT,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine/harness-contract";
import { afterAll, describe, expect, it } from "vitest";
import { aggregateLearningSignals, deriveObservationLearningSignals, recommendImprovementPromotion } from "../../../../convex/lib/factoryLearning.js";
import { buildFactoryExecutionManifest } from "../../../../convex/lib/executionManifest.js";
import {
  exactModelRouteDigest,
  exactModelRouteQualificationSnapshot,
  exactModelRouteSnapshot,
  modelRouteQualificationDigest,
} from "../../../../convex/lib/modelRouteAdmission.js";
import { RUNTIME_CONTRACT_VERSION } from "../../../../convex/lib/runtimeContract.js";
import {
  analyzeSpecPlanConsistency,
  evaluateMissionSpecQuality,
  missionSpecDigest,
  projectConstitutionDigest,
  type MissionSpecContent,
  type ProjectConstitutionContent,
} from "../../../../convex/lib/missionSpec.js";
import { evaluateAcceptance } from "../../../../convex/lib/workOrderGovernance.js";
import { compileMissionWorkOrderContract } from "../../../../convex/lib/missionWorkOrderContract.js";
import { validateMissionPlan } from "../../../../convex/lib/missionPlan.js";
import { compilePolicyV2VerificationPlan } from "../../../../convex/lib/policyV2Verification.js";
import { qualityGateStateForCurrentEligibility } from "../../../../convex/lib/qualityGateDecision.js";
import { compileApprovedPlanQualityContract } from "../../../../convex/lib/qualityContract.js";
import {
  activeLeaseMatches,
  evaluateAttemptClaim,
} from "../../../../convex/lib/factoryAttempt.js";
import {
  factoryWorkerEligibility,
  type FactoryWorkerCandidate,
} from "../../../../convex/lib/factoryWorkerRuntime.js";
import { factoryHarnessCapabilityRequirements } from "../../../../convex/lib/harnessCapabilities.js";
import { executeIndependentVerification } from "../factoryVerification.js";
import { FakeSandboxProvider } from "../fakeSandboxProvider.js";
import { RemoteSandboxRuntime, InMemoryRemoteSandboxJournal } from "../remoteSandboxRuntime.js";
import { FakeSandboxCredentialBroker } from "../sandboxCredentials.js";
import type { SandboxProfileSnapshot } from "../sandboxProvider.js";
import { sandboxProfileDigest } from "../sandboxProvider.js";
import {
  createPatchDescriptor,
  createSandboxResultBundle,
  encodeSandboxResultBundle,
} from "../sandboxResultBundle.js";

const execFileAsync = promisify(execFile);
const cleanupDirectories: string[] = [];
const FIXED_NOW = Date.UTC(2026, 7, 16, 20, 0, 0);
const REPOSITORY_KEY = "sellerfi/system-factory-qualification-fixture";
const REPOSITORY_ID = "repository-system-factory-e2e-v2";
const PROJECT_ID = "workspace-system-factory-e2e-v2";
const MISSION_ID = "mission-system-factory-e2e-v2";
const PLAN_ID = "plan-system-factory-e2e-v2";
const WORK_ORDER_ID = "work-order-system-factory-e2e-v2";
const CONSTITUTION_REVISION_ID = "constitution-revision-system-factory-e2e-v2-r1";
const SPEC_REVISION_1_ID = "mission-spec-system-factory-e2e-v2-r1";
const SPEC_REVISION_2_ID = "mission-spec-system-factory-e2e-v2-r2";
const SPEC_REVISION_3_ID = "mission-spec-system-factory-e2e-v2-r3";
const SPEC_EVALUATION_2_ID = "mission-spec-evaluation-system-factory-e2e-v2-r2";
const FACTORY_VERSION_ID = "factory-version-progressive-software-v1";
const VERIFICATION_FACTORY_VERSION_ID = "factory-version-independent-verification-v1";
const CODEX_CAPABILITY_MANIFEST_SHA256 = harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST);
const DEEPSEEK_CAPABILITY_MANIFEST_SHA256 = harnessCapabilityManifestDigest(DEEPSEEK_V1_HARNESS_MANIFEST);

type GateResult = {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  digest: string;
};

type LineageResult = Awaited<ReturnType<typeof buildVerificationLineage>>;

afterAll(async () => {
  await Promise.all(cleanupDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("Mission Control full-system Factory qualification V2", () => {
  it("binds qualification evidence to the canonical runtime contract identity", () => {
    expect(RUNTIME_CONTRACT_VERSION).toBeGreaterThan(0);
    expect(() => requireQualificationRuntimeContractIdentity({
      canonicalRuntimeContractVersion: RUNTIME_CONTRACT_VERSION + 1,
      evidenceRuntimeContractVersion: RUNTIME_CONTRACT_VERSION,
    })).toThrow("Qualification runtime contract identity mismatch");
  });

  it.each([
    {
      canonicalRuntimeContractVersion: undefined,
      evidenceRuntimeContractVersion: RUNTIME_CONTRACT_VERSION,
    },
    {
      canonicalRuntimeContractVersion: RUNTIME_CONTRACT_VERSION,
      evidenceRuntimeContractVersion: undefined,
    },
  ])("fails closed when a qualification runtime identity is unavailable", (identity) => {
    expect(() => requireQualificationRuntimeContractIdentity(identity)).toThrow(
      "Qualification runtime contract identity is unavailable",
    );
  });

  it("proves exact governed lineage, failures, recovery, authority, and learning on an isolated fixture", async () => {
    const qualificationStartedAt = Date.now();
    const repositoryRoot = await createFixtureRepository();
    const baseSha = await gitValue(repositoryRoot, ["rev-parse", "HEAD"]);
    const baseTreeSha = await gitValue(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);

    const mission = {
      _id: MISSION_ID,
      projectId: PROJECT_ID,
      objective: "Correct the listing fee calculation and prove the exact candidate with deterministic gates.",
      context: "The fixture policy requires a five percent listing fee in integer cents.",
      constraints: [
        "Change only the bounded fixture repository.",
        "Do not publish, merge, or accept from the execution boundary.",
      ],
      sourceOfTruthRefs: [{ kind: "ADR", label: "Listing fee policy", location: "docs/listing-fee-policy.md" }],
    };
    const assertion = {
      assertionId: "deterministic-gates-pass",
      title: "Deterministic gates pass",
      outcome: "The listing fee is five percent and lint, typecheck, and tests all pass.",
      verificationMethod: "TEST" as const,
      passCondition: "node scripts/verify.mjs exits zero in an independent checkout.",
      requiredEvidence: "Independent deterministic gate output",
      requiresIndependentValidation: true,
      waiverAllowed: false,
      sourceRequirementIds: ["REQ-001", "NFR-001"],
      sourceAcceptanceExpectationIds: ["AC-001", "AC-002"],
      sourceVerificationExpectationIds: ["VERIFY-001"],
    };
    const blueprint = {
      id: "implement-listing-fee",
      title: "Correct the listing fee",
      desiredOutcome: "The fixture returns exactly five percent in integer cents.",
      workflowId: "progressive-software-delivery",
      workflowVersion: 1,
      sequence: 1,
      role: "WORKER" as const,
      isMutating: true,
      priority: 1 as const,
      riskLevel: "MEDIUM" as const,
      branchStrategy: "isolated-worktree" as const,
      constraints: ["Preserve the deterministic verification boundary."],
      requiredApprovals: [],
      implementationPolicy: {
        allowedCommands: ["node scripts/verify.mjs"],
        independentVerification: {
          executable: "node",
          args: ["scripts/verify.mjs"],
          category: "UNIT_TEST" as const,
          commandClass: "TEST" as const,
          evidenceCategory: "TEST_RESULT" as const,
          timeoutMs: 60_000,
        },
        maxFilesChanged: 8,
        maxLinesChanged: 200,
        maxAttempts: 5,
        timeoutMinutes: 10,
        stopCondition: "Stop only after independent exact-candidate verification and durable cleanup evidence.",
      },
      dependsOnBlueprintIds: [],
      assertionIds: [assertion.assertionId],
    };
    const missionPlanInput = {
      summary: "Correct and independently verify the listing fee fixture.",
      rollbackApproach: "Reset the isolated fixture branch to the recorded base SHA.",
      estimatedCostUsd: 0,
      repository: REPOSITORY_KEY,
      repositoryBranch: "main",
      assertions: [assertion],
      workOrderBlueprints: [blueprint],
    };
    expect(validateMissionPlan(missionPlanInput)).toEqual([]);

    const constitution = qualificationConstitution();
    const constitutionDigest = projectConstitutionDigest(constitution);
    const specRevision1 = qualificationSpecRevision1();
    const specRevision2 = qualificationSpecRevision2();
    const specRevision3 = qualificationSpecRevision3();
    const specRevision1Evaluation = evaluateMissionSpecQuality({ spec: specRevision1, constitution });
    const specRevision2Evaluation = evaluateMissionSpecQuality({ spec: specRevision2, constitution });
    expect(specRevision1Evaluation.result).toBe("FAIL");
    expect(specRevision1Evaluation.findings.some((finding) => finding.blocking)).toBe(true);
    expect(specRevision2Evaluation).toMatchObject({ result: "PASS", findings: [] });
    const specRevision2Digest = missionSpecDigest(specRevision2);
    const specRevision3Digest = missionSpecDigest(specRevision3);
    expect(specRevision3Digest).not.toBe(specRevision2Digest);
    const specPlanAnalysis = analyzeSpecPlanConsistency({
      spec: specRevision2,
      assertions: [assertion],
      workOrderBlueprints: [blueprint],
      planSummary: missionPlanInput.summary,
      repositoryId: REPOSITORY_ID,
    });
    expect(specPlanAnalysis.findings).toEqual([]);
    expect(specPlanAnalysis.coverage.complete).toBe(true);
    const mismatchedSpecPlan = analyzeSpecPlanConsistency({
      spec: specRevision2,
      assertions: [assertion],
      workOrderBlueprints: [blueprint],
      planSummary: missionPlanInput.summary,
      repositoryId: "repository-outside-approved-spec-scope",
    });
    expect(mismatchedSpecPlan.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PLAN_REPOSITORY_SCOPE_MISMATCH", blocking: true }),
    ]));

    const planRevision = 1;
    const submittedPlan = {
      _id: PLAN_ID,
      missionId: MISSION_ID,
      revisionNumber: planRevision,
      status: "PROPOSED",
      submittedBy: "operator-author",
      missionSpecRevisionId: SPEC_REVISION_2_ID,
      missionSpecDigest: specRevision2Digest,
      missionSpecQualityEvaluationId: SPEC_EVALUATION_2_ID,
      projectConstitutionRevisionId: CONSTITUTION_REVISION_ID,
      projectConstitutionDigest: constitutionDigest,
      requirementsCoverageProjection: specPlanAnalysis.coverage,
      specConsistencyDigest: specPlanAnalysis.digest,
      ...missionPlanInput,
    };
    const approvedPlan = {
      ...submittedPlan,
      status: "APPROVED",
      approvedRevision: planRevision,
      approvedBy: "operator-approver",
      approvedAt: FIXED_NOW,
    };
    expect(approvedPlan.approvedRevision).toBe(submittedPlan.revisionNumber);
    expect(approvedPlan.approvedBy).not.toBe(submittedPlan.submittedBy);

    const qualityContract = compileApprovedPlanQualityContract({
      missionId: MISSION_ID,
      missionPlanId: PLAN_ID,
      missionPlanRevision: planRevision,
      objective: mission.objective,
      businessContext: mission.context,
      constraints: mission.constraints,
      sourceOfTruthRefs: mission.sourceOfTruthRefs,
      repository: REPOSITORY_KEY,
      repositoryBranch: "main",
      summary: submittedPlan.summary,
      rollbackApproach: submittedPlan.rollbackApproach,
      assertions: submittedPlan.assertions,
      workOrderBlueprints: submittedPlan.workOrderBlueprints,
      specLineage: {
        missionSpecRevisionId: SPEC_REVISION_2_ID,
        missionSpecDigest: specRevision2Digest,
        missionSpecQualityEvaluationId: SPEC_EVALUATION_2_ID,
        projectConstitutionRevisionId: CONSTITUTION_REVISION_ID,
        projectConstitutionDigest: constitutionDigest,
        requirementsCoverage: specPlanAnalysis.coverage,
        checklistLineage: qualificationChecklistLineage(specRevision2),
      },
    });
    const compiledWorkOrder = compileMissionWorkOrderContract({
      blueprint,
      assertions: [assertion],
      rollbackApproach: submittedPlan.rollbackApproach,
      codeScopes: [{
        includePaths: ["src/**", "tests/**", "scripts/**", "docs/**"],
        excludePaths: [".git/**"],
      }],
      spec: specRevision2,
    });
    const contractDigest = verificationContractDigest(
      compiledWorkOrder.verificationContract,
      qualityContract.digest,
    );
    const workOrder = {
      _id: WORK_ORDER_ID,
      missionId: MISSION_ID,
      missionPlanId: PLAN_ID,
      missionPlanRevision: planRevision,
      currentRevisionNumber: 1,
      repositoryId: REPOSITORY_ID,
      repository: REPOSITORY_KEY,
      baseSha,
      factoryDefinitionVersionId: FACTORY_VERSION_ID,
      qualityContractDigest: qualityContract.digest,
      verificationContractDigest: contractDigest,
      missionSpecLineage: {
        missionSpecRevisionId: SPEC_REVISION_2_ID,
        missionSpecDigest: specRevision2Digest,
        missionSpecQualityEvaluationId: SPEC_EVALUATION_2_ID,
        projectConstitutionRevisionId: CONSTITUTION_REVISION_ID,
        projectConstitutionDigest: constitutionDigest,
        requirementsCoverage: specPlanAnalysis.coverage,
        checklistLineage: qualificationChecklistLineage(specRevision2),
      },
      state: "READY",
      title: blueprint.title,
      desiredOutcome: blueprint.desiredOutcome,
      context: mission.context,
      riskLevel: blueprint.riskLevel,
      ...compiledWorkOrder,
    };
    expect(workOrder.missionId).toBe(mission._id);
    expect(workOrder.missionPlanId).toBe(approvedPlan._id);
    expect(workOrder.missionPlanRevision).toBe(approvedPlan.approvedRevision);
    expect(qualityContract.projection.source).toMatchObject({
      missionPlanId: PLAN_ID,
      missionPlanRevision: planRevision,
    });
    expect(workOrder.baseSha).toBe(baseSha);
    expect(workOrder.factoryDefinitionVersionId).toBe(FACTORY_VERSION_ID);
    expect(qualityContract.projection.schemaVersion).toBe(2);
    expect(qualityContract.projection.source).toMatchObject({
      missionSpecRevisionId: SPEC_REVISION_2_ID,
      missionSpecDigest: specRevision2Digest,
      projectConstitutionRevisionId: CONSTITUTION_REVISION_ID,
      projectConstitutionDigest: constitutionDigest,
    });
    expect(workOrder.missionSpecLineage.missionSpecRevisionId).toBe(SPEC_REVISION_2_ID);
    expect(workOrder.missionSpecLineage.requirementsCoverage.complete).toBe(true);
    expect(workOrder.requirements.map((requirement: any) => requirement.id).sort()).toEqual(["NFR-001", "REQ-001"]);
    expect(workOrder.verificationContract!.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "spec:VERIFY-001", verifierId: "factory-command/v1" }),
    ]));
    expect(submittedPlan.missionSpecRevisionId).toBe(SPEC_REVISION_2_ID);
    expect(specRevision3Digest).not.toBe(submittedPlan.missionSpecDigest);

    const failedAttempts: Array<{
      attemptId: string;
      candidateSha: string;
      gate: GateResult;
      immutableSnapshot: string;
    }> = [];
    for (let index = 1; index <= 3; index += 1) {
      const attemptId = `attempt-source-failed-${index}`;
      await commit(repositoryRoot, `failed source Attempt ${index}`, index, true);
      const candidateSha = await gitValue(repositoryRoot, ["rev-parse", "HEAD"]);
      const gate = await runFixtureGate(repositoryRoot);
      expect(gate.passed).toBe(false);
      failedAttempts.push({
        attemptId,
        candidateSha,
        gate,
        immutableSnapshot: canonicalHash({ attemptId, candidateSha, gateDigest: gate.digest }),
      });
    }
    expect(new Set(failedAttempts.map((attempt) => attempt.attemptId)).size).toBe(3);
    expect(new Set(failedAttempts.map((attempt) => attempt.candidateSha)).size).toBe(3);

    const failedLineage = await buildVerificationLineage({
      repositoryRoot,
      baseSha,
      candidateSha: failedAttempts.at(-1)!.candidateSha,
      sourceAttemptId: failedAttempts.at(-1)!.attemptId,
      verificationAttemptId: "attempt-verification-failed-3",
      workOrder,
      readyAt: FIXED_NOW + 30,
      expectVerified: false,
    });
    expect(failedLineage.verificationAttempt.id).not.toBe(failedLineage.sourceAttempt.id);
    expect(failedLineage.decision.verdict).toBe("NOT_VERIFIED");

    await writeFile(
      path.join(repositoryRoot, "src/listingFee.ts"),
      "export function calculateListingFee(amountCents: number): number {\n  return Math.round(amountCents * 0.05);\n}\n",
    );
    await commit(repositoryRoot, "repair listing fee", 4);
    const repairedCandidateSha = await gitValue(repositoryRoot, ["rev-parse", "HEAD"]);
    const repairedGate = await runFixtureGate(repositoryRoot);
    expect(repairedGate.passed, [repairedGate.stdout, repairedGate.stderr].filter(Boolean).join("\n")).toBe(true);

    const repairedLineage = await buildVerificationLineage({
      repositoryRoot,
      baseSha,
      candidateSha: repairedCandidateSha,
      sourceAttemptId: "attempt-source-repaired",
      verificationAttemptId: "attempt-verification-repaired",
      workOrder,
      readyAt: FIXED_NOW + 40,
      expectVerified: true,
    });
    const repairedProviderHead = providerHeadFor(repairedLineage, repairedCandidateSha, FIXED_NOW + 50);
    const repairedEligibility = evaluateCurrentVerificationEligibility(currentnessInput({
      workOrder,
      lineages: [repairedLineage],
      providerHeads: [repairedProviderHead],
      now: FIXED_NOW + 60,
    }));
    expect(repairedEligibility, repairedEligibility.reasons.join(" ")).toMatchObject({
      eligible: true,
      current: true,
      sourceAttemptId: repairedLineage.sourceAttempt.id,
      verificationAttemptId: repairedLineage.verificationAttempt.id,
    });

    await writeFile(
      path.join(repositoryRoot, "docs/qualification-note.md"),
      "# Qualification note\n\nThe exact provider head advanced after verification.\n",
    );
    await commit(repositoryRoot, "advance provider head", 5);
    const advancedHeadSha = await gitValue(repositoryRoot, ["rev-parse", "HEAD"]);
    expect(advancedHeadSha).not.toBe(repairedCandidateSha);
    const staleEligibility = evaluateCurrentVerificationEligibility(currentnessInput({
      workOrder,
      lineages: [repairedLineage],
      providerHeads: [{ ...repairedProviderHead, headSha: advancedHeadSha, syncedAt: FIXED_NOW + 70 }],
      now: FIXED_NOW + 80,
    }));
    expect(staleEligibility.eligible).toBe(false);
    expect(qualityGateStateForCurrentEligibility(staleEligibility)).toBe("STALE");
    expect(repairedLineage.receipt.status).toBe("PASSED");
    expect(repairedLineage.receipt.verificationSubjectId).toBe(repairedLineage.subject.subjectId);

    const finalAttemptId = "attempt-source-current-head";
    const finalContext = buildContextPackage({
      workOrder,
      attemptId: finalAttemptId,
      candidateSha: advancedHeadSha,
    });
    expect(finalContext.contextPackage.attemptId).toBe(finalAttemptId);
    expect(finalContext.contextPackage.workOrderId).toBe(WORK_ORDER_ID);
    expect(finalContext.contextPackage.factoryVersionId).toBe(FACTORY_VERSION_ID);
    expect(finalContext.contextPackage.acceptanceAuthority).toBe(false);
    expect(finalContext.sufficiency.sufficient).toBe(true);

    const contextMiss = buildContextMiss({ workOrder, attemptId: finalAttemptId });
    expect(contextMiss.sufficiency.sufficient).toBe(false);
    expect(contextMiss.signal).toMatchObject({ signalType: "CONTEXT_MISS" });

    const worker = eligibleWorker();
    const workerAdmission = factoryWorkerEligibility({
      worker,
      requirements: {
        repositoryId: REPOSITORY_ID,
        executor: {
          adapter: "codex",
          version: "v1",
          capabilityManifestSha256: CODEX_CAPABILITY_MANIFEST_SHA256,
          effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
          runtimeArtifactSha256: harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT),
        },
        provider: "openai",
        model: "gpt-5.6-terra",
        harnessCapabilities: factoryHarnessCapabilityRequirements("WORKSPACE_WRITE"),
        isolation: "WORKSPACE_WRITE",
        sandboxCapabilities: ["remote-sandbox", "workspace-write"],
        executionBackend: "remote-sandbox",
      },
      activeWorkerLeaseCount: 0,
      now: FIXED_NOW,
    });
    expect(workerAdmission.eligible).toBe(true);
    if (!workerAdmission.eligible) return;
    const genericHarnessAdmission = qualifyGenericHarnessAdmission();
    expect(genericHarnessAdmission.exact.eligible).toBe(true);
    expect(genericHarnessAdmission.manifestMismatch).toMatchObject({
      eligible: false,
      reason: "worker-harness-manifest-mismatch",
    });
    expect(genericHarnessAdmission.modelMismatch).toMatchObject({
      eligible: false,
      reason: "worker-harness-model-unsupported",
    });
    expect(genericHarnessAdmission.backendMismatch).toMatchObject({
      eligible: false,
      reason: "worker-harness-backend-unsupported",
    });
    const currentWorkerIdentity = {
      workerId: workerAdmission.workerId,
      sessionId: workerAdmission.sessionId,
      generation: workerAdmission.generation,
    };
    const currentLease = evaluateAttemptClaim({
      status: "PENDING",
      leaseId: "lease-source-current-head",
      ownerId: "factory-service",
      worker: currentWorkerIdentity,
      leaseDurationMs: 60_000,
      now: FIXED_NOW,
    });
    expect(currentLease.ok).toBe(true);
    if (!currentLease.ok) return;

    const oldWorkerIdentity = { ...currentWorkerIdentity, sessionId: "worker-session-stale", generation: 1 };
    const staleLease = evaluateAttemptClaim({
      status: "PENDING",
      leaseId: "lease-stale",
      ownerId: "factory-service",
      worker: oldWorkerIdentity,
      leaseDurationMs: 15_000,
      now: FIXED_NOW - 16_000,
    });
    expect(staleLease.ok).toBe(true);
    expect(activeLeaseMatches({
      lease: staleLease.ok ? staleLease.lease : undefined,
      leaseId: "lease-stale",
      ownerId: "factory-service",
      worker: oldWorkerIdentity,
      now: FIXED_NOW,
    })).toBe(false);
    expect(activeLeaseMatches({
      lease: currentLease.lease,
      leaseId: currentLease.lease.leaseId,
      ownerId: "factory-service",
      worker: currentWorkerIdentity,
      now: FIXED_NOW + 1,
    })).toBe(true);

    const profile = fakeSandboxProfile();
    const remoteRuntimeArtifact = remoteSandboxRuntimeArtifact(profile);
    const remoteRuntimeArtifactDigest = harnessRuntimeArtifactDigest(remoteRuntimeArtifact);
    const modelRouteSnapshot = exactModelRouteSnapshot({
      provider: "openai",
      providerRoute: "openrouter",
      modelId: "gpt-5.6-terra",
    });
    const modelRouteDigest = exactModelRouteDigest(modelRouteSnapshot);
    const modelQualificationSnapshot = exactModelRouteQualificationSnapshot({
      routeDigest: modelRouteDigest,
      evidenceReference: "system-factory-qualification/model-route",
      evidenceDigest: `sha256:${"9".repeat(64)}`,
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["YELLOW"],
      promotedBy: "system-factory-qualification",
      promotedAt: FIXED_NOW,
      compatibility: {
        adapter: "codex",
        version: "v1",
        capabilityManifestDigest: CODEX_CAPABILITY_MANIFEST_SHA256,
        effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        runtimeArtifactDigest: remoteRuntimeArtifactDigest,
        executionBackend: "remote-sandbox",
      },
    });
    const executionManifest = buildFactoryExecutionManifest({
      runId: finalAttemptId,
      missionId: MISSION_ID,
      missionPlanId: PLAN_ID,
      missionPlanVersion: planRevision,
      qualityContractDigest: qualityContract.digest,
      workOrderId: WORK_ORDER_ID,
      workOrderRevisionNumber: workOrder.currentRevisionNumber,
      factoryDefinitionVersionId: FACTORY_VERSION_ID,
      factoryConfigurationDigest: `sha256:${"c".repeat(64)}`,
      factoryPurpose: "SOFTWARE",
      repositoryId: REPOSITORY_ID,
      repository: REPOSITORY_KEY,
      defaultBranch: "main",
      baseSha,
      branch: "mc/system-factory-e2e-v2",
      worktree: repositoryRoot,
      executor: {
        adapter: "codex",
        version: "v1",
        capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
        capabilityManifestSha256: CODEX_CAPABILITY_MANIFEST_SHA256,
        effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        runtimeArtifact: remoteRuntimeArtifact,
        runtimeArtifactDigest: remoteRuntimeArtifactDigest,
      },
      executionBackend: "remote-sandbox",
      modelRoute: {
        catalogId: "model-route-system-factory-e2e-v2",
        routeDigest: modelRouteDigest,
        routeSnapshot: modelRouteSnapshot,
        qualificationDigest: modelRouteQualificationDigest(modelQualificationSnapshot),
        qualificationSnapshot: modelQualificationSnapshot,
      },
      sandboxProfile: {
        isolation: "WORKSPACE_WRITE",
        requiredCapabilities: ["remote-sandbox", "workspace-write"],
      },
      sandbox: {
        resourceName: "mc-attempt-system-factory-v2",
        profileId: profile.profileKey,
        profileDigest: sandboxProfileDigest(profile),
        profileSnapshot: profile,
        supervisorVersion: "mission-control-supervisor/v1",
        resultContract: {
          schema: "factory-sandbox-result/v1",
          independentHostValidationRequired: true,
        },
        credentialGrants: [{
          kind: "INFERENCE",
          secretValueIncluded: false,
          githubAuthority: "NONE",
          providerAuthority: "NONE",
        }],
        teardown: {
          credentialsRevokedBeforePublication: true,
          resourceAbsenceRequiredBeforePublication: true,
        },
      },
      workflow: {
        workflowId: "progressive-software-delivery",
        version: 1,
        name: "Progressive software delivery",
        description: "Bounded fixture execution",
        agents: [{ id: "implementer", persona: "bounded implementer" }],
        steps: [{
          id: "implement",
          agent: "implementer",
          input: "Apply the approved fixture change.",
          timeoutMinutes: 10,
          kind: "AGENT",
        }],
      },
      workOrder: {
        title: workOrder.title,
        desiredOutcome: workOrder.desiredOutcome,
        context: workOrder.context,
        requirements: workOrder.requirements,
        acceptanceCriteria: workOrder.acceptanceCriteria,
        constraints: mission.constraints,
        positiveConstraints: workOrder.positiveConstraints,
        negativeConstraints: workOrder.negativeConstraints,
        changeBudget: workOrder.changeBudget,
        verificationContract: workOrder.verificationContract,
        autonomyLevel: workOrder.autonomyLevel,
        riskLevel: workOrder.riskLevel,
        requiredApprovals: workOrder.requiredApprovals,
        sourceOfTruthRefs: mission.sourceOfTruthRefs,
      },
      agentBindings: [{
        workflowAgentId: "implementer",
        agentVersionId: "agent-version-bounded-v1",
        agentVersion: 1,
        genomeHash: `sha256:${"1".repeat(64)}`,
        promptBundleHash: `sha256:${"2".repeat(64)}`,
        toolManifestHash: `sha256:${"3".repeat(64)}`,
        model: { provider: "openai", modelId: "gpt-5.6-terra" },
      }],
      codeScopes: [{
        id: "scope-fixture",
        slug: "fixture",
        includePaths: ["src/**", "tests/**", "scripts/**", "docs/**"],
        excludePaths: [".git/**"],
      }],
      allowedTools: ["read", "write", "shell"],
      routedModel: "gpt-5.6-terra",
      maxAttempts: 3,
      maxCostUsd: 3,
      maxRuntimeMinutes: 10,
      initialContext: finalContext.contextPackage,
      harnessIsolation: "WORKSPACE_WRITE",
    });
    expect(executionManifest.manifest.causation).toMatchObject({
      workflowRunId: finalAttemptId,
      workOrderId: WORK_ORDER_ID,
      factoryDefinitionVersionId: FACTORY_VERSION_ID,
    });
    expect(executionManifest.manifest.repository.baseSha).toBe(baseSha);
    expect(executionManifest.manifest.harness.pullRequestAuthority).toBe("CONTROL_PLANE_ONLY");
    expect(executionManifest.manifest.sandbox?.credentialGrants[0]).toMatchObject({
      secretValueIncluded: false,
      githubAuthority: "NONE",
      providerAuthority: "NONE",
    });

    const sandboxResult = sandboxBundle({
      profile,
      attemptId: finalAttemptId,
      leaseId: currentLease.lease.leaseId,
      manifestDigest: executionManifest.digest,
      sourceSha: advancedHeadSha,
      modelRouteDigest,
      providerRoute: modelRouteSnapshot.providerRoute,
    });
    const sandboxProvider = new FakeSandboxProvider({
      result: encodeSandboxResultBundle(sandboxResult),
      now: () => FIXED_NOW,
    });
    const sandboxCredentials = new FakeSandboxCredentialBroker(() => FIXED_NOW);
    const sandboxJournal = new InMemoryRemoteSandboxJournal();
    const sandboxRuntime = new RemoteSandboxRuntime(
      sandboxProvider,
      sandboxCredentials,
      sandboxJournal,
      () => FIXED_NOW,
      async () => undefined,
    );
    const sandboxExecution = await sandboxRuntime.execute({
      projectId: PROJECT_ID,
      workOrderId: WORK_ORDER_ID,
      workOrderRevisionNumber: workOrder.currentRevisionNumber,
      workflowRunId: finalAttemptId,
      attemptId: finalAttemptId,
      attemptLeaseId: currentLease.lease.leaseId,
      executionManifest: executionManifest.manifest,
      manifestDigest: executionManifest.digest,
      sourceSha: advancedHeadSha,
      profile,
      repositoryBundle: Buffer.from("deterministic-fixture-bundle"),
      supervisorSource: "// deterministic qualification supervisor",
      executor: {
        command: "fixture-executor",
        args: ["run"],
        provider: modelRouteSnapshot.provider,
        model: "gpt-5.6-terra",
        modelRouteDigest,
        providerRoute: modelRouteSnapshot.providerRoute,
        prompt: "Execute the frozen fixture WorkOrder.",
        allowedPaths: ["src/**", "tests/**", "scripts/**", "docs/**"],
        timeoutMs: 60_000,
      },
    });
    expect(sandboxExecution.termination.resourceAbsent).toBe(true);
    expect(sandboxCredentials.active.size).toBe(0);
    expect(sandboxJournal.events.at(-1)?.type).toBe("SANDBOX_TERMINATED");
    expect(sandboxJournal.issuedCredentials[0]).not.toHaveProperty("secret");

    const finalLineage = await buildVerificationLineage({
      repositoryRoot,
      baseSha,
      candidateSha: advancedHeadSha,
      sourceAttemptId: finalAttemptId,
      verificationAttemptId: "attempt-verification-current-head",
      workOrder,
      readyAt: FIXED_NOW + 90,
      expectVerified: true,
      sourceLeaseId: currentLease.lease.leaseId,
    });
    const finalProviderHead = providerHeadFor(finalLineage, advancedHeadSha, FIXED_NOW + 100);
    const finalEligibility = evaluateCurrentVerificationEligibility(currentnessInput({
      workOrder,
      lineages: [failedLineage, repairedLineage, finalLineage],
      providerHeads: [finalProviderHead],
      now: FIXED_NOW + 110,
    }));
    expect(finalEligibility, finalEligibility.reasons.join(" ")).toMatchObject({
      eligible: true,
      current: true,
      sourceAttemptId: finalAttemptId,
      candidateRevision: advancedHeadSha,
      verificationAttemptId: finalLineage.verificationAttempt.id,
      verificationRunId: finalLineage.result.id,
      verificationReceiptId: finalLineage.receipt.id,
      verificationPlanDigest: finalLineage.plan.planDigest,
    });
    expect(finalLineage.subject.sourceAttemptId).toBe(finalAttemptId);
    expect(finalLineage.plan.verificationSubject.digest).toBe(finalLineage.subject.digest);
    expect(finalLineage.verificationAttempt.id).not.toBe(finalAttemptId);
    expect(finalLineage.independence.passed).toBe(true);
    expect(finalLineage.evidence.every((item) =>
      item.verificationRunId === finalLineage.result.id
      && item.verificationSubjectId === finalLineage.subject.subjectId
      && item.verificationPlanDigest === finalLineage.plan.planDigest
    )).toBe(true);
    expect(finalLineage.receipt.evidenceEnvelopeIds).toEqual(
      finalLineage.evidence.map((item) => item.id),
    );

    const acceptanceProjection = evaluateAcceptance({
      riskLevel: "LOW",
      requiredApprovals: [],
      approvalDecisions: [],
      acceptanceCriteria: workOrder.acceptanceCriteria.map((criterion: any) => ({
        ...criterion,
        status: "PASS",
      })),
      verificationReceipts: workOrder.acceptanceCriteria.map((criterion: any, index: number) => ({
        receiptScope: "ACCEPTANCE_CRITERION",
        acceptanceCriterionId: criterion.id,
        status: "PASSED",
        _creationTime: index + 1,
      })),
      now: FIXED_NOW + 110,
    });
    expect(acceptanceProjection.eligible).toBe(true);
    expect(finalEligibility.eligible).toBe(true);

    const learningSignals = failedAttempts.map((attempt, index) => ({
      projectId: PROJECT_ID,
      repositoryKey: REPOSITORY_KEY,
      signalType: "HUMAN_CORRECTION" as const,
      deterministicKey: "test:listing-fee-deterministic-gate",
      evidenceFingerprint: attempt.immutableSnapshot,
      evidenceRefs: [`attempt:${attempt.attemptId}`, `candidate:${attempt.candidateSha}`],
      observedAt: FIXED_NOW + index,
      confidence: 1,
      severity: "MEDIUM" as const,
      reason: "The same deterministic listing-fee failure required a governed correction.",
      acceptanceAuthority: false as const,
      observedModelCalls: 0,
    }));
    const learning = aggregateLearningSignals(
      [...learningSignals, learningSignals[0]],
      { minimumOccurrences: 3, maximumEvidenceItems: 20, windowStart: FIXED_NOW - 1 },
    );
    expect(learning.clusters).toHaveLength(1);
    expect(learning.clusters[0]).toMatchObject({
      occurrenceCount: 3,
      qualifiesForCandidate: true,
      acceptanceAuthority: false,
    });
    expect(learning.duplicatesSuppressed).toBe(1);
    expect(learning.candidates).toEqual([expect.objectContaining({
      candidateType: "ADD_DETERMINISTIC_GATE",
      acceptanceAuthority: false,
    })]);
    const isolatedLearning = aggregateLearningSignals([
      learningSignals[0],
      { ...learningSignals[1], repositoryKey: "sellerfi/other-fixture" },
    ], { minimumOccurrences: 3, maximumEvidenceItems: 20, windowStart: FIXED_NOW - 1 });
    expect(new Set(isolatedLearning.clusters.map((cluster) => cluster.clusterKey)).size).toBe(2);

    const promotionRecommendation = recommendImprovementPromotion({
      baseline: {
        sampleSize: 3,
        successRate: 0,
        firstPassVerificationRate: 0,
        averageRetries: 1,
        deterministicFailures: 3,
      },
      candidate: {
        sampleSize: 3,
        successRate: 1,
        firstPassVerificationRate: 1,
        averageRetries: 0,
        deterministicFailures: 0,
      },
    });
    expect(promotionRecommendation).toMatchObject({
      recommendation: "PROMOTION_RECOMMENDED",
      sampleLabel: "LOW_SAMPLE",
      autoPromote: false,
    });
    const learningContinuation = {
      candidateId: "improvement-candidate-listing-fee-gate",
      review: { status: "APPROVED_FOR_EXPERIMENT", actorType: "HUMAN" },
      experiment: { id: "experiment-listing-fee-gate", status: "COMPLETED", sampleLabel: "LOW_SAMPLE" },
      promotionRecommendation,
      promotedMission: { id: "mission-learning-followup", createdBy: "operator-author" },
      submittedPlan: { id: "plan-learning-followup", status: "PROPOSED", submittedBy: "operator-author" },
      releasedWorkOrderIds: [] as string[],
    };
    expect(learningContinuation.releasedWorkOrderIds).toEqual([]);

    const authority = await inspectAuthorityBoundaries();
    expect(authority.workOrderAcceptedEventWriters).toEqual(["workOrders.ts"]);
    expect(authority.learningHasAcceptanceMutation).toBe(false);
    expect(authority.observabilityHasAcceptanceMutation).toBe(false);
    expect(authority.planSelfApprovalGuard).toBe(true);
    expect(authority.sandboxHasGithubAuthority).toBe(false);

    const evidencePacket = {
      schemaVersion: "system-factory-e2e-qualification/v2",
      result: "SYSTEM QUALIFIED V2 WITH KNOWN LIMITATIONS",
      baseSha: process.env.MC_QUALIFICATION_BASE_SHA ?? "resolved-by-top-level-command",
      runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
      hardeningV1: {
        decision: "HARDENING V1 PASSED",
        productionAdvisories: { before: { moderate: 4, high: 0, critical: 0 }, after: { moderate: 3, high: 0, critical: 0 } },
        completeGraphAdvisories: { before: { low: 4, moderate: 9, high: 0, critical: 0 }, after: { low: 2, moderate: 4, high: 0, critical: 0 } },
        dependencyGate: "PASS",
        credentialGate: "PASS",
        releaseConfigurationGate: "PASS",
      },
      fixture: {
        repository: REPOSITORY_KEY,
        baseSha,
        baseTreeSha,
        finalCandidateSha: advancedHeadSha,
        definitionOfDone: assertion.passCondition,
      },
      lineage: {
        projectConstitutionRevisionId: CONSTITUTION_REVISION_ID,
        projectConstitutionDigest: constitutionDigest,
        failedSpecRevisionId: SPEC_REVISION_1_ID,
        failedSpecDigest: missionSpecDigest(specRevision1),
        finalizedSpecRevisionId: SPEC_REVISION_2_ID,
        finalizedSpecDigest: specRevision2Digest,
        specQualityEvaluationId: SPEC_EVALUATION_2_ID,
        currentSpecRevisionId: SPEC_REVISION_3_ID,
        currentSpecDigest: specRevision3Digest,
        boundSpecRemainedRevision: SPEC_REVISION_2_ID,
        specConsistencyDigest: specPlanAnalysis.digest,
        requirementsCoverageDigest: specPlanAnalysis.coverage.digest,
        missionId: MISSION_ID,
        planId: PLAN_ID,
        planRevision,
        planApproval: {
          submittedBy: submittedPlan.submittedBy,
          approvedBy: approvedPlan.approvedBy,
          approvedRevision: approvedPlan.approvedRevision,
        },
        qualityContractDigest: qualityContract.digest,
        workOrderId: WORK_ORDER_ID,
        workOrderRevision: workOrder.currentRevisionNumber,
        recipe: blueprint.workflowId,
        factoryVersionId: FACTORY_VERSION_ID,
        verificationFactoryVersionId: VERIFICATION_FACTORY_VERSION_ID,
        contextPackageId: finalContext.contextPackage.id,
        worker: currentWorkerIdentity,
        leaseId: currentLease.lease.leaseId,
        sourceAttemptIds: [...failedAttempts.map((item) => item.attemptId), repairedLineage.sourceAttempt.id, finalAttemptId],
        executionManifestDigest: executionManifest.digest,
        executionBackend: "executionBackend" in executionManifest.manifest
          ? executionManifest.manifest.executionBackend
          : executionManifest.manifest.harness.executionBackend,
        candidateShas: [...failedAttempts.map((item) => item.candidateSha), repairedCandidateSha, advancedHeadSha],
        verificationAttemptIds: [failedLineage.verificationAttempt.id, repairedLineage.verificationAttempt.id, finalLineage.verificationAttempt.id],
        verificationSubjectId: finalLineage.subject.subjectId,
        verificationPlanId: finalLineage.plan.planId,
        verificationPlanDigest: finalLineage.plan.planDigest,
        verificationRunId: finalLineage.result.id,
        evidenceIds: finalLineage.evidence.map((item) => item.id),
        receiptId: finalLineage.receipt.id,
        qualityGateState: qualityGateStateForCurrentEligibility(finalEligibility),
        providerPullRequestId: finalLineage.subject.pullRequest.providerPullRequestId,
        providerPullRequestUrl: finalLineage.subject.pullRequest.url,
        providerHeadSha: finalProviderHead.headSha,
        acceptanceEvent: "WORK_ORDER_ACCEPTED via workOrders.accept only",
        acceptanceActor: "human operator",
      },
      harnessLineage: {
        execution: {
          adapter: CODEX_V1_HARNESS_MANIFEST.identity.adapterId,
          version: CODEX_V1_HARNESS_MANIFEST.identity.adapterVersion,
          capabilityManifestSha256: CODEX_CAPABILITY_MANIFEST_SHA256,
          effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
          executionBackend: "executionBackend" in executionManifest.manifest
            ? executionManifest.manifest.executionBackend
            : executionManifest.manifest.harness.executionBackend,
        },
        genericAdmission: {
          contractVersion: "generic-harness-contract/v1",
          adapter: DEEPSEEK_V1_HARNESS_MANIFEST.identity.adapterId,
          version: DEEPSEEK_V1_HARNESS_MANIFEST.identity.adapterVersion,
          capabilityManifestSha256: DEEPSEEK_CAPABILITY_MANIFEST_SHA256,
          effectiveConfigSha256: DEEPSEEK_V1_HARNESS_MANIFEST.effectiveConfigSha256,
          provider: "local-ollama",
          model: "qwen3.5:35b-a3b-q8_0",
          executionBackend: "persistent-worker",
          maturity: DEEPSEEK_V1_HARNESS_MANIFEST.admission.maturity,
          exactAdmission: genericHarnessAdmission.exact,
        },
      },
      observability: {
        sourceTraceId: `trace:${finalAttemptId}`,
        verificationTraceId: `trace:${finalLineage.verificationAttempt.id}`,
        sourceWorkflowRunId: finalAttemptId,
        verificationWorkflowRunId: finalLineage.verificationAttempt.id,
        sandboxLifecycleEvents: sandboxJournal.events.map((event) => event.type),
        phases: {
          human: ["plan approval", "improvement review", "workOrders.accept"],
          agent: ["bounded fake-provider execution"],
          code: ["context retrieval", "deterministic gates", "independent verification", "exact-current eligibility"],
        },
      },
      failureInjection: {
        staleLease: "PASS",
        incompleteSpecRevisionBlocked: "PASS",
        specRepositoryScopeMismatchBlocked: "PASS",
        newerSpecRevisionDidNotRebindApprovedPlanOrWorkOrder: "PASS",
        harnessManifestDigestMismatchBlocked: "PASS",
        harnessUnsupportedModelBlocked: "PASS",
        harnessUnsupportedBackendBlocked: "PASS",
        candidatePrHeadMismatch: "PASS",
        verificationFailure: "PASS",
        retryNewAttempt: "PASS",
        contextMiss: "PASS",
        deterministicGateFailure: "PASS",
        sandboxTeardownFailure: "PASS (focused regression suite)",
        repeatedCorrectionLearning: "PASS",
        improvementCandidateCannotSelfPromote: "PASS",
      },
      learning: {
        signalCount: learningSignals.length,
        signalType: learningSignals[0].signalType,
        contextMissSignalType: contextMiss.signal.signalType,
        duplicateCount: learning.duplicatesSuppressed,
        clusterKey: learning.clusters[0].clusterKey,
        candidateId: learningContinuation.candidateId,
        candidateType: learning.candidates[0].candidateType,
        review: learningContinuation.review,
        experimentId: learningContinuation.experiment.id,
        experimentStatus: learningContinuation.experiment.status,
        promotionRecommendation,
        promotedMissionId: learningContinuation.promotedMission.id,
        submittedPlanId: learningContinuation.submittedPlan.id,
        submittedPlanStatus: learningContinuation.submittedPlan.status,
        releasedWorkOrderIds: learningContinuation.releasedWorkOrderIds,
        modelCalls: 0,
      },
      authority,
      performance: {
        durationMs: Date.now() - qualificationStartedAt,
        sourceGateDurationMs: [...failedAttempts.map((attempt) => attempt.gate), repairedGate]
          .reduce((total, gate) => total + gate.durationMs, 0),
        verificationDurationMs: [failedLineage, repairedLineage, finalLineage]
          .reduce(
            (total, lineage) => total + lineage.verificationExecution.checks
              .reduce((checkTotal, check) => checkTotal + check.durationMs, 0),
            0,
          ),
        sandboxProviderRuntimeMs: sandboxResult.usage.providerRuntimeMs,
        deterministicGateRuns: failedAttempts.length + 1 + 3,
        sourceAttempts: failedAttempts.length + 2,
        sourceRetries: failedAttempts.length + 1,
        verificationAttempts: 3,
        agentSteps: 1,
        modelCalls: 0,
        tokens: null,
        costUsd: 0,
      },
      limitations: [
        "Remote Sandbox uses FakeSandboxProvider; live exe.dev remains Preview / Not Live Certified.",
        "PR #89 two-company live identity proof remains deferred by instruction.",
        "DeepSeek generic-harness admission is exact but remains experimental and explicitly routed; autonomous model/harness routing was not started.",
        "Loom production admission remains deferred by instruction.",
        "The provider pull-request identity is deterministic fixture lineage; no external product repository is mutated.",
      ],
    };
    requireQualificationRuntimeContractIdentity({
      canonicalRuntimeContractVersion: RUNTIME_CONTRACT_VERSION,
      evidenceRuntimeContractVersion: evidencePacket.runtimeContractVersion,
    });
    await writeEvidencePacket(evidencePacket);
  }, 60_000);
});

function requireQualificationRuntimeContractIdentity({
  canonicalRuntimeContractVersion,
  evidenceRuntimeContractVersion,
}: {
  canonicalRuntimeContractVersion: unknown;
  evidenceRuntimeContractVersion: unknown;
}) {
  if (
    typeof canonicalRuntimeContractVersion !== "number"
    || !Number.isSafeInteger(canonicalRuntimeContractVersion)
    || canonicalRuntimeContractVersion <= 0
    || typeof evidenceRuntimeContractVersion !== "number"
    || !Number.isSafeInteger(evidenceRuntimeContractVersion)
    || evidenceRuntimeContractVersion <= 0
  ) {
    throw new Error("Qualification runtime contract identity is unavailable.");
  }
  if (canonicalRuntimeContractVersion !== evidenceRuntimeContractVersion) {
    throw new Error(
      `Qualification runtime contract identity mismatch: canonical v${canonicalRuntimeContractVersion}, evidence v${evidenceRuntimeContractVersion}.`,
    );
  }
}

async function createFixtureRepository() {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "mc-system-factory-e2e-v2-"));
  cleanupDirectories.push(repositoryRoot);
  await Promise.all([
    mkdir(path.join(repositoryRoot, "src"), { recursive: true }),
    mkdir(path.join(repositoryRoot, "tests"), { recursive: true }),
    mkdir(path.join(repositoryRoot, "scripts"), { recursive: true }),
    mkdir(path.join(repositoryRoot, "docs"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(repositoryRoot, "package.json"), JSON.stringify({
      name: "sellerfi-system-factory-qualification-fixture",
      private: true,
      type: "module",
      scripts: {
        lint: "node scripts/lint.mjs",
        typecheck: "node scripts/typecheck.mjs",
        test: "node scripts/test.mjs",
        verify: "node scripts/verify.mjs",
      },
    }, null, 2) + "\n"),
    writeFile(path.join(repositoryRoot, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        noEmit: true,
      },
      include: ["src/**/*.ts"],
    }, null, 2) + "\n"),
    writeFile(
      path.join(repositoryRoot, "src/listingFee.ts"),
      "export function calculateListingFee(amountCents: number): number {\n  return Math.round(amountCents * 0.04);\n}\n",
    ),
    writeFile(
      path.join(repositoryRoot, "tests/listingFee.test.ts"),
      "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport { calculateListingFee } from '../src/listingFee.ts';\n\ntest('charges the approved five percent listing fee', () => {\n  assert.equal(calculateListingFee(10_000), 500);\n  assert.equal(calculateListingFee(0), 0);\n});\n",
    ),
    writeFile(
      path.join(repositoryRoot, "docs/listing-fee-policy.md"),
      "# Listing fee policy\n\nThe marketplace listing fee is exactly five percent of the listing amount, rounded to integer cents.\n",
    ),
    writeFile(
      path.join(repositoryRoot, "AGENTS.md"),
      "# Fixture instructions\n\nKeep changes inside this fixture. Run `node scripts/verify.mjs`. Do not publish or merge.\n",
    ),
    writeFile(path.join(repositoryRoot, "scripts/lint.mjs"), lintScript()),
    writeFile(path.join(repositoryRoot, "scripts/typecheck.mjs"), typecheckScript()),
    writeFile(path.join(repositoryRoot, "scripts/test.mjs"), testScript()),
    writeFile(path.join(repositoryRoot, "scripts/verify.mjs"), verifyScript()),
  ]);
  await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: repositoryRoot });
  await commit(repositoryRoot, "fixture base", 0);
  return repositoryRoot;
}

function qualificationRepoRoot() {
  return path.resolve(import.meta.dirname, "../../../..");
}

function lintScript() {
  return `import { readFile } from "node:fs/promises";\nconst files = ["src/listingFee.ts", "tests/listingFee.test.ts"];\nfor (const file of files) {\n  const content = await readFile(file, "utf8");\n  if (/\\t|[ \\t]+$/m.test(content)) {\n    console.error(\`lint failed: \${file}\`);\n    process.exit(1);\n  }\n}\n`;
}

function typecheckScript() {
  return `import { spawnSync } from "node:child_process";\nconst result = spawnSync("tsc", ["--project", "tsconfig.json", "--noEmit"], { cwd: process.cwd(), encoding: "utf8" });\nprocess.stdout.write(result.stdout ?? "");\nprocess.stderr.write(result.stderr ?? "");\nprocess.exit(result.status ?? 1);\n`;
}

function testScript() {
  return `import { spawnSync } from "node:child_process";\nconst result = spawnSync("tsx", ["--test", "tests/listingFee.test.ts"], { cwd: process.cwd(), encoding: "utf8" });\nprocess.stdout.write(result.stdout ?? "");\nprocess.stderr.write(result.stderr ?? "");\nprocess.exit(result.status ?? 1);\n`;
}

function verifyScript() {
  return `import { spawnSync } from "node:child_process";\nconst gates = ["lint.mjs", "typecheck.mjs", "test.mjs"];\nfor (const gate of gates) {\n  const result = spawnSync(process.execPath, [\`scripts/\${gate}\`], { cwd: process.cwd(), env: process.env, encoding: "utf8" });\n  process.stdout.write(result.stdout ?? "");\n  process.stderr.write(result.stderr ?? "");\n  if (result.status !== 0) process.exit(result.status ?? 1);\n}\n`;
}

async function commit(repositoryRoot: string, message: string, sequence: number, allowEmpty = false) {
  const date = new Date(FIXED_NOW + sequence * 1_000).toISOString();
  await execFileAsync("git", ["add", "-A"], { cwd: repositoryRoot });
  const args = [
    "-c", "user.name=Mission Control Qualification",
    "-c", "user.email=qualification@example.invalid",
    "commit", "-qm", message,
  ];
  if (allowEmpty) args.push("--allow-empty");
  await execFileAsync("git", args, {
    cwd: repositoryRoot,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

async function gitValue(repositoryRoot: string, args: string[]) {
  return (await execFileAsync("git", args, { cwd: repositoryRoot })).stdout.trim();
}

async function runFixtureGate(repositoryRoot: string): Promise<GateResult> {
  const startedAt = Date.now();
  try {
    const result = await execFileAsync(process.execPath, ["scripts/verify.mjs"], {
      cwd: repositoryRoot,
      env: { ...process.env, MC_QUALIFICATION_REPO_ROOT: qualificationRepoRoot() },
      maxBuffer: 5 * 1024 * 1024,
    });
    const durationMs = Date.now() - startedAt;
    return {
      passed: true,
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      digest: canonicalHash({ exitCode: 0, stdout: result.stdout, stderr: result.stderr }),
    };
  } catch (error: any) {
    const stdout = String(error?.stdout ?? "");
    const stderr = String(error?.stderr ?? error?.message ?? "");
    const exitCode = Number(error?.code ?? 1);
    const durationMs = Date.now() - startedAt;
    return {
      passed: false,
      exitCode: Number.isFinite(exitCode) ? exitCode : 1,
      stdout,
      stderr,
      durationMs,
      digest: canonicalHash({ exitCode, stdout, stderr }),
    };
  }
}

async function buildVerificationLineage(input: {
  repositoryRoot: string;
  baseSha: string;
  candidateSha: string;
  sourceAttemptId: string;
  verificationAttemptId: string;
  workOrder: any;
  readyAt: number;
  expectVerified: boolean;
  sourceLeaseId?: string;
}) {
  const verificationRoot = await mkdtemp(path.join(tmpdir(), "mc-system-factory-verify-v2-"));
  cleanupDirectories.push(verificationRoot);
  const checkoutRoot = path.join(verificationRoot, "checkout");
  await execFileAsync("git", ["clone", "-q", "--no-local", input.repositoryRoot, checkoutRoot]);
  await execFileAsync("git", ["checkout", "-q", "--detach", input.candidateSha], { cwd: checkoutRoot });
  const initialStatus = await gitValue(checkoutRoot, ["status", "--porcelain"]);
  const treeSha = await gitValue(checkoutRoot, ["rev-parse", "HEAD^{tree}"]);
  const changedFiles = (await gitValue(checkoutRoot, ["diff", "--name-only", `${input.baseSha}..${input.candidateSha}`]))
    .split("\n")
    .filter(Boolean);
  const verificationExecution = await executeIndependentVerification({
    workflowRunId: input.verificationAttemptId,
    workOrderId: WORK_ORDER_ID,
    workOrderRevisionNumber: input.workOrder.currentRevisionNumber,
    title: `Verify ${input.candidateSha.slice(0, 12)}`,
    specification: input.workOrder,
    repositoryRoot: checkoutRoot,
    candidate: {
      sourceRevision: input.baseSha,
      candidateRevision: input.candidateSha,
      changedFiles,
      deletedFiles: [],
      linesAdded: changedFiles.length,
      linesDeleted: 0,
      diff: await gitValue(checkoutRoot, ["diff", "--no-ext-diff", `${input.baseSha}..${input.candidateSha}`]),
    },
  });
  expect(
    verificationExecution.verdict === "VERIFIED",
    JSON.stringify(verificationExecution),
  ).toBe(input.expectVerified);
  expect(await gitValue(checkoutRoot, ["status", "--porcelain"])).toBe("");

  const subject = createGitVerificationSubject({
    version: 1,
    kind: "GIT_CANDIDATE",
    workOrderId: WORK_ORDER_ID,
    workOrderRevisionNumber: input.workOrder.currentRevisionNumber,
    verificationContractDigest: input.workOrder.verificationContractDigest,
    sourceAttemptId: input.sourceAttemptId,
    repositoryId: REPOSITORY_ID,
    provider: "GITHUB",
    providerRepositoryId: "provider-repository-system-factory-v2",
    candidateSha: input.candidateSha,
    treeSha,
    pullRequest: {
      providerPullRequestId: "provider-pr-system-factory-v2",
      number: 1,
      url: "https://github.invalid/sellerfi/system-factory-qualification-fixture/pull/1",
      baseRef: "main",
      headRef: "mc/system-factory-e2e-v2",
      headSha: input.candidateSha,
      draftAtPublication: true,
    },
  });
  const sourceAttempt = {
    id: input.sourceAttemptId,
    _id: input.sourceAttemptId,
    repositoryId: REPOSITORY_ID,
    attemptPurpose: "IMPLEMENTATION" as const,
    status: "COMPLETED",
    candidateReadyAt: input.readyAt,
    qualityContractDigest: input.workOrder.qualityContractDigest,
    verificationSubject: subject,
    executorInvocationId: `executor:${input.sourceAttemptId}`,
    leaseId: input.sourceLeaseId ?? `lease:${input.sourceAttemptId}`,
    worktree: input.repositoryRoot,
  };
  const plan = compilePolicyV2VerificationPlan({
    now: input.readyAt + 1,
    workOrder: input.workOrder,
    sourceAttempt,
    verificationAttemptId: input.verificationAttemptId,
    verificationSubject: subject,
    factoryDefinitionId: "factory-definition-independent-verification",
    factoryDefinitionVersionId: VERIFICATION_FACTORY_VERSION_ID,
    executorInvocationId: `executor:${input.verificationAttemptId}`,
  });
  const tuple: VerificationIdentityTuple = {
    workOrderId: WORK_ORDER_ID,
    workOrderRevisionNumber: input.workOrder.currentRevisionNumber,
    verificationContractDigest: input.workOrder.verificationContractDigest,
    sourceAttemptId: input.sourceAttemptId,
    verificationSubjectDigest: subject.digest,
  };
  const verificationAttempt = {
    id: input.verificationAttemptId,
    attemptPurpose: "VERIFICATION" as const,
    factoryPurpose: "VERIFICATION" as const,
    status: "COMPLETED",
    createdAt: input.readyAt + 1,
    qualityContractDigest: input.workOrder.qualityContractDigest,
    factoryDefinitionVersionId: VERIFICATION_FACTORY_VERSION_ID,
    executorInvocationId: `executor:${input.verificationAttemptId}`,
    leaseId: `lease:${input.verificationAttemptId}`,
    worktree: checkoutRoot,
    binding: tuple,
    verificationAttemptBinding: tuple,
  };
  const verificationRunId = `verification-run:${input.verificationAttemptId}`;
  const isolationWithoutDigest = {
    mode: "FRESH_CLONE" as const,
    sandboxId: `sandbox:${input.verificationAttemptId}`,
    subjectDigest: subject.digest,
    verifierRoot: checkoutRoot,
    sourceRoot: input.repositoryRoot,
    initialClean: initialStatus === "",
    finalSubjectMatch: await gitValue(checkoutRoot, ["rev-parse", "HEAD"]) === input.candidateSha,
    repositoryId: REPOSITORY_ID,
    headSha: input.candidateSha,
    treeSha,
  };
  const isolation = {
    ...isolationWithoutDigest,
    rootBindingDigest: verificationIsolationBindingDigest(isolationWithoutDigest),
  };
  const expected = {
    ...tuple,
    verificationAttemptId: input.verificationAttemptId,
    verificationRunId,
    verificationSubjectId: subject.subjectId,
    verificationPlanId: plan.planId,
    verificationPlanDigest: plan.planDigest,
  };
  const independence = deriveVerificationIndependence({
    expected,
    subject,
    sourceAttempt,
    verificationAttempt,
    factoryVersion: { id: VERIFICATION_FACTORY_VERSION_ID, purpose: "VERIFICATION" },
    verificationRun: {
      id: verificationRunId,
      workflowRunId: input.verificationAttemptId,
      ...tuple,
      verificationSubjectId: subject.subjectId,
      verificationPlanId: plan.planId,
      verificationPlanDigest: plan.planDigest,
    },
    isolation,
    reportCapability: "verification:report",
    authorityStatus: verificationExecution.checks.some(
      (check) => check.verifierId === "factory-verification-authority" && check.status === "PASS",
    ) ? "PASS" : "FAIL",
  });
  expect(independence.passed).toBe(true);

  const evidenceInputs = plan.requiredEvidence.map((required) => {
    const executionCheck = verificationExecution.checks.find((check) => check.checkId === required.id);
    const passed = executionCheck?.status === "PASS";
    return {
      id: `evidence:${input.verificationAttemptId}:${required.id}`,
      requiredEvidenceIds: [required.id],
      requirementIds: required.requirementIds,
      requiredRiskIds: required.requiredRiskIds,
      discoveredRiskIds: [] as string[],
      conclusion: passed ? "PASSED" as const : "FAILED" as const,
      usable: true,
    };
  });
  const decision = evaluateVerificationDecision({
    plan,
    evidence: evidenceInputs,
    runStatus: "COMPLETED",
    independence,
    requireHumanReview: false,
    evaluatedAt: input.readyAt + 2,
  });
  expect(decision.verdict === "VERIFIED").toBe(input.expectVerified);
  const result = {
    id: verificationRunId,
    workflowRunId: input.verificationAttemptId,
    ...tuple,
    status: "COMPLETED" as const,
    verdict: decision.verdict!,
    independenceValid: independence.passed,
    verificationPlanId: plan.planId,
    verificationPlanDigest: plan.planDigest,
    decisionInputDigest: decision.decisionInputDigest,
    createdAt: input.readyAt + 1,
    completedAt: input.readyAt + 2,
  };
  const evidence = evidenceInputs.map((item, index) => ({
    id: item.id,
    workflowRunId: input.verificationAttemptId,
    verificationRunId,
    verificationAttemptId: input.verificationAttemptId,
    verificationSubjectId: subject.subjectId,
    verificationPlanId: plan.planId,
    verificationPlanDigest: plan.planDigest,
    ...tuple,
    recordedAt: input.readyAt + 3 + index,
  }));
  const receipt = {
    id: `receipt:${input.verificationAttemptId}`,
    verificationRunId,
    verificationAttemptId: input.verificationAttemptId,
    verificationPlanId: plan.planId,
    verificationPlanDigest: plan.planDigest,
    verificationSubjectId: subject.subjectId,
    evidenceEnvelopeIds: evidence.map((item) => item.id),
    ...tuple,
    status: input.expectVerified ? "PASSED" as const : "FAILED" as const,
    verdict: decision.verdict!,
    independenceValid: independence.passed,
    decisionInputDigest: decision.decisionInputDigest,
    recordedAt: input.readyAt + 10,
    validUntil: input.readyAt + 1_000_000,
  };
  return {
    sourceAttempt,
    verificationAttempt,
    subject,
    plan,
    independence,
    decision,
    result,
    evidence,
    receipt,
    verificationExecution,
  };
}

function providerHeadFor(lineage: LineageResult, headSha: string, syncedAt: number) {
  return {
    provider: "GITHUB" as const,
    repositoryId: REPOSITORY_ID,
    installationId: "installation-system-factory-v2",
    sourceAttemptId: lineage.sourceAttempt.id,
    providerRepositoryId: lineage.subject.providerRepositoryId,
    providerPullRequestId: lineage.subject.pullRequest.providerPullRequestId,
    pullRequestNumber: lineage.subject.pullRequest.number,
    pullRequestUrl: lineage.subject.pullRequest.url,
    state: "OPEN" as const,
    draft: true,
    headSha,
    syncedAt,
    expiresAt: syncedAt + 1_000_000,
  };
}

function currentnessInput(input: {
  workOrder: any;
  lineages: LineageResult[];
  providerHeads: ReturnType<typeof providerHeadFor>[];
  now: number;
}) {
  return {
    workOrderId: WORK_ORDER_ID,
    workOrderRevisionNumber: input.workOrder.currentRevisionNumber,
    qualityContractDigest: input.workOrder.qualityContractDigest,
    verificationContractDigest: input.workOrder.verificationContractDigest,
    sourceAttempts: input.lineages.map((lineage) => lineage.sourceAttempt),
    verificationAttempts: input.lineages.map((lineage) => lineage.verificationAttempt),
    verificationResults: input.lineages.map((lineage) => lineage.result),
    verificationReceipts: input.lineages.map((lineage) => lineage.receipt),
    verificationEvidence: input.lineages.flatMap((lineage) => lineage.evidence),
    providerHeads: input.providerHeads,
    now: input.now,
  };
}

function memoryResult(input: {
  sourceType: FactoryMemoryResult["sourceType"];
  sourceId: string;
  content: string;
  revision: string;
  score?: number;
}): FactoryMemoryResult {
  return {
    chunkId: `chunk:${input.sourceId}`,
    documentId: `document:${input.sourceId}`,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    content: input.content,
    score: input.score ?? 1,
    retrievalMethod: "code",
    estimatedTokens: 50,
    authority: "authoritative",
    reason: "Exact fixture source selected by deterministic retrieval.",
    provenance: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      revision: input.revision,
      timestamp: FIXED_NOW,
      derivation: "authoritative",
    },
    acceptanceAuthority: false,
  };
}

function buildContextPackage(input: { workOrder: any; attemptId: string; candidateSha: string }) {
  const workOrderInput = {
    projectId: PROJECT_ID,
    repositoryId: REPOSITORY_ID,
    workOrderId: WORK_ORDER_ID,
    attemptId: input.attemptId,
    attemptPurpose: "IMPLEMENTATION" as const,
    primaryTraceId: `trace:${input.attemptId}`,
    qualityContractDigest: input.workOrder.qualityContractDigest,
    factoryVersionId: FACTORY_VERSION_ID,
    purpose: "SOFTWARE" as const,
    objective: input.workOrder.desiredOutcome,
    context: input.workOrder.context,
    acceptanceCriteria: input.workOrder.acceptanceCriteria.map((criterion: any) => ({
      id: criterion.id,
      description: criterion.title,
    })),
    changedPaths: ["src/listingFee.ts"],
  };
  const plan = planContextRetrieval(workOrderInput, { maxItems: 8, maxEstimatedTokens: 4_000 }, FIXED_NOW);
  const results = [
    memoryResult({ sourceType: "source-code", sourceId: "src/listingFee.ts", content: "Listing fee calculation source.", revision: input.candidateSha }),
    memoryResult({ sourceType: "test", sourceId: "tests/listingFee.test.ts", content: "Deterministic five-percent acceptance test.", revision: input.candidateSha }),
    memoryResult({ sourceType: "adr", sourceId: "docs/listing-fee-policy.md", content: "Authoritative five-percent listing fee policy.", revision: input.candidateSha }),
  ];
  const sufficiency = assessContextSufficiency({
    results,
    requiredSourceTypes: plan.requiredSourceTypes,
    budget: plan.budget,
  });
  const contextPackage = assembleContextPackage({
    workOrder: workOrderInput,
    plan,
    results,
    generatedAt: FIXED_NOW,
    metadata: { repositoryBaseSha: input.workOrder.baseSha },
  });
  return { plan, results, sufficiency, contextPackage };
}

function buildContextMiss(input: { workOrder: any; attemptId: string }) {
  const workOrderInput = {
    projectId: PROJECT_ID,
    repositoryId: REPOSITORY_ID,
    workOrderId: WORK_ORDER_ID,
    attemptId: input.attemptId,
    attemptPurpose: "IMPLEMENTATION" as const,
    primaryTraceId: `trace:${input.attemptId}:context-miss`,
    qualityContractDigest: input.workOrder.qualityContractDigest,
    factoryVersionId: FACTORY_VERSION_ID,
    purpose: "SOFTWARE" as const,
    objective: input.workOrder.desiredOutcome,
    context: input.workOrder.context,
    acceptanceCriteria: input.workOrder.acceptanceCriteria.map((criterion: any) => ({ id: criterion.id, description: criterion.title })),
    changedPaths: ["src/listingFee.ts"],
  };
  const plan = planContextRetrieval(workOrderInput, {}, FIXED_NOW);
  const results = [memoryResult({
    sourceType: "repository-document",
    sourceId: "docs/listing-fee-policy.md",
    content: "Policy exists, but source code was deliberately withheld for context-miss qualification.",
    revision: input.workOrder.baseSha,
  })];
  const sufficiency = assessContextSufficiency({
    results,
    requiredSourceTypes: plan.requiredSourceTypes,
    budget: plan.budget,
  });
  const signal = deriveObservationLearningSignals({
    type: "RETRIEVAL",
    name: "Factory Memory context.sufficiency",
    output: { resultCount: results.length },
    metadata: {
      domain: "FACTORY_MEMORY",
      factoryObservationType: "context.sufficiency",
      detail: { sufficient: false, missingSources: sufficiency.missingSourceTypes },
    },
  })[0];
  return { plan, results, sufficiency, signal };
}

function qualificationConstitution(): ProjectConstitutionContent {
  return {
    summary: "SellerFi changes must remain explicitly scoped, secure, independently verifiable, and attributable through one authority path.",
    principles: [
      { id: "PRINCIPLE-ARCH-001", title: "One authority path", description: "Approved intent compiles through the canonical Plan, WorkOrder, verification, publication, and acceptance chain.", category: "ARCHITECTURE" },
      { id: "PRINCIPLE-SEC-001", title: "No authority expansion", description: "Specifications, harnesses, Memory, and Learning have no release, publication, merge, or acceptance authority.", category: "SECURITY" },
      { id: "PRINCIPLE-TEST-001", title: "Exact evidence", description: "Acceptance requires independent evidence for the exact current candidate and frozen verification contract.", category: "TESTING" },
    ],
    requiredSpecSections: [
      "OUTCOME", "PERSONAS", "USER_STORIES", "REQUIREMENTS", "NON_FUNCTIONAL_REQUIREMENTS",
      "ACCEPTANCE_EXPECTATIONS", "VERIFICATION_EXPECTATIONS", "DEFINITION_OF_DONE", "NON_GOALS",
      "CONSTRAINTS", "RISKS", "REPOSITORY_SCOPE", "SOURCES",
    ],
    checklistItems: [
      { id: "CHECK-REQ-001", title: "Requirements are testable", description: "Every MUST requirement maps to observable acceptance.", classification: "REQUIREMENTS_QUALITY", required: true },
      { id: "CHECK-GOV-001", title: "Authority is bounded", description: "Execution and acceptance remain in their existing canonical stores.", classification: "GOVERNANCE_CONSTRAINT", required: true },
      { id: "CHECK-VERIFY-001", title: "Exact candidate is verified", description: "The frozen deterministic command produces durable evidence for the exact candidate.", classification: "EVIDENCE_BEARING_VERIFICATION", required: true },
    ],
  };
}

function qualificationSpecRevision2(): MissionSpecContent {
  return {
    problem: "SellerFi listing fee behavior can drift from approved marketplace policy without exact intent-to-evidence lineage.",
    outcome: "The fixture charges exactly five percent in integer cents and retains the finalized specification behind the accepted candidate.",
    measurableOutcomes: [{ id: "OUTCOME-001", description: "Every tested listing amount uses the approved five-percent fee.", metric: "Incorrect deterministic fee assertions", target: "0" }],
    personas: [{ id: "PERSONA-001", name: "SellerFi marketplace operator", needs: "Trustworthy policy implementation and exact acceptance evidence." }],
    userStories: [{
      id: "STORY-001",
      personaId: "PERSONA-001",
      title: "Trust listing fee delivery",
      outcome: "The operator can trace the approved fee policy to the exact verified candidate.",
      priority: "P0",
      scenarios: [{ id: "SCENARIO-001", given: "A finalized five-percent fee specification", when: "the governed Factory prepares a candidate", then: "the independent deterministic gate proves the exact current candidate before human acceptance" }],
    }],
    requirements: [{ id: "REQ-001", title: "Five-percent listing fee", description: "The listing fee must equal five percent of the listing amount rounded to integer cents.", priority: "MUST", sourceStoryIds: ["STORY-001"] }],
    nonFunctionalRequirements: [{ id: "NFR-001", title: "Fail-closed lineage", description: "Spec, Plan, WorkOrder, candidate, verification, and acceptance lineage must reject stale or mismatched identities.", category: "RELIABILITY", priority: "MUST", sourceStoryIds: ["STORY-001"] }],
    acceptanceExpectations: [
      { id: "AC-001", title: "Exact fee behavior", description: "The deterministic fixture proves five-percent fee outputs for the approved examples.", requirementIds: ["REQ-001"], verificationExpectationIds: ["VERIFY-001"], givenWhenThen: { given: "approved listing amounts", when: "the fee function runs", then: "the result is exactly five percent in integer cents" } },
      { id: "AC-002", title: "Exact lineage remains frozen", description: "A newer Spec revision cannot silently rebind the approved Plan, WorkOrder, or verification subject.", requirementIds: ["NFR-001"], verificationExpectationIds: ["VERIFY-001"] },
    ],
    verificationExpectations: [{ id: "VERIFY-001", title: "Independent fixture verification", description: "Run the frozen lint, typecheck, and test gate in an independent exact-candidate checkout.", method: "TEST", category: "CONTRACT_TEST", evidenceCategory: "TEST_RESULT", acceptanceExpectationIds: ["AC-001", "AC-002"], checklistItemIds: ["CHECK-VERIFY-001"], mandatory: true }],
    definitionOfDone: [{ id: "DOD-001", description: "Exact Spec-to-Plan-to-WorkOrder-to-verification lineage and fee behavior both pass.", acceptanceExpectationIds: ["AC-001", "AC-002"] }],
    constraints: [{ id: "CONSTRAINT-001", description: "The execution boundary may change only the isolated fixture and has no publication, merge, or acceptance authority." }],
    nonGoals: [{ id: "NONGOAL-001", description: "Create another orchestration, verification, publication, or acceptance path." }],
    risks: [{ id: "RISK-001", description: "A passing result could be applied to a stale pull-request head.", severity: "HIGH", mitigation: "Bind independent evidence and receipt eligibility to the exact current provider head." }],
    edgeCases: [{ id: "EDGE-001", description: "A third Spec revision exists after Plan approval.", expectedBehavior: "The approved Plan and released WorkOrder remain bound to finalized revision two." }],
    repositoryScope: { repositoryId: REPOSITORY_ID, codeScopeIds: ["scope-fixture"] },
    sources: [{ id: "SOURCE-001", kind: "DOC", label: "Listing fee policy", location: "docs/listing-fee-policy.md" }],
    clarifications: [{ id: "CLARIFY-001", findingCode: "MEASURABLE_OUTCOME_MISSING", question: "What proves the marketplace fee policy?", answer: "Zero incorrect deterministic fee assertions.", status: "RESOLVED" }],
    checklistDispositions: [
      { checklistItemId: "CHECK-REQ-001", classification: "REQUIREMENTS_QUALITY", disposition: "SATISFIED", reason: "Both MUST requirements map to acceptance." },
      { checklistItemId: "CHECK-GOV-001", classification: "GOVERNANCE_CONSTRAINT", disposition: "SATISFIED", reason: "Canonical authority boundaries remain unchanged." },
      { checklistItemId: "CHECK-VERIFY-001", classification: "EVIDENCE_BEARING_VERIFICATION", disposition: "SATISFIED", reason: "The frozen independent gate produces exact-candidate evidence." },
    ],
    recipe: { recipeId: "full-sdlc", specTemplateVersion: 1, checklistVersion: 1, repositoryType: "APPLICATION", teamType: "PRODUCT", riskProfile: "HIGH", productType: "MARKETPLACE" },
  };
}

function qualificationSpecRevision1(): MissionSpecContent {
  const revision2 = qualificationSpecRevision2();
  return {
    ...revision2,
    measurableOutcomes: [],
    acceptanceExpectations: revision2.acceptanceExpectations.map((item, index) =>
      index === 0 ? { ...item, verificationExpectationIds: [] } : item
    ),
    clarifications: [{ id: "CLARIFY-001", findingCode: "MEASURABLE_OUTCOME_MISSING", question: "What proves the marketplace fee policy?", status: "OPEN" }],
  };
}

function qualificationSpecRevision3(): MissionSpecContent {
  const revision2 = qualificationSpecRevision2();
  return {
    ...revision2,
    outcome: `${revision2.outcome} Revision three also documents narrow-viewport lineage inspection.`,
    edgeCases: [...revision2.edgeCases, { id: "EDGE-002", description: "The operator inspects lineage on a narrow viewport.", expectedBehavior: "Exact identifiers remain readable without rebinding historical records." }],
  };
}

function qualificationChecklistLineage(spec: MissionSpecContent) {
  const ids = (classification: MissionSpecContent["checklistDispositions"][number]["classification"]) =>
    spec.checklistDispositions
      .filter((item) => item.classification === classification)
      .map((item) => item.checklistItemId)
      .sort();
  return {
    requirementsQualityItemIds: ids("REQUIREMENTS_QUALITY"),
    governanceConstraintItemIds: ids("GOVERNANCE_CONSTRAINT"),
    evidenceBearingVerificationItemIds: ids("EVIDENCE_BEARING_VERIFICATION"),
  };
}

function qualifyGenericHarnessAdmission() {
  const worker: FactoryWorkerCandidate = {
    workerId: "worker-generic-harness-v2",
    status: "READY",
    dirty: false,
    capacity: { maxConcurrentRuns: 1, currentRuns: 0 },
    workerRuntime: {
      sessionId: "worker-generic-harness-session-v2",
      generation: 1,
      hostRuntimeType: "persistent-worker",
      executionBackends: ["persistent-worker", "remote-sandbox"],
      supportedExecutors: [{
        adapter: "deepseek-harness",
        version: "0.2.0",
        capabilityManifestSha256: DEEPSEEK_CAPABILITY_MANIFEST_SHA256,
        effectiveConfigSha256: DEEPSEEK_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        runtimeArtifact: DEEPSEEK_V1_RUNTIME_ARTIFACT,
        runtimeArtifactSha256: harnessRuntimeArtifactDigest(DEEPSEEK_V1_RUNTIME_ARTIFACT),
        capabilityManifest: DEEPSEEK_V1_HARNESS_MANIFEST,
        supportsCancel: true,
        supportsResume: true,
        isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
      }],
      sandboxCapabilities: ["git-worktree", "workspace-write"],
      repositoryAccess: [{ repositoryId: REPOSITORY_ID, access: "READ_WRITE" }],
      readiness: "READY",
      draining: false,
      lastHeartbeatAt: FIXED_NOW,
    },
  };
  const requirements = {
    repositoryId: REPOSITORY_ID,
    executor: {
      adapter: "deepseek-harness",
      version: "0.2.0",
      capabilityManifestSha256: DEEPSEEK_CAPABILITY_MANIFEST_SHA256,
      effectiveConfigSha256: DEEPSEEK_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifactSha256: harnessRuntimeArtifactDigest(DEEPSEEK_V1_RUNTIME_ARTIFACT),
    },
    provider: "local-ollama",
    model: "qwen3.5:35b-a3b-q8_0",
    harnessCapabilities: factoryHarnessCapabilityRequirements("WORKSPACE_WRITE"),
    isolation: "WORKSPACE_WRITE" as const,
    sandboxCapabilities: ["git-worktree", "workspace-write"],
    executionBackend: "persistent-worker" as const,
  };
  return {
    exact: factoryWorkerEligibility({ worker, requirements, activeWorkerLeaseCount: 0, now: FIXED_NOW }),
    manifestMismatch: factoryWorkerEligibility({
      worker,
      requirements: { ...requirements, executor: { ...requirements.executor, capabilityManifestSha256: `sha256:${"0".repeat(64)}` } },
      activeWorkerLeaseCount: 0,
      now: FIXED_NOW,
    }),
    modelMismatch: factoryWorkerEligibility({
      worker,
      requirements: { ...requirements, provider: "unsupported-provider", model: "unsupported-model" },
      activeWorkerLeaseCount: 0,
      now: FIXED_NOW,
    }),
    backendMismatch: factoryWorkerEligibility({
      worker,
      requirements: { ...requirements, executionBackend: "remote-sandbox" },
      activeWorkerLeaseCount: 0,
      now: FIXED_NOW,
    }),
  };
}

function eligibleWorker(): FactoryWorkerCandidate {
  return {
    workerId: "worker-system-factory-v2",
    status: "READY",
    dirty: false,
    capacity: { maxConcurrentRuns: 1, currentRuns: 0 },
    workerRuntime: {
      sessionId: "worker-session-current",
      generation: 2,
      hostRuntimeType: "local-macos",
      executionBackends: ["remote-sandbox"],
      supportedExecutors: [{
        adapter: "codex",
        version: "v1",
        capabilityManifestSha256: CODEX_CAPABILITY_MANIFEST_SHA256,
        effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
        runtimeArtifactSha256: harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT),
        capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
        supportsCancel: true,
        supportsResume: false,
        isolationModes: ["WORKSPACE_WRITE"],
      }],
      sandboxCapabilities: ["remote-sandbox", "workspace-write"],
      repositoryAccess: [{ repositoryId: REPOSITORY_ID, access: "READ_WRITE" }],
      readiness: "READY",
      draining: false,
      lastHeartbeatAt: FIXED_NOW,
    },
  };
}

function fakeSandboxProfile(): SandboxProfileSnapshot {
  const imageDigest = `sha256:${"e".repeat(64)}`;
  return {
    schema: "factory-sandbox-profile/v1",
    profileKey: "fake-system-factory-v2",
    version: 1,
    provider: "FAKE",
    providerProfile: "deterministic",
    providerProfileVersion: "v1",
    machine: { image: `fake:system-factory-v2@${imageDigest}`, cpu: 2, memoryMb: 4_096, diskGb: 20 },
    supervisor: { version: "mission-control-supervisor/v1", transport: "SSH" },
    runtime: { maxRuntimeMs: 60_000, resultPollIntervalMs: 250, resultRetentionMs: 86_400_000 },
    network: { egress: "UNRESTRICTED", egressAllowlist: [], publicIngress: false, exposedPorts: [] },
    credentials: {
      inference: "ATTEMPT_SCOPED_OPENROUTER",
      repositoryAccess: "CONTROL_PLANE_SNAPSHOT",
      githubAuthority: "NONE",
      providerAuthority: "NONE",
    },
    spend: { maxUsd: 1, enforcement: "PROVIDER_KEY_LIMIT" },
    teardown: { terminateOnEveryTerminalState: true, verifyResourceAbsent: true, supportsResume: false },
    preview: { mode: "DISABLED" },
    readiness: {
      state: "DEGRADED",
      checkedAt: FIXED_NOW,
      reason: "Deterministic fake provider; no live certification claim.",
      egressEnforcementProven: false,
    },
  };
}

function remoteSandboxRuntimeArtifact(profile: SandboxProfileSnapshot) {
  const imageDigest = profile.machine.image.match(/@(sha256:[a-f0-9]{64})$/i)?.[1];
  if (!imageDigest) throw new Error("System Factory remote fixture requires an exact image digest.");
  return {
    schemaVersion: "harness-runtime-artifact/v1" as const,
    kind: "CONTAINER_IMAGE" as const,
    name: `${CODEX_V1_HARNESS_MANIFEST.identity.harnessId}-sandbox`,
    version: profile.providerProfileVersion,
    executableSha256: null,
    imageDigest,
  };
}

function sandboxBundle(input: {
  profile: SandboxProfileSnapshot;
  attemptId: string;
  leaseId: string;
  manifestDigest: string;
  sourceSha: string;
  modelRouteDigest: string;
  providerRoute: string;
}) {
  return createSandboxResultBundle({
    schema: "factory-sandbox-result/v1",
    attemptId: input.attemptId,
    workOrderId: WORK_ORDER_ID,
    workOrderRevisionNumber: 1,
    workflowRunId: input.attemptId,
    manifestDigest: input.manifestDigest,
    profileDigest: sandboxProfileDigest(input.profile),
    sourceSha: input.sourceSha,
    supervisorVersion: "mission-control-supervisor/v1",
    harness: {
      adapter: "codex",
      version: "v1",
      harnessId: "codex-cli",
      harnessVersion: "0.146.0",
      provider: "openai",
      model: "gpt-5.6-terra",
      modelRouteDigest: input.modelRouteDigest,
      providerRoute: input.providerRoute,
    },
    environment: { provider: "FAKE", image: input.profile.machine.image },
    startedAt: FIXED_NOW,
    finishedAt: FIXED_NOW + 1,
    status: "COMPLETED",
    resultProvenance: {
      source: "OUTPUT_FILE",
      outputFile: { state: "VALID", byteLength: 100 },
      jsonl: { byteLength: 0, lineCount: 0, malformedLineCount: 0, terminalCompletedCount: 0, terminalFailureCount: 0, validCandidateCount: 0 },
      context: { attemptId: input.attemptId, manifestDigest: input.manifestDigest, sourceSha: input.sourceSha },
    },
    structuredResult: {
      schema: "factory-result/v1",
      status: "COMPLETED",
      summary: "Candidate prepared for independent verification.",
      completedAcceptanceCriterionIds: ["deterministic-gates-pass"],
      incompleteAcceptanceCriterionIds: [],
      unknownAcceptanceCriterionIds: [],
      verificationCommands: ["node scripts/verify.mjs"],
      knownRisks: [],
      nextAction: "Run independent verification.",
    },
    changedFiles: ["docs/qualification-note.md"],
    diff: { filesChanged: 1, linesAdded: 3, linesDeleted: 0 },
    commandResults: [{ commandClass: "EXECUTOR", exitCode: 0, durationMs: 1, timedOut: false }],
    verificationInputs: { reportedCommands: ["node scripts/verify.mjs"] },
    artifacts: [],
    events: [{ type: "RESULT_WRITTEN", occurredAt: FIXED_NOW + 1 }],
    patch: createPatchDescriptor(Buffer.from("diff --git a/docs/qualification-note.md b/docs/qualification-note.md\n")),
    executor: {
      exitCode: 0,
      stdoutDigest: "sha256:fixture-stdout",
      stderrDigest: "sha256:fixture-stderr",
      stdoutTail: "",
      stderrTail: "",
    },
    usage: {
      providerCostUsd: 0,
      inferenceCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      providerRuntimeMs: 1,
      observedAt: FIXED_NOW + 1,
      enforcement: "PROVIDER_REPORTED",
    },
  });
}

async function inspectAuthorityBoundaries() {
  const repoRoot = qualificationRepoRoot();
  const convexRoot = path.join(repoRoot, "convex");
  const files = await listTypeScriptFiles(convexRoot);
  const acceptedEventWriters: string[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/eventType:\s*["']WORK_ORDER_ACCEPTED["']/.test(source)) {
      acceptedEventWriters.push(path.basename(file));
    }
  }
  const [learning, metaLoop, observability, sandbox, missions] = await Promise.all([
    readFile(path.join(convexRoot, "factory/learning.ts"), "utf8"),
    readFile(path.join(convexRoot, "factory/metaLoop.ts"), "utf8"),
    readFile(path.join(convexRoot, "observability.ts"), "utf8"),
    readFile(path.join(repoRoot, "apps/orchestration-server/src/remoteSandboxRuntime.ts"), "utf8"),
    readFile(path.join(convexRoot, "missions.ts"), "utf8"),
  ]);
  return {
    workOrderAcceptedEventWriters: [...new Set(acceptedEventWriters)].sort(),
    learningHasAcceptanceMutation: [learning, metaLoop].some((source) => source.includes("workOrders.accept")),
    observabilityHasAcceptanceMutation: observability.includes("workOrders.accept"),
    planSelfApprovalGuard: missions.includes("A plan author cannot approve the same plan revision"),
    sandboxHasGithubAuthority: sandbox.includes("GITHUB_TOKEN") || sandbox.includes("GITHUB_APP_PRIVATE_KEY"),
  };
}

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return await listTypeScriptFiles(target);
    return entry.isFile() && entry.name.endsWith(".ts") ? [target] : [];
  }));
  return files.flat();
}

async function writeEvidencePacket(packet: unknown) {
  const outputPath = process.env.MC_SYSTEM_QUALIFICATION_EVIDENCE;
  if (!outputPath) return;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(packet, null, 2) + "\n");
}
