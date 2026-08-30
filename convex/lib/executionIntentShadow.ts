export interface ExecutionIntentIdentity {
  intentId: string;
  idempotencyKey: string;
  requestDigest: string;
}

export type ExecutionIntentIntakeDecision = "CREATE" | "DUPLICATE" | "CONFLICT";

export function decideExecutionIntentIntake(
  existingByIdempotency: ExecutionIntentIdentity | null,
  existingByIntent: ExecutionIntentIdentity | null,
  incoming: ExecutionIntentIdentity,
): ExecutionIntentIntakeDecision {
  if (!existingByIdempotency && !existingByIntent) return "CREATE";
  const candidates = [existingByIdempotency, existingByIntent].filter(
    (candidate): candidate is ExecutionIntentIdentity => candidate !== null,
  );
  return candidates.every(
    (candidate) =>
      candidate.intentId === incoming.intentId &&
      candidate.idempotencyKey === incoming.idempotencyKey &&
      candidate.requestDigest === incoming.requestDigest,
  )
    ? "DUPLICATE"
    : "CONFLICT";
}

export function assertExecutionIntentServiceScope(input: {
  authenticatedSubject: string | null;
  configuredSubject: string | undefined;
  requestedSubject: string;
  configuredOrganizationId: string | undefined;
  requestedOrganizationId: string;
}): void {
  if (
    !input.authenticatedSubject ||
    !input.configuredSubject ||
    input.authenticatedSubject !== input.configuredSubject ||
    input.requestedSubject !== input.configuredSubject
  ) {
    throw new Error("ExecutionIntent service identity is not authorized.");
  }
  if (
    !input.configuredOrganizationId ||
    input.requestedOrganizationId !== input.configuredOrganizationId
  ) {
    throw new Error("ExecutionIntent organization is not authorized.");
  }
}
