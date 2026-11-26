import { describe, expect, it } from "vitest";
import { buildReviewFacets } from "../lib/reviewFacets";

const tuple = { workOrderId: "wo-1", workOrderRevisionNumber: 2, verificationContractDigest: "sha256:contract",
  sourceAttemptId: "source-1", verificationSubjectDigest: "sha256:subject" };
const observation = { schema: "factory-review-observation/v1",
  rollback: { estimatedMinutes: 12, operatorSteps: 3, requiresDataRestore: false, requiresRedeployment: true, restorationTest: "NOT_RUN" },
  errorDetection: { mechanism: "visible persistence failure", faultInjected: true, signalObserved: true } };
const evidence = { ...tuple, _id: "evidence-1", workflowRunId: "verifier-1", verificationAttemptId: "verifier-1",
  verificationRunId: "verification-1", verificationSubjectId: "subject-1", verificationPlanId: "plan-1", verificationPlanDigest: "sha256:plan",
  acceptanceCriterionIds: ["behavior"], sourceRevision: "base", candidateRevision: "head", result: "PASS", provenance: "LIVE",
  producer: { actorId: "verifier-service", independent: true }, contentHash: `sha256:${"a".repeat(64)}`, recordedAt: 90,
  metadata: { output: `Test passed\nMC_REVIEW_OBSERVATION=${JSON.stringify(observation)}`,
    verifierHost: { platform: "linux", architecture: "x64", nodeVersion: "v22.0.0", unwanted: "not-projected" } } };
const base = { now: 100, packageStatus: "READY", workOrderId: "wo-1", revision: 2, sourceAttemptId: "source-1",
  sourceRevision: "base", candidateRevision: "head", executionClaimedBy: "builder-service",
  currentVerification: { current: true, eligible: true, reasons: [], exactIdentity: tuple,
    sourceAttemptId: "source-1", candidateRevision: "head", verificationAttemptId: "verifier-1", verificationRunId: "verification-1",
    verificationReceiptId: "receipt-1", verificationPlanDigest: "sha256:plan", evidenceSetDigest: "sha256:evidence-set" },
  gate: { _id: "receipt-1", verificationSubjectId: "subject-1", verificationPlanId: "plan-1", evidenceEnvelopeIds: ["evidence-1"] },
  criteria: [{ id: "behavior", status: "PASS", receiptId: "criterion-receipt-1", evidenceEnvelopeIds: ["evidence-1"] }],
  changedFiles: ["src/app.tsx"], deviations: [], rollbackApproach: "Revert the candidate.", evidence: [evidence] };

describe("advisory review facets", () => {
  it("projects exact independent observations without granting acceptance", () => {
    const result = buildReviewFacets(base);
    expect(result).toMatchObject({ authority: "ADVISORY", mandatoryGateStatus: "READY", applicationRuntime: "UNVERIFIED",
      rollback: { observation: observation.rollback, evidenceId: "evidence-1" },
      errorDetection: { observation: observation.errorDetection, evidenceId: "evidence-1" } });
    expect(result.verifierHost).toEqual({ platform: "linux", architecture: "x64", nodeVersion: "v22.0.0", evidenceId: "evidence-1" });
    expect(result.facets.find((facet) => facet.id === "rollback")?.summary).toContain("Restoration test: NOT_RUN");
  });

  it("keeps rollback cost and restoration unknown when only guidance exists", () => {
    const result = buildReviewFacets({ ...base, evidence: [] });
    expect(result.rollback.observation).toBeNull();
    expect(result.facets.find((facet) => facet.id === "rollback")).toMatchObject({ status: "UNKNOWN" });
  });

  it("consumes the actual Policy V2 producer metadata wrapper", () => {
    const result = buildReviewFacets({ ...base, evidence: [{ ...evidence, metadata: {
      serverDerivedIndependence: true, verifierMetadata: evidence.metadata,
    } }] });
    expect(result.rollback.observation).toEqual(observation.rollback);
    expect(result.errorDetection.observation).toEqual(observation.errorDetection);
    expect(result.verifierHost).toMatchObject({ platform: "linux", architecture: "x64", nodeVersion: "v22.0.0" });
  });

  it.each(["output", "reviewObservation", "verifierHost"])("rejects ambiguous wrapped and flat %s fields", (field) => {
    const result = buildReviewFacets({ ...base, evidence: [{ ...evidence, metadata: {
      verifierMetadata: evidence.metadata, [field]: "conflicting-flat-value",
    } }] });
    expect(result.rollback.observation).toBeNull();
    expect(result.verifierHost).toBeNull();
  });

  it.each(["envelope", "producer"])("retains synthetic authority restrictions at the %s level", (level) => {
    const result = buildReviewFacets({ ...base, evidence: [{ ...evidence, metadata: {
      ...(level === "envelope" ? { authority: "NONE", evidenceOrigin: "CONTROL_FIXTURE" } : {}),
      verifierMetadata: { ...evidence.metadata, ...(level === "producer" ? { authority: "NONE", evidenceOrigin: "CONTROL_FIXTURE" } : {}) },
    } }] });
    expect(result.rollback.observation).toBeNull();
    expect(result.verifierHost).toBeNull();
  });

  it("does not choose a structured observation over a second output observation", () => {
    const result = buildReviewFacets({ ...base, evidence: [{ ...evidence, metadata: {
      ...evidence.metadata, reviewObservation: observation,
    } }] });
    expect(result.rollback.observation).toBeNull();
  });

  it("does not establish uniqueness from a truncated output suffix", () => {
    const result = buildReviewFacets({ ...base, evidence: [{ ...evidence, metadata: {
      verifierMetadata: { ...evidence.metadata, outputTruncated: true },
    } }] });
    expect(result.rollback.observation).toBeNull();
    expect(result.errorDetection.observation).toBeNull();
    expect(result.verifierHost).toMatchObject({ platform: "linux" });
  });

  it.each(["SYNTHETIC", "DEMO", "IMPORTED", "LEGACY"])("does not present %s evidence as a live observation", (provenance) => {
    expect(buildReviewFacets({ ...base, evidence: [{ ...evidence, provenance }] }).rollback.observation).toBeNull();
  });

  it.each(["workOrderId", "sourceAttemptId", "verificationAttemptId", "workflowRunId", "verificationRunId", "verificationSubjectId", "verificationSubjectDigest",
    "verificationContractDigest", "verificationPlanId", "verificationPlanDigest", "sourceRevision", "candidateRevision"])("rejects a mismatched %s", (field) => {
    expect(buildReviewFacets({ ...base, evidence: [{ ...evidence, [field]: "different" }] }).errorDetection.observation).toBeNull();
  });

  it.each([
    { workOrderRevisionNumber: 1 }, { recordedAt: 101 }, { contentHash: "not-a-hash" }, { result: "FAIL" },
    { producer: { actorId: "builder-service", independent: true } }, { producer: { actorId: "verifier-service", independent: false } },
    { acceptanceCriterionIds: ["unrelated"] }, { metadata: { ...evidence.metadata, authority: "NONE" } },
    { metadata: { ...evidence.metadata, evidenceOrigin: "CONTROL_FIXTURE" } },
  ])("retains unknown for invalid observation lineage %#", (patch) => {
    expect(buildReviewFacets({ ...base, evidence: [{ ...evidence, ...patch }] }).rollback.observation).toBeNull();
  });

  it("does not fall back to a prior pass when canonical currentness rejects it", () => {
    const result = buildReviewFacets({ ...base, packageStatus: "BLOCKED", currentVerification: { ...base.currentVerification, current: false, eligible: false } });
    expect(result.rollback.observation).toBeNull();
    expect(result.mandatoryGateStatus).toBe("BLOCKED");
    expect(result.facets.find((facet) => facet.id === "verification")?.status).toBe("ATTENTION");
    expect(result.facets.find((facet) => facet.id === "alignment")?.status).toBe("UNKNOWN");
  });

  it("retains unknown alignment without a complete current verification assessment", () => {
    expect(buildReviewFacets({ ...base, currentVerification: undefined }).facets.find((facet) => facet.id === "alignment")?.status).toBe("UNKNOWN");
    expect(buildReviewFacets({ ...base, currentVerification: { ...base.currentVerification, eligible: false } }).facets.find((facet) => facet.id === "alignment")?.status).toBe("UNKNOWN");
  });

  it.each([["PASS"], { value: "PASS" }, 1, true, null, "SUCCEEDED"].map((restorationTest) => ({ restorationTest })))("rejects a malformed restoration status %#", ({ restorationTest }) => {
    const result = buildReviewFacets({ ...base, evidence: [{ ...evidence, metadata: { reviewObservation: {
      ...observation, rollback: { ...observation.rollback, restorationTest },
    } } }] });
    expect(result.rollback.observation).toBeNull();
  });

  it.each(["MISSING", "PENDING", "FAIL", "STALE", "UNKNOWN", "WAIVED"])("does not use %s criterion evidence for operational claims", (status) => {
    expect(buildReviewFacets({ ...base, criteria: [{ ...base.criteria[0], status }] }).rollback.observation).toBeNull();
  });

  it("requires both the current gate and the passed criterion to link evidence", () => {
    expect(buildReviewFacets({ ...base, gate: { ...base.gate, evidenceEnvelopeIds: [] } }).rollback.observation).toBeNull();
    expect(buildReviewFacets({ ...base, gate: { ...base.gate, _id: "older-receipt" } }).rollback.observation).toBeNull();
    expect(buildReviewFacets({ ...base, criteria: [{ ...base.criteria[0], evidenceEnvelopeIds: [] }] }).rollback.observation).toBeNull();
  });

  it.each(["MC_REVIEW_OBSERVATION={bad}", `MC_REVIEW_OBSERVATION=${JSON.stringify(observation)}\nMC_REVIEW_OBSERVATION=${JSON.stringify(observation)}`,
    `MC_REVIEW_OBSERVATION=${JSON.stringify({ ...observation, schema: "unknown/v1" })}`])("ignores malformed or ambiguous observation output %#", (output) => {
    expect(buildReviewFacets({ ...base, evidence: [{ ...evidence, metadata: { output } }] }).rollback.observation).toBeNull();
  });

  it("does not turn a cost estimate into exercised restoration or a failed detection into a pass", () => {
    const result = buildReviewFacets({ ...base, evidence: [{ ...evidence, metadata: { reviewObservation: {
      ...observation, rollback: { ...observation.rollback, restorationTest: "FAIL" },
      errorDetection: { ...observation.errorDetection, signalObserved: false },
    } } }] });
    expect(result.facets.find((facet) => facet.id === "rollback")?.status).toBe("ATTENTION");
    expect(result.facets.find((facet) => facet.id === "error-detection")?.status).toBe("ATTENTION");
    expect(result.mandatoryGateStatus).toBe("READY");
  });

  it("does not let favorable observations erase a failed mandatory gate", () => {
    const result = buildReviewFacets({ ...base, packageStatus: "BLOCKED" });
    expect(result.rollback.observation).not.toBeNull();
    expect(result.mandatoryGateStatus).toBe("BLOCKED");
    expect(result.facets.find((facet) => facet.id === "verification")?.status).toBe("ATTENTION");
  });
});
