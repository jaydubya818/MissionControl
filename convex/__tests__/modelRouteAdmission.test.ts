import { describe, expect, it } from "vitest";
import { computeCanonicalHash } from "../lib/genomeHash";
import {
  MODEL_ROUTE_COST_POLICY_SCHEMA,
  MODEL_ROUTE_QUALIFICATION_SCHEMA,
  exactModelRouteDigest,
  exactModelRouteSnapshot,
  modelRouteCostPolicyDigest,
  modelRouteProductionEligible,
  modelRouteQualifiedFor,
} from "../lib/modelRouteAdmission";

const routeSnapshot = exactModelRouteSnapshot({
  provider: "OpenAI",
  providerRoute: "OpenAI",
  modelId: "gpt-5.6-terra",
  capabilityIdentity: {
    adapter: "codex",
    version: "v1",
    capabilityManifestDigest: `sha256:${"1".repeat(64)}`,
    effectiveConfigSha256: "2".repeat(64),
  },
  runtimeIdentity: {
    kind: "CODEX_CLI",
    cliVersion: "0.146.0",
    executableSha256: "3".repeat(64),
  },
});
const routeDigest = exactModelRouteDigest(routeSnapshot);
const qualificationSnapshot = {
  schema: MODEL_ROUTE_QUALIFICATION_SCHEMA,
  routeDigest,
  evidence: { reference: "docs/evidence.json", digest: `sha256:${"4".repeat(64)}` },
  scope: { workloadClasses: ["BUG_FIX"], riskClasses: ["GREEN"] },
  promotedBy: "operator-1",
  promotedAt: 1,
  authority: {
    executionOnly: true,
    routing: false,
    verification: false,
    acceptance: false,
    publication: false,
    merge: false,
  },
};
const qualificationDigest = `sha256:${computeCanonicalHash({
  namespace: MODEL_ROUTE_QUALIFICATION_SCHEMA,
  value: qualificationSnapshot,
})}`;

describe("exact model route admission", () => {
  it("normalizes and freezes the exact route identity", () => {
    expect(routeSnapshot.provider).toBe("openai");
    expect(routeSnapshot.providerRoute).toBe("openai");
    expect(exactModelRouteDigest(routeSnapshot)).toBe(routeDigest);
  });

  it("does not treat registration as qualification", () => {
    expect(modelRouteProductionEligible({
      routeSnapshot,
      routeDigest,
      enabled: false,
      qualificationStatus: "UNQUALIFIED",
      admissionStatus: "DISABLED",
    })).toBe(false);
  });

  it("admits only the exact human-promoted evidence binding", () => {
    const promoted = {
      routeSnapshot,
      routeDigest,
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
      qualificationSnapshot,
      qualificationDigest,
    };
    expect(modelRouteProductionEligible(promoted)).toBe(true);
    expect(modelRouteProductionEligible({ ...promoted, routeDigest: `sha256:${"0".repeat(64)}` })).toBe(false);
    expect(modelRouteProductionEligible({
      ...promoted,
      qualificationSnapshot: {
        ...qualificationSnapshot,
        authority: { ...qualificationSnapshot.authority, routing: true },
      },
    })).toBe(false);
  });

  it("requires exact repository, workload, RED scope, and auditable cost identity", () => {
    const costPolicy = {
      schema: MODEL_ROUTE_COST_POLICY_SCHEMA,
      method: "FULL_APPROVED_WORK_ORDER_CAP_RESERVATION",
      currency: "USD",
      estimatedCostPerRunUsd: 24,
      reservationMode: "FULL_ESTIMATE",
      actualCostTelemetry: "UNAVAILABLE",
      unknownActualCostReason: "Saved ChatGPT authentication does not expose authoritative USD telemetry.",
      evidence: { reference: "docs/red-route.md", digest: `sha256:${"5".repeat(64)}` },
      source: {
        kind: "APPROVED_WORK_ORDER",
        workOrderId: "work-order-1",
        workOrderRevisionNumber: 1,
        missionPlanId: "plan-1",
        missionPlanRevision: 1,
        planEstimatedCostUsd: 32,
        workOrderEstimatedCostUsd: 24,
        hardLimitUsd: 24,
        maxRuntimeMinutes: 60,
        maxAttempts: 3,
      },
    };
    const redQualification = {
      ...qualificationSnapshot,
      scope: {
        workloadClasses: ["SOFTWARE_CHANGE"],
        riskClasses: ["RED", "YELLOW"],
        repositoryIds: ["repository-1"],
      },
      costPolicy,
    };
    const redRoute = {
      routeSnapshot,
      routeDigest,
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
      qualificationSnapshot: redQualification,
      qualificationDigest: `sha256:${computeCanonicalHash({ namespace: MODEL_ROUTE_QUALIFICATION_SCHEMA, value: redQualification })}`,
      riskApproved: true,
      estimatedCostPerRunUsd: 24,
      costPolicySnapshot: costPolicy,
      costPolicyDigest: modelRouteCostPolicyDigest(costPolicy),
    };
    expect(modelRouteQualifiedFor(redRoute, {
      workloadClass: "SOFTWARE_CHANGE",
      riskClass: "RED",
      repositoryId: "repository-1",
    })).toBe(true);
    expect(modelRouteQualifiedFor(redRoute, {
      workloadClass: "SOFTWARE_CHANGE",
      riskClass: "RED",
      repositoryId: "repository-2",
    })).toBe(false);
    expect(modelRouteQualifiedFor(redRoute, {
      workloadClass: "MISSION_PLANNING",
      riskClass: "YELLOW",
      repositoryId: "repository-1",
    })).toBe(false);
    expect(modelRouteProductionEligible({ ...redRoute, estimatedCostPerRunUsd: 0 })).toBe(false);
  });
});
