export type FactoryDeploymentClass = "local" | "shared" | "production" | undefined;

export type FactoryCostEnforcementDecision =
  | {
      allowed: true;
      enforcement: "LOCAL_DEMO_ONLY" | "PROVIDER_KEY_LIMIT";
      perAttemptLimitUsd: number | null;
      telemetry: "UNKNOWN_ALLOWED_BY_HARD_CAP" | "UNKNOWN_LOCAL_DEMO";
    }
  | {
      allowed: false;
      reason:
        | "budget-invalid"
        | "persistent-worker-cost-cap-unavailable"
        | "provider-key-limit-required"
        | "provider-key-limit-invalid"
        | "aggregate-provider-cap-exceeds-budget";
    };

/**
 * Decides whether one immutable Factory binding can enforce its model-spend
 * budget without inventing cost telemetry.
 *
 * Persistent CLI adapters currently expose token counts but no authoritative
 * dollar telemetry or provider-side hard cap. They remain useful on an
 * explicitly local backend, but cannot qualify a shared/production Factory.
 * Remote sandbox attempts mint one provider key per Attempt. Requiring the
 * per-Attempt cap multiplied by the maximum number of Attempts to stay within
 * the Factory budget preserves the aggregate bound even when observed cost is
 * unavailable.
 */
export function assessFactoryCostEnforcement(input: {
  deploymentClass: FactoryDeploymentClass;
  executionBackend: string;
  maxCostUsd: number;
  maxAttempts: number;
  sandboxSpend?: {
    maxUsd?: number;
    enforcement?: string;
  } | null;
}): FactoryCostEnforcementDecision {
  if (!Number.isFinite(input.maxCostUsd)
    || input.maxCostUsd <= 0
    || !Number.isSafeInteger(input.maxAttempts)
    || input.maxAttempts < 1) {
    return { allowed: false, reason: "budget-invalid" };
  }

  if (input.executionBackend === "persistent-worker") {
    if (input.deploymentClass === "local") {
      return {
        allowed: true,
        enforcement: "LOCAL_DEMO_ONLY",
        perAttemptLimitUsd: null,
        telemetry: "UNKNOWN_LOCAL_DEMO",
      };
    }
    return { allowed: false, reason: "persistent-worker-cost-cap-unavailable" };
  }

  if (input.executionBackend !== "remote-sandbox"
    || input.sandboxSpend?.enforcement !== "PROVIDER_KEY_LIMIT") {
    return { allowed: false, reason: "provider-key-limit-required" };
  }
  const perAttemptLimitUsd = input.sandboxSpend.maxUsd;
  if (!Number.isFinite(perAttemptLimitUsd)
    || (perAttemptLimitUsd ?? 0) <= 0) {
    return { allowed: false, reason: "provider-key-limit-invalid" };
  }
  if ((perAttemptLimitUsd as number) * input.maxAttempts > input.maxCostUsd + Number.EPSILON) {
    return { allowed: false, reason: "aggregate-provider-cap-exceeds-budget" };
  }
  return {
    allowed: true,
    enforcement: "PROVIDER_KEY_LIMIT",
    perAttemptLimitUsd: perAttemptLimitUsd as number,
    telemetry: "UNKNOWN_ALLOWED_BY_HARD_CAP",
  };
}

export function observedFactoryCostWithinBound(input: {
  observedCostUsd: number | null;
  enforcedLimitUsd: number;
}) {
  if (!Number.isFinite(input.enforcedLimitUsd) || input.enforcedLimitUsd <= 0) {
    return { allowed: false as const, reason: "provider-key-limit-invalid" as const };
  }
  if (input.observedCostUsd === null) {
    return { allowed: true as const, telemetry: "UNKNOWN_ALLOWED_BY_HARD_CAP" as const };
  }
  if (!Number.isFinite(input.observedCostUsd) || input.observedCostUsd < 0) {
    return { allowed: false as const, reason: "observed-cost-invalid" as const };
  }
  if (input.observedCostUsd > input.enforcedLimitUsd + Number.EPSILON) {
    return { allowed: false as const, reason: "budget-exceeded" as const };
  }
  return { allowed: true as const, telemetry: "OBSERVED_WITHIN_HARD_CAP" as const };
}
