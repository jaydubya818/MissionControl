import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadGovernedMcpContext, resolveMissionControlHostRoot } from "../factoryGovernedMcpContext.js";
import { ConvexGovernedMcpReceiptSink } from "../convexGovernedMcpReceiptSink.js";
import {
  mcpToolGrantDigest,
  mcpToolVersionDigest,
  qualificationToolVersion,
  QUALIFICATION_FIXTURE_RELATIVE_PATH,
  type McpToolGrantSnapshot,
} from "../governedMcpContracts.js";

const previousSecret = process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET;

beforeEach(() => { process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = "governed-mcp-context-test-secret"; });
afterEach(() => {
  if (previousSecret === undefined) delete process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET;
  else process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = previousSecret;
});

describe("Factory governed MCP context integration", () => {
  it("resolves the repository root and invokes the real one-file server through signed receipt commands", async () => {
    const root = resolveMissionControlHostRoot();
    const implementationDigest = `sha256:${createHash("sha256").update(await readFile(resolve(root, QUALIFICATION_FIXTURE_RELATIVE_PATH))).digest("hex")}`;
    const tool = qualificationToolVersion(implementationDigest);
    const toolDigest = mcpToolVersionDigest(tool);
    const now = Date.now();
    const grant: McpToolGrantSnapshot = {
      schema: "governed-mcp-tool-grant/v1", grantKey: "doctrine-read", version: 1,
      projectId: "project-1", toolVersionId: "tool-1", toolVersionDigest: toolDigest,
      toolVersionSnapshot: tool, operation: tool.operation.name, credentialClass: "NONE",
      destination: "LOCAL_PROCESS", issuedAt: now - 1_000, expiresAt: now + 60_000,
      maxCallsPerAttempt: 1, revocationMode: "DENY_NEW_CALLS",
    };
    const grantDigest = mcpToolGrantDigest(grant);
    const receipts: any[] = [];
    const client = {
      action: async (_reference: unknown, command: { payloadJson: string; envelope: { commandId: string } }) => {
        const receipt = JSON.parse(command.payloadJson).receipt;
        receipts.push({ receipt, commandId: command.envelope.commandId });
        return receipt.phase === "AUTHORIZATION"
          ? { created: true, permitted: true }
          : { created: true, lateOrStale: false };
      },
    };
    const profile = {
      profileId: "profile-1", profileDigest: `sha256:${"1".repeat(64)}`,
      profileSnapshot: { toolGrant: { grantId: "grant-1", grantDigest, grantSnapshot: grant } },
    };
    const context = await loadGovernedMcpContext({
      client: client as any,
      claim: {
        projectId: "project-1", repositoryId: "repository-1", workOrderId: "work-order-1",
        workflowRunId: "attempt-1", executionProfile: { profileId: "profile-1", qualificationValidUntil: now + 60_000 },
        lease: { leaseId: "lease-1", workerId: "worker-1", workerSessionId: "session-1", workerGeneration: 1, expiresAt: now + 60_000 },
      },
      manifest: { executionProfile: profile },
    });

    expect(context?.text).toContain("untrusted content");
    expect(context?.text).toContain("PUBLIC_FIXTURE");
    expect(receipts.map(({ receipt }) => [receipt.phase, receipt.status])).toEqual([
      ["AUTHORIZATION", "ALLOWED"], ["COMPLETION", "SUCCEEDED"],
    ]);
    expect(receipts[0].commandId).not.toBe(receipts[1].commandId);
  });

  it("gives an allowed reservation and its replay denial distinct service-command identities", async () => {
    const commands: string[] = [];
    const client = { action: async (_reference: unknown, command: { envelope: { commandId: string } }) => {
      commands.push(command.envelope.commandId);
      return { created: true };
    } };
    const sink = new ConvexGovernedMcpReceiptSink(client as any, "repository-1");
    const base = {
      schema: "governed-mcp-tool-call-receipt/v1" as const,
      callId: "call:qualification:0001", phase: "AUTHORIZATION" as const, sequence: 1 as const,
      projectId: "project-1", workOrderId: "work-order-1", workflowRunId: "attempt-1", attemptId: "attempt-1",
      attemptLeaseId: "lease-1", workerId: "worker-1", workerSessionId: "session-1", workerGeneration: 1,
      executionProfileId: "profile-1", executionProfileDigest: `sha256:${"1".repeat(64)}`,
      toolGrantId: "grant-1", toolGrantDigest: `sha256:${"2".repeat(64)}`,
      toolVersionId: "tool-1", toolVersionDigest: `sha256:${"3".repeat(64)}`,
      operation: "read_factory_doctrine_excerpt", requestDigest: "4".repeat(64), requestBytes: 32,
      retryCount: 0 as const, costStatus: "UNKNOWN" as const,
      serverImplementationDigest: `sha256:${"5".repeat(64)}`, occurredAt: 1_000, authority: "HOST_BROKER" as const,
    };
    await sink.append({ ...base, status: "ALLOWED", reason: "EXACT_AUTHORITY_MATCH" });
    await sink.append({ ...base, status: "DENIED", reason: "REPLAY_DENIED" });
    expect(commands[0]).not.toBe(commands[1]);
  });
});
