import {
  bedrockRouteSchema,
  BEDROCK_DESTINATIONS,
  BEDROCK_MODEL,
  type BedrockRoute,
} from "./bedrockRoute.js";
/** Offline policy specification, never attached or applied by this module. */
export function bedrockIamSpecification(input: BedrockRoute) {
  const r = bedrockRouteSchema.parse(input);
  const models = BEDROCK_DESTINATIONS.map(
    (region) => `arn:aws:bedrock:${region}::foundation-model/${BEDROCK_MODEL}`,
  );
  const invokeActions = [
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream",
  ];
  return {
    evidenceClass: "OFFLINE_SPECIFICATION",
    authority: "NONE",
    roleArn: r.roleArn,
    inspectionPolicy: {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "InspectExactProfile",
          Effect: "Allow",
          Action: ["bedrock:GetInferenceProfile"],
          Resource: [r.inferenceProfileArn],
          Condition: { StringEquals: { "aws:RequestedRegion": r.region } },
        },
        {
          Sid: "InspectExactModels",
          Effect: "Allow",
          Action: ["bedrock:GetFoundationModel"],
          Resource: models,
        },
        {
          Sid: "HoldAllInference",
          Effect: "Deny",
          Action: invokeActions,
          Resource: "*",
        },
      ],
    },
    // This future policy requires separately authorized removal of HoldAllInference.
    // The explicit denies protect against other attached invocation grants.
    laterInvocationPolicy: {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "ExactProfile",
          Effect: "Allow",
          Action: ["bedrock:InvokeModel"],
          Resource: [r.inferenceProfileArn],
          Condition: { StringEquals: { "aws:RequestedRegion": r.region } },
        },
        {
          Sid: "ExactModelsThroughProfile",
          Effect: "Allow",
          Action: ["bedrock:InvokeModel"],
          Resource: models,
          Condition: {
            StringEquals: {
              "bedrock:InferenceProfileArn": r.inferenceProfileArn,
            },
          },
        },
        {
          Sid: "DenyOtherModelsAndProfiles",
          Effect: "Deny",
          Action: invokeActions,
          NotResource: [r.inferenceProfileArn, ...models],
        },
        {
          Sid: "DenyDirectModelInvocation",
          Effect: "Deny",
          Action: invokeActions,
          Resource: models,
          Condition: {
            StringNotEquals: {
              "bedrock:InferenceProfileArn": r.inferenceProfileArn,
            },
          },
        },
        {
          Sid: "DenyOtherSourceOrGlobal",
          Effect: "Deny",
          Action: invokeActions,
          Resource: "*",
          Condition: { StringNotEquals: { "aws:RequestedRegion": r.region } },
        },
        {
          Sid: "DenyStreaming",
          Effect: "Deny",
          Action: ["bedrock:InvokeModelWithResponseStream"],
          Resource: "*",
        },
      ],
    },
    trustPolicy:
      "UNQUALIFIED: authorized bootstrap principal and trust conditions must be supplied; do not invent a principal.",
  };
}
