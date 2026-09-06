/**
 * Workflow Engine
 *
 * Multi-agent workflow execution inspired by Antfarm.
 *
 * Key patterns:
 * - Deterministic workflows (same steps, same order)
 * - Agent verification (separate verifier checks implementer's work)
 * - Fresh context per step (Ralph loop pattern)
 * - Retry and escalation (automatic retry, then human approval)
 * - Template-based inputs ({{variable}} substitution)
 */

export {
  WorkflowExecutor,
  createExecutor,
  legacyExecutorOwnsRun,
  workflowDefinitionForRun,
  workflowEvidenceDigest,
  type WorkflowExecutorConfig,
  type StepExecutionResult,
} from "./executor.js";

export {
  render,
  extractVariables,
  validateContext,
  type RenderContext,
} from "./renderer.js";

export {
  buildBoundedContextUpdate,
  validateCompletionOutput,
} from "./handoff.js";

export {
  parse,
  meetsExpectations,
  extractData,
  type ParsedOutput,
} from "./parser.js";

export {
  loadWorkflow,
  loadAllWorkflows,
  validateWorkflow,
  type WorkflowDefinition,
  type WorkflowStepDefinition,
  type WorkflowValidationError,
} from "./loader.js";

export {
  compileWorkflowGraph,
  evaluateWorkflowCondition,
  getRunnableNodeIndexes,
  graphMetrics,
  validateGraphDefinition,
  validateStructuredOutput,
  type CompiledWorkflowGraph,
  type GraphStepDefinition,
  type GraphStepState,
  type GraphValidationError,
  type JsonContract,
  type WorkflowCondition,
  type WorkflowFailurePolicy,
  type WorkflowNodeKind,
  type WorkflowNodeStatus,
  type WorkflowTopology,
} from "./graph.js";

export {
  boundedProviderMetadata,
  GENERIC_HARNESS_CONTRACT_VERSION,
  harnessCapabilityManifestDigest,
  harnessCapabilityRequirementsSatisfied,
  harnessCapabilitySupport,
  harnessExecutionRequestDigest,
  harnessManifestIssues,
  harnessNormalizedResultIssues,
  harnessRuntimeArtifactDigest,
  harnessRuntimeArtifactIssues,
  modelRouteReasoningConfigIssues,
  NO_HARNESS_AUTHORITY,
  runHarnessExecution,
  HarnessCleanupError,
} from "./executorAdapter.js";

export type {
  ExecutorAdapter,
  ExecutorCapabilities,
  ExecutorConfigurationIssue,
  ExecutorEstimate,
  ExecutorEvent,
  ExecutorEventType,
  ExecutorHealth,
  ExecutorProcessObserver,
  ExecutorRequest,
  ExecutorResult,
  HarnessAuthorityLevel,
  HarnessAuthorityProfile,
  HarnessCapabilityManifest,
  HarnessCapabilityRequirement,
  HarnessChangedFile,
  HarnessExecutionBackend,
  HarnessExecutionContext,
  HarnessExecutionStatus,
  HarnessExecutorAdapter,
  HarnessExecutorCapabilities,
  HarnessModelCapability,
  HarnessNormalizedResult,
  HarnessRuntimeArtifactIdentity,
  HarnessSupportLevel,
  IsolationMode,
  ModelRouteReasoningConfig,
} from "./executorAdapter.js";

export {
  CODEX_HARNESS_EFFECTIVE_CONFIG ,
  CODEX_BEDROCK_EFFECTIVE_CONFIG,
  CODEX_BEDROCK_V1_HARNESS_MANIFEST ,
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  DEEPSEEK_HARNESS_EFFECTIVE_CONFIG,
  DEEPSEEK_V1_HARNESS_MANIFEST,
  DEEPSEEK_V1_RUNTIME_ARTIFACT,
  KNOWN_HARNESS_MANIFESTS,
  findKnownHarnessManifest,
  findKnownHarnessRuntimeArtifact,
  harnessSupportsModel,
} from "./harnessManifests.js";

export {
  matchesRepositoryGlob,
  normalizeRepositoryPath,
  validateChangedFileScope,
  type RepositoryScope,
  type RepositoryScopeViolation,
} from "./repositoryScope.js";

export {
  VerificationEngine,
  ChangeBudgetVerifier,
  NegativeConstraintVerifier,
  calculateCriterionCoverage,
  evaluateVerificationOutcome,
  matchesRepositoryPattern,
  type AcceptanceCriterionSpec,
  type CandidateChange,
  type ChangeBudget,
  type CommandClass,
  type CriterionCoverage,
  type EvidenceCategory,
  type EvidenceRequirement,
  type NegativeConstraint,
  type VerificationCategory,
  type VerificationCheckResult,
  type VerificationCheckSpec,
  type VerificationCheckStatus,
  type VerificationContract,
  type VerificationEngineResult,
  type VerificationEvidenceDraft,
  type VerificationExecutionContext,
  type VerificationVerdict,
  type Verifier,
  type WorkOrderVerificationSpec,
} from "./verification.js";

export {
  canonicalVerificationJson,
  qualityGateEvidenceSetDigest,
  verificationContractDigest,
  verificationDigest,
  verificationSha256Hex,
} from "./verificationIdentity.js";

export {
  createAutomationVerificationSubject,
  createGitVerificationSubject,
  createPrepublicationGitVerificationSubject,
  createGitSubjectPublicationBinding,
  verifyGitSubjectPublicationBinding,
  normalizeAttemptPurpose,
  normalizeFactoryPurpose,
  normalizeWorkOrderKind,
  verifyVerificationSubjectIdentity,
  type AttemptPurpose,
  type AutomationVerificationSubject,
  type FactoryPurpose,
  type GitVerificationSubject,
  type PrepublicationGitVerificationSubject,
  type GitSubjectPublicationBinding,
  type GithubVerificationSubject,
  type LocalGitVerificationSubject,
  type VerificationSubject,
  type WorkOrderKind,
} from "./verificationSubject.js";

export {
  assertVerificationPlanImmutable,
  freezeVerificationPlan,
  validateVerificationPlanDraft,
  type DiscoveredVerificationRisk,
  type RequiredEvidence,
  type RequiredVerificationRisk,
  type VerificationPlan,
  type VerificationPlanContract,
  type VerificationPlanDraft,
  type VerificationRequirement,
} from "./verificationPlan.js";

export {
  deriveVerificationIndependence,
  tupleMatches,
  verificationIsolationBindingDigest,
  type VerificationIdentityTuple,
  type VerificationIndependenceInput,
  type VerificationIndependenceResult,
} from "./verificationIndependence.js";

export {
  assertVerificationRunTransition,
  evaluateVerificationDecision,
  type VerificationCoverageV2,
  type VerificationDecisionResult,
  type VerificationEvidenceInput,
  type VerificationRunStatus,
  type VerificationVerdictV2,
} from "./verificationDecision.js";

export {
  evaluateCurrentVerificationEligibility,
  type CurrentVerificationAttempt,
  type CurrentVerificationEligibility,
  type CurrentVerificationSourceAttempt,
  type GitProviderHeadProjection,
  type StoredVerificationReceipt,
  type StoredVerificationResult,
  type StoredVerificationEvidence,
} from "./verificationCurrentness.js";
