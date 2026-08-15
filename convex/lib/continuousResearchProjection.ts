import { classifyFreshness } from "./loopEngineering";
import type {
  LoopWorkflowProjection,
  ProjectedLoopClaim,
  ProjectedLoopSource,
} from "./loopWorkflowProjection";

type Confidence = "LOW" | "MEDIUM" | "HIGH";

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return array(value)
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
}

function confidence(value: unknown, fallback: Confidence = "MEDIUM"): Confidence {
  const normalized = String(value ?? "").toUpperCase();
  return normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH"
    ? normalized
    : fallback;
}

function normalizedDecision(value: unknown): "ACCEPTED" | "REJECTED" | "PENDING" {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized.startsWith("ACCEPT")) return "ACCEPTED";
  if (normalized.startsWith("REJECT")) return "REJECTED";
  return "PENDING";
}

function sourceType(value: unknown): ProjectedLoopSource["sourceType"] {
  if (value === "PRIMARY") return "PRIMARY";
  if (value === "OFFICIAL") return "OFFICIAL_DOCS";
  if (value === "VENDOR") return "VENDOR";
  if (value === "COMMUNITY") return "COMMUNITY";
  return "OTHER";
}

function claimKey(value: Record<string, any>): string {
  return String(value.claimId ?? value.id ?? "").trim();
}

function claimStatement(value: Record<string, any>): string {
  return String(value.statement ?? value.claim ?? "").trim();
}

function sourceId(observationId: string): string {
  return `research-observation:${observationId}`;
}

function buildExtractorClaim(
  value: Record<string, any>,
  packetByObservationId: Map<string, Record<string, any>>,
) {
  const id = claimKey(value);
  const statement = claimStatement(value);
  const observationIds = new Set<string>();
  const artifactIds = new Set<string>();
  const issues: string[] = [];
  if (!id) issues.push("Claim id is missing.");
  if (!statement) issues.push(`Claim ${id || "unknown"} has no statement.`);
  const citations = array(value.supportingEvidence).map(record);
  if (citations.length < 1) issues.push(`Claim ${id || "unknown"} has no exact evidence citation.`);
  for (const citation of citations) {
    const observationId = String(citation.observationId ?? "").trim();
    const artifactId = String(citation.artifactId ?? "").trim();
    const quote = String(citation.quote ?? "").trim();
    const observation = packetByObservationId.get(observationId);
    if (!observation || observation.artifactId !== artifactId) {
      issues.push(`Claim ${id || "unknown"} cites evidence outside the frozen packet.`);
      continue;
    }
    if (!quote || !String(observation.excerpt ?? "").includes(quote)) {
      issues.push(`Claim ${id || "unknown"} quote is not present in the frozen excerpt.`);
      continue;
    }
    observationIds.add(observationId);
    artifactIds.add(artifactId);
  }
  return {
    id,
    statement,
    confidence: confidence(value.confidence),
    observationIds: [...observationIds].sort(),
    artifactIds: [...artifactIds].sort(),
    issues,
  };
}

export function projectContinuousResearchContext(
  contextValue: unknown,
  options: { workflowRunId: string; now?: number },
): LoopWorkflowProjection {
  const context = record(contextValue);
  const now = options.now ?? Date.now();
  const packet = record(context.frozenObservationPacket);
  const included = array(packet.includedObservations).map(record);
  const excluded = array(packet.excludedObservations).map(record);
  const packetByObservationId = new Map(
    included.map((observation) => [String(observation.observationId), observation]),
  );
  const extractor = record(context.extractClaimsOutput);
  const verifier = record(context.verifyClaimsOutput);
  const conflicts = new Set<string>([
    ...strings(extractor.conflicts),
    ...strings(verifier.conflicts),
  ]);
  const limitations = new Set<string>([
    ...strings(extractor.limitations),
    ...strings(verifier.limitations),
  ]);

  const extracted = new Map<string, ReturnType<typeof buildExtractorClaim>>();
  for (const claimValue of array(extractor.claims)) {
    const parsed = buildExtractorClaim(record(claimValue), packetByObservationId);
    if (!parsed.id) {
      for (const issue of parsed.issues) limitations.add(issue);
      continue;
    }
    if (extracted.has(parsed.id)) {
      limitations.add(`Extractor emitted duplicate claim id ${parsed.id}.`);
      continue;
    }
    extracted.set(parsed.id, parsed);
  }

  const acceptedById = new Map(
    array(verifier.acceptedClaims).map(record).map((claim) => [claimKey(claim), claim]),
  );
  const rejectedById = new Map(
    array(verifier.rejectedClaims).map(record).map((claim) => [claimKey(claim), claim]),
  );
  const sourceDecisionRows = array(verifier.sourceDecisions).map(record);
  const sourceDecisions = new Map<string, Record<string, any>>();
  for (const decision of sourceDecisionRows) {
    const observationId = String(decision.observationId ?? "").trim();
    if (!observationId || !packetByObservationId.has(observationId)) {
      limitations.add("Verifier returned a source decision outside the frozen observation packet.");
      continue;
    }
    if (sourceDecisions.has(observationId)) {
      limitations.add(`Verifier returned duplicate source decisions for observation ${observationId}.`);
      continue;
    }
    sourceDecisions.set(observationId, decision);
  }

  const claims: ProjectedLoopClaim[] = [];
  const acceptedObservationIds = new Set<string>();
  for (const extractedClaim of extracted.values()) {
    const accepted = acceptedById.get(extractedClaim.id);
    const rejected = rejectedById.get(extractedClaim.id);
    let acceptedClaim = false;
    const claimIssues = [...extractedClaim.issues];
    if (accepted && rejected) {
      claimIssues.push(`Verifier both accepted and rejected claim ${extractedClaim.id}.`);
    } else if (accepted) {
      const verifierObservationIds = strings(accepted.supportingObservationIds).sort();
      const verifierArtifactIds = strings(accepted.supportingArtifactIds).sort();
      if (claimStatement(accepted) !== extractedClaim.statement) {
        claimIssues.push(`Verifier changed the statement for claim ${extractedClaim.id}.`);
      }
      if (
        verifierObservationIds.length < 1
        || verifierObservationIds.some((id) => !extractedClaim.observationIds.includes(id))
      ) {
        claimIssues.push(`Verifier cited observations outside extractor claim ${extractedClaim.id}.`);
      }
      const expectedArtifacts = verifierObservationIds
        .map((id) => String(packetByObservationId.get(id)?.artifactId ?? ""))
        .filter(Boolean)
        .sort();
      if (JSON.stringify(expectedArtifacts) !== JSON.stringify(verifierArtifactIds)) {
        claimIssues.push(`Verifier artifact citations do not match claim ${extractedClaim.id}.`);
      }
      if (verifierObservationIds.some((id) =>
        normalizedDecision(sourceDecisions.get(id)?.decision) !== "ACCEPTED"
      )) {
        claimIssues.push(`Verifier did not accept every cited source for claim ${extractedClaim.id}.`);
      }
      acceptedClaim = claimIssues.length === 0;
      if (acceptedClaim) {
        for (const id of verifierObservationIds) acceptedObservationIds.add(id);
      }
    } else if (!rejected) {
      claimIssues.push(`Verifier did not decide claim ${extractedClaim.id}.`);
    }
    for (const issue of claimIssues) limitations.add(issue);
    const supportingObservationIds = accepted
      ? strings(accepted.supportingObservationIds).filter((id) => packetByObservationId.has(id))
      : [];
    claims.push({
      id: `claim-research:${extractedClaim.id}`,
      statement: extractedClaim.statement,
      supportingSourceIds: acceptedClaim ? supportingObservationIds.map(sourceId) : [],
      contradictorySourceIds: acceptedClaim ? [] : extractedClaim.observationIds.map(sourceId),
      unsupported: !acceptedClaim,
      confidence: acceptedClaim ? confidence(accepted?.confidence) : "LOW",
      createdAt: now,
      createdBy: "continuous-research:claim-verifier",
    });
  }

  for (const [id, verifierClaim] of [...acceptedById, ...rejectedById]) {
    if (!id || extracted.has(id)) continue;
    const statement = claimStatement(verifierClaim) || `Invented claim ${id}`;
    limitations.add(`Verifier decided claim ${id} that was not emitted by the extractor.`);
    claims.push({
      id: `claim-research:invented:${id}`,
      statement,
      supportingSourceIds: [],
      contradictorySourceIds: [],
      unsupported: true,
      confidence: "LOW",
      createdAt: now,
      createdBy: "continuous-research:claim-verifier",
    });
  }

  const sources: ProjectedLoopSource[] = included.map((observation) => {
    const observationId = String(observation.observationId);
    const verifierDecision = sourceDecisions.get(observationId);
    const requestedDecision = normalizedDecision(verifierDecision?.decision);
    const decision = requestedDecision === "ACCEPTED" && acceptedObservationIds.has(observationId)
      ? "ACCEPTED" as const
      : requestedDecision === "PENDING"
        ? "PENDING" as const
        : "REJECTED" as const;
    if (requestedDecision === "ACCEPTED" && decision !== "ACCEPTED") {
      limitations.add(`Observation ${observationId} was accepted without an accepted cited claim.`);
    }
    return {
      id: sourceId(observationId),
      title: String(observation.title ?? observation.providerItemId ?? observationId),
      url: String(observation.canonicalUrl ?? ""),
      publisher: typeof observation.author === "string" ? observation.author : undefined,
      publishedAt: typeof observation.publishedAt === "number" ? observation.publishedAt : undefined,
      retrievedAt: Number(observation.retrievedAt ?? now),
      sourceType: sourceType(observation.trustClassification),
      vendorClaim: observation.trustClassification === "VENDOR",
      canonicalUrl: String(observation.canonicalUrl ?? ""),
      freshness: classifyFreshness(observation.publishedAt, now),
      decision,
      decisionReason: String(
        verifierDecision?.reason
        ?? (decision === "PENDING" ? "The independent verifier did not decide this source." : "No accepted claim cites this observation."),
      ),
      verifiedBy: decision === "PENDING" ? undefined : "continuous-research:claim-verifier",
      verifiedAt: decision === "PENDING" ? undefined : now,
      researchSourceId: observation.sourceId,
      researchSourceRunId: observation.sourceRunId,
      researchObservationId: observation.observationId,
      runArtifactId: observation.artifactId,
      verificationReceiptId: observation.verificationReceiptId,
      providerItemId: observation.providerItemId,
      contentHash: observation.contentHash,
      safetyScanStatus: "PASSED",
    } as ProjectedLoopSource;
  });
  for (const observation of excluded) {
    sources.push({
      id: sourceId(String(observation.observationId)),
      title: String(observation.title ?? observation.providerItemId ?? observation.observationId),
      url: String(observation.canonicalUrl ?? ""),
      retrievedAt: now,
      sourceType: "OTHER",
      vendorClaim: false,
      canonicalUrl: String(observation.canonicalUrl ?? ""),
      freshness: "UNKNOWN",
      decision: "REJECTED",
      decisionReason: String(observation.reason ?? "Excluded by the ingestion safety boundary."),
      verifiedBy: "continuous-research:claim-verifier",
      verifiedAt: now,
      researchSourceId: observation.sourceId,
      researchSourceRunId: observation.sourceRunId,
      researchObservationId: observation.observationId,
      runArtifactId: observation.artifactId,
      verificationReceiptId: observation.verificationReceiptId,
      providerItemId: observation.providerItemId,
      contentHash: observation.contentHash,
      safetyScanStatus: "QUARANTINED",
    } as ProjectedLoopSource);
  }

  const evidenceStatus = String(extractor.evidenceStatus ?? "").toUpperCase();
  const noNewEvidence = verifier.noNewEvidence === true;
  const allSourcesDecided = sources.every((source) => source.decision !== "PENDING");
  const supportedClaims = claims.filter((claim) => !claim.unsupported);
  const cleanStop = evidenceStatus === "NO_NEW_EVIDENCE"
    && extracted.size === 0
    && noNewEvidence
    && supportedClaims.length === 0
    && allSourcesDecided;
  if (noNewEvidence && (evidenceStatus !== "NO_NEW_EVIDENCE" || extracted.size > 0)) {
    conflicts.add("Verifier reported no new evidence while the extractor emitted claims.");
  }
  const targetPhase = cleanStop
    ? "READY_FOR_NEXT_CYCLE" as const
    : supportedClaims.length > 0
      ? "RECOMMEND" as const
      : "VERIFY" as const;

  return {
    sources,
    claims,
    recommendations: [],
    conflicts: [...conflicts],
    limitations: [...limitations],
    measurementSnapshots: [],
    stopCondition: cleanStop
      ? "Independent verification confirmed that the frozen packet contains no new material evidence."
      : undefined,
    approved: false,
    cleanStop,
    targetPhase,
  };
}
