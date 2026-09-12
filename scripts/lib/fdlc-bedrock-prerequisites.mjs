/** Offline document policy only. No credential discovery, AWS I/O or authority. */
export const BEDROCK_ROUTE = Object.freeze({
  provider: "AWS Bedrock",
  region: "us-east-1",
  modelId: "anthropic.claude-sonnet-4-6",
  foundationModelArn:
    "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6",
  inferenceProfileId: "us.anthropic.claude-sonnet-4-6",
  topology: "US_GEOGRAPHIC_CROSS_REGION",
  globalInference: false,
});
export const DESTINATIONS = Object.freeze([
  "us-east-1",
  "us-east-2",
  "us-west-2",
]);
const text = (v) => typeof v === "string" && v.trim().length > 0;
export function routeBlockers(input) {
  if (!input || typeof input !== "object") return ["ROUTE_REQUIRED"];
  const errors = Object.entries(BEDROCK_ROUTE)
    .filter(([k, v]) => input[k] !== v)
    .map(([k]) => `APPROVED_CONSTRAINT_MISMATCH:${k}`);
  if (
    !Array.isArray(input.allowedDestinationRegions) ||
    JSON.stringify([...input.allowedDestinationRegions].sort()) !==
      JSON.stringify(DESTINATIONS)
  )
    errors.push("DESTINATION_SET_MISMATCH");
  if (
    typeof input.awsAccountId !== "string" ||
    !/^\d{12}$/.test(input.awsAccountId)
  )
    errors.push("AWS_QUALIFICATION_ACCOUNT_REQUIRED");
  if (!text(input.projectEnvironmentId))
    errors.push("APPROVED_PROJECT_ENVIRONMENT_REQUIRED");
  const role =
    typeof input.roleArn === "string" &&
    /^arn:aws:iam::(\d{12}):role\/[A-Za-z0-9+=,.@_/-]+$/.exec(input.roleArn);
  if (!role) errors.push("APPROVED_ROLE_REQUIRED");
  if (role && role[1] !== input.awsAccountId)
    errors.push("ROLE_ACCOUNT_MISMATCH");
  const expectedArn = `arn:aws:bedrock:us-east-1:${input.awsAccountId}:inference-profile/${BEDROCK_ROUTE.inferenceProfileId}`;
  if (input.inferenceProfileArn !== expectedArn)
    errors.push("PROFILE_ARN_REQUIRED_OR_MISMATCH");
  return errors;
}
export function assessBedrockPrerequisites(input) {
  input = qualificationInputsFromBootstrap(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
  const blockers = [...routeBlockers(input), ...bootstrapIdentityBlockers(input)];
  for (const [field, value] of Object.entries({
    schema: "fdlc-bedrock-qualification-inputs/v2",
    environmentClass: "QUALIFICATION_ONLY",
    allowLocalAwsCredentialDiscovery: false,
    allowModelCalls: false,
    allowWorkOrderExecution: false,
    allowReadinessIssuance: false,
    allowMergeOrPublication: false,
  })) {
    if (input[field] !== value)
      blockers.push(`APPROVED_CONSTRAINT_MISMATCH:${field}`);
  }
  if (!text(input.awsIdentityApprovalReference))
    blockers.push("AWS_IDENTITY_APPROVAL_REQUIRED");
  return {
    schema: "fdlc-bedrock-prerequisite-assessment/v2",
    state: blockers.length
      ? "QUALIFICATION_AWS_IDENTITY_REQUIRED"
      : "REQUIRES_INDEPENDENT_QUALIFICATION",
    blockers,
    prerequisiteDocumentComplete: blockers.length === 0,
    providerQualified: false,
    readinessIssued: false,
    executionAuthorized: false,
    authority: "NONE",
    note: "Document completeness is not caller identity, profile verification, price qualification or permission to invoke.",
  };
}

/** Converts only explicitly supplied safe bootstrap fields, never process.env. */
export function qualificationInputsFromBootstrap(raw) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) return {};
  if(!Object.hasOwn(raw,'AWS_PROFILE')) return raw;
  const keys=['AWS_PROFILE','AWS_REGION','QUALIFICATION_AWS_ACCOUNT_ID','EXPECTED_STS_PRINCIPAL_ARN','QUALIFICATION_PROJECT_OR_ENVIRONMENT_ID','QUALIFICATION_ROLE_ARN','AUTHORITATIVE_QUALIFICATION_CONFIG_LOCATION','BEDROCK_INFERENCE_PROFILE_ID','BEDROCK_INFERENCE_PROFILE_ARN','APPROVAL_REFERENCE'];
  if(Object.keys(raw).some(k=>!keys.includes(k))) return {};
  return {
    schema:'fdlc-bedrock-qualification-inputs/v2',...BEDROCK_ROUTE,
    region:raw.AWS_REGION,awsProfile:raw.AWS_PROFILE,
    awsAccountId:raw.QUALIFICATION_AWS_ACCOUNT_ID,
    expectedStsPrincipalArn:raw.EXPECTED_STS_PRINCIPAL_ARN,
    projectEnvironmentId:raw.QUALIFICATION_PROJECT_OR_ENVIRONMENT_ID,
    roleArn:raw.QUALIFICATION_ROLE_ARN,
    authoritativeConfigurationLocation:raw.AUTHORITATIVE_QUALIFICATION_CONFIG_LOCATION,
    inferenceProfileId:raw.BEDROCK_INFERENCE_PROFILE_ID,
    inferenceProfileArn:raw.BEDROCK_INFERENCE_PROFILE_ARN,
    awsIdentityApprovalReference:raw.APPROVAL_REFERENCE,
    allowedDestinationRegions:[...DESTINATIONS],environmentClass:'QUALIFICATION_ONLY',
    allowLocalAwsCredentialDiscovery:false,allowModelCalls:false,allowWorkOrderExecution:false,allowReadinessIssuance:false,allowMergeOrPublication:false,
  };
}
export function bootstrapIdentityBlockers(input) {
  const errors=[];
  if(typeof input.awsProfile!=='string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(input.awsProfile) || input.awsProfile==='default') errors.push('APPROVED_EXPLICIT_AWS_PROFILE_REQUIRED');
  if(!text(input.authoritativeConfigurationLocation)) errors.push('AUTHORITATIVE_CONFIG_LOCATION_REQUIRED');
  const principal=typeof input.expectedStsPrincipalArn==='string' && /^arn:aws:sts::(\d{12}):assumed-role\/([A-Za-z0-9+=,.@_-]+)\/([A-Za-z0-9+=,.@_-]+)$/.exec(input.expectedStsPrincipalArn);
  const role=typeof input.roleArn==='string' && /^arn:aws:iam::(\d{12}):role\/(?:[A-Za-z0-9+=,.@_-]+\/)*([A-Za-z0-9+=,.@_-]+)$/.exec(input.roleArn);
  if(!principal || !role || principal[1]!==input.awsAccountId || principal[1]!==role[1] || principal[2]!==role[2]) errors.push('EXPECTED_STS_PRINCIPAL_REQUIRED_OR_MISMATCH');
  return errors;
}
