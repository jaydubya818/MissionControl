import type { Doc, Id } from "../_generated/dataModel";
import { computeCanonicalHash } from "./genomeHash";
import { loadResearchEvidenceBundle } from "./researchEvidenceBundle";

export const MAX_CONTINUOUS_RESEARCH_OBSERVATIONS = 25;
export const MAX_CONTINUOUS_RESEARCH_EXCERPT_CHARS = 1_200;
export const MAX_CONTINUOUS_RESEARCH_PACKET_BYTES = 48 * 1024;

export function continuousResearchDesiredOutcome(stopCondition: string): string {
  return `Extract cited claims only from the exact observations frozen on this Research Brief, then require a separate Evidence Reviewer to approve or reject each claim. Do not discover new sources, generate recommendations, send messages, schedule work, or change a repository. Stop condition: ${stopCondition.trim()}`;
}

export function continuousResearchWorkOrderDispatchIssues(args: {
  state: string;
  workflowId?: string;
  desiredOutcome: string;
  expectedDesiredOutcome: string;
  isMutating?: boolean;
  metadata?: Record<string, unknown>;
}): string[] {
  const issues: string[] = [];
  if (!["READY", "DISPATCHED", "IN_PROGRESS"].includes(args.state)) {
    issues.push("The Research Brief WorkOrder is not dispatchable.");
  }
  if (args.workflowId !== "continuous-research") {
    issues.push("The WorkOrder is not bound to the continuous-research workflow.");
  }
  if (args.desiredOutcome !== args.expectedDesiredOutcome) {
    issues.push("The WorkOrder objective is broader than the frozen-evidence claim boundary.");
  }
  if (args.isMutating !== false) {
    issues.push("The WorkOrder is not explicitly non-mutating.");
  }
  if (args.metadata?.loopEngineering !== true || args.metadata?.graphEngineering !== true) {
    issues.push("The WorkOrder is missing its Loop Engineering provenance.");
  }
  return issues;
}

export interface FrozenResearchObservation {
  observationId: string;
  sourceId: string;
  sourceRunId: string;
  artifactId: string;
  verificationReceiptId: string;
  providerItemId: string;
  title: string;
  canonicalUrl: string;
  author?: string;
  publishedAt?: number;
  retrievedAt: number;
  contentHash: string;
  trustClassification: string;
  excerpt: string;
}

export interface ExcludedResearchObservation {
  observationId: string;
  sourceId: string;
  sourceRunId: string;
  artifactId: string;
  verificationReceiptId: string;
  providerItemId: string;
  title: string;
  canonicalUrl: string;
  contentHash: string;
  safetyScanStatus: string;
  reason: string;
}

export interface FrozenObservationPacket {
  version: 1;
  includedObservations: FrozenResearchObservation[];
  excludedObservations: ExcludedResearchObservation[];
}

export interface ContinuousResearchInitialContext {
  loopEngineeringCycleId: string;
  researchSourceRunIds: string[];
  researchBrief: NonNullable<Doc<"loopEngineeringCycles">["researchBrief"]>;
  researchEvidenceDigest: string;
  frozenObservationPacket: FrozenObservationPacket;
}

export function continuousResearchObservationDisposition(input: {
  state: string;
  safetyScanStatus: string;
  verificationDecision: string;
  sourceDecision: string;
}): "INCLUDE" | "EXCLUDE" {
  if (input.state !== "ACTIVE") {
    throw new Error("A frozen observation was deleted or superseded after the Research Brief was created.");
  }
  const rejected = input.safetyScanStatus === "QUARANTINED"
    || input.verificationDecision === "REJECTED";
  if (rejected) {
    if (input.sourceDecision !== "REJECTED") {
      throw new Error("Rejected or quarantined evidence cannot enter claim extraction.");
    }
    return "EXCLUDE";
  }
  if (input.safetyScanStatus !== "PASSED" || input.sourceDecision !== "PENDING") {
    throw new Error("Only safety-passed observations awaiting independent claim review may be dispatched.");
  }
  return "INCLUDE";
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function requireSourceLineage(source: Doc<"loopEngineeringCycles">["sources"][number]) {
  if (
    !source.researchSourceId
    || !source.researchSourceRunId
    || !source.researchObservationId
    || !source.runArtifactId
    || !source.verificationReceiptId
    || !source.providerItemId
    || !source.contentHash
    || !source.safetyScanStatus
  ) {
    throw new Error("Every Research Brief source must retain complete typed provenance before dispatch.");
  }
  return {
    researchSourceId: source.researchSourceId,
    researchSourceRunId: source.researchSourceRunId,
    researchObservationId: source.researchObservationId,
    runArtifactId: source.runArtifactId,
    verificationReceiptId: source.verificationReceiptId,
  };
}

export async function buildContinuousResearchInitialContext(
  ctx: { db: any },
  cycleId: Id<"loopEngineeringCycles">,
): Promise<{
  cycle: Doc<"loopEngineeringCycles">;
  workOrderId: Id<"workOrders">;
  context: ContinuousResearchInitialContext;
  includedObservationCount: number;
  excludedObservationCount: number;
}> {
  const cycle = await ctx.db.get(cycleId) as Doc<"loopEngineeringCycles"> | null;
  if (!cycle || !cycle.rootWorkOrderId) {
    throw new Error("The Research Brief cycle has no canonical root WorkOrder.");
  }
  if (cycle.phase !== "RESEARCH") {
    throw new Error("Frozen evidence can only be dispatched while the cycle is in research.");
  }
  if (!cycle.researchBrief) {
    throw new Error("A frozen Research Brief is required before evidence dispatch.");
  }
  const sourceRunIds = [...new Set(cycle.researchSourceRunIds ?? [])].sort();
  if (sourceRunIds.length < 1) {
    throw new Error("The Research Brief has no verified source-run evidence.");
  }
  if (cycle.sources.length < 1) {
    throw new Error("The Research Brief has no provenance-bound observations.");
  }
  if (cycle.sources.length > MAX_CONTINUOUS_RESEARCH_OBSERVATIONS) {
    throw new Error(
      `A continuous-research dispatch is limited to ${MAX_CONTINUOUS_RESEARCH_OBSERVATIONS} observations.`,
    );
  }

  const workOrder = await ctx.db.get(cycle.rootWorkOrderId) as Doc<"workOrders"> | null;
  if (!workOrder || workOrder.projectId !== cycle.projectId) {
    throw new Error("The Research Brief WorkOrder is missing or belongs to another workspace.");
  }
  const workOrderIssues = continuousResearchWorkOrderDispatchIssues({
    state: workOrder.state,
    workflowId: workOrder.workflowId,
    desiredOutcome: workOrder.desiredOutcome,
    expectedDesiredOutcome: continuousResearchDesiredOutcome(cycle.stopCondition),
    isMutating: workOrder.isMutating,
    metadata: workOrder.metadata,
  });
  if (workOrderIssues.length > 0) {
    throw new Error(workOrderIssues[0]);
  }

  const bundles = await Promise.all(sourceRunIds.map((sourceRunId) =>
    loadResearchEvidenceBundle(ctx, cycle.projectId, sourceRunId as Id<"researchSourceRuns">),
  ));
  const observations = new Map(bundles.flatMap((bundle) =>
    bundle.observations.map((observation) => [String(observation._id), { bundle, observation }] as const),
  ));
  if (observations.size !== cycle.sources.length) {
    throw new Error("The frozen source ledger and retained observation set are not identical.");
  }

  const includedObservations: FrozenResearchObservation[] = [];
  const excludedObservations: ExcludedResearchObservation[] = [];
  const seenObservationIds = new Set<string>();

  for (const source of [...cycle.sources].sort((left, right) => left.id.localeCompare(right.id))) {
    const lineage = requireSourceLineage(source);
    const observationId = String(lineage.researchObservationId);
    if (seenObservationIds.has(observationId)) {
      throw new Error("The frozen source ledger contains a duplicate observation.");
    }
    seenObservationIds.add(observationId);
    const retained = observations.get(observationId);
    if (!retained) {
      throw new Error("A frozen source no longer resolves to its retained observation.");
    }
    const { bundle, observation } = retained;
    if (
      lineage.researchSourceId !== observation.sourceId
      || lineage.researchSourceRunId !== bundle.sourceRun._id
      || lineage.runArtifactId !== bundle.artifact._id
      || lineage.verificationReceiptId !== bundle.receipt._id
      || source.providerItemId !== observation.providerItemId
      || source.contentHash !== observation.contentHash
      || source.safetyScanStatus !== observation.safetyScanStatus
    ) {
      throw new Error("A frozen source no longer matches its exact evidence lineage.");
    }
    const disposition = continuousResearchObservationDisposition({
      state: observation.state,
      safetyScanStatus: observation.safetyScanStatus,
      verificationDecision: observation.verificationDecision,
      sourceDecision: source.decision,
    });
    const base = {
      observationId,
      sourceId: String(observation.sourceId),
      sourceRunId: String(bundle.sourceRun._id),
      artifactId: String(bundle.artifact._id),
      verificationReceiptId: String(bundle.receipt._id),
      providerItemId: observation.providerItemId,
      title: observation.title?.trim() || observation.providerItemId,
      canonicalUrl: observation.canonicalUrl,
      contentHash: observation.contentHash,
    };
    if (disposition === "EXCLUDE") {
      excludedObservations.push({
        ...base,
        safetyScanStatus: observation.safetyScanStatus,
        reason: source.decisionReason
          || observation.quarantineReason
          || "The ingestion or verification boundary rejected this observation.",
      });
      continue;
    }
    includedObservations.push({
      ...base,
      author: observation.authorName?.trim() || undefined,
      publishedAt: observation.publishedAt,
      retrievedAt: observation.retrievedAt,
      trustClassification: observation.trustClassification,
      excerpt: (observation.normalizedExcerpt ?? "")
        .trim()
        .slice(0, MAX_CONTINUOUS_RESEARCH_EXCERPT_CHARS),
    });
  }

  const frozenObservationPacket: FrozenObservationPacket = {
    version: 1,
    includedObservations,
    excludedObservations,
  };
  if (byteLength(frozenObservationPacket) > MAX_CONTINUOUS_RESEARCH_PACKET_BYTES) {
    throw new Error(
      `The frozen observation packet exceeds the ${MAX_CONTINUOUS_RESEARCH_PACKET_BYTES / 1024} KB context budget.`,
    );
  }
  const digestPayload = {
    cycleId: String(cycle._id),
    researchSourceRunIds: sourceRunIds.map(String),
    researchBrief: cycle.researchBrief,
    observations: [...includedObservations, ...excludedObservations].map((observation) => ({
      observationId: observation.observationId,
      sourceRunId: observation.sourceRunId,
      artifactId: observation.artifactId,
      verificationReceiptId: observation.verificationReceiptId,
      contentHash: observation.contentHash,
    })),
  };
  const researchEvidenceDigest = `sha256:${computeCanonicalHash(digestPayload)}`;
  return {
    cycle,
    workOrderId: cycle.rootWorkOrderId,
    context: {
      loopEngineeringCycleId: String(cycle._id),
      researchSourceRunIds: sourceRunIds.map(String),
      researchBrief: cycle.researchBrief,
      researchEvidenceDigest,
      frozenObservationPacket,
    },
    includedObservationCount: includedObservations.length,
    excludedObservationCount: excludedObservations.length,
  };
}
