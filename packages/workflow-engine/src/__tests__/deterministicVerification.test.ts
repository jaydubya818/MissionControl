import { describe, expect, it } from "vitest";
import { sha256Hex } from "@mission-control/shared";
import { VERIFY_DOCUMENT_OPERATION, VERIFY_DOCUMENT_OPERATION_DIGEST, verifyDocumentBytes,
  verifyDocumentWorkloadIssues, type VerifyDocumentWorkload } from "../deterministicVerification.js";

function fixture(): VerifyDocumentWorkload {
  const content = "# Synthetic document\n\nSynthetic qualification content.\n";
  return { reference: VERIFY_DOCUMENT_OPERATION, digest: VERIFY_DOCUMENT_OPERATION_DIGEST, input: {
    subjectDigest: `sha256:${"a".repeat(64)}`, verificationPlanDigest: `sha256:${"b".repeat(64)}`,
    repositoryId: "synthetic-repository", workOrderId: "synthetic-work-order", workOrderRevisionNumber: 1,
    producerAttemptId: "synthetic-producer", candidateSha: "c".repeat(40), candidateTreeSha: "d".repeat(40),
    path: "docs/synthetic.md", expectedContentSha256: `sha256:${sha256Hex(new TextEncoder().encode(content))}`,
    candidateContent: content,
  } };
}

describe("bounded independent synthetic document comparison", () => {
  it("compares actual bytes without granting acceptance or behavioral authority", () => {
    const result = verifyDocumentBytes(fixture());
    expect(result).toMatchObject({ matches: true, authority: "NONE", evidenceOrigin: "CONTROL_FIXTURE", behavioralPass: false });
  });
  it("preserves a mismatch without changing the approved expected digest", () => {
    const work = fixture(); const expected = work.input.expectedContentSha256;
    work.input.candidateContent += "Mutation\n";
    expect(verifyDocumentBytes(work).matches).toBe(false);
    expect(work.input.expectedContentSha256).toBe(expected);
  });
  it.each(["subjectDigest", "verificationPlanDigest", "repositoryId", "workOrderId", "producerAttemptId",
    "candidateSha", "candidateTreeSha", "workOrderRevisionNumber"] as const)("binds %s into the result", field => {
    const work = fixture(); const before = verifyDocumentBytes(work).requestDigest;
    if (field === "workOrderRevisionNumber") work.input[field] += 1;
    else if (field.endsWith("Digest")) (work.input as any)[field] = `sha256:${"e".repeat(64)}`;
    else if (field.endsWith("Sha")) (work.input as any)[field] = "e".repeat(40);
    else (work.input as any)[field] += "-other";
    expect(verifyDocumentBytes(work).requestDigest).not.toBe(before);
  });
  it("rejects extra authority, path traversal, oversized bytes and unregistered operation", () => {
    const work = fixture();
    for (const altered of [
      { ...work, accepted: true },
      { ...work, digest: `sha256:${"0".repeat(64)}` },
      { ...work, input: { ...work.input, path: "../secret.md" } },
      { ...work, input: { ...work.input, candidateContent: "界".repeat(7000) } },
      { ...work, input: { ...work.input, expectedContentSha256: "unbound" } },
    ]) expect(verifyDocumentWorkloadIssues(altered).length).toBeGreaterThan(0);
  });
});
