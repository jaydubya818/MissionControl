import { v } from "convex/values";

export const FACTORY_INCIDENT_PHASES = [
  "CLARIFY",
  "CONTAIN",
  "OBSERVE",
  "ISOLATE",
  "RESTORE",
  "CORRECT",
  "PREVENT",
  "MEASURE",
  "RESOLVED",
] as const;

export type FactoryIncidentPhase = (typeof FACTORY_INCIDENT_PHASES)[number];

export type FactoryIncidentEvidenceKind =
  | "MISSION" | "WORK_ORDER" | "TASK" | "ATTEMPT" | "TRACE" | "TOOL_CALL"
  | "MODEL_ROUTE" | "FACTORY_VERSION" | "SANDBOX" | "PULL_REQUEST" | "RELEASE"
  | "ALERT" | "EVIDENCE" | "AUDIT" | "CONTROL_RECEIPT";

export type FactoryIncidentContainmentAction =
  | "PAUSE_REPOSITORY_DISPATCH" | "PAUSE_WORKSPACE_DISPATCH" | "CANCEL_ATTEMPT"
  | "REVOKE_ATTEMPT_CREDENTIALS" | "QUARANTINE_WORKER" | "QUARANTINE_HARNESS"
  | "QUARANTINE_MODEL_ROUTE" | "QUARANTINE_TOOL" | "QUARANTINE_FACTORY_VERSION"
  | "DISABLE_GUARDED_AUTO" | "HOLD_PUBLICATION" | "HOLD_RELEASE";

export const factoryIncidentPhaseValidator = v.union(
  v.literal("CLARIFY"),
  v.literal("CONTAIN"),
  v.literal("OBSERVE"),
  v.literal("ISOLATE"),
  v.literal("RESTORE"),
  v.literal("CORRECT"),
  v.literal("PREVENT"),
  v.literal("MEASURE"),
  v.literal("RESOLVED"),
);

export const factoryIncidentSeverityValidator = v.union(
  v.literal("SEV1"),
  v.literal("SEV2"),
  v.literal("SEV3"),
  v.literal("SEV4"),
);

export const factoryIncidentEvidenceKindValidator = v.union(
  v.literal("MISSION"),
  v.literal("WORK_ORDER"),
  v.literal("TASK"),
  v.literal("ATTEMPT"),
  v.literal("TRACE"),
  v.literal("TOOL_CALL"),
  v.literal("MODEL_ROUTE"),
  v.literal("FACTORY_VERSION"),
  v.literal("SANDBOX"),
  v.literal("PULL_REQUEST"),
  v.literal("RELEASE"),
  v.literal("ALERT"),
  v.literal("EVIDENCE"),
  v.literal("AUDIT"),
  v.literal("CONTROL_RECEIPT"),
);

export const factoryIncidentEvidenceRefValidator = v.object({
  kind: factoryIncidentEvidenceKindValidator,
  recordId: v.string(),
  relationship: v.string(),
  subjectDigest: v.optional(v.string()),
});

export const factoryIncidentContainmentActionValidator = v.union(
  v.literal("PAUSE_REPOSITORY_DISPATCH"),
  v.literal("PAUSE_WORKSPACE_DISPATCH"),
  v.literal("CANCEL_ATTEMPT"),
  v.literal("REVOKE_ATTEMPT_CREDENTIALS"),
  v.literal("QUARANTINE_WORKER"),
  v.literal("QUARANTINE_HARNESS"),
  v.literal("QUARANTINE_MODEL_ROUTE"),
  v.literal("QUARANTINE_TOOL"),
  v.literal("QUARANTINE_FACTORY_VERSION"),
  v.literal("DISABLE_GUARDED_AUTO"),
  v.literal("HOLD_PUBLICATION"),
  v.literal("HOLD_RELEASE"),
);

export const factoryIncidentControlExecutionValidator = v.object({
  controlKey: factoryIncidentContainmentActionValidator,
  commandReceipt: factoryIncidentEvidenceRefValidator,
  observedEffectReceipt: factoryIncidentEvidenceRefValidator,
  observedAt: v.number(),
});

export type FactoryIncidentControlExecution = {
  controlKey: FactoryIncidentContainmentAction;
  commandReceipt: { kind: FactoryIncidentEvidenceKind; recordId: string; relationship: string; subjectDigest?: string };
  observedEffectReceipt: { kind: FactoryIncidentEvidenceKind; recordId: string; relationship: string; subjectDigest?: string };
  observedAt: number;
};

export const factoryIncidentProposalKindValidator = v.union(
  v.literal("ENRICHMENT"),
  v.literal("CONTAINMENT"),
  v.literal("CORRECTIVE_WORK"),
);

export function nextFactoryIncidentPhase(
  phase: FactoryIncidentPhase,
): FactoryIncidentPhase | null {
  const index = FACTORY_INCIDENT_PHASES.indexOf(phase);
  return index < 0 || index === FACTORY_INCIDENT_PHASES.length - 1
    ? null
    : FACTORY_INCIDENT_PHASES[index + 1];
}

export function validateFactoryIncidentTransition(input: {
  currentPhase: FactoryIncidentPhase;
  nextPhase: FactoryIncidentPhase;
  containmentActions: readonly FactoryIncidentContainmentAction[];
  controlExecutions: readonly FactoryIncidentControlExecution[];
  restorationControlKeys?: readonly FactoryIncidentContainmentAction[];
  measurementReferenceCount: number;
}): string | null {
  if (nextFactoryIncidentPhase(input.currentPhase) !== input.nextPhase) {
    return "incident-phase-transition-not-sequential";
  }
  if (input.nextPhase === "CONTAIN" && input.containmentActions.length === 0) {
    return "containment-action-required";
  }
  if (input.nextPhase === "CONTAIN") {
    const expected = new Set(input.containmentActions);
    const observed = new Set(input.controlExecutions.map((execution) => execution.controlKey));
    if (expected.size !== input.containmentActions.length
      || observed.size !== input.controlExecutions.length
      || expected.size !== observed.size
      || [...expected].some((controlKey) => !observed.has(controlKey))) {
      return "containment-observed-effect-required";
    }
  }
  if (input.nextPhase === "RESTORE") {
    const expected = new Set(input.restorationControlKeys ?? []);
    const observed = new Set(input.controlExecutions.map((execution) => execution.controlKey));
    if (expected.size === 0
      || observed.size !== input.controlExecutions.length
      || expected.size !== observed.size
      || [...expected].some((controlKey) => !observed.has(controlKey))) {
      return "restoration-observed-effect-required";
    }
  }
  if (!["CONTAIN", "RESTORE"].includes(input.nextPhase) && input.controlExecutions.length > 0) {
    return "control-execution-not-applicable";
  }
  if (input.nextPhase === "MEASURE" && input.measurementReferenceCount === 0) {
    return "measurement-evidence-required";
  }
  return null;
}

export function normalizeControlExecutions(
  executions: FactoryIncidentControlExecution[],
  now = Date.now(),
  notBefore = 0,
) {
  if (executions.length > 12) throw new Error("Too many control executions.");
  const normalized = executions.map((execution) => ({
    controlKey: execution.controlKey,
    commandReceipt: normalizeEvidenceRefs([execution.commandReceipt])[0],
    observedEffectReceipt: normalizeEvidenceRefs([execution.observedEffectReceipt])[0],
    observedAt: execution.observedAt,
  }));
  for (const execution of normalized) {
    const commandKey = `${execution.commandReceipt.kind}:${execution.commandReceipt.recordId}`;
    const effectKey = `${execution.observedEffectReceipt.kind}:${execution.observedEffectReceipt.recordId}`;
    if (!execution.controlKey) throw new Error("Control execution requires a control key.");
    if (commandKey === effectKey) {
      throw new Error("A control acknowledgement cannot prove its observed effect.");
    }
    if (!Number.isSafeInteger(execution.observedAt)
      || execution.observedAt < notBefore
      || execution.observedAt > now) {
      throw new Error("Control observed-effect time is stale, invalid, or in the future.");
    }
  }
  return normalized;
}

export function controlReceiptRejectionReason(input: {
  projectId?: string;
  expectedProjectId: string;
  result?: string;
  checkId?: string;
  expectedCheckId: string;
  createdAt: number;
  earliestCreatedAt: number;
  observedAt: number;
}) {
  if (input.projectId !== input.expectedProjectId) return "control-receipt-outside-workspace";
  if (input.result !== "PASS") return "control-receipt-not-passing";
  if (input.checkId !== input.expectedCheckId) return "control-receipt-role-mismatch";
  if (input.createdAt < input.earliestCreatedAt) return "control-receipt-stale";
  if (input.createdAt > input.observedAt) return "control-receipt-created-after-observation";
  return null;
}

export function incidentStatusForPhase(phase: FactoryIncidentPhase) {
  if (phase === "RESOLVED") return "RESOLVED" as const;
  if (phase === "RESTORE" || phase === "CORRECT") return "RECOVERING" as const;
  if (phase === "PREVENT" || phase === "MEASURE") return "MONITORING" as const;
  if (["CONTAIN", "OBSERVE", "ISOLATE"].includes(phase)) return "CONTAINED" as const;
  return "OPEN" as const;
}

export function evaluateIncidentWrite(input: {
  currentSequence: number;
  expectedSequence: number;
  status: "OPEN" | "CONTAINED" | "RECOVERING" | "MONITORING" | "RESOLVED";
  targetIncidentId: string;
  duplicateIncidentId?: string;
}) {
  if (input.duplicateIncidentId) {
    return input.duplicateIncidentId === input.targetIncidentId
      ? { allowed: false as const, duplicate: true as const, reason: "idempotent-replay" }
      : { allowed: false as const, duplicate: false as const, reason: "idempotency-key-bound-elsewhere" };
  }
  if (!Number.isSafeInteger(input.expectedSequence)
    || input.expectedSequence !== input.currentSequence) {
    return { allowed: false as const, duplicate: false as const, reason: "stale-sequence" };
  }
  if (input.status === "RESOLVED") {
    return { allowed: false as const, duplicate: false as const, reason: "incident-resolved" };
  }
  return { allowed: true as const, duplicate: false as const };
}

export function normalizeIncidentText(value: string, label: string, maximum = 2_000) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 8) throw new Error(`${label} must contain at least 8 characters.`);
  if (normalized.length > maximum) throw new Error(`${label} exceeds ${maximum} characters.`);
  return normalized;
}

export function normalizeEvidenceRefs<
  T extends { kind: string; recordId: string; relationship: string; subjectDigest?: string },
>(refs: T[]): T[] {
  const unique = new Map<string, T>();
  for (const ref of refs) {
    const normalized = {
      ...ref,
      recordId: ref.recordId.trim(),
      relationship: ref.relationship.trim(),
      subjectDigest: ref.subjectDigest?.trim() || undefined,
    };
    if (!normalized.recordId || !normalized.relationship) {
      throw new Error("Incident evidence references require recordId and relationship.");
    }
    const key = `${normalized.kind}:${normalized.recordId}:${normalized.relationship}:${normalized.subjectDigest ?? ""}`;
    unique.set(key, normalized as T);
  }
  return [...unique.values()].slice(0, 100);
}
