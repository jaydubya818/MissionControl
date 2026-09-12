import { describe, expect, it } from "vitest";
import { sha256Hex } from "@mission-control/shared";
import { mapOfflineVerification } from "../lib/offlineVerification";
import { gitBlobDigest } from "../lib/gitBlobDigest";

// Mapper conformance only. These constructed records are not execution evidence.
function fixture(): Parameters<typeof mapOfflineVerification>[0] {
  const digest = `sha256:${"a".repeat(64)}`;
  const content = "# Synthetic\n";
  const contentSha256 = `sha256:${sha256Hex(content)}`;
  const candidateSha = "b".repeat(40); const treeSha = "c".repeat(40);
  return {
    retained: { request: { workload: { reference: "verify-document-bytes/v1", input: { producerAttemptId: "producer",
      verificationPlanDigest: digest, subjectDigest: digest, candidateSha, candidateTreeSha: treeSha,
      path: "docs/synthetic.md", candidateContent: content, expectedContentSha256: contentSha256 } } },
      result: { status: "SUCCESS", startedAt: 10, completedAt: 20 }, runtimeResult: {},
      evidence: { schema: "factory-isolated-execution-evidence/v2", container: { id: "d".repeat(64) }, cleanupVerified: true },
      packetDigest: digest } as any,
    packet: { responseDigest: digest, candidateObservation: { candidateSha, treeSha, path: "docs/synthetic.md",
      blobSha: gitBlobDigest(content, 40), contentSha256, observedAt: 21 },
      candidate: { sourceRevision: "e".repeat(40), candidateRevision: candidateSha, treeRevision: treeSha,
        rawDiffSha256: `sha256:${"f".repeat(64)}`,
        changedFiles: ["docs/synthetic.md"], deletedFiles: [], linesAdded: 1, linesDeleted: 0, diff: "+# Synthetic\n" } },
    workOrder: { _id: "work-order", currentRevisionNumber: 1, title: "Synthetic", riskLevel: "LOW", requiredApprovals: [],
      acceptanceCriteria: [{ id: "document", title: "Exact document", requiredEvidence: [{ category: "TEST_RESULT", minimumCount: 1, independent: true }] }],
      verificationContract: { schemaVersion: 2, enforcementMode: "ENFORCED", requireHumanReview: false,
        checks: [{ id: "bytes", name: "Exact bytes", category: "UNIT_TEST", evidenceCategory: "TEST_RESULT",
          mandatory: true, acceptanceCriterionIds: ["document"], verifierId: "factory-command/v1",
          command: { executable: "node", args: ["-e", "process.exit(0)"], commandClass: "TEST", timeoutMs: 10_000 } }] } },
    run: { _id: "verifier" }, sourceAttempt: { _id: "producer", executionBaseSha: "e".repeat(40) },
    verificationRun: { verificationPlanDigest: digest, verificationSubjectDigest: digest }, now: 22,
  };
}

describe("offline verification mapper conformance, not behavioral qualification", () => {
  it("uses the existing engine and preserves control-only byte evidence", async () => {
    const mapped = await mapOfflineVerification(fixture());
    expect(mapped.checks.find(check => check.checkId === "bytes")).toMatchObject({ status: "PASS",
      evidence: [{ metadata: { evidenceOrigin: "CONTROL_FIXTURE", authority: "NONE", behavioralPass: false } }] });
    expect(mapped.checks.some(check => check.verifierId === "factory-verification-authority")).toBe(true);
  });
  it.each(["blob", "tree", "path", "stale", "future", "extra-file", "baseline", "raw-diff", "response", "failed-runtime"])("rejects %s substitution", async mutation => {
    const input = fixture();
    if (mutation === "blob") input.packet.candidateObservation.blobSha = "f".repeat(40);
    if (mutation === "tree") input.packet.candidateObservation.treeSha = "f".repeat(40);
    if (mutation === "path") input.packet.candidateObservation.path = "docs/other.md";
    if (mutation === "stale") input.now = 60_022;
    if (mutation === "future") input.packet.candidateObservation.observedAt = 23;
    if (mutation === "extra-file") input.packet.candidate.changedFiles.push("AGENTS.md");
    if (mutation === "baseline") input.packet.candidate.sourceRevision = "f".repeat(40);
    if (mutation === "raw-diff") input.packet.candidate.rawDiffSha256 = "unbound";
    if (mutation === "response") input.packet.responseDigest = `sha256:${"f".repeat(64)}`;
    if (mutation === "failed-runtime") input.retained.result.status = "WORKLOAD_FAILURE";
    await expect(mapOfflineVerification(input)).rejects.toThrow("not exact and current");
  });
  it("preserves unsupported required checks as NOT_CONFIGURED", async () => {
    const input = fixture();
    input.workOrder.verificationContract.checks.push({ ...input.workOrder.verificationContract.checks[0],
      id: "unavailable", verifierId: "unregistered-unit-test-runner" });
    const mapped = await mapOfflineVerification(input);
    expect(mapped.checks.find(check => check.checkId === "unavailable")?.status).toBe("NOT_CONFIGURED");
    expect(mapped.verdict).not.toBe("VERIFIED");
  });
});
