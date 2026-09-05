#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine/harness-contract";

const CONVEX_URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3224";
if (CONVEX_URL !== "http://127.0.0.1:3224") {
  throw new Error(`Refusing non-qualification Convex URL: ${CONVEX_URL}`);
}

const client = new ConvexHttpClient(CONVEX_URL);
const fn = (name) => makeFunctionReference(name);
const now = Date.now();
const validUntil = now + 6 * 60 * 60 * 1_000;
const evidenceDigest = (path) => `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
const objectSchema = (properties, required) => ({
  type: "object",
  properties: { status: { type: "string" }, ...properties },
  required: ["status", ...required],
  additionalProperties: false,
});

let project = await client.query(fn("projects:getBySlug"), { slug: "phase4-real-mcp-qualification" });
if (!project) {
  const projectResult = await client.mutation(fn("projects:create"), {
    name: "PHASE4_REAL_MCP_QUALIFICATION",
    slug: "phase4-real-mcp-qualification",
    description: "Disposable isolated qualification workspace for one governed Context7 query-docs call.",
    purpose: "Qualify one exact read-only MCP operation through the canonical Factory Attempt path.",
    owner: "PHASE4_QUALIFICATION_OPERATOR",
    status: "ACTIVE",
    githubRepo: "jaydubya818/MissionControl",
    githubBranch: "main",
    metadata: { qualification: "PHASE4_REAL_MCP_QUALIFICATION", isolated: true },
  });
  if (!projectResult.success || !projectResult.project?._id) throw new Error(projectResult.error ?? "Qualification workspace creation failed.");
  project = projectResult.project;
}
const projectId = project._id;
const repositories = await client.query(fn("projects:listRepositories"), { projectId });
const repository = repositories.find((item) => item.repository === "jaydubya818/MissionControl");
if (!repository) throw new Error("Qualification repository connection was not created.");
const repositoryId = repository.repositoryId;
if (!repositoryId) throw new Error("Qualification repository connection is only a legacy projection.");

await client.mutation(fn("projects:setRepositoryDataClassification"), {
  repositoryId,
  dataClassification: "PUBLIC",
  reason: "The qualification uses the public MissionControl repository and synthetic qualification instructions only.",
});

const github = await client.action(fn("githubAppConnections:bindExistingInstallation"), {
  repositoryId,
  installationId: "152563527",
});
if (!github.ok) throw new Error(`GitHub App qualification binding failed: ${github.code}`);

const scopeResult = await client.mutation(fn("projects:createRepositoryCodeScope"), {
  repositoryId,
  name: "Phase 4 real MCP qualification evidence",
  slug: "phase4-real-mcp-qualification-evidence",
  description: "One synthetic evidence file produced by the bounded qualification Attempt.",
  includePaths: ["docs/testing/evidence/governed-mcp-phase4-live-attempt/**"],
  excludePaths: [],
  requiredReviewers: ["PHASE4_QUALIFICATION_OPERATOR"],
  allowedEnvironments: ["LOCAL"],
  verificationPolicy: "Independent dependency-free verification must pass before publication review.",
  approvalPolicy: "HUMAN_REVIEW",
  approvalPolicyDescription: "The candidate pauses before any publication authority is granted.",
});
if (!scopeResult.success || !scopeResult.scopeId) throw new Error(scopeResult.error ?? "Qualification code scope creation failed.");
const codeScopeId = scopeResult.scopeId;

const workflowId = `phase4-real-mcp-${String(projectId).slice(-16)}`;
const workflowRecordId = await client.mutation(fn("workflows:registerProduction"), {
  projectId,
  workflowId,
  name: "Phase 4 governed Context7 qualification",
  description: "One bounded implementation Attempt followed by independent verification and a human publication gate.",
  topology: "LINEAR",
  maxConcurrency: 1,
  agents: [{ id: "builder", persona: "Bounded synthetic qualification evidence builder" }],
  steps: [
    {
      id: "implement",
      agent: "builder",
      input: "Create only the approved synthetic qualification evidence file using the governed Context7 context supplied by Mission Control.",
      expects: "A schema-valid candidate revision and explicit completion status.",
      retryLimit: 0,
      timeoutMinutes: 10,
      kind: "AGENT",
      isolation: "WORKTREE",
      failurePolicy: "BLOCK",
      outputSchema: objectSchema({ candidateRevision: { type: "string" } }, ["candidateRevision"]),
    },
    {
      id: "gate",
      agent: "builder",
      input: "Wait for the recorded human publication decision.",
      expects: "APPROVED",
      retryLimit: 0,
      timeoutMinutes: 5,
      dependsOn: ["implement"],
      kind: "GATE",
      isolation: "READ_ONLY",
      failurePolicy: "BLOCK",
    },
  ],
  active: true,
});

const policy = await client.mutation(fn("governance/policyEnvelopes:createPolicyEnvelope"), {
  projectId,
  name: "Phase 4 qualification human-review boundary",
  priority: 100,
  rules: {
    defaultDecision: "NEEDS_APPROVAL",
    requireApprovalOnRisk: ["GREEN", "YELLOW", "RED"],
    toolPolicies: { shell: "NEEDS_APPROVAL", exec: "NEEDS_APPROVAL", write_file: "NEEDS_APPROVAL", delete_file: "DENY" },
    autonomyTier: 1,
    executionEnvironments: ["LOCAL"],
  },
  metadata: { qualification: "PHASE4_REAL_MCP_QUALIFICATION" },
});

const verifierId = await client.mutation(fn("context/verifiers:create"), {
  projectId,
  label: "Phase 4 exact synthetic evidence verifier",
  invariant: "The candidate contains only one exact synthetic evidence file and passes the dependency-free content check.",
  globPatterns: ["docs/testing/evidence/governed-mcp-phase4-live-attempt/**"],
  idempotencyKey: `phase4-real-mcp-verifier:${repositoryId}`,
});

const template = await client.mutation(fn("registry/agentTemplates:createTemplate"), {
  projectId,
  name: "Phase 4 bounded Codex runner",
  slug: `phase4-real-mcp-codex-${String(projectId).slice(-12)}`,
  description: "One qualification-only Codex runner with no publication authority.",
  metadata: { qualification: "PHASE4_REAL_MCP_QUALIFICATION" },
});
const agentVersion = await client.mutation(fn("registry/agentVersions:createVersion"), {
  projectId,
  templateId: template._id,
  status: "APPROVED",
  notes: "Authorized by the Product Owner for one bounded Phase 4 harness execution.",
  genome: {
    modelConfig: { provider: "openai", modelId: "gpt-5.6-terra" },
    promptBundleHash: "phase4-real-mcp-qualification-v1",
    toolManifestHash: "phase4-context7-query-docs-host-broker-v1",
    provenance: { createdBy: "PHASE4_QUALIFICATION_OPERATOR", source: "phase4-explicit-model-authorization", createdAt: now },
  },
  metadata: { executionEnvironments: ["LOCAL"], requireHumanReview: true, maxHarnessExecutions: 1 },
});

const modelCatalogId = await client.mutation(fn("modelCatalog:registerExactRoute"), {
  projectId,
  provider: "openai",
  providerRoute: "openai",
  modelId: "gpt-5.6-terra",
  displayName: "Phase 4 exact Codex qualification route",
  tier: "BALANCED",
  capabilities: ["text", "code"],
  supportsTools: true,
  contextWindow: 200000,
});
const modelRows = await client.query(fn("modelCatalog:list"), { projectId });
const modelRoute = modelRows.find((item) => item._id === modelCatalogId);
if (!modelRoute?.routeDigest) throw new Error("Registered exact model route was not returned.");
const capabilityManifestDigest = harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST);
const runtimeArtifactDigest = harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT);
await client.mutation(fn("modelCatalog:promoteExactRoute"), {
  modelCatalogId,
  expectedRouteDigest: modelRoute.routeDigest,
  evidenceReference: "docs/testing/evidence/production-execution-admission-foundation-v1/final-validation.md",
  evidenceDigest: evidenceDigest("docs/testing/evidence/production-execution-admission-foundation-v1/final-validation.md"),
  workloadClasses: ["SOFTWARE_CHANGE"],
  riskClasses: ["GREEN"],
  repositoryIds: [repositoryId],
  compatibility: {
    adapter: "codex",
    version: "v1",
    capabilityManifestDigest,
    effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    runtimeArtifactDigest,
    executionBackend: "persistent-worker",
  },
});

const tool = await client.mutation(fn("factory/governedMcp:registerContext7QueryDocs"), {
  projectId,
  registrationIdempotencyKey: `phase4-context7-v4.0.5:${repositoryId}`,
});
await client.mutation(fn("factory/governedMcp:qualifyVersion"), {
  toolVersionId: tool.toolVersionId,
  expectedDigest: tool.toolVersionDigest,
  evidenceReference: "docs/software-factory/phase4-real-mcp-service-selection-v2.md",
  evidenceDigest: evidenceDigest("docs/software-factory/phase4-real-mcp-service-selection-v2.md"),
  validUntil,
});
const grant = await client.mutation(fn("factory/governedMcp:createGrant"), {
  projectId,
  toolVersionId: tool.toolVersionId,
  grantKey: "phase4-context7-query-docs",
  expiresAt: validUntil,
  registrationIdempotencyKey: `phase4-context7-grant:${repositoryId}`,
});

const profileResult = await client.mutation(fn("factory/executionProfiles:registerVersion"), {
  projectId,
  profileKey: "phase4-context7-codex",
  registrationIdempotencyKey: `phase4-context7-profile:${repositoryId}`,
  executor: { adapter: "codex", version: "v1" },
  executionBackend: "persistent-worker",
  modelCatalogId,
  toolGrantId: grant.toolGrantId,
  isolationModes: ["WORKSPACE_WRITE"],
});
const profileBefore = await client.query(fn("factory/executionProfiles:get"), { executionProfileId: profileResult.executionProfileId });
await client.mutation(fn("factory/executionProfiles:qualify"), {
  executionProfileId: profileResult.executionProfileId,
  expectedProfileDigest: profileBefore.profile.profileDigest,
  qualificationIdempotencyKey: `phase4-context7-profile-qualification:${repositoryId}`,
  evidenceReference: "docs/testing/evidence/governed-mcp-phase4-recovery/first-live-call-preflight.md",
  evidenceDigest: evidenceDigest("docs/testing/evidence/governed-mcp-phase4-recovery/first-live-call-preflight.md"),
  workloadClasses: ["SOFTWARE_CHANGE"],
  riskClasses: ["GREEN"],
  validUntil,
});

const factoryDefinitionId = await client.mutation(fn("factory/configuration:create"), {
  repositoryId,
  name: "PHASE4_REAL_MCP_QUALIFICATION Factory",
  purpose: "SOFTWARE",
});
const factoryDefinitionVersionId = await client.mutation(fn("factory/configuration:createVersion"), {
  factoryDefinitionId,
  workflowId: workflowRecordId,
  executionProfileId: profileResult.executionProfileId,
  codeScopeIds: [codeScopeId],
  agentBindings: [{ workflowAgentId: "builder", agentVersionId: agentVersion._id }],
  policyEnvelopeId: policy._id,
  budget: { maxCostUsd: 1, maxRuntimeMinutes: 10, maxAttempts: 1 },
  verifierIds: [verifierId],
  riskBoundary: "GREEN",
  recovery: { pause: false, cancel: true, retry: true, resume: false },
});
const profile = await client.query(fn("factory/executionProfiles:get"), { executionProfileId: profileResult.executionProfileId });
const factory = await client.query(fn("factory/configuration:getDetail"), { factoryDefinitionId });
const version = factory.versions.find((item) => item._id === factoryDefinitionVersionId);
if (!version) throw new Error("Qualification Factory version was not returned.");

console.log(JSON.stringify({
  schema: "phase4-real-mcp-qualification-preparation/v1",
  authorization: { modelHarnessExecutions: 1, authorizedAt: new Date(now).toISOString(), telemetryLimitationAccepted: true },
  projectId,
  repositoryId,
  codeScopeId,
  workflowRecordId,
  workflowId,
  policyEnvelopeId: policy._id,
  verifierId,
  agentTemplateId: template._id,
  agentVersionId: agentVersion._id,
  modelCatalogId,
  modelRouteDigest: modelRoute.routeDigest,
  toolVersionId: tool.toolVersionId,
  toolVersionDigest: tool.toolVersionDigest,
  toolGrantId: grant.toolGrantId,
  toolGrantDigest: grant.grantDigest,
  executionProfileId: profile.profile._id,
  executionProfileDigest: profile.profile.profileDigest,
  executionProfileQualificationDigest: profile.profile.qualificationDigest,
  factoryDefinitionId,
  factoryDefinitionVersionId,
  factoryConfigurationDigest: version.configurationDigest,
  validUntil,
}, null, 2));
