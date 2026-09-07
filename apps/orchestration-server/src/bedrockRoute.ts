import { z } from "zod";

export const BEDROCK_MODEL = "anthropic.claude-sonnet-4-6";
export const BEDROCK_PROFILE = `us.${BEDROCK_MODEL}`;
export const BEDROCK_CONTEXT_WINDOW_TOKENS = 1_000_000;
export const providerCapabilityStatusSchema = z.enum([
  "SUPPORTED",
  "UNSUPPORTED",
  "UNKNOWN",
]);
export const BEDROCK_DESTINATIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-2",
] as const;
export const bedrockRouteSchema = z
  .object({
    provider: z.literal("AWS Bedrock"),
    region: z.literal("us-east-1"),
    modelId: z.literal(BEDROCK_MODEL),
    foundationModelArn: z.literal(
      `arn:aws:bedrock:us-east-1::foundation-model/${BEDROCK_MODEL}`,
    ),
    inferenceProfileId: z.literal(BEDROCK_PROFILE),
    inferenceProfileArn: z.string(),
    maximumContextTokens: z.literal(BEDROCK_CONTEXT_WINDOW_TOKENS),
    capabilities: z
      .object({
        countTokens: z
          .object({
            status: providerCapabilityStatusSchema,
            evidenceReference: z.string().min(1),
            evidenceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          })
          .strict(),
      })
      .strict(),
    topology: z.literal("US_GEOGRAPHIC_CROSS_REGION"),
    globalInference: z.literal(false),
    allowedDestinationRegions: z.array(z.string()).length(3),
    awsAccountId: z.string().regex(/^\d{12}$/),
    projectEnvironmentId: z.string().trim().min(1),
    roleArn: z.string().nullable(),
    expectedStsPrincipalArn: z.string(),
  })
  .superRefine((r, ctx) => {
    if (
      JSON.stringify([...r.allowedDestinationRegions].sort()) !==
      JSON.stringify(BEDROCK_DESTINATIONS)
    )
      ctx.addIssue({ code: "custom", message: "DESTINATION_SET_MISMATCH" });
    if (
      r.inferenceProfileArn !==
      `arn:aws:bedrock:us-east-1:${r.awsAccountId}:inference-profile/${BEDROCK_PROFILE}`
    )
      ctx.addIssue({
        code: "custom",
        message: "PROFILE_ACCOUNT_OR_ID_MISMATCH",
      });
    if (r.roleArn !== null && !new RegExp(
      `^arn:aws:iam::${r.awsAccountId}:role/[A-Za-z0-9+=,.@_/-]+$`,
    ).test(r.roleArn))
      ctx.addIssue({ code: "custom", message: "ROLE_ACCOUNT_MISMATCH" });
    if (!new RegExp(
      `^arn:aws:sts::${r.awsAccountId}:assumed-role/[A-Za-z0-9+=,.@_-]+/[A-Za-z0-9+=,.@_-]+$`,
    ).test(r.expectedStsPrincipalArn))
      ctx.addIssue({ code: "custom", message: "STS_PRINCIPAL_MISMATCH" });
  });
export type BedrockRoute = z.infer<typeof bedrockRouteSchema>;
/** Validates an explicitly supplied inspection response; never fetches it. */
export function verifyBedrockProfile(route: BedrockRoute, response: unknown) {
  const r = bedrockRouteSchema.parse(route);
  const p = z
    .object({
      inferenceProfileArn: z.literal(r.inferenceProfileArn),
      inferenceProfileId: z.literal(BEDROCK_PROFILE),
      status: z.literal("ACTIVE"),
      type: z.literal("SYSTEM_DEFINED"),
      models: z.array(z.object({ modelArn: z.string() })).length(3),
    })
    .parse(response);
  const expected = BEDROCK_DESTINATIONS.map(
    (region) => `arn:aws:bedrock:${region}::foundation-model/${BEDROCK_MODEL}`,
  ).sort();
  if (
    JSON.stringify(p.models.map((m) => m.modelArn).sort()) !==
    JSON.stringify(expected)
  )
    throw new Error("PROFILE_DESTINATION_OR_MODEL_MISMATCH");
  return { validated: true, authority: "NONE" as const };
}
