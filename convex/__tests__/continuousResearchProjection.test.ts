import { describe, expect, it } from "vitest";
import { projectContinuousResearchContext } from "../lib/continuousResearchProjection";

const observation = {
  observationId: "observation-1",
  sourceId: "source-1",
  sourceRunId: "run-1",
  artifactId: "artifact-1",
  verificationReceiptId: "receipt-1",
  providerItemId: "item-1",
  title: "Verified update",
  canonicalUrl: "https://example.com/update",
  retrievedAt: Date.UTC(2026, 7, 11),
  contentHash: "sha256:content",
  trustClassification: "OFFICIAL",
  excerpt: "The platform now supports durable agent checkpoints.",
};

function context(overrides: Record<string, unknown> = {}) {
  return {
    frozenObservationPacket: {
      version: 1,
      includedObservations: [observation],
      excludedObservations: [],
    },
    extractClaimsOutput: {
      status: "COMPLETED",
      evidenceStatus: "CLAIMS_FOUND",
      claims: [{
        claimId: "claim-1",
        statement: "The platform supports durable agent checkpoints.",
        confidence: "HIGH",
        supportingEvidence: [{
          observationId: "observation-1",
          artifactId: "artifact-1",
          quote: "supports durable agent checkpoints",
        }],
      }],
      conflicts: [],
      limitations: [],
    },
    verifyClaimsOutput: {
      status: "COMPLETED",
      noNewEvidence: false,
      acceptedClaims: [{
        claimId: "claim-1",
        statement: "The platform supports durable agent checkpoints.",
        supportingObservationIds: ["observation-1"],
        supportingArtifactIds: ["artifact-1"],
        confidence: "HIGH",
        reason: "Exact retained excerpt supports the claim.",
      }],
      rejectedClaims: [],
      sourceDecisions: [{
        observationId: "observation-1",
        decision: "ACCEPTED",
        reason: "Supports accepted claim claim-1.",
      }],
      conflicts: [],
      limitations: [],
    },
    ...overrides,
  };
}

describe("continuous research projection", () => {
  it("accepts only an extracted claim with exact observation and artifact citations", () => {
    const projection = projectContinuousResearchContext(context(), {
      workflowRunId: "workflow-run-1",
      now: Date.UTC(2026, 7, 11),
    });

    expect(projection.claims).toEqual([expect.objectContaining({
      id: "claim-research:claim-1",
      supportingSourceIds: ["research-observation:observation-1"],
      unsupported: false,
      createdBy: "continuous-research:claim-verifier",
    })]);
    expect(projection.sources[0]).toMatchObject({
      id: "research-observation:observation-1",
      decision: "ACCEPTED",
      runArtifactId: "artifact-1",
      researchObservationId: "observation-1",
    });
    expect(projection.targetPhase).toBe("RECOMMEND");
    expect(projection.recommendations).toEqual([]);
  });

  it("rejects an invented claim and an artifact citation mismatch", () => {
    const invalid = context();
    (invalid.verifyClaimsOutput as any).acceptedClaims = [
      {
        ...(invalid.verifyClaimsOutput as any).acceptedClaims[0],
        supportingArtifactIds: ["artifact-other"],
      },
      {
        claimId: "claim-invented",
        statement: "Invented statement",
        supportingObservationIds: ["observation-1"],
        supportingArtifactIds: ["artifact-1"],
        confidence: "HIGH",
        reason: "Invented",
      },
    ];

    const projection = projectContinuousResearchContext(invalid, {
      workflowRunId: "workflow-run-1",
    });

    expect(projection.claims.every((claim) => claim.unsupported)).toBe(true);
    expect(projection.limitations).toEqual(expect.arrayContaining([
      expect.stringContaining("artifact citations do not match"),
      expect.stringContaining("not emitted by the extractor"),
    ]));
    expect(projection.targetPhase).toBe("VERIFY");
  });

  it("treats independently verified no-new-evidence as a clean stop", () => {
    const empty = context({
      extractClaimsOutput: {
        status: "COMPLETED",
        evidenceStatus: "NO_NEW_EVIDENCE",
        claims: [],
        conflicts: [],
        limitations: [],
      },
      verifyClaimsOutput: {
        status: "COMPLETED",
        noNewEvidence: true,
        acceptedClaims: [],
        rejectedClaims: [],
        sourceDecisions: [{
          observationId: "observation-1",
          decision: "REJECTED",
          reason: "No material claim answers the brief.",
        }],
        conflicts: [],
        limitations: [],
      },
    });

    const projection = projectContinuousResearchContext(empty, {
      workflowRunId: "workflow-run-1",
    });

    expect(projection.cleanStop).toBe(true);
    expect(projection.targetPhase).toBe("READY_FOR_NEXT_CYCLE");
    expect(projection.claims).toEqual([]);
  });

  it("keeps quarantined evidence rejected without requiring its excerpt", () => {
    const quarantined = context({
      frozenObservationPacket: {
        version: 1,
        includedObservations: [],
        excludedObservations: [{
          ...observation,
          excerpt: undefined,
          safetyScanStatus: "QUARANTINED",
          reason: "Instruction-like content was quarantined.",
        }],
      },
      extractClaimsOutput: {
        status: "COMPLETED",
        evidenceStatus: "NO_NEW_EVIDENCE",
        claims: [],
        conflicts: [],
        limitations: [],
      },
      verifyClaimsOutput: {
        status: "COMPLETED",
        noNewEvidence: true,
        acceptedClaims: [],
        rejectedClaims: [],
        sourceDecisions: [],
        conflicts: [],
        limitations: [],
      },
    });

    const projection = projectContinuousResearchContext(quarantined, {
      workflowRunId: "workflow-run-1",
    });

    expect(projection.sources[0]).toMatchObject({
      decision: "REJECTED",
      decisionReason: "Instruction-like content was quarantined.",
      safetyScanStatus: "QUARANTINED",
    });
  });
});
