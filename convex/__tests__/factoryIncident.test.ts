import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FACTORY_INCIDENT_PHASES,
  controlReceiptRejectionReason,
  incidentStatusForPhase,
  evaluateIncidentWrite,
  nextFactoryIncidentPhase,
  normalizeControlExecutions,
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
        containmentActions: [],
        controlExecutions: [],
        measurementReferenceCount: 0,
      })).toBe("incident-phase-transition-not-sequential");
    }
  });

  it("requires a distinct command and observed-effect receipt for every containment action", () => {
    expect(validateFactoryIncidentTransition({
      currentPhase: "CLARIFY",
      nextPhase: "CONTAIN",
      containmentActions: [],
      controlExecutions: [],
      restorationControlKeys: ["PAUSE_REPOSITORY_DISPATCH"],
      measurementReferenceCount: 0,
    })).toBe("containment-action-required");
    expect(validateFactoryIncidentTransition({
      currentPhase: "CLARIFY",
      nextPhase: "CONTAIN",
      containmentActions: ["PAUSE_REPOSITORY_DISPATCH", "REVOKE_ATTEMPT_CREDENTIALS"],
      controlExecutions: [{
        controlKey: "PAUSE_REPOSITORY_DISPATCH",
        commandReceipt: { kind: "AUDIT", recordId: "command:pause", relationship: "issued" },
        observedEffectReceipt: { kind: "AUDIT", recordId: "effect:pause", relationship: "observed" },
        observedAt: 1,
      }],
      measurementReferenceCount: 0,
    })).toBe("containment-observed-effect-required");
    expect(validateFactoryIncidentTransition({
      currentPhase: "CLARIFY",
      nextPhase: "CONTAIN",
      containmentActions: ["PAUSE_REPOSITORY_DISPATCH", "REVOKE_ATTEMPT_CREDENTIALS"],
      controlExecutions: [
        { controlKey: "PAUSE_REPOSITORY_DISPATCH", commandReceipt: { kind: "AUDIT", recordId: "command:pause", relationship: "issued" }, observedEffectReceipt: { kind: "AUDIT", recordId: "effect:pause", relationship: "observed" }, observedAt: 1 },
        { controlKey: "REVOKE_ATTEMPT_CREDENTIALS", commandReceipt: { kind: "AUDIT", recordId: "command:revoke", relationship: "issued" }, observedEffectReceipt: { kind: "AUDIT", recordId: "effect:revoke", relationship: "observed" }, observedAt: 2 },
      ],
      measurementReferenceCount: 0,
    })).toBeNull();
  });

  it("rejects forged, duplicate, and acknowledgement-only containment proof", () => {
    expect(() => normalizeControlExecutions([{
      controlKey: "PAUSE_REPOSITORY_DISPATCH",
      commandReceipt: { kind: "AUDIT", recordId: "receipt:ack", relationship: "issued" },
      observedEffectReceipt: { kind: "AUDIT", recordId: "receipt:ack", relationship: "observed" },
      observedAt: 1,
    }], 2)).toThrow("cannot prove its observed effect");
    expect(() => normalizeControlExecutions([{
      controlKey: "PAUSE_REPOSITORY_DISPATCH",
      commandReceipt: { kind: "AUDIT", recordId: "receipt:command", relationship: "issued" },
      observedEffectReceipt: { kind: "AUDIT", recordId: "receipt:effect", relationship: "observed" },
      observedAt: 3,
    }], 2)).toThrow("stale, invalid, or in the future");
    expect(validateFactoryIncidentTransition({
      currentPhase: "CLARIFY",
      nextPhase: "CONTAIN",
      containmentActions: ["PAUSE_REPOSITORY_DISPATCH", "PAUSE_REPOSITORY_DISPATCH"],
      controlExecutions: [
        { controlKey: "PAUSE_REPOSITORY_DISPATCH", commandReceipt: { kind: "AUDIT", recordId: "command:1", relationship: "issued" }, observedEffectReceipt: { kind: "AUDIT", recordId: "effect:1", relationship: "observed" }, observedAt: 1 },
        { controlKey: "PAUSE_REPOSITORY_DISPATCH", commandReceipt: { kind: "AUDIT", recordId: "command:2", relationship: "issued" }, observedEffectReceipt: { kind: "AUDIT", recordId: "effect:2", relationship: "observed" }, observedAt: 1 },
      ],
      measurementReferenceCount: 0,
    })).toBe("containment-observed-effect-required");
  });

  it("rejects cross-workspace, failed, role-mismatched, and post-observation receipts", () => {
    const receipt = {
      projectId: "project-1",
      expectedProjectId: "project-1",
      result: "PASS",
      checkId: "factory-control:PAUSE_REPOSITORY_DISPATCH:effect",
      expectedCheckId: "factory-control:PAUSE_REPOSITORY_DISPATCH:effect",
      createdAt: 10,
      earliestCreatedAt: 9,
      observedAt: 11,
    };
    expect(controlReceiptRejectionReason(receipt)).toBeNull();
    expect(controlReceiptRejectionReason({ ...receipt, projectId: "project-2" })).toBe("control-receipt-outside-workspace");
    expect(controlReceiptRejectionReason({ ...receipt, result: "FAIL" })).toBe("control-receipt-not-passing");
    expect(controlReceiptRejectionReason({ ...receipt, checkId: "factory-control:PAUSE_REPOSITORY_DISPATCH:command" })).toBe("control-receipt-role-mismatch");
    expect(controlReceiptRejectionReason({ ...receipt, earliestCreatedAt: 11 })).toBe("control-receipt-stale");
    expect(controlReceiptRejectionReason({ ...receipt, createdAt: 12 })).toBe("control-receipt-created-after-observation");
  });

  it("requires independently observed restoration and rejects controls in other phases", () => {
    expect(validateFactoryIncidentTransition({
      currentPhase: "ISOLATE",
      nextPhase: "RESTORE",
      containmentActions: [],
      controlExecutions: [],
      measurementReferenceCount: 0,
    })).toBe("restoration-observed-effect-required");
    expect(validateFactoryIncidentTransition({
      currentPhase: "ISOLATE",
      nextPhase: "RESTORE",
      containmentActions: [],
      restorationControlKeys: ["PAUSE_REPOSITORY_DISPATCH", "REVOKE_ATTEMPT_CREDENTIALS"],
      controlExecutions: [{
        controlKey: "PAUSE_REPOSITORY_DISPATCH",
        commandReceipt: { kind: "EVIDENCE", recordId: "command:pause", relationship: "issued" },
        observedEffectReceipt: { kind: "EVIDENCE", recordId: "effect:pause", relationship: "observed" },
        observedAt: 1,
      }],
      measurementReferenceCount: 0,
    })).toBe("restoration-observed-effect-required");
    expect(validateFactoryIncidentTransition({
      currentPhase: "CONTAIN",
      nextPhase: "OBSERVE",
      containmentActions: [],
      controlExecutions: [{
        controlKey: "PAUSE_REPOSITORY_DISPATCH",
        commandReceipt: { kind: "AUDIT", recordId: "command:pause", relationship: "issued" },
        observedEffectReceipt: { kind: "AUDIT", recordId: "effect:pause", relationship: "observed" },
        observedAt: 1,
      }],
      measurementReferenceCount: 0,
    })).toBe("control-execution-not-applicable");
  });

  it("requires measurement evidence before monitoring can close", () => {
    expect(validateFactoryIncidentTransition({
      currentPhase: "PREVENT",
      nextPhase: "MEASURE",
      containmentActions: [],
      controlExecutions: [],
      measurementReferenceCount: 0,
    })).toBe("measurement-evidence-required");
    expect(validateFactoryIncidentTransition({
      currentPhase: "PREVENT",
      nextPhase: "MEASURE",
      containmentActions: [],
      controlExecutions: [],
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
    expect(source).toContain("requireCanonicalControlReceipts");
    expect(source).toContain('args.nextPhase === "RESTORE" || args.nextPhase === "MEASURE"');
    expect(source).not.toContain('ctx.db.patch("workOrders"');
    expect(source).not.toContain('ctx.db.patch("workflowRuns"');
    expect(source).not.toContain('ctx.db.insert("mcpToolGrants"');
    expect(source).not.toContain('ctx.db.patch("mcpToolGrants"');
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
    expect(evaluateIncidentWrite({
      currentSequence: 4,
      expectedSequence: 4,
      status: "CONTAINED",
      targetIncidentId: "incident-1",
      duplicateIncidentId: "incident-2",
    })).toMatchObject({ allowed: false, duplicate: false, reason: "idempotency-key-bound-elsewhere" });
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
