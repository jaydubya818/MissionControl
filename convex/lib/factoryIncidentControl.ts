import { v } from "convex/values";

export const REPOSITORY_DISPATCH_CONTROL = "PAUSE_REPOSITORY_DISPATCH" as const;
export const REPOSITORY_DISPATCH_OBSERVER_ID = "repository-dispatch-admission-observer/v1";
export const REPOSITORY_DISPATCH_EXECUTOR_ID = "repository-dispatch-control-executor/v1";
export const INCIDENT_COMMAND_AUTHORITY_ID = "incident-command-authority/v1";
export const INCIDENT_CONTROL_AUTHORITY_MAX_TTL_MS = 5 * 60 * 1_000;

export const repositoryDispatchOperationValidator = v.union(
  v.literal("PAUSE_REPOSITORY_DISPATCH"),
  v.literal("RESUME_REPOSITORY_DISPATCH"),
);

export const repositoryDispatchAdmissionValidator = v.union(
  v.literal("ENABLED"),
  v.literal("DENIED"),
);

export const factoryIncidentControlReceiptTypeValidator = v.union(
  v.literal("COMMAND_REQUESTED"),
  v.literal("COMMAND_ISSUED"),
  v.literal("ACKNOWLEDGED"),
  v.literal("EFFECT_OBSERVED"),
);

export type RepositoryDispatchOperation = "PAUSE_REPOSITORY_DISPATCH" | "RESUME_REPOSITORY_DISPATCH";
export type RepositoryDispatchAdmission = "ENABLED" | "DENIED";

export function expectedAdmissionForOperation(operation: RepositoryDispatchOperation): RepositoryDispatchAdmission {
  return operation === "PAUSE_REPOSITORY_DISPATCH" ? "DENIED" : "ENABLED";
}

export function expectedIncidentPhaseForOperation(operation: RepositoryDispatchOperation) {
  return operation === "PAUSE_REPOSITORY_DISPATCH" ? "CLARIFY" : "ISOLATE";
}

export function repositoryDispatchAdmissionRejectionReason(input: {
  projectId: string;
  projection?: { projectId: unknown; admission: RepositoryDispatchAdmission } | null;
}) {
  if (!input.projection) return null;
  if (String(input.projection.projectId) !== input.projectId) return "repository-dispatch-control-scope-mismatch";
  if (input.projection.admission === "DENIED") return "repository-dispatch-paused";
  return null;
}

export function validateIncidentControlAuthority(input: {
  now: number;
  authorityExpiresAt: number;
  expectedSequence: number;
  actualSequence: number;
  expectedCommanderActorId: string;
  actualCommanderActorId?: string;
  actorId: string;
}) {
  if (!Number.isSafeInteger(input.authorityExpiresAt)
    || input.authorityExpiresAt <= input.now
    || input.authorityExpiresAt > input.now + INCIDENT_CONTROL_AUTHORITY_MAX_TTL_MS) {
    return "incident-control-authority-expired-or-unbounded";
  }
  if (input.expectedSequence !== input.actualSequence) return "incident-control-authority-stale";
  if (!input.actualCommanderActorId
    || input.expectedCommanderActorId !== input.actualCommanderActorId
    || input.actorId !== input.actualCommanderActorId) {
    return "incident-control-commander-mismatch";
  }
  return null;
}

export function validateObservedControlReceipt(input: {
  request: any;
  command: any;
  acknowledgment: any;
  effect: any;
  incidentId: string;
  projectId: string;
  repositoryId: string;
  operation: RepositoryDispatchOperation;
  controlKey: string;
  earliestCreatedAt: number;
  observedAt: number;
  evaluatedAt?: number;
  expectedAuthorityActorId?: string;
  expectedAuthoritySequence?: number;
  expectedRuntimeContractVersion: number;
  restorationAuthorization?: any;
}) {
  const rows = [input.request, input.command, input.acknowledgment, input.effect];
  if (rows.some((row) => !row)) return "incident-control-receipt-missing";
  if (rows.some((row) => String(row.incidentId) !== input.incidentId
    || String(row.projectId) !== input.projectId
    || String(row.repositoryId) !== input.repositoryId
    || row.operation !== input.operation
    || row.controlKey !== input.controlKey)) return "incident-control-receipt-scope-mismatch";
  if (input.request.receiptType !== "COMMAND_REQUESTED"
    || input.command.receiptType !== "COMMAND_ISSUED"
    || input.acknowledgment.receiptType !== "ACKNOWLEDGED"
    || input.effect.receiptType !== "EFFECT_OBSERVED") return "incident-control-receipt-role-mismatch";
  if (input.request.requestId !== input.command.requestId
    || input.command.requestId !== input.acknowledgment.requestId
    || input.command.requestId !== input.effect.requestId
    || String(input.command.predecessorReceiptId) !== String(input.request._id)
    || String(input.acknowledgment.predecessorReceiptId) !== String(input.command._id)
    || String(input.effect.predecessorReceiptId) !== String(input.acknowledgment._id)) {
    return "incident-control-receipt-lineage-mismatch";
  }
  if (input.request.authorityActorId !== input.command.authorityActorId
    || input.command.authorityActorId !== input.acknowledgment.authorityActorId
    || input.command.authorityActorId !== input.effect.authorityActorId
    || input.request.authoritySequence !== input.command.authoritySequence
    || input.command.authoritySequence !== input.acknowledgment.authoritySequence
    || input.command.authoritySequence !== input.effect.authoritySequence
    || input.request.authorityExpiresAt !== input.command.authorityExpiresAt
    || input.command.authorityExpiresAt !== input.acknowledgment.authorityExpiresAt
    || input.command.authorityExpiresAt !== input.effect.authorityExpiresAt
    || (input.expectedAuthorityActorId !== undefined
      && input.command.authorityActorId !== input.expectedAuthorityActorId)
    || (input.expectedAuthoritySequence !== undefined
      && input.command.authoritySequence !== input.expectedAuthoritySequence)) {
    return "incident-control-authority-lineage-mismatch";
  }
  if (rows.some((row) => row.runtimeContractVersion !== input.expectedRuntimeContractVersion)) {
    return "incident-control-runtime-contract-mismatch";
  }
  if (input.operation === "RESUME_REPOSITORY_DISPATCH") {
    const authorizationId = input.command.restorationAuthorizationId;
    if (!authorizationId
      || input.request.restorationAuthorizationId !== authorizationId
      || input.acknowledgment.restorationAuthorizationId !== authorizationId
      || input.effect.restorationAuthorizationId !== authorizationId) {
      return "incident-control-restoration-authority-lineage-mismatch";
    }
    const authorization = input.restorationAuthorization;
    if (!authorization
      || String(authorization._id) !== String(authorizationId)
      || String(authorization.incidentId) !== input.incidentId
      || String(authorization.projectId) !== input.projectId
      || String(authorization.repositoryId) !== input.repositoryId
      || authorization.operation !== input.operation
      || authorization.authorityActorId !== input.command.authorityActorId
      || authorization.authoritySequence !== input.command.authoritySequence
      || authorization.authorityExpiresAt !== input.command.authorityExpiresAt
      || authorization.consumedByRequestId !== input.command.requestId
      || !authorization.consumedAt
      || authorization.consumedAt > input.command.createdAt) {
      return "incident-control-restoration-authority-invalid";
    }
  } else if (rows.some((row) => row.restorationAuthorizationId !== undefined)) {
    return "incident-control-unexpected-restoration-authority";
  }
  if (rows.some((row) => row.result !== "PASS")) {
    return "incident-control-receipt-not-pass";
  }
  if (input.request.producerId !== INCIDENT_COMMAND_AUTHORITY_ID) {
    return "incident-control-authority-identity-mismatch";
  }
  if (input.command.producerId !== REPOSITORY_DISPATCH_EXECUTOR_ID
    || input.acknowledgment.producerId !== REPOSITORY_DISPATCH_EXECUTOR_ID) {
    return "incident-control-executor-identity-mismatch";
  }
  if (input.effect.producerId !== REPOSITORY_DISPATCH_OBSERVER_ID
    || input.command.producerId === input.effect.producerId) return "incident-control-observer-not-independent";
  const expectedAdmission = expectedAdmissionForOperation(input.operation);
  if (input.command.expectedAdmission !== expectedAdmission
    || input.acknowledgment.expectedAdmission !== expectedAdmission
    || input.effect.expectedAdmission !== expectedAdmission
    || input.effect.observedAdmission !== expectedAdmission) return "incident-control-effect-mismatch";
  if (input.request.createdAt < input.earliestCreatedAt
    || input.command.createdAt < input.request.createdAt
    || input.acknowledgment.createdAt < input.command.createdAt
    || input.effect.createdAt < input.acknowledgment.createdAt
    || input.observedAt !== input.effect.createdAt) return "incident-control-receipt-stale";
  if (input.effect.createdAt > input.command.authorityExpiresAt
    || (input.evaluatedAt !== undefined && input.evaluatedAt > input.command.authorityExpiresAt)) {
    return "incident-control-authority-stale";
  }
  return null;
}
