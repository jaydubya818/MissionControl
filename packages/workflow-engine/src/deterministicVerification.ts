import { canonicalHash, sha256Hex } from "@mission-control/shared";
import { deterministicDocumentPath } from "./deterministicWorkload.js";

/** A bounded independent byte comparison. Expected bytes must come from a
 * frozen human-approved verification plan, never from a producer PASS flag.
 * This operation alone grants no verification or acceptance authority. */
export const VERIFY_DOCUMENT_OPERATION = "verify-document-bytes/v1" as const;
export const VERIFY_DOCUMENT_OPERATION_DIGEST = `sha256:${canonicalHash({
  operation: VERIFY_DOCUMENT_OPERATION,
  comparison: "sha256-of-utf8-candidate-against-frozen-plan",
  maximumBytes: 20_000,
})}`;

export interface VerifyDocumentWorkload {
  reference: typeof VERIFY_DOCUMENT_OPERATION;
  digest: string;
  input: {
    subjectDigest: string;
    verificationPlanDigest: string;
    repositoryId: string;
    workOrderId: string;
    workOrderRevisionNumber: number;
    producerAttemptId: string;
    candidateSha: string;
    candidateTreeSha: string;
    path: string;
    expectedContentSha256: string;
    candidateContent: string;
  };
}

/** Factory configuration freezes only the approved comparison target. Exact
 * candidate and verifier identities are supplied by canonical admission. */
export interface VerifyDocumentTemplate {
  reference: typeof VERIFY_DOCUMENT_OPERATION;
  digest: string;
  input: { path: string; expectedContentSha256: string };
}

export function verifyDocumentTemplateIssues(value: unknown): string[] {
  if (!exact(value, ["reference", "digest", "input"])
    || value.reference !== VERIFY_DOCUMENT_OPERATION || value.digest !== VERIFY_DOCUMENT_OPERATION_DIGEST
    || !exact(value.input, ["path", "expectedContentSha256"])
    || !deterministicDocumentPath(value.input.path)
    || typeof value.input.expectedContentSha256 !== "string"
    || !/^sha256:[a-f0-9]{64}$/.test(value.input.expectedContentSha256)) return ["verification-template-invalid"];
  return [];
}

function exact(value: unknown, fields: string[]): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...fields].sort().join(",");
}

export function verifyDocumentWorkloadIssues(value: unknown): string[] {
  if (!exact(value, ["reference", "digest", "input"])
    || value.reference !== VERIFY_DOCUMENT_OPERATION || value.digest !== VERIFY_DOCUMENT_OPERATION_DIGEST) {
    return ["verification-operation-unregistered"];
  }
  const input = value.input;
  if (!exact(input, ["subjectDigest", "verificationPlanDigest", "repositoryId", "workOrderId",
    "workOrderRevisionNumber", "producerAttemptId", "candidateSha", "candidateTreeSha", "path",
    "expectedContentSha256", "candidateContent"])) return ["verification-input-fields-invalid"];
  if (![input.subjectDigest, input.verificationPlanDigest, input.expectedContentSha256]
    .every(item => typeof item === "string" && /^sha256:[a-f0-9]{64}$/.test(item))
    || ![input.candidateSha, input.candidateTreeSha].every(item => typeof item === "string" && /^[a-f0-9]{40,64}$/.test(item))
    || ![input.repositoryId, input.workOrderId, input.producerAttemptId]
      .every(item => typeof item === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(item))
    || !Number.isSafeInteger(input.workOrderRevisionNumber) || input.workOrderRevisionNumber < 1
    || !deterministicDocumentPath(input.path)
    || typeof input.candidateContent !== "string"
    || new TextEncoder().encode(input.candidateContent).length > 20_000) return ["verification-input-invalid"];
  return [];
}

export function verifyDocumentBytes(workload: VerifyDocumentWorkload) {
  const issues = verifyDocumentWorkloadIssues(workload);
  if (issues.length) throw new Error(issues.join(","));
  const observedContentSha256 = `sha256:${sha256Hex(new TextEncoder().encode(workload.input.candidateContent))}`;
  return {
    operation: VERIFY_DOCUMENT_OPERATION,
    requestDigest: `sha256:${canonicalHash(workload)}`,
    subjectDigest: workload.input.subjectDigest,
    verificationPlanDigest: workload.input.verificationPlanDigest,
    observedContentSha256,
    matches: observedContentSha256 === workload.input.expectedContentSha256,
    evidenceOrigin: "CONTROL_FIXTURE" as const,
    authority: "NONE" as const,
    behavioralPass: false as const,
  };
}
