#!/usr/bin/env node
import { qualificationInputsFromBootstrap, assessBedrockPrerequisites } from "./lib/fdlc-bedrock-prerequisites.mjs";
import { readFileSync } from "node:fs";
import { bedrockRouteSchema } from "../apps/orchestration-server/src/bedrockRoute.js";
import { bedrockIamSpecification } from "../apps/orchestration-server/src/bedrockIam.js";
// Plan-only. Does not spawn AWS CLI, resolve credentials, inspect env or send I/O.
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--config")
  throw new Error(
    "Usage: pnpm exec tsx scripts/fdlc-bedrock-resumption.mts --config APPROVED_SAFE_CONFIG.json",
  );
const data = qualificationInputsFromBootstrap(JSON.parse(readFileSync(args[1], "utf8")));
const assessment = assessBedrockPrerequisites(data);
if(!assessment.prerequisiteDocumentComplete) throw new Error(assessment.blockers.join(","));
for (const key of [
  "allowLocalAwsCredentialDiscovery",
  "allowModelCalls",
  "allowWorkOrderExecution",
  "allowReadinessIssuance",
  "allowMergeOrPublication",
])
  if (data[key] !== false) throw new Error(`HOLD_FLAG_REQUIRED:${key}`);
if (
  data.environmentClass !== "QUALIFICATION_ONLY" ||
  typeof data.awsIdentityApprovalReference !== "string" ||
  !data.awsIdentityApprovalReference.trim()
)
  throw new Error("APPROVED_QUALIFICATION_CONFIG_REQUIRED");
const route = bedrockRouteSchema.parse(data);
process.stdout.write(
  JSON.stringify(
    {
      state: "REQUIRES_INDEPENDENT_QUALIFICATION",
      authority: "NONE",
      mode: "PLAN_ONLY",
      expected: route,
      expectedStsPrincipalArn:data.expectedStsPrincipalArn,
      approvedProfile:data.awsProfile,
      authoritativeConfigurationLocation:data.authoritativeConfigurationLocation,
      steps: [
        "Load only the explicitly approved qualification credential source in an isolated process; no default chain, profiles or cached sessions.",
        "Read STS GetCallerIdentity; compare Account and assumed role to approved account and role. Resolve IAM role path from authoritative configuration, not only its session basename.",
        "Use only the us-east-1 Bedrock endpoint. Inspect the exact GetInferenceProfile ARN; verify ACTIVE SYSTEM_DEFINED, model relationship and exact three destination models.",
        "Retrieve and independently verify versioned account-applicable pricing and full input/output/cache/reasoning bounds; real price remains UNQUALIFIED until then.",
        "Run offline route negatives against the captured inspection evidence; qualify credential isolation, no-bypass broker and runtime/profile binding under separate live authority.",
        "Request authorization for the minimum bounded live model call. Do not invoke, issue readiness, execute WO1, merge or publish from this plan.",
      ],
      readOnlyCommandArguments: [
        ["aws", "sts", "get-caller-identity", "--region", route.region, "--profile", data.awsProfile],
        [
          "aws",
          "bedrock",
          "get-inference-profile",
          "--region",
          route.region,
          "--inference-profile-identifier",
          route.inferenceProfileArn, "--profile", data.awsProfile,
        ],
      ],
      iam: bedrockIamSpecification(route),
    },
    null,
    2,
  ) + "\n",
);
