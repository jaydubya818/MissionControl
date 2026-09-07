import { ISOLATED_CONTAINER_POLICY, invocationDigest } from "@mission-control/workflow-engine/harness-contract";
import { computeCanonicalHash } from "./genomeHash.js";

export const ISOLATED_SANDBOX_SCHEMA = "factory-sandbox-profile/v2" as const;
export const ISOLATED_SANDBOX_ADMISSION_SCHEMA = "factory-sandbox-admission/v2" as const;

export interface IsolatedSandboxSnapshot {
  schema: typeof ISOLATED_SANDBOX_SCHEMA;
  provider: "LOCAL_CONTAINER";
  profileKey: string;
  version: number;
  imageDigest: string;
  bridgeDigest: string;
  backendDigest: string;
  isolationPolicy: typeof ISOLATED_CONTAINER_POLICY;
  qualification: { evidenceReference: string; evidenceDigest: string; validUntil: number };
}
function exact(value: unknown, keys: string[]): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
const sha = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);

export function isolatedSandboxIssues(value: unknown): string[] {
  if (!exact(value, ["schema", "provider", "profileKey", "version", "imageDigest", "bridgeDigest", "backendDigest", "isolationPolicy", "qualification"])) return ["isolated-sandbox-fields-invalid"];
  const issues: string[] = [];
  if (value.schema !== ISOLATED_SANDBOX_SCHEMA || value.provider !== "LOCAL_CONTAINER") issues.push("isolated-sandbox-class-invalid");
  if (typeof value.profileKey !== "string" || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(value.profileKey)
    || !Number.isSafeInteger(value.version) || value.version < 1) issues.push("isolated-sandbox-identity-invalid");
  if (![value.imageDigest, value.bridgeDigest, value.backendDigest].every(sha)) issues.push("isolated-sandbox-component-digest-invalid");
  if (invocationDigest(value.isolationPolicy) !== invocationDigest(ISOLATED_CONTAINER_POLICY)) issues.push("isolated-sandbox-policy-invalid");
  const evidence = value.qualification;
  if (!exact(evidence, ["evidenceReference", "evidenceDigest", "validUntil"])
    || typeof evidence.evidenceReference !== "string" || evidence.evidenceReference.length < 1 || evidence.evidenceReference.length > 1000
    || /[\x00\r\n]/.test(evidence.evidenceReference) || !sha(evidence.evidenceDigest)
    || !Number.isSafeInteger(evidence.validUntil) || evidence.validUntil <= 0) issues.push("isolated-sandbox-evidence-invalid");
  return issues;
}

export function isolatedSandboxDigest(snapshot: unknown): string {
  if (isolatedSandboxIssues(snapshot).length) throw new Error("Invalid isolated Sandbox Profile");
  return `sha256:${computeCanonicalHash({ namespace: ISOLATED_SANDBOX_SCHEMA, value: snapshot })}`;
}

export function isolatedSandboxAdmission(snapshot: IsolatedSandboxSnapshot, actor: string, now: number) {
  if (typeof actor !== "string" || !actor.trim() || actor.length > 200 || /[\x00\r\n]/.test(actor)
    || !Number.isSafeInteger(now) || now < 0
    || isolatedSandboxIssues(snapshot).length
    || snapshot.qualification.validUntil <= now || snapshot.qualification.validUntil - now > 366 * 86400000) throw new Error("Isolated sandbox qualification is stale or unbounded");
  return { schema: ISOLATED_SANDBOX_ADMISSION_SCHEMA, profileDigest: isolatedSandboxDigest(snapshot),
    imageDigest: snapshot.imageDigest, bridgeDigest: snapshot.bridgeDigest, backendDigest: snapshot.backendDigest,
    isolationDigest: invocationDigest(snapshot.isolationPolicy), evidence: snapshot.qualification,
    scope: { workloadClasses: ["SOFTWARE_CHANGE"], riskClasses: ["GREEN"], externalExecution: "DENIED" },
    promotedBy: actor, promotedAt: now, validUntil: snapshot.qualification.validUntil,
    authority: { routing: false, verification: false, acceptance: false, publication: false, merge: false } };
}

export function isolatedSandboxEligible(record: { immutableSnapshot?: unknown; profileDigest?: string; admissionState?: string; admissionSnapshot?: unknown; admissionDigest?: string; promotedBy?: string; promotedAt?: number; status?: string }, now: number): boolean {
  if (isolatedSandboxIssues(record.immutableSnapshot).length || record.admissionState !== "OFFLINE_ELIGIBLE" || record.status !== "ACTIVE") return false;
  const snapshot = record.immutableSnapshot as IsolatedSandboxSnapshot;
  if (!record.promotedBy || !Number.isSafeInteger(record.promotedAt) || record.promotedAt! > now || snapshot.qualification.validUntil <= now) return false;
  try {
    const admission = isolatedSandboxAdmission(snapshot, record.promotedBy, record.promotedAt!);
    return record.profileDigest === isolatedSandboxDigest(snapshot)
      && computeCanonicalHash(record.admissionSnapshot) === computeCanonicalHash(admission)
      && record.admissionDigest === `sha256:${computeCanonicalHash({ namespace: ISOLATED_SANDBOX_ADMISSION_SCHEMA, value: admission })}`;
  } catch { return false; }
}
