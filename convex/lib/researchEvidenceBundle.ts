import type { Doc, Id } from "../_generated/dataModel";
import { researchEvidenceHandoffIssues } from "./loopResearchEvidence";

export async function loadResearchEvidenceBundle(
  ctx: { db: any },
  projectId: Id<"projects">,
  sourceRunId: Id<"researchSourceRuns">,
) {
  const sourceRun = await ctx.db.get(sourceRunId) as Doc<"researchSourceRuns"> | null;
  if (!sourceRun || sourceRun.projectId !== projectId) {
    throw new Error("Verified research evidence is unavailable or unauthorized.");
  }
  const [source, artifact, receipt, observations] = await Promise.all([
    ctx.db.get(sourceRun.sourceId) as Promise<Doc<"researchSources"> | null>,
    sourceRun.runArtifactId
      ? ctx.db.get(sourceRun.runArtifactId) as Promise<Doc<"runArtifacts"> | null>
      : Promise.resolve(null),
    sourceRun.verificationReceiptId
      ? ctx.db.get(sourceRun.verificationReceiptId) as Promise<Doc<"verificationReceipts"> | null>
      : Promise.resolve(null),
    Promise.all(sourceRun.observationIds.map(
      (id) => ctx.db.get(id) as Promise<Doc<"researchObservations"> | null>,
    )),
  ]);
  const retainedObservations = observations.filter(
    (observation): observation is Doc<"researchObservations"> => observation !== null,
  );
  const issues = researchEvidenceHandoffIssues({
    runProjectId: String(sourceRun.projectId),
    runStatus: sourceRun.status,
    receiptStatus: receipt?.status,
    artifactId: artifact ? String(artifact._id) : undefined,
    observationCount: retainedObservations.length,
    expectedObservationCount: sourceRun.observationIds.length,
    verifier: receipt?.verifier,
    producer: artifact?.producer,
  });
  if (!source || source.projectId !== projectId) {
    issues.push("The governed research source authority is missing or mismatched.");
  }
  if (
    artifact
    && (
      artifact.projectId !== projectId
      || artifact.workflowRunId !== sourceRun.workflowRunId
      || artifact._id !== sourceRun.runArtifactId
    )
  ) {
    issues.push("The retained artifact does not match the verified source run.");
  }
  if (
    receipt
    && (
      receipt.projectId !== projectId
      || receipt.workOrderId !== sourceRun.workOrderId
      || receipt.workflowRunId !== sourceRun.workflowRunId
      || !receipt.linkedRunArtifactIds?.includes(sourceRun.runArtifactId!)
    )
  ) {
    issues.push("The independent receipt does not bind the exact source run artifact.");
  }
  if (retainedObservations.some((observation) =>
    observation.projectId !== projectId
    || observation.sourceId !== sourceRun.sourceId
    || observation.workflowRunId !== sourceRun.workflowRunId
    || observation.runArtifactId !== sourceRun.runArtifactId
    || !["PASSED", "QUARANTINED"].includes(observation.safetyScanStatus)
  )) {
    issues.push("One or more observations fall outside the verified evidence lineage.");
  }
  if (
    issues.length > 0
    || !source
    || !artifact
    || !receipt
    || !sourceRun.runArtifactId
    || !sourceRun.verificationReceiptId
  ) {
    throw new Error(issues[0] ?? "Verified research evidence is incomplete.");
  }
  return { sourceRun, source, artifact, receipt, observations: retainedObservations };
}
