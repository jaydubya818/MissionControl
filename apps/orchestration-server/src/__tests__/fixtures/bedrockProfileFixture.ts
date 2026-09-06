// Pure synthetic composition. Never register or issue this as a live profile.
import {
  CODEX_BEDROCK_V1_HARNESS_MANIFEST,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine";
import {
  executionProfileSnapshot,
  executionProfileDigest,
  executionProfileQualificationSnapshot,
  executionProfileQualificationDigest,
} from "../../../../../convex/lib/executionProfile.js";
import {
  exactModelRouteQualificationSnapshot,
  modelRouteQualificationDigest,
} from "../../../../../convex/lib/modelRouteAdmission.js";
import { profile, executionManifest } from "./remoteWorkerFixture.js";
import { bedrockModelRouteBinding } from "../../bedrockModelRouteBinding.js";
import { fixtureRoute, sha } from "./bedrockBridgeFixture.js";
import { DOCKER_BEDROCK_CANDIDATE_IDENTITY } from "../../dockerBedrockIdentity.js";
import { sandboxProfileDigest, stableSandboxResourceName } from "../../sandboxProvider.js";
export function bedrockProfileFixture(
  baseSha = "a".repeat(40),
  worktree = "/tmp/offline-fixture",
) {
  const p: any = profile(),
    identity = DOCKER_BEDROCK_CANDIDATE_IDENTITY;
  Object.assign(p, {
    provider: "DOCKER",
    providerProfile: "factory/docker-bedrock/v1",
    providerProfileVersion: "1",
    profileKey: "bedrock-offline",
  });
  p.machine = { ...p.machine, image: identity.image, cpu: 1, memoryMb: 512 };
  p.supervisor.transport = "DOCKER_STDIN";
  p.credentials.inference = "NONE";
  p.network.egress = "RESTRICTED_ALLOWLIST";
  p.network.egressAllowlist = [];
  p.runtime.maxRuntimeMs = 60000;
  p.spend.enforcement = "OBSERVATION_ONLY";
  delete p.qualification;
  p.dockerQualification = {
    schema: "factory-docker-qualification/v1",
    imageDigest: identity.imageId,
    toolchainDigest: sha("a"),
    evidencePacketReference: "OFFLINE_FIXTURE",
    evidencePacketDigest: sha("b"),
    bridgeProtocol: "docker-attach-framed/v1",
    harness: "codex/bedrock-v1",
    containment: {
      network: "DOCKER_NETWORK_NONE",
      readOnlyRoot: true,
      uid: 10001,
      gid: 10001,
      noNewPrivileges: true,
      capabilities: "DROP_ALL",
      hostMounts: "NONE",
      credentials: "NONE",
    },
    supportedWorkloadClasses: ["SOFTWARE_CHANGE"],
    supportedRiskClasses: ["GREEN"],
    workloadTimeouts: [
      { workloadClass: "SOFTWARE_CHANGE", maxRuntimeMs: 60000 },
    ],
  };
  p.readiness = {
    ...p.readiness,
    liveCertified: true,
    egressEnforcementProven: true,
    state: "DEGRADED",
  };
  const manifest: any = executionManifest(p, baseSha, worktree),
    h = CODEX_BEDROCK_V1_HARNESS_MANIFEST;
  const runtime = {
    schemaVersion: "harness-runtime-artifact/v1" as const,
    kind: "CONTAINER_IMAGE" as const,
    name: "codex-cli-sandbox",
    version: "0.146.0",
    executableSha256: null,
    imageDigest: identity.imageId,
  };
  const runtimeDigest = harnessRuntimeArtifactDigest(runtime),
    harnessDigest = harnessCapabilityManifestDigest(h),
    route = bedrockModelRouteBinding(fixtureRoute);
  const routeQualification = exactModelRouteQualificationSnapshot({
    routeDigest: route.routeDigest,
    evidenceReference: "OFFLINE_FIXTURE",
    evidenceDigest: sha("d"),
    workloadClasses: ["SOFTWARE_CHANGE"],
    riskClasses: ["GREEN"],
    promotedBy: "OFFLINE_FIXTURE",
    promotedAt: Date.now() - 1000,
    compatibility: {
      adapter: "codex",
      version: "bedrock-v1",
      capabilityManifestDigest: harnessDigest,
      effectiveConfigSha256: h.effectiveConfigSha256,
      runtimeArtifactDigest: runtimeDigest,
      executionBackend: "remote-sandbox",
    },
  });
  const modelRoute = {
    catalogId: "fixture-bedrock-route",
    routeSnapshot: route.snapshot,
    routeDigest: route.routeDigest,
    qualificationSnapshot: routeQualification,
    qualificationDigest: modelRouteQualificationDigest(routeQualification),
  };
  const snapshot = executionProfileSnapshot({
    profileKey: "bedrock-offline",
    version: 1,
    harness: {
      adapter: "codex",
      version: "bedrock-v1",
      capabilityManifest: h,
      capabilityManifestDigest: harnessDigest,
      effectiveConfigSha256: h.effectiveConfigSha256,
    },
    runtimeArtifact: { snapshot: runtime, digest: runtimeDigest },
    executionBackend: "remote-sandbox",
    modelRoute,
    sandboxProfile: {
      profileId: "sandbox-profile-1",
      profileSnapshot: p,
      profileDigest: sandboxProfileDigest(p),
    },
    isolationModes: ["WORKSPACE_WRITE"],
  });
  const profileDigest = executionProfileDigest(snapshot),
    qualification = executionProfileQualificationSnapshot({
      profileId: "bedrock-fixture-profile",
      profileSnapshot: snapshot,
      profileDigest,
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["GREEN"],
      evidenceReference: "OFFLINE_FIXTURE",
      evidenceDigest: sha("e"),
      approvedBy: "OFFLINE_FIXTURE",
      approvedAt: Date.now() - 1000,
      validUntil: Date.now() + 60000,
    });
  manifest.version = "factory-execution-manifest/v3";
  manifest.executionBackend = "remote-sandbox";
  manifest.modelRoute = modelRoute;
  delete manifest.harness.provider;
  delete manifest.harness.model;
  delete manifest.harness.modelRouteSnapshot;
  delete manifest.harness.executionBackend;
  Object.assign(manifest.harness, {
    version: "bedrock-v1",
    capabilityManifest: h,
    capabilityManifestSha256: harnessDigest,
    effectiveConfigSha256: h.effectiveConfigSha256,
    runtimeArtifact: runtime,
    runtimeArtifactDigest: runtimeDigest,
    requiredHarnessCapabilities: snapshot.requiredHarnessCapabilities,
    requiredCapabilities: snapshot.requiredSandboxCapabilities,
  });
  manifest.retryPolicy.maxAttempts = 1;
  manifest.retryPolicy.maxModelSpendUsd = 1;
  manifest.sandbox.credentialGrants = [];
  manifest.executionProfile = {
    profileId: "bedrock-fixture-profile",
    profileKey: snapshot.profileKey,
    version: 1,
    profileDigest,
    profileSnapshot: snapshot,
    qualificationSnapshot: qualification,
    qualificationDigest: executionProfileQualificationDigest(qualification),
  };
  manifest.causation.workflowRunId = "bedrock-fixture-run";
  manifest.sandbox.resourceName = stableSandboxResourceName({projectId:"bedrock-offline-fixture",workflowRunId:"bedrock-fixture-run",attemptId:"bedrock-fixture-run"});
  manifest.compiledPrompt =
    "OFFLINE FIXTURE. Perform the supplied deterministic tool operation and return the required factory JSON result.";
  return {
    profile: p,
    manifest,
    snapshot,
    profileDigest,
    qualification,
    modelRoute,
    runtimeDigest,
    harnessDigest,
  };
}
