import { v } from "convex/values";

export const factoryPurposeValidator = v.union(
  v.literal("SOFTWARE"), v.literal("VERIFICATION"), v.literal("INTELLIGENT_AUTOMATION"),
);

export const workOrderKindValidator = v.union(
  v.literal("SOFTWARE_CHANGE"), v.literal("VERIFICATION"), v.literal("AUTOMATION"),
);

export const attemptPurposeValidator = v.union(
  v.literal("IMPLEMENTATION"), v.literal("VERIFICATION"), v.literal("AUTOMATION"),
);

export const traceContextValidator = v.object({
  traceId: v.optional(v.string()),
  spanId: v.optional(v.string()),
  parentSpanId: v.optional(v.string()),
});

export const evidenceCategoryValidator = v.union(
  v.literal("TEST_RESULT"), v.literal("BUILD_RESULT"), v.literal("STATIC_ANALYSIS"),
  v.literal("SECURITY_SCAN"), v.literal("COMMAND_LOG"), v.literal("FILE_DIFF"),
  v.literal("SCREENSHOT"), v.literal("BROWSER_RESULT"), v.literal("PERFORMANCE_RESULT"),
  v.literal("REVIEW_RESULT"), v.literal("POLICY_RESULT"), v.literal("CI_RESULT"),
  v.literal("RUNTIME_OBSERVATION"),
);

export const verificationCheckStatusValidator = v.union(
  v.literal("PASS"), v.literal("FAIL"), v.literal("SKIPPED"),
  v.literal("NOT_CONFIGURED"), v.literal("ERROR"),
);

export const verificationVerdictValidator = v.union(
  v.literal("VERIFIED"), v.literal("NOT_VERIFIED"), v.literal("BLOCKED"),
  v.literal("REQUIRES_HUMAN_REVIEW"),
);

export const verificationCategoryValidator = v.union(
  v.literal("BUILD"), v.literal("TYPECHECK"), v.literal("UNIT_TEST"),
  v.literal("INTEGRATION_TEST"), v.literal("CONTRACT_TEST"), v.literal("SECURITY"),
  v.literal("SECRETS"), v.literal("DEPENDENCY"), v.literal("POLICY"),
  v.literal("CHANGE_BUDGET"), v.literal("ACCEPTANCE"), v.literal("INDEPENDENT_REVIEW"),
);

export const commandClassValidator = v.union(
  v.literal("BUILD"), v.literal("TYPECHECK"), v.literal("TEST"), v.literal("LINT"),
  v.literal("SECURITY_SCAN"), v.literal("DEPENDENCY_SCAN"), v.literal("MIGRATION"),
  v.literal("INFRASTRUCTURE"), v.literal("PRODUCTION_ACCESS"), v.literal("SECRETS_ACCESS"),
  v.literal("DESTRUCTIVE"), v.literal("PUBLISH"),
);

export const evidenceIndependenceLevelValidator = v.union(
  v.literal("ANY_VERIFICATION"),
  v.literal("CANDIDATE_DEPENDENT_ALLOWED"),
  v.literal("INDEPENDENT_REQUIRED"),
);

export const evidenceRequirementValidator = v.object({
  category: evidenceCategoryValidator,
  minimumCount: v.number(),
  independent: v.boolean(),
  independenceLevel: v.optional(evidenceIndependenceLevelValidator),
});

export const acceptanceCriterionValidator = v.object({
  id: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  requirementIds: v.optional(v.array(v.string())),
  givenWhenThen: v.optional(v.object({
    given: v.string(),
    when: v.string(),
    then: v.string(),
  })),
  requiredEvidence: v.optional(v.array(evidenceRequirementValidator)),
  verificationMethod: v.optional(v.union(
    v.literal("MANUAL"), v.literal("COMMAND"), v.literal("TEST"),
    v.literal("CHECKLIST"), v.literal("BROWSER"),
  )),
  status: v.union(
    v.literal("PENDING"), v.literal("PASS"), v.literal("FAIL"),
    v.literal("WAIVED"), v.literal("STALE"),
  ),
});

export const requirementValidator = v.object({
  id: v.string(),
  title: v.string(),
  description: v.string(),
  type: v.union(v.literal("FUNCTIONAL"), v.literal("NON_FUNCTIONAL")),
  category: v.optional(v.union(
    v.literal("FUNCTIONAL"), v.literal("SECURITY"), v.literal("RELIABILITY"),
    v.literal("PERFORMANCE"), v.literal("ACCESSIBILITY"), v.literal("PRIVACY"),
    v.literal("OPERABILITY"), v.literal("ARCHITECTURE"),
  )),
  priority: v.union(v.literal("MUST"), v.literal("SHOULD")),
});

export const negativeConstraintValidator = v.object({
  id: v.string(),
  type: v.union(
    v.literal("PROTECTED_PATH"), v.literal("NO_AUTH_CHANGES"),
    v.literal("NO_PRODUCTION_ACCESS"), v.literal("NO_PLAINTEXT_SECRETS"),
    v.literal("NO_PUBLIC_API_CHANGES"), v.literal("NO_SCHEMA_CHANGES"),
    v.literal("NO_NEW_DEPENDENCIES"), v.literal("NO_TEST_REMOVAL"),
    v.literal("NO_ASSERTION_WEAKENING"), v.literal("NO_VERIFICATION_CONFIG_CHANGES"),
    v.literal("CUSTOM"),
  ),
  description: v.string(),
  paths: v.optional(v.array(v.string())),
  pattern: v.optional(v.string()),
});

export const dataBoundaryValidator = v.object({
  id: v.string(),
  kind: v.union(
    v.literal("SECRET"), v.literal("CREDENTIAL"), v.literal("PRODUCTION_DATA"),
    v.literal("PII"), v.literal("PROTECTED_FILE"), v.literal("RESTRICTED_SERVICE"),
  ),
  description: v.string(),
  paths: v.optional(v.array(v.string())),
  resources: v.optional(v.array(v.string())),
});

export const changeBudgetValidator = v.object({
  maxFilesChanged: v.number(),
  maxLinesChanged: v.number(),
  allowedPaths: v.array(v.string()),
  deniedPaths: v.array(v.string()),
  allowedCommandClasses: v.array(commandClassValidator),
  prohibitedCommandClasses: v.array(commandClassValidator),
  allowDependencyChanges: v.boolean(),
  allowSchemaChanges: v.boolean(),
  allowMigrations: v.boolean(),
  allowInfrastructureChanges: v.boolean(),
});

export const verificationCheckValidator = v.object({
  id: v.string(),
  name: v.string(),
  category: verificationCategoryValidator,
  verifierId: v.string(),
  mandatory: v.boolean(),
  acceptanceCriterionIds: v.array(v.string()),
  evidenceCategory: evidenceCategoryValidator,
  command: v.optional(v.object({
    executable: v.string(),
    args: v.array(v.string()),
    commandClass: commandClassValidator,
    timeoutMs: v.number(),
  })),
});

const verificationAuthoritySurfaceValidator = v.union(
  v.literal("PACKAGE_MANIFEST"),
  v.literal("LOCKFILE"),
  v.literal("BUILD_SCRIPT"),
  v.literal("TEST_CONFIG"),
  v.literal("TEST_SOURCE"),
  v.literal("RUNNER_CONFIG"),
  v.literal("CI_CONFIG"),
);

export const verificationAuthorityPolicyValidator = v.object({
  allowedSurfaceMutations: v.optional(v.array(verificationAuthoritySurfaceValidator)),
  allowedPaths: v.optional(v.array(v.string())),
  reason: v.optional(v.string()),
});

export const requiredVerificationRiskContractValidator = v.object({
  id: v.string(),
  description: v.string(),
  severity: v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"), v.literal("CRITICAL")),
  source: v.union(v.literal("WORK_ORDER"), v.literal("POLICY"), v.literal("HUMAN_APPROVED")),
  requiredEvidenceIds: v.array(v.string()),
});

const verificationContractV1Validator = v.object({
  schemaVersion: v.literal(1),
  enforcementMode: v.union(v.literal("OBSERVE_ONLY"), v.literal("ENFORCED")),
  checks: v.array(verificationCheckValidator),
  requireHumanReview: v.boolean(),
  authorityPolicy: v.optional(verificationAuthorityPolicyValidator),
});

const verificationContractV2Validator = v.object({
  schemaVersion: v.literal(2),
  enforcementMode: v.union(v.literal("OBSERVE_ONLY"), v.literal("ENFORCED")),
  checks: v.array(verificationCheckValidator),
  requiredRisks: v.array(requiredVerificationRiskContractValidator),
  requireHumanReview: v.boolean(),
  independence: v.object({
    required: v.boolean(),
    minimumBoundary: v.literal("SEPARATE_ATTEMPT"),
  }),
  authorityPolicy: v.optional(verificationAuthorityPolicyValidator),
});

export const verificationContractValidator = v.union(
  verificationContractV1Validator,
  verificationContractV2Validator,
);

const verificationSubjectIdentityFields = {
  version: v.literal(1),
  subjectId: v.string(),
  workOrderId: v.id("workOrders"),
  workOrderRevisionNumber: v.number(),
  verificationContractDigest: v.string(),
  sourceAttemptId: v.id("workflowRuns"),
  digest: v.string(),
};

export const gitVerificationSubjectValidator = v.object({
  ...verificationSubjectIdentityFields,
  kind: v.literal("GIT_CANDIDATE"),
  repositoryId: v.id("workspaceRepositories"),
  provider: v.literal("GITHUB"),
  providerRepositoryId: v.string(),
  candidateSha: v.string(),
  treeSha: v.string(),
  pullRequest: v.object({
    providerPullRequestId: v.string(),
    number: v.number(),
    url: v.string(),
    baseRef: v.string(),
    headRef: v.string(),
    headSha: v.string(),
    draftAtPublication: v.boolean(),
  }),
});

export const automationVerificationSubjectValidator = v.object({
  ...verificationSubjectIdentityFields,
  kind: v.literal("AUTOMATION_RUN"),
  automationWorkflowRunId: v.id("workflowRuns"),
  automationDefinitionId: v.id("automationDefinitions"),
  automationDefinitionVersion: v.number(),
  adapterIdentity: v.object({
    adapterType: v.string(),
    runtime: v.optional(v.string()),
    executionBindingDigest: v.string(),
    outputContractDigest: v.string(),
  }),
  outputSnapshotArtifactId: v.id("runArtifacts"),
  outputSnapshotContentHash: v.string(),
  outputArtifactIds: v.array(v.id("runArtifacts")),
  outputArtifactContentHashes: v.array(v.string()),
});

export const prepublicationGitVerificationSubjectValidator = v.object({
  ...verificationSubjectIdentityFields, version: v.literal(2), kind: v.literal("GIT_CANDIDATE"),
  repositoryId: v.id("workspaceRepositories"), provider: v.literal("GITHUB"), providerRepositoryId: v.string(),
  baseSha: v.string(), candidateSha: v.string(), treeSha: v.string(), rawDiffSha256: v.string(), baseRef: v.string(), headRef: v.string(),
});

export const gitSubjectPublicationBindingValidator = v.object({
  version: v.literal(1), verificationSubjectDigest: v.string(), sourceAttemptId: v.id("workflowRuns"), repositoryId: v.id("workspaceRepositories"),
  publicationPermitId: v.string(), publicationPermitLeaseId: v.string(), approvalDecisionId: v.id("approvalDecisions"),
  verificationReceiptId: v.id("verificationReceipts"), digest: v.string(),
  pullRequest: v.object({ providerPullRequestId: v.string(), number: v.number(), url: v.string(), baseRef: v.string(), headRef: v.string(), headSha: v.string(), draftAtPublication: v.boolean() }),
});

export const verificationSubjectValidator = v.union(
  gitVerificationSubjectValidator,
  prepublicationGitVerificationSubjectValidator,
  automationVerificationSubjectValidator,
);

export const verificationAttemptBindingValidator = v.object({
  sourceAttemptId: v.id("workflowRuns"),
  workOrderId: v.id("workOrders"),
  workOrderRevisionNumber: v.number(),
  verificationContractDigest: v.string(),
  verificationSubject: verificationSubjectValidator,
  verificationSubjectDigest: v.string(),
});

export const verificationRequirementValidator = v.object({
  id: v.string(),
  description: v.string(),
  source: v.union(v.literal("WORK_ORDER"), v.literal("ACCEPTANCE_CRITERION"), v.literal("POLICY"), v.literal("MANUAL")),
  sourceReference: v.optional(v.string()),
  criticality: v.union(v.literal("REQUIRED"), v.literal("IMPORTANT"), v.literal("INFORMATIONAL")),
});

export const requiredVerificationRiskValidator = v.object({
  id: v.string(),
  description: v.string(),
  severity: v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"), v.literal("CRITICAL")),
  source: v.union(v.literal("WORK_ORDER"), v.literal("POLICY"), v.literal("HUMAN_APPROVED")),
  affectedAreas: v.array(v.string()),
});

export const discoveredVerificationRiskValidator = v.object({
  id: v.string(),
  description: v.string(),
  severity: v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"), v.literal("CRITICAL")),
  affectedAreas: v.array(v.string()),
  discoveredBy: v.string(),
});

export const requiredEvidenceValidator = v.object({
  id: v.string(),
  requirementIds: v.array(v.string()),
  requiredRiskIds: v.array(v.string()),
  description: v.string(),
  evidenceType: v.union(
    v.literal("UNIT_TEST"), v.literal("INTEGRATION_TEST"), v.literal("E2E_TEST"), v.literal("API_CHECK"),
    v.literal("RUNTIME_OBSERVATION"), v.literal("SECURITY_CHECK"), v.literal("PERFORMANCE_CHECK"),
    v.literal("ARTIFACT_INSPECTION"), v.literal("MANUAL_REVIEW"), v.literal("CUSTOM"),
  ),
  required: v.boolean(),
});

export const verificationPlanValidator = v.object({
  planVersion: v.literal(1),
  planId: v.string(),
  planDigest: v.string(),
  workOrderId: v.id("workOrders"),
  workOrderRevisionNumber: v.number(),
  verificationContractDigest: v.string(),
  sourceAttemptId: v.id("workflowRuns"),
  verificationAttemptId: v.id("workflowRuns"),
  verificationSubject: verificationSubjectValidator,
  generatedBy: v.object({
    factoryDefinitionId: v.id("factoryDefinitions"),
    factoryDefinitionVersionId: v.id("factoryDefinitionVersions"),
    attemptId: v.id("workflowRuns"),
    executorInvocationId: v.string(),
  }),
  requirements: v.array(verificationRequirementValidator),
  requiredRisks: v.array(requiredVerificationRiskValidator),
  discoveredRisks: v.array(discoveredVerificationRiskValidator),
  requiredEvidence: v.array(requiredEvidenceValidator),
  adversarial: v.optional(v.object({
    enabled: v.boolean(),
    scenarios: v.array(v.object({
      id: v.string(),
      description: v.string(),
      requirementIds: v.array(v.string()),
      riskIds: v.array(v.string()),
      requiredEvidenceIds: v.array(v.string()),
    })),
  })),
  createdAt: v.number(),
});

export const verificationCoverageV2Validator = v.object({
  requiredRequirementCoverage: v.number(),
  requiredEvidenceCoverage: v.number(),
  requiredRiskCoverage: v.number(),
  totalRequiredRequirements: v.number(),
  coveredRequiredRequirements: v.number(),
  totalRequiredRisks: v.number(),
  coveredRequiredRisks: v.number(),
  requiredEvidenceCount: v.number(),
  passedRequiredEvidenceCount: v.number(),
  discoveredRiskCount: v.number(),
  discoveredRiskEvidenceCoverage: v.union(v.number(), v.null()),
});

export const verificationIndependenceValidator = v.object({
  policyVersion: v.literal("verification-independence/v1"),
  sourceAttemptId: v.id("workflowRuns"),
  verificationAttemptId: v.id("workflowRuns"),
  passed: v.boolean(),
  reasons: v.array(v.string()),
});

export const verificationIsolationAttestationValidator = v.object({
  mode: v.union(
    v.literal("DETACHED_GIT_WORKTREE"), v.literal("FRESH_CLONE"), v.literal("REMOTE_SANDBOX"),
    v.literal("AUTOMATION_SNAPSHOT"), v.literal("LOCAL_DOCKER_CANARY"),
  ),
  sandboxId: v.string(),
  rootBindingDigest: v.string(),
  subjectDigest: v.string(),
  verifierRoot: v.optional(v.string()),
  sourceRoot: v.optional(v.string()),
  initialClean: v.boolean(),
  finalSubjectMatch: v.boolean(),
  repositoryId: v.optional(v.id("workspaceRepositories")),
  headSha: v.optional(v.string()),
  treeSha: v.optional(v.string()),
  outputSnapshotContentHash: v.optional(v.string()),
  attestedAt: v.number(),
});

export const automationDesignValidator = v.object({
  version: v.literal(1),
  objective: v.string(),
  steps: v.array(v.object({
    id: v.string(),
    description: v.string(),
    classification: v.union(v.literal("DETERMINISTIC"), v.literal("AI_ASSISTED"), v.literal("AGENTIC"), v.literal("HUMAN")),
    reason: v.string(),
    tool: v.optional(v.string()),
    approvalRequired: v.optional(v.boolean()),
  })),
});

export const automationOutputSnapshotValidator = v.object({
  version: v.literal(1),
  sourceAttemptId: v.id("workflowRuns"),
  automationDefinitionId: v.id("automationDefinitions"),
  automationDefinitionVersion: v.number(),
  adapterType: v.string(),
  runtime: v.optional(v.string()),
  executionBindingDigest: v.string(),
  outputContractDigest: v.string(),
  normalizedStatus: v.union(
    v.literal("PASSED"), v.literal("FAILED"), v.literal("TIMED_OUT"), v.literal("CANCELED"), v.literal("INFRASTRUCTURE_ERROR"),
  ),
  outputContractVersion: v.optional(v.string()),
  normalizedResult: v.any(),
  artifactRefs: v.array(v.string()),
  artifactContentHashes: v.array(v.string()),
  startedAt: v.number(),
  completedAt: v.number(),
});

export const verificationCheckResultValidator = v.object({
  checkId: v.string(),
  name: v.string(),
  category: verificationCategoryValidator,
  verifierId: v.string(),
  mandatory: v.boolean(),
  status: verificationCheckStatusValidator,
  summary: v.string(),
  acceptanceCriterionIds: v.array(v.string()),
  startedAt: v.number(),
  completedAt: v.number(),
  durationMs: v.number(),
  evidenceIds: v.array(v.id("evidenceEnvelopes")),
  violations: v.array(v.string()),
  metadata: v.optional(v.any()),
});

export const criterionCoverageValidator = v.object({
  criterionId: v.string(),
  title: v.string(),
  status: v.union(v.literal("EVIDENCED"), v.literal("MISSING")),
  requiredEvidenceCount: v.number(),
  usableEvidenceCount: v.number(),
  missingEvidence: v.array(v.string()),
  evidenceIds: v.array(v.id("evidenceEnvelopes")),
});
