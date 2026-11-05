import { describe, it, expect } from "vitest";
import { deriveSignedFactoryVerificationIndependence } from "../verificationIndependence.js";
import { createGitVerificationSubject } from "../verificationSubject.js";
const hash = "sha256:" + "a".repeat(64);
function input(): Parameters<typeof deriveSignedFactoryVerificationIndependence>[0] {
  const subject = createGitVerificationSubject({ version: 1, kind: "GIT_CANDIDATE", provider: "LOCAL_GIT",
    workOrderId: "wo", workOrderRevisionNumber: 1, verificationContractDigest: hash, sourceAttemptId: "source",
    repositoryId: "repo", candidateSha: "a".repeat(40), treeSha: "b".repeat(40),
    localRef: { baseRef: "base", headRef: "candidate", headSha: "a".repeat(40) } });
  const expected = { workOrderId: "wo", workOrderRevisionNumber: 1, verificationContractDigest: hash,
    sourceAttemptId: "source", verificationSubjectDigest: subject.digest, verificationSubjectId: subject.subjectId,
    verificationAttemptId: "verifier", verificationRunId: "evaluation", verificationPlanId: "plan", verificationPlanDigest: hash };
  return { expected, subject, sourceAttemptId: "source", verificationAttemptId: "verifier",
    verificationRun: { ...expected, id: "evaluation", workflowRunId: "verifier" }, factoryVersion: "a".repeat(64),
    expectedFactoryVersion: "a".repeat(64), bindingDigest: hash, expectedBindingDigest: hash, resultDigest: hash,
    producerAllocation: "sbx_producer", verifierAllocation: "sbx_verifier", candidateCommit: "a".repeat(40),
    candidateTree: "b".repeat(40), cleanupConfirmed: true, authorityStatus: "PASS", isolatedQualification: true };
}
describe("signed Factory allocation independence", () => {
  it("records actual independent allocations without requiring or inventing native leases", () => {
    expect(deriveSignedFactoryVerificationIndependence(input()).passed).toBe(true);
  });
  it.each([{ verifierAllocation: "sbx_producer" }, { factoryVersion: "b".repeat(64) },
    { bindingDigest: "sha256:" + "b".repeat(64) }, { candidateCommit: "c".repeat(40) },
    { candidateTree: "c".repeat(40) }, { cleanupConfirmed: false }, { authorityStatus: "FAIL" },
    { isolatedQualification: false }, { verificationAttemptId: "source" }, { resultDigest: "unsigned" }])("denies substituted authority %o", patch => {
    expect(deriveSignedFactoryVerificationIndependence({ ...input(), ...patch }).passed).toBe(false);
  });
});
