import { computeCanonicalHash } from "./genomeHash";
import { validateOfflineAttemptEvidence } from "./offlineAttemptEvidence";

export function executionProfileEvidence(run: any) {
  if (!run?.executionProfileId) return undefined;
  const profile = run.executionProfileSnapshot as Record<string, any> | undefined;
  const qualification = run.executionProfileQualificationSnapshot as Record<string, any> | undefined;
  const selectedIsolation = (run.executionManifest as Record<string, any> | undefined)?.harness?.isolation;
  return {
    profileId: String(run.executionProfileId),
    profileKey: run.executionProfileKey,
    version: run.executionProfileVersion,
    profileDigest: run.executionProfileDigest,
    qualificationDigest: run.executionProfileQualificationDigest,
    qualificationEvidence: qualification?.evidence,
    qualificationValidUntil: qualification?.validUntil,
    ...(profile?.harness ? {
      harness: {
        adapter: profile.harness.adapter,
        version: profile.harness.version,
        capabilityManifestDigest: profile.harness.capabilityManifestDigest,
        effectiveConfigSha256: profile.harness.effectiveConfigSha256,
      },
    } : {}),
    ...(profile?.runtimeArtifact?.digest ? { runtimeArtifactDigest: profile.runtimeArtifact.digest } : {}),
    ...(profile?.executionBackend ? { executionBackend: profile.executionBackend } : {}),
    ...(profile?.modelRoute ? {
      modelRoute: profile.executionBackend === "isolated-container" ? profile.modelRoute : {
        catalogId: profile.modelRoute.catalogId,
        routeDigest: profile.modelRoute.routeDigest,
        qualificationDigest: profile.modelRoute.qualificationDigest,
      },
    } : {}),
    ...(profile?.sandboxProfile ? {
      sandboxProfile: {
        profileId: profile.sandboxProfile.profileId,
        profileDigest: profile.sandboxProfile.profileDigest,
      },
    } : {}),
    ...(profile?.toolGrant ? {
      toolGrant: {
        grantId: profile.toolGrant.grantId,
        grantDigest: profile.toolGrant.grantDigest,
        operation: profile.toolGrant.grantSnapshot?.operation,
        expiresAt: profile.toolGrant.grantSnapshot?.expiresAt,
        admission: profile.toolGrant.grantSnapshot?.toolVersionSnapshot?.admission === "QUALIFIED_REAL_READ_ONLY_SERVICE"
          ? "QUALIFIED_REAL_READ_ONLY_SERVICE"
          : "QUALIFICATION_FIXTURE",
      },
    } : { toolCapability: "NO_TOOL_CAPABILITY" }),
    ...(typeof selectedIsolation === "string" ? { selectedIsolation } : {}),
  };
}

export function assertReportedExecutionProfileEvidence(metadata: any, expected: ReturnType<typeof executionProfileEvidence>) {
  if (metadata?.executionProfile === undefined) return;
  if (!expected
    || computeCanonicalHash(metadata.executionProfile) !== computeCanonicalHash(expected)) {
    throw new Error("Factory evidence Execution Profile identity does not match the frozen Attempt.");
  }
}


export function validateStoredOfflineResponse(
  artifact: any,
  request: Parameters<typeof validateOfflineAttemptEvidence>[1],
  run: any,
  args: any,
) {
  const metadata = artifact?.metadata;
  if (!run || !artifact || artifact.workflowRunId !== run._id || artifact.projectId !== run.projectId
    || artifact.tenantId !== run.tenantId || artifact.workOrderId !== run.workOrderId
    || artifact.missionId !== run.missionId || artifact.artifactType !== "STRUCTURED_OUTPUT"
    || artifact.idempotencyKey !== `factory:${run.runId}:${args.leaseId}:offline-response`
    || artifact.producer !== `service:${args.ownerId}`
    || metadata?.schema !== "factory-offline-attempt-evidence/v1" || metadata.evidenceOrigin !== "CONTROL_FIXTURE"
    || metadata.authority !== "NONE" || metadata.behavioralPass !== false
    || metadata.leaseId !== args.leaseId || metadata.workerId !== args.workerId
    || metadata.workerSessionId !== args.workerSessionId || metadata.workerGeneration !== args.workerGeneration
    || metadata.executionManifestDigest !== run.executionManifestDigest
    || !["CURRENT_AT_INGESTION", "STALE_FENCED"].includes(metadata.disposition)) {
    throw new Error("Stored offline response provenance is invalid.");
  }
  assertReportedExecutionProfileEvidence(metadata, executionProfileEvidence(run));
  const parsed = validateOfflineAttemptEvidence(metadata.packet, request);
  if (parsed.packetDigest !== artifact.contentHash) throw new Error("Stored offline response digest is invalid.");
  return parsed;
}

