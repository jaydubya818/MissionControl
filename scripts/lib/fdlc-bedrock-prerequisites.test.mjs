import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessBedrockPrerequisites } from "./fdlc-bedrock-prerequisites.mjs";
const frozen = JSON.parse(
  readFileSync(
    new URL(
      "../../docs/software-factory/fdlc-bedrock-qualification-inputs.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const complete = {
  ...frozen,
  awsAccountId: "000000000000",
  projectEnvironmentId: "OFFLINE-FIXTURE",
  roleArn: "arn:aws:iam::000000000000:role/fixture",
  inferenceProfileArn:
    "arn:aws:bedrock:us-east-1:000000000000:inference-profile/us.anthropic.claude-sonnet-4-6",
  awsIdentityApprovalReference: "OFFLINE-FIXTURE",
    awsProfile:"fdlc-fixture",expectedStsPrincipalArn:"arn:aws:sts::000000000000:assumed-role/fixture/session",authoritativeConfigurationLocation:"/fixture/approved-config",
};
describe("OFFLINE / FIXTURE Bedrock prerequisites", () => {
  it("keeps the current missing identity hold", () =>
    expect(assessBedrockPrerequisites(frozen)).toMatchObject({
      state: "QUALIFICATION_AWS_IDENTITY_REQUIRED",
      authority: "NONE",
      executionAuthorized: false,
    }));
  it("does not issue readiness when document fields are complete", () =>
    expect(assessBedrockPrerequisites(complete)).toMatchObject({
      state: "REQUIRES_INDEPENDENT_QUALIFICATION",
      prerequisiteDocumentComplete: true,
      providerQualified: false,
      readinessIssued: false,
      executionAuthorized: false,
    }));
  it.each(
    Object.entries({
      provider: "other",
      region: "us-west-2",
      modelId: "other",
      foundationModelArn: "other",
      inferenceProfileId: "global.anthropic.claude-sonnet-4-6",
      inferenceProfileArn: "other",
      topology: "GLOBAL",
      globalInference: true,
      allowedDestinationRegions: ["us-east-1"],
      awsAccountId: null,
      roleArn: "arn:aws:iam::111111111111:role/fixture",
      projectEnvironmentId: "",
      awsIdentityApprovalReference: null,
      environmentClass: "PRODUCTION",
      allowLocalAwsCredentialDiscovery: true,
      allowModelCalls: true,
      allowWorkOrderExecution: true,
      allowReadinessIssuance: true,
      allowMergeOrPublication: true,
    }),
  )("rejects %s", (key, value) =>
    expect(
      assessBedrockPrerequisites({ ...complete, [key]: value }).blockers.length,
    ).toBeGreaterThan(0),
  );
  it.each([
    null,
    {},
    [],
    { ...complete, awsAccountId: 0 },
    {
      ...complete,
      allowedDestinationRegions: ["us-east-1", "us-east-1", "us-west-2"],
    },
  ])("fails closed", (input) =>
    expect(assessBedrockPrerequisites(input).blockers.length).toBeGreaterThan(
      0,
    ),
  );
});

// Safe handoff fields are synthetic; no process.env or credential file is read.
const bootstrap={AWS_PROFILE:'fdlc-fixture',AWS_REGION:'us-east-1',QUALIFICATION_AWS_ACCOUNT_ID:'000000000000',EXPECTED_STS_PRINCIPAL_ARN:'arn:aws:sts::000000000000:assumed-role/fixture/session',QUALIFICATION_PROJECT_OR_ENVIRONMENT_ID:'OFFLINE-FIXTURE',QUALIFICATION_ROLE_ARN:'arn:aws:iam::000000000000:role/fixture',AUTHORITATIVE_QUALIFICATION_CONFIG_LOCATION:'/fixture/approved-config',BEDROCK_INFERENCE_PROFILE_ID:'us.anthropic.claude-sonnet-4-6',BEDROCK_INFERENCE_PROFILE_ARN:'arn:aws:bedrock:us-east-1:000000000000:inference-profile/us.anthropic.claude-sonnet-4-6',APPROVAL_REFERENCE:'OFFLINE-FIXTURE'};
it('accepts safe bootstrap identifiers as configuration, never qualification',()=>expect(assessBedrockPrerequisites(bootstrap)).toMatchObject({prerequisiteDocumentComplete:true,providerQualified:false,authority:'NONE'}));
it.each(Object.keys(bootstrap))('missing bootstrap %s fails closed',key=>{const changed={...bootstrap};delete changed[key];expect(assessBedrockPrerequisites(changed).prerequisiteDocumentComplete).toBe(false);});
it.each([{AWS_PROFILE:'default'},{AWS_REGION:'us-west-2'},{BEDROCK_INFERENCE_PROFILE_ID:'global.anthropic.claude-sonnet-4-6'},{EXPECTED_STS_PRINCIPAL_ARN:'arn:aws:sts::111111111111:assumed-role/fixture/session'},{EXPECTED_STS_PRINCIPAL_ARN:'arn:aws:sts::000000000000:assumed-role/other/session'},{AWS_ACCESS_KEY_ID:'not-accepted-even-as-fixture'},{allowModelCalls:true}])('rejects unsafe bootstrap override %j',change=>expect(assessBedrockPrerequisites({...bootstrap,...change}).prerequisiteDocumentComplete).toBe(false));
