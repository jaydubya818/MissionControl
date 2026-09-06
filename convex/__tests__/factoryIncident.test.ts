import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FACTORY_INCIDENT_PHASES,
  incidentStatusForPhase,
  evaluateIncidentWrite,
  nextFactoryIncidentPhase,
  normalizeEvidenceRefs,
  validateFactoryIncidentTransition,
} from "../lib/factoryIncident";
import {
  FACTORY_INCIDENT_DRILLS,
  validateFactoryIncidentDrillCatalog,
} from "../lib/factoryIncidentDrills";

describe("Factory Incident Command domain", () => {
  it("keeps the lifecycle exact and sequential", () => {
    expect(FACTORY_INCIDENT_PHASES).toEqual([
      "CLARIFY", "CONTAIN", "OBSERVE", "ISOLATE", "RESTORE",
      "CORRECT", "PREVENT", "MEASURE", "RESOLVED",
    ]);
    expect(nextFactoryIncidentPhase("CLARIFY")).toBe("CONTAIN");
    expect(nextFactoryIncidentPhase("MEASURE")).toBe("RESOLVED");
    expect(nextFactoryIncidentPhase("RESOLVED")).toBeNull();
  });

  it("rejects skipped, reversed, and repeated phases", () => {
    for (const nextPhase of ["OBSERVE", "CLARIFY", "RESTORE"] as const) {
      expect(validateFactoryIncidentTransition({
        currentPhase: "CLARIFY",
        nextPhase,
        containmentActionCount: 0,
        controlReferenceCount: 0,
        measurementReferenceCount: 0,
      })).toBe("incident-phase-transition-not-sequential");
    }
  });

  it("requires an exact applied-control reference for every containment action", () => {
    expect(validateFactoryIncidentTransition({
      currentPhase: "CLARIFY",
      nextPhase: "CONTAIN",
      containmentActionCount: 0,
      controlReferenceCount: 0,
      measurementReferenceCount: 0,
    })).toBe("containment-action-required");
    expect(validateFactoryIncidentTransition({
      currentPhase: "CLARIFY",
      nextPhase: "CONTAIN",
      containmentActionCount: 2,
      controlReferenceCount: 1,
      measurementReferenceCount: 0,
    })).toBe("containment-control-reference-required");
    expect(validateFactoryIncidentTransition({
      currentPhase: "CLARIFY",
      nextPhase: "CONTAIN",
      containmentActionCount: 2,
      controlReferenceCount: 2,
      measurementReferenceCount: 0,
    })).toBeNull();
  });

  it("requires measurement evidence before monitoring can close", () => {
    expect(validateFactoryIncidentTransition({
      currentPhase: "PREVENT",
      nextPhase: "MEASURE",
      containmentActionCount: 0,
      controlReferenceCount: 0,
      measurementReferenceCount: 0,
    })).toBe("measurement-evidence-required");
    expect(validateFactoryIncidentTransition({
      currentPhase: "PREVENT",
      nextPhase: "MEASURE",
      containmentActionCount: 0,
      controlReferenceCount: 0,
      measurementReferenceCount: 1,
    })).toBeNull();
  });

  it("projects containment, recovery, monitoring, and resolution without conflating them", () => {
    expect(incidentStatusForPhase("CLARIFY")).toBe("OPEN");
    expect(incidentStatusForPhase("CONTAIN")).toBe("CONTAINED");
    expect(incidentStatusForPhase("RESTORE")).toBe("RECOVERING");
    expect(incidentStatusForPhase("MEASURE")).toBe("MONITORING");
    expect(incidentStatusForPhase("RESOLVED")).toBe("RESOLVED");
  });

  it("deduplicates evidence references without copying evidence content", () => {
    expect(normalizeEvidenceRefs([
      { kind: "TRACE", recordId: "trace-1", relationship: "detected-by" },
      { kind: "TRACE", recordId: "trace-1", relationship: "detected-by" },
      { kind: "ALERT", recordId: "alert-1", relationship: "triggered-by" },
    ])).toEqual([
      { kind: "TRACE", recordId: "trace-1", relationship: "detected-by", subjectDigest: undefined },
      { kind: "ALERT", recordId: "alert-1", relationship: "triggered-by", subjectDigest: undefined },
    ]);
  });

  it("exposes only signed service detect and propose capabilities to agents", () => {
    const commands = readFileSync(new URL("../serviceCommands.ts", import.meta.url), "utf8");
    const client = readFileSync(new URL("../../apps/orchestration-server/src/serviceCommandClient.ts", import.meta.url), "utf8");
    for (const capability of ["incidents.detect", "incidents.propose"]) {
      expect(commands).toContain(capability);
      expect(client).toContain(capability);
    }
    expect(commands).not.toContain("incidents.restore");
    expect(commands).not.toContain("incidents.resolve");
  });

  it("keeps human containment, restoration, and resolution as separate immutable decisions", () => {
    const source = readFileSync(new URL("../factory/incidents.ts", import.meta.url), "utf8");
    expect(source).toContain('args.nextPhase === "CONTAIN"');
    expect(source).toContain('args.nextPhase === "RESTORE"');
    expect(source).toContain('args.nextPhase === "RESOLVED"');
    expect(source).toContain("Resolved incidents are immutable.");
    expect(source).toContain("An incident cannot resolve before explicit authority restoration.");
  });

  it("makes duplicate delivery idempotent and rejects late or reordered writes", () => {
    expect(evaluateIncidentWrite({
      currentSequence: 4,
      expectedSequence: 4,
      status: "CONTAINED",
      targetIncidentId: "incident-1",
      duplicateIncidentId: "incident-1",
    })).toMatchObject({ duplicate: true, reason: "idempotent-replay" });
    expect(evaluateIncidentWrite({
      currentSequence: 4,
      expectedSequence: 3,
      status: "CONTAINED",
      targetIncidentId: "incident-1",
    })).toMatchObject({ allowed: false, reason: "stale-sequence" });
    expect(evaluateIncidentWrite({
      currentSequence: 4,
      expectedSequence: 5,
      status: "CONTAINED",
      targetIncidentId: "incident-1",
    })).toMatchObject({ allowed: false, reason: "stale-sequence" });
    expect(evaluateIncidentWrite({
      currentSequence: 9,
      expectedSequence: 9,
      status: "RESOLVED",
      targetIncidentId: "incident-1",
    })).toMatchObject({ allowed: false, reason: "incident-resolved" });
  });

  it("maps every required agentic threat drill to OWASP, NIST Manage, containment, and source evidence", () => {
    expect(validateFactoryIncidentDrillCatalog()).toEqual({ valid: true, errors: [], drillCount: 12 });
    expect(FACTORY_INCIDENT_DRILLS.map((drill) => drill.id)).toEqual(expect.arrayContaining([
      "prompt-goal-injection",
      "secret-exfiltration-network",
      "tool-mcp-poisoning",
      "identity-approval-bypass",
      "sandbox-policy-mutation",
      "candidate-evidence-substitution",
      "supply-chain-compromise",
      "cross-company-leakage",
      "rogue-agent-cascade",
      "runaway-cost-provider",
      "production-regression",
      "evaluation-regression",
    ]));
  });
});
