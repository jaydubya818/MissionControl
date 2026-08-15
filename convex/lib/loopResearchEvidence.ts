import { classifyFreshness } from "./loopEngineering";

export interface ResearchEvidenceHandoffInput {
  cycleProjectId?: string;
  runProjectId: string;
  runStatus: string;
  receiptStatus?: string;
  artifactId?: string;
  observationCount: number;
  expectedObservationCount: number;
  verifier?: string;
  producer?: string;
}

export function researchEvidenceHandoffIssues(
  input: ResearchEvidenceHandoffInput,
): string[] {
  const issues: string[] = [];
  if (input.cycleProjectId && input.cycleProjectId !== input.runProjectId) {
    issues.push("The verified source run belongs to a different workspace.");
  }
  if (input.runStatus !== "VERIFIED") {
    issues.push("The source run must complete independent verification before research can begin.");
  }
  if (input.receiptStatus !== "PASSED") {
    issues.push("A passing independent verification receipt is required.");
  }
  if (!input.artifactId) {
    issues.push("The verified source run has no retained evidence artifact.");
  }
  if (input.expectedObservationCount < 1) {
    issues.push("The verified source run contains no observations to research.");
  }
  if (input.observationCount !== input.expectedObservationCount) {
    issues.push("The verified observation lineage is incomplete.");
  }
  if (input.verifier && input.producer && input.verifier === input.producer) {
    issues.push("The evidence producer cannot independently verify its own artifact.");
  }
  return issues;
}

export interface ResearchObservationProjectionInput {
  observationId: string;
  researchSourceId: string;
  researchSourceRunId: string;
  runArtifactId: string;
  verificationReceiptId: string;
  providerItemId: string;
  title: string;
  canonicalUrl: string;
  author?: string;
  publishedAt?: number;
  retrievedAt: number;
  contentHash: string;
  safetyScanStatus: "PASSED" | "QUARANTINED";
  verificationDecision: "PENDING" | "ACCEPTED" | "REJECTED";
  quarantineReason?: string;
  verifier: string;
  verifiedAt: number;
}

export function projectResearchObservationSource(
  observation: ResearchObservationProjectionInput,
  now = Date.now(),
) {
  const rejected = observation.safetyScanStatus === "QUARANTINED"
    || observation.verificationDecision === "REJECTED";
  return {
    id: `research-observation:${observation.observationId}`,
    title: observation.title.trim() || observation.providerItemId,
    url: observation.canonicalUrl,
    publisher: observation.author?.trim() || undefined,
    publishedAt: observation.publishedAt,
    retrievedAt: observation.retrievedAt,
    sourceType: "OTHER" as const,
    vendorClaim: false,
    canonicalUrl: observation.canonicalUrl,
    freshness: classifyFreshness(observation.publishedAt, now),
    decision: rejected ? "REJECTED" as const : "PENDING" as const,
    decisionReason: rejected
      ? observation.quarantineReason || "The ingestion safety boundary rejected this observation."
      : undefined,
    verifiedBy: rejected ? observation.verifier : undefined,
    verifiedAt: rejected ? observation.verifiedAt : undefined,
    researchSourceId: observation.researchSourceId,
    researchSourceRunId: observation.researchSourceRunId,
    researchObservationId: observation.observationId,
    runArtifactId: observation.runArtifactId,
    verificationReceiptId: observation.verificationReceiptId,
    providerItemId: observation.providerItemId,
    contentHash: observation.contentHash,
    safetyScanStatus: observation.safetyScanStatus,
  };
}
