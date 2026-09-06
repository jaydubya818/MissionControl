import { computeCanonicalHash } from "./genomeHash.js";
import { isolatedSandboxIssues, isolatedSandboxDigest, isolatedSandboxAdmission, isolatedSandboxEligible } from "./isolatedSandbox.js";
import { loadLocalRepositoryAdmission } from "./localRepositoryAdmission.js";
import type { QueryCtx } from "../_generated/server.js";
import type { Id } from "../_generated/dataModel.js";
import { ISOLATED_INVOCATION_EFFECTIVE_CONFIG, ISOLATED_INVOCATION_RUNTIME_ARTIFACT } from "@mission-control/workflow-engine/harness-contract";
import type { OfflineExecutionPolicy } from "./offlineExecutionPolicy.js";

export const LOCAL_SANDBOX_SCHEMA = "local-qualification-sandbox/v1";
const operations = ["render-markdown/v1", "verify-document-bytes/v1"];
const sha = (s: unknown) => typeof s === "string" && /^sha256:[a-f0-9]{64}$/.test(s);
const exact = (x: any, keys: string[]) => x && typeof x === "object" && !Array.isArray(x)
  && Object.keys(x).sort().join(",") === [...keys].sort().join(",");

/** Structural validation only. Authority additionally requires the live exact
 * configured repository admission below. Legacy v2 semantics are untouched. */
export function offlineSandboxIssues(snapshot: any): string[] {
  if (snapshot?.schema !== LOCAL_SANDBOX_SCHEMA) return isolatedSandboxIssues(snapshot);
  const { localQualification, ...base } = snapshot;
  const errors = isolatedSandboxIssues({ ...base, schema: "factory-sandbox-profile/v2" });
  if (snapshot.imageDigest !== ISOLATED_INVOCATION_RUNTIME_ARTIFACT.imageDigest
    || snapshot.bridgeDigest !== ISOLATED_INVOCATION_EFFECTIVE_CONFIG.bridgeImplementationDigest
    || snapshot.backendDigest !== ISOLATED_INVOCATION_EFFECTIVE_CONFIG.backendImplementationDigest) errors.push("local-sandbox-runtime-unadmitted");
  if (!exact(localQualification, ["repositoryId", "repositoryAdmissionDigest", "environmentId", "projectId", "tenantId",
    "operatorId", "program", "operations", "risk", "inference", "transmission", "publication", "production"])
    || !sha(localQualification.repositoryAdmissionDigest)
    || [localQualification.repositoryId, localQualification.environmentId, localQualification.projectId,
      localQualification.tenantId, localQualification.operatorId].some(x => typeof x !== "string" || !x.trim())
    || localQualification.program !== "unpublished-handoff-fixture/v1"
    || JSON.stringify(localQualification.operations) !== JSON.stringify(operations)
    || localQualification.risk !== "GREEN" || localQualification.inference !== "DENIED" || localQualification.transmission !== "DENIED"
    || localQualification.publication !== "NONE" || localQualification.production !== "NONE") errors.push("local-sandbox-capability-invalid");
  return errors;
}

export function offlineSandboxDigest(snapshot: any): string {
  if (snapshot?.schema !== LOCAL_SANDBOX_SCHEMA) return isolatedSandboxDigest(snapshot);
  if (offlineSandboxIssues(snapshot).length) throw new Error("Invalid local qualification sandbox.");
  return `sha256:${computeCanonicalHash({ namespace: LOCAL_SANDBOX_SCHEMA, value: snapshot })}`;
}

export async function assertLocalSandboxScope(
  ctx: Pick<QueryCtx, "db">,
  snapshot: any,
  now: number,
  actorId?: string,
  target?: { projectId: string; tenantId: string | undefined },
) {
  if (snapshot?.schema !== LOCAL_SANDBOX_SCHEMA) return;
  if (offlineSandboxIssues(snapshot).length) throw new Error("Local sandbox capability is invalid.");
  const scope = snapshot.localQualification;
  const repository = await ctx.db.get(scope.repositoryId as Id<"workspaceRepositories">);
  const loaded = await loadLocalRepositoryAdmission(ctx, repository, now);
  const a = loaded.admission;
  if (!repository || scope.repositoryAdmissionDigest !== loaded.digest || scope.projectId !== a.projectId
    || scope.tenantId !== a.tenantId || scope.environmentId !== a.environmentId || scope.operatorId !== a.operatorId
    || (target !== undefined && (scope.projectId !== target.projectId || scope.tenantId !== target.tenantId))
    || scope.program !== a.program || (actorId !== undefined && actorId !== a.operatorId)
    || snapshot.qualification.validUntil > a.expiresAt) throw new Error("Local sandbox exceeds the exact approved repository/environment/operator scope.");
}

export function offlineSandboxAdmission(snapshot: any, actor: string, now: number) {
  if (snapshot?.schema !== LOCAL_SANDBOX_SCHEMA) return isolatedSandboxAdmission(snapshot, actor, now);
  if (offlineSandboxIssues(snapshot).length || actor !== snapshot.localQualification.operatorId) throw new Error("Local sandbox approval operator mismatch.");
  const { localQualification, ...base } = snapshot;
  const legacyValidation = isolatedSandboxAdmission({ ...base, schema: "factory-sandbox-profile/v2" }, actor, now);
  return { ...legacyValidation, schema: "local-qualification-sandbox-admission/v1", profileDigest: offlineSandboxDigest(snapshot),
    localQualification, scope: { workloadClasses: ["SOFTWARE_CHANGE", "VERIFICATION"], riskClasses: ["GREEN"], externalExecution: "DENIED" } };
}

/** Necessary but insufficient: async authority readers also call assertLocalSandboxScope. */
export function offlineSandboxEligible(record: any, now: number): boolean {
  if (record?.immutableSnapshot?.schema !== LOCAL_SANDBOX_SCHEMA) return isolatedSandboxEligible(record, now);
  if (record.admissionState !== "OFFLINE_ELIGIBLE" || record.status !== "ACTIVE"
    || !Number.isSafeInteger(record.promotedAt) || record.promotedAt > now) return false;
  try {
    const snapshot = record.immutableSnapshot;
    if (snapshot.qualification.validUntil <= now || record.projectId !== snapshot.localQualification.projectId
      || record.tenantId !== snapshot.localQualification.tenantId) return false;
    const admission = offlineSandboxAdmission(snapshot, record.promotedBy, record.promotedAt);
    return record.profileDigest === offlineSandboxDigest(snapshot)
      && computeCanonicalHash(record.admissionSnapshot) === computeCanonicalHash(admission)
      && record.admissionDigest === `sha256:${computeCanonicalHash({ namespace: admission.schema, value: admission })}`;
  } catch { return false; }
}

/** Adapter capability projection for the exact local fixture. The frozen
 * workflow and repository admission still authorize the single operation. */
export function localQualificationExecutionPolicy(
  record: any,
  isolationModes: string[],
  now: number,
): OfflineExecutionPolicy {
  const snapshot = record?.immutableSnapshot;
  if (snapshot?.schema !== LOCAL_SANDBOX_SCHEMA || !offlineSandboxEligible(record, now)
    || isolationModes.length !== 1 || !["READ_ONLY", "WORKSPACE_WRITE"].includes(isolationModes[0])) {
    throw new Error("Local qualification requires its admitted sandbox and separate producer/verifier isolation.");
  }
  return {
    schema: "factory-offline-execution-policy/v1",
    bridge: {
      id: "isolated-invocation",
      version: "1",
      implementationDigest: snapshot.bridgeDigest,
      invocationSchema: "factory-isolated-invocation/v2",
      resultSchema: "factory-isolated-result/v2",
    },
    backend: {
      id: "docker-chroot-offline",
      version: "1",
      implementationDigest: snapshot.backendDigest,
      environment: "LOCAL_CONTAINER",
    },
    isolation: {
      profileId: String(record._id),
      profileDigest: record.profileDigest,
      evidenceDigest: snapshot.qualification.evidenceDigest,
      admissionDigest: record.admissionDigest,
      qualifiedAt: record.promotedAt,
      validUntil: snapshot.qualification.validUntil,
    },
    transmission: {
      schema: "factory-transmission-policy/v1",
      mode: "DENY_ALL",
      destinations: [],
      credentialClasses: [],
      maxOutboundBytes: 0,
    },
    budget: {
      schema: "factory-provider-budget/v1",
      mode: "NO_PROVIDER_EXECUTION",
      maxProviderCalls: 0,
      maxProviderLiabilityUsd: 0,
    },
    capabilities: isolationModes[0] === "READ_ONLY"
      ? ["verify-document-bytes"]
      : ["render-markdown", "synthetic-receipt"],
  };
}
