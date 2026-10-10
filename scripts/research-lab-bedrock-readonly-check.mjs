#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const output = process.argv[2];
if (!output)
  throw new Error(
    "Pass an evidence output directory. No inference is performed.",
  );
const config = JSON.parse(
  readFileSync(
    new URL(
      "../docs/software-factory/fdlc-bedrock-qualification-inputs.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
if (
  config.awsProfile !== "fdlc-qualification" ||
  config.region !== "us-east-1" ||
  config.modelId !== "anthropic.claude-sonnet-4-6" ||
  config.allowModelCalls !== false
)
  throw new Error("Approved read-only configuration required.");
const env = { ...process.env, AWS_MAX_ATTEMPTS: "1", AWS_PAGER: "" };
for (const key of [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_ROLE_ARN",
])
  delete env[key];
mkdirSync(output, { recursive: true });
function aws(args) {
  return JSON.parse(
    execFileSync(
      "aws",
      [
        ...args,
        "--profile",
        config.awsProfile,
        "--region",
        config.region,
        "--output",
        "json",
        "--no-cli-pager",
      ],
      {
        env,
        timeout: 30000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
}
const report = {
  schema: "research-lab-bedrock-readonly-check/v1",
  checkedAt: new Date().toISOString(),
  modelId: config.modelId,
  inferenceProfileId: config.inferenceProfileId,
  paidInferenceCalls: 0,
  status: "INCOMPLETE",
};
try {
  const identity = aws(["sts", "get-caller-identity"]);
  if (
    identity.Account !== config.awsAccountId ||
    identity.Arn !== config.expectedStsPrincipalArn
  )
    throw new Error("APPROVED_PRINCIPAL_MISMATCH");
  report.identityVerified = true;
  const profile = aws([
    "bedrock",
    "get-inference-profile",
    "--inference-profile-identifier",
    config.inferenceProfileArn,
  ]);
  if (
    profile.inferenceProfileArn !== config.inferenceProfileArn ||
    profile.status !== "ACTIVE" ||
    !profile.models?.length ||
    profile.models.some(
      (m) =>
        !config.allowedDestinationRegions.some(
          (region) =>
            m.modelArn ===
            `arn:aws:bedrock:${region}::foundation-model/${config.modelId}`,
        ),
    )
  )
    throw new Error("EXACT_ROUTE_MISMATCH");
  report.profile = profile;
  const input = {
    converse: {
      messages: [
        {
          role: "user",
          content: [{ text: "Read-only qualification token count." }],
        },
      ],
    },
  };
  try {
    const count = aws([
      "bedrock-runtime",
      "count-tokens",
      "--model-id",
      config.inferenceProfileArn,
      "--input",
      JSON.stringify(input),
    ]);
    if (!Number.isSafeInteger(count.inputTokens) || count.inputTokens < 1)
      throw new Error("INVALID_TOKEN_COUNT");
    report.countTokens = {
      status: "OBSERVED_SUPPORTED",
      inputTokens: count.inputTokens,
    };
    report.status = "READ_ONLY_CHECK_PASSED";
  } catch (error) {
    const stderr = String(error.stderr ?? "");
    report.countTokens = {
      status: "NOT_QUALIFIED",
      errorClass: stderr.includes("ValidationException")
        ? "ValidationException"
        : stderr.includes("AccessDenied")
          ? "AccessDenied"
          : "OTHER",
    };
    report.status = "COUNT_TOKENS_CHECK_FAILED";
  }
} catch (error) {
  const stderr = String(error.stderr ?? "");
  report.status = /SSO session|Token has expired|Error loading SSO Token/i.test(
    stderr,
  )
    ? "WAITING_FOR_SSO"
    : "READ_ONLY_CHECK_FAILED";
  report.errorClass = [
    "APPROVED_PRINCIPAL_MISMATCH",
    "EXACT_ROUTE_MISMATCH",
  ].includes(error.message)
    ? error.message
    : report.status;
}
writeFileSync(
  resolve(output, "readonly-route-check.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ status: report.status, paidInferenceCalls: 0 }));
if (report.status !== "READ_ONLY_CHECK_PASSED") process.exitCode = 2;
