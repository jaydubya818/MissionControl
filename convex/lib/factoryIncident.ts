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
  containmentActionCount: number;
  controlReferenceCount: number;
  measurementReferenceCount: number;
}): string | null {
  if (nextFactoryIncidentPhase(input.currentPhase) !== input.nextPhase) {
    return "incident-phase-transition-not-sequential";
  }
  if (input.nextPhase === "CONTAIN" && input.containmentActionCount === 0) {
    return "containment-action-required";
  }
  if (input.nextPhase === "CONTAIN"
    && input.controlReferenceCount < input.containmentActionCount) {
    return "containment-control-reference-required";
  }
  if (input.nextPhase === "MEASURE" && input.measurementReferenceCount === 0) {
    return "measurement-evidence-required";
  }
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
