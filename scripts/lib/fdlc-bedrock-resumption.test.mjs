import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
const root = new URL("../../", import.meta.url);
const input = JSON.parse(
  readFileSync(
    new URL(
      "docs/software-factory/fdlc-bedrock-qualification-inputs.json",
      root,
    ),
    "utf8",
  ),
);
function run(value) {
  const directory = mkdtempSync(path.join(tmpdir(), "bedrock-plan-fixture-"));
  try {
    const file = path.join(directory, "input.json");
    writeFileSync(file, JSON.stringify(value));
    return spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/fdlc-bedrock-resumption.mts",
        "--config",
        file,
      ],
      { cwd: root, encoding: "utf8" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
describe("OFFLINE / FIXTURE resumption command", () => {
  it("fails closed for the current unresolved document", () =>
    expect(run(input).status).not.toBe(0));
  it("renders exact read-only steps and unapplied IAM templates without authority", () => {
    const r = run({
      ...input,
      awsAccountId: "000000000000",
      projectEnvironmentId: "OFFLINE-FIXTURE",
      roleArn: "arn:aws:iam::000000000000:role/fixture",
      inferenceProfileArn:
        "arn:aws:bedrock:us-east-1:000000000000:inference-profile/us.anthropic.claude-sonnet-4-6",
      awsIdentityApprovalReference: "OFFLINE-FIXTURE",
    awsProfile:"fdlc-fixture",expectedStsPrincipalArn:"arn:aws:sts::000000000000:assumed-role/fixture/session",authoritativeConfigurationLocation:"/fixture/approved-config",
    });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      mode: "PLAN_ONLY",
      authority: "NONE",
      state: "REQUIRES_INDEPENDENT_QUALIFICATION",
    });
  });
  it("cannot enable live steps by changing flags", () =>
    expect(run({ ...input, allowModelCalls: true }).status).not.toBe(0));
});
