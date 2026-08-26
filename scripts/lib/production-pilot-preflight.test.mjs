import { describe, expect, it } from "vitest";
import { evaluateProductionPilotPreflight, productionPilotPreflightContract } from "./production-pilot-preflight.mjs";

function validManifest() {
  return {
    schema: "mission-control-production-pilot/v1",
    pilotId: "sellerfi-internal-pilot-1",
    repository: { repository: "sellerfi/marketplace", defaultBranch: "main", dataClassification: "INTERNAL" },
    designPartner: { team: "Marketplace", champion: "Product owner", forwardDeployedEngineer: "Platform lead" },
    execution: { backend: "LOCAL", approvedHostBinding: "sellerfi-local-worker", providerEnforcedEgressProven: false },
    incidentDrill: {
      incidentCommander: "Incident commander",
      completedAt: "2026-08-25T20:00:00.000Z",
      scenario: "Credential revocation and cleanup failure",
      evidenceReferences: ["docs/testing/evidence/pilot/preflight.json"],
      stages: productionPilotPreflightContract.incidentStages.map((stage) => ({
        stage,
        owner: "Incident commander",
        action: `${stage} action completed`,
        evidenceReferences: [`docs/testing/evidence/pilot/${stage.toLowerCase()}.json`],
      })),
    },
    workOrderPortfolio: Array.from({ length: 10 }, (_, index) => ({
      id: `PILOT-${String(index + 1).padStart(2, "0")}`,
      title: `Pilot WorkOrder ${index + 1}`,
      class: productionPilotPreflightContract.requiredWorkOrderClasses[index % 4],
    })),
    failureDrills: productionPilotPreflightContract.requiredFailureDrills.map((kind) => ({ kind, owner: "Platform lead" })),
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

describe("production pilot preflight", () => {
  it("accepts a named, drilled, human-governed local pilot", () => {
    expect(evaluateProductionPilotPreflight(validManifest())).toEqual({ ok: true, findings: [] });
  });

  it("fails closed on placeholder ownership and an incomplete incident lifecycle", () => {
    const manifest = validManifest();
    manifest.designPartner.team = "<team>";
    manifest.incidentDrill.stages = manifest.incidentDrill.stages.slice(0, 2);
    const result = evaluateProductionPilotPreflight(manifest);
    expect(result.ok).toBe(false);
    expect(result.findings).toContain("designPartner.team must be a named non-placeholder value");
    expect(result.findings).toContain("incidentDrill.stages is missing MEASURE");
  });

  it("blocks a sensitive remote pilot without provider-enforced egress", () => {
    const manifest = validManifest();
    manifest.execution = { backend: "REMOTE_SANDBOX", providerEnforcedEgressProven: false };
    expect(evaluateProductionPilotPreflight(manifest).findings)
      .toContain("sensitive remote pilot requires provider-enforced egress proof");
  });

  it("blocks forbidden autonomous authority", () => {
    const manifest = validManifest();
    manifest.authority.autonomousMerge = true;
    expect(evaluateProductionPilotPreflight(manifest).findings)
      .toContain("authority.autonomousMerge must remain disabled");
  });
});
