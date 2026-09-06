import { sha256Hex } from "@mission-control/shared";
import { ChangeBudgetVerifier, NegativeConstraintVerifier, VerificationAuthorityVerifier, VerificationEngine,
  type Verifier } from "@mission-control/workflow-engine/verification";
import type { validateOfflineAttemptEvidence } from "./offlineAttemptEvidence";
import { gitBlobDigest } from "./gitBlobDigest";

/** Maps a retained real deterministic response into the existing verification
 * engine. This is qualification evidence only; callers own admission and scope. */
export async function mapOfflineVerification(input: {
  retained: ReturnType<typeof validateOfflineAttemptEvidence>; packet: any; workOrder: any;
  run: any; sourceAttempt: any; verificationRun: any; now: number;
}) {
  const { retained, packet, workOrder, run, sourceAttempt, verificationRun, now } = input;
  const workload = retained.request.workload;
  const observation = packet?.candidateObservation;
  const candidate = packet?.candidate;
  const exact = (value: any, keys: string[]) => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
  if (!exact(packet, ["responseDigest", "candidate", "candidateObservation"])
    || packet.responseDigest !== retained.packetDigest || retained.result.status !== "SUCCESS"
    || !retained.runtimeResult || retained.evidence.schema !== "factory-isolated-execution-evidence/v2"
    || !retained.evidence.container?.id || !retained.evidence.cleanupVerified
    || workload.reference !== "verify-document-bytes/v1"
    || workload.input.producerAttemptId !== String(sourceAttempt._id)
    || workload.input.verificationPlanDigest !== verificationRun.verificationPlanDigest
    || workload.input.subjectDigest !== verificationRun.verificationSubjectDigest
    || !exact(observation, ["candidateSha", "treeSha", "path", "blobSha", "contentSha256", "observedAt"])
    || observation.candidateSha !== workload.input.candidateSha || observation.treeSha !== workload.input.candidateTreeSha
    || observation.path !== workload.input.path
    || observation.contentSha256 !== `sha256:${sha256Hex(workload.input.candidateContent)}`
    || observation.contentSha256 !== workload.input.expectedContentSha256
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(observation.blobSha)
    || observation.blobSha.length !== observation.candidateSha.length
    || observation.treeSha.length !== observation.candidateSha.length
    || observation.blobSha !== gitBlobDigest(workload.input.candidateContent, observation.candidateSha.length)
    || !Number.isSafeInteger(observation.observedAt) || observation.observedAt > now
    || observation.observedAt < retained.result.completedAt || now - observation.observedAt > 60_000
    || !exact(candidate, ["sourceRevision", "candidateRevision", "treeRevision", "rawDiffSha256", "changedFiles", "deletedFiles", "linesAdded", "linesDeleted", "diff"])
    || candidate.sourceRevision !== sourceAttempt.executionBaseSha || candidate.candidateRevision !== workload.input.candidateSha
    || candidate.treeRevision !== workload.input.candidateTreeSha
    || !/^sha256:[a-f0-9]{64}$/.test(candidate.rawDiffSha256)
    || (sourceAttempt.verificationSubject?.version === 2
      && candidate.rawDiffSha256 !== sourceAttempt.verificationSubject.rawDiffSha256)
    || !Array.isArray(candidate.changedFiles) || candidate.changedFiles.length !== 1 || candidate.changedFiles[0] !== workload.input.path
    || !Array.isArray(candidate.deletedFiles) || candidate.deletedFiles.length !== 0
    || !Number.isSafeInteger(candidate.linesAdded) || candidate.linesAdded < 0
    || !Number.isSafeInteger(candidate.linesDeleted) || candidate.linesDeleted < 0
    || typeof candidate.diff !== "string" || new TextEncoder().encode(JSON.stringify(candidate)).length > 64_000) {
    throw new Error("Offline verifier response and independent candidate observation are not exact and current.");
  }
  // The WorkOrder contract names the stable Factory command interface. The
  // exact v4 manifest and retained workload above prove which admitted
  // deterministic implementation fulfilled that interface for this Attempt.
  const byteVerifier: Verifier = {
    id: "factory-command/v1", name: "Admitted deterministic document byte command",
    supports: check => check.verifierId === "factory-command/v1" && Boolean(check.command),
    execute: async (_context, check) => ({
      checkId: check.id, name: check.name, category: check.category, verifierId: check.verifierId,
      mandatory: check.mandatory, status: "PASS", summary: "Actual admitted runtime matched the frozen document digest.",
      acceptanceCriterionIds: check.acceptanceCriterionIds, startedAt: retained.result.startedAt,
      completedAt: retained.result.completedAt, durationMs: retained.result.completedAt - retained.result.startedAt, violations: [],
      evidence: [{ evidenceKey: `${String(run._id)}:${check.id}:${retained.packetDigest}`, category: check.evidenceCategory,
        result: "PASS", summary: "Exact retained runtime bytes match the independent Git blob and approved comparison target.",
        acceptanceCriterionIds: check.acceptanceCriterionIds,
        producer: { id: "verify-document-bytes/v1", role: "VERIFICATION_FACTORY", independent: true, definitionAuthority: "INDEPENDENT" },
        contentHash: observation.contentSha256,
        metadata: { responseDigest: retained.packetDigest, contractVerifierId: "factory-command/v1",
          workloadReference: "verify-document-bytes/v1", evidenceOrigin: "CONTROL_FIXTURE", authority: "NONE", behavioralPass: false } }],
    }),
  };
  const engine = new VerificationEngine([new VerificationAuthorityVerifier(), new ChangeBudgetVerifier(),
    new NegativeConstraintVerifier(), byteVerifier]);
  return engine.execute({ workflowRunId: String(run._id), candidate,
    workOrder: { id: String(workOrder._id), revisionNumber: workOrder.currentRevisionNumber, title: workOrder.title,
      riskLevel: workOrder.riskLevel, riskReasons: workOrder.riskReasons ?? [], acceptanceCriteria: workOrder.acceptanceCriteria,
      negativeConstraints: workOrder.negativeConstraints ?? [], changeBudget: workOrder.changeBudget,
      verificationContract: workOrder.verificationContract, requiredApprovals: workOrder.requiredApprovals ?? [] } });
}
