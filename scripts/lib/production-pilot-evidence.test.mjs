import { describe, expect, it } from "vitest";
import { productionPilotPreflightContract } from "./production-pilot-preflight.mjs";
import {
  evaluateProductionPilotEvidence,
  productionPilotEvidenceContract,
} from "./production-pilot-evidence.mjs";

function measuredCost(usd) {
  return { usd, evidenceReferences: ["evidence/billing-receipt.json"] };
}

function validManifest() {
  const workOrderPortfolio = Array.from({ length: 10 }, (_, index) => ({
    id: `PILOT-${String(index + 1).padStart(2, "0")}`,
    title: `Accepted product WorkOrder ${index + 1}`,
    class: productionPilotPreflightContract.requiredWorkOrderClasses[index % 4],
  }));
  return {
    schema: "mission-control-production-pilot/v1",
    pilotId: "product-pilot-1",
    repository: { repository: "company/product", defaultBranch: "main", dataClassification: "INTERNAL" },
    designPartner: { team: "Product team", champion: "Product owner", forwardDeployedEngineer: "Platform lead" },
    execution: { backend: "LOCAL", approvedHostBinding: "product-local-worker", providerEnforcedEgressProven: false },
    incidentDrill: {
      incidentCommander: "Incident commander",
      completedAt: "2026-08-26T08:00:00.000Z",
      scenario: "Credential revocation and cleanup failure",
      evidenceReferences: ["evidence/preflight.json"],
      stages: productionPilotPreflightContract.incidentStages.map((stage) => ({
        stage,
        owner: "Incident commander",
        action: `${stage} completed`,
        evidenceReferences: [`evidence/${stage.toLowerCase()}.json`],
      })),
    },
    workOrderPortfolio,
    results: workOrderPortfolio.map((workOrder, index) => ({
      workOrderId: workOrder.id,
      status: "ACCEPTED",
      lineage: Object.fromEntries(productionPilotEvidenceContract.requiredLineage.map((field) => [
        field,
        field === "pullRequestUrl" ? `https://github.com/company/product/pull/${index + 1}` : `${field}-${index + 1}`,
      ])),
      metrics: {
        timeToReviewReadyPrMs: 60_000,
        reviewLatencyMs: 30_000,
        humanAttentionMinutes: 12,
        retryCount: 0,
        correctionCount: 0,
        recoveryTimeMs: null,
        firstPassVerification: true,
      },
      costs: Object.fromEntries(productionPilotEvidenceContract.costComponents.map((component) => [component, measuredCost(0.1)])),
      outcome: {
        status: "HEALTHY",
        observedAt: "2026-08-26T09:00:00.000Z",
        evidenceReferences: [`evidence/outcome-${index + 1}.json`],
      },
    })),
    failureDrills: productionPilotPreflightContract.requiredFailureDrills.map((kind) => ({
      kind,
      owner: "Platform lead",
      passed: true,
      evidenceReferences: [`evidence/drills/${kind.toLowerCase()}.json`],
    })),
    safetySummary: {
      authorityBoundaryEscapes: 0,
      crossCompanyEscapes: 0,
      secretEscapes: 0,
      repositoryScopeEscapes: 0,
    },
    exitDecision: {
      decision: "GO",
      decidedBy: "Product owner",
      decidedAt: "2026-08-26T10:00:00.000Z",
      acceptedWorkOrderCount: 10,
      remoteSandboxEgressResidualRisk: "Sensitive remote execution remains denied pending provider enforcement.",
      costEfficiencyClaimed: true,
      evidenceReferences: ["evidence/exit-decision.json"],
    },
    authority: {
      humanPlanApproval: true,
      independentVerification: true,
      humanAcceptance: true,
      humanMerge: true,
      guardedAuto: false,
      autonomousMerge: false,
      autonomousDeployment: false,
      learningPromotion: false,
    },
  };
}

describe("production pilot evidence", () => {
  it("accepts ten fully attributed outcomes and computes coverage", () => {
    const result = evaluateProductionPilotEvidence(validManifest());
    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({
      acceptedWorkOrders: 10,
      firstPassVerification: 10,
      costCoverage: { model: { measured: 10, total: 10 } },
    });
  });

  it("preserves unknown cost as null and blocks a cost-efficiency claim", () => {
    const manifest = validManifest();
    manifest.results[0].costs.model = {
      usd: null,
      unknownReason: "Provider invoice unavailable",
      coverageImpact: "Model cost coverage is 9 of 10 accepted WorkOrders",
    };
    const result = evaluateProductionPilotEvidence(manifest);
    expect(result.findings).toContain("exitDecision.costEfficiencyClaimed cannot be true while any accepted cost is unknown");
    expect(result.summary.costCoverage.model).toEqual({ measured: 9, total: 10 });
  });

  it("requires exact incident and rollback linkage", () => {
    const manifest = validManifest();
    manifest.results[0].outcome.status = "INCIDENT";
    const result = evaluateProductionPilotEvidence(manifest);
    expect(result.findings).toContain("results.PILOT-01.outcome.incidentId must be a named non-placeholder value");
  });

  it("accepts a failed drill only with preserved evidence and a decision packet", () => {
    const manifest = validManifest();
    manifest.failureDrills[0].passed = false;
    let result = evaluateProductionPilotEvidence(manifest);
    expect(result.ok).toBe(false);
    manifest.failureDrills[0].decisionPacketReference = "evidence/decisions/restart.json";
    result = evaluateProductionPilotEvidence(manifest);
    expect(result.ok).toBe(true);
  });

  it("fails on any safety escape", () => {
    const manifest = validManifest();
    manifest.safetySummary.secretEscapes = 1;
    expect(evaluateProductionPilotEvidence(manifest).findings)
      .toContain("safetySummary.secretEscapes must equal zero");
  });
});
