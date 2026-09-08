export const BEDROCK_SONNET_46_DAILY_QUOTA_CODE = "L-B29C9321";

export function requireConfirmedBedrockQuota({
  diagnosis,
  route,
  countTokens,
  maxOutputTokens,
  now,
}) {
  const minimumAvailableTokens = countTokens.inputTokens + maxOutputTokens;
  const valid =
    diagnosis?.state === "BEDROCK_QUOTA_CAPACITY_CONFIRMED" &&
    diagnosis.awsAccountId === route.awsAccountId &&
    diagnosis.region === route.region &&
    diagnosis.inferenceProfileId === route.inferenceProfileId &&
    diagnosis.underlyingModelId === route.modelId &&
    diagnosis.quota?.code === BEDROCK_SONNET_46_DAILY_QUOTA_CODE &&
    Number.isSafeInteger(diagnosis.quota.currentAppliedValue) &&
    diagnosis.quota.currentAppliedValue > 0 &&
    Number.isSafeInteger(diagnosis.quota.availableTokensAtConfirmation) &&
    diagnosis.quota.availableTokensAtConfirmation >= minimumAvailableTokens &&
    Number.isSafeInteger(diagnosis.capacityConfirmedAt) &&
    Number.isSafeInteger(diagnosis.capacityConfirmationExpiresAt) &&
    diagnosis.capacityConfirmedAt <= now &&
    diagnosis.capacityConfirmationExpiresAt > now &&
    diagnosis.existingIncreaseRequest !== "UNKNOWN_DUE_TO_ACCESS_DENIED";

  if (!valid) throw new Error("QUALIFICATION_BEDROCK_QUOTA_UNCONFIRMED");
  return { minimumAvailableTokens };
}
