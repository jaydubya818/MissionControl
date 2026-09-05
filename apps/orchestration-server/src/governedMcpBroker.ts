import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { canonicalHash } from "@mission-control/shared";
import {
  evaluateGovernedMcpCall,
  QUALIFICATION_SERVER,
  QUALIFICATION_SERVER_VERSION,
  validQualificationOutput,
  type GovernedMcpAuthority,
  type GovernedMcpCallRequest,
} from "./governedMcpContracts.js";

export type GovernedMcpReceiptStatus = "ALLOWED" | "DENIED" | "SUCCEEDED" | "FAILED" | "CANCELED" | "TIMED_OUT";

export interface GovernedMcpReceipt {
  schema: "governed-mcp-tool-call-receipt/v1";
  callId: string;
  phase: "AUTHORIZATION" | "COMPLETION";
  sequence: 1 | 2;
  status: GovernedMcpReceiptStatus;
  reason: string;
  projectId: string;
  workOrderId: string;
  workflowRunId: string;
  attemptId: string;
  attemptLeaseId: string;
  workerId: string;
  workerSessionId: string;
  workerGeneration: number;
  executionProfileId: string;
  executionProfileDigest: string;
  toolGrantId: string;
  toolGrantDigest: string;
  toolVersionId: string;
  toolVersionDigest: string;
  operation: string;
  requestDigest: string;
  requestBytes: number;
  retryCount: 0;
  costStatus: "UNKNOWN";
  outputDigest?: string;
  outputBytes?: number;
  poisoningDetected?: boolean;
  redactionApplied?: boolean;
  serverImplementationDigest: string;
  occurredAt: number;
  durationMs?: number;
  authority: "HOST_BROKER";
}

export interface GovernedMcpReceiptSink {
  append(receipt: GovernedMcpReceipt): Promise<{
    created: boolean;
    permitted?: boolean;
    reason?: string;
    lateOrStale?: boolean;
  }>;
}

export interface GovernedMcpBrokerRuntime {
  implementationDigest(entrypoint: string): Promise<string>;
  invoke(input: {
    entrypoint: string;
    operation: string;
    arguments: Record<string, unknown>;
    timeoutMs: number;
    expectedImplementationDigest: string;
    signal?: AbortSignal;
  }): Promise<unknown>;
}

export class GovernedMcpBrokerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "GovernedMcpBrokerError";
  }
}

export class GovernedMcpBroker {
  private readonly consumedCallIds = new Set<string>();

  constructor(
    private readonly receiptSink: GovernedMcpReceiptSink,
    private readonly now: () => number = Date.now,
    private readonly runtime: GovernedMcpBrokerRuntime = defaultRuntime,
  ) {}

  async call(input: {
    request: GovernedMcpCallRequest;
    authority: GovernedMcpAuthority;
    hostRoot: string;
    signal?: AbortSignal;
  }) {
    const startedAt = this.now();
    const authority = { ...input.authority, replayed: input.authority.replayed || this.consumedCallIds.has(input.request.callId) };
    const decision = evaluateGovernedMcpCall(input.request, authority);
    const base = receiptBase(input.request, authority);
    if (!decision.allowed) {
      await this.receiptSink.append({ ...base, phase: "AUTHORIZATION", sequence: 1, status: "DENIED", reason: decision.code, requestDigest: decision.requestDigest, occurredAt: startedAt });
      throw new GovernedMcpBrokerError(decision.code, `Governed MCP call denied (${decision.code}).`);
    }
    this.consumedCallIds.add(input.request.callId);
    const authorizationReceipt = await this.receiptSink.append({ ...base, phase: "AUTHORIZATION", sequence: 1, status: "ALLOWED", reason: "EXACT_AUTHORITY_MATCH", requestDigest: decision.requestDigest, occurredAt: startedAt });
    if (!authorizationReceipt.created) {
      throw new GovernedMcpBrokerError("REPLAY_DENIED", "Authorization receipt already exists; transport startup is denied.");
    }
    if (authorizationReceipt.permitted !== true) {
      throw new GovernedMcpBrokerError(
        authorizationReceipt.reason ?? "AUTHORITY_RESERVATION_DENIED",
        `Governed MCP transport permit denied (${authorizationReceipt.reason ?? "AUTHORITY_RESERVATION_DENIED"}).`,
      );
    }

    try {
      if (input.signal?.aborted) throw new GovernedMcpBrokerError("ATTEMPT_CANCELLED", "Attempt was canceled before MCP transport startup.");
      const serverEntrypoint = resolve(input.hostRoot, authority.toolVersion.snapshot.transport.entrypoint);
      const implementationDigest = await this.runtime.implementationDigest(serverEntrypoint);
      if (implementationDigest !== authority.toolVersion.snapshot.server.implementationDigest) {
        throw new GovernedMcpBrokerError("IMPLEMENTATION_SUBSTITUTION", "MCP server implementation digest does not match the qualified Tool Version.");
      }
      const output = await this.runtime.invoke({
        entrypoint: serverEntrypoint,
        operation: input.request.operation,
        arguments: input.request.arguments as Record<string, unknown>,
        timeoutMs: authority.toolVersion.snapshot.operation.timeoutMs,
        expectedImplementationDigest: implementationDigest,
        signal: input.signal,
      });
      if (!validQualificationOutput(output)) throw new GovernedMcpBrokerError("RESPONSE_SCHEMA_INVALID", "MCP response failed the frozen output schema.");
      const serialized = JSON.stringify(output);
      const outputBytes = Buffer.byteLength(serialized, "utf8");
      if (outputBytes > authority.toolVersion.snapshot.operation.maxResponseBytes) throw new GovernedMcpBrokerError("RESPONSE_TOO_LARGE", "MCP response exceeded the frozen byte limit.");
      const poisoningDetected = detectsInstructionPoisoning(serialized);
      if (containsSecret(serialized)) throw new GovernedMcpBrokerError("OUTPUT_SECRET_DETECTED", "MCP response matched a secret pattern and was withheld.");
      const outputDigest = canonicalHash(output);
      const completionReceipt = await this.receiptSink.append({
        ...base,
        phase: "COMPLETION",
        sequence: 2,
        status: "SUCCEEDED",
        reason: "BOUNDED_READ_COMPLETED",
        requestDigest: decision.requestDigest,
        outputDigest,
        outputBytes,
        poisoningDetected,
        redactionApplied: false,
        occurredAt: this.now(),
        durationMs: Math.max(0, this.now() - startedAt),
      });
      if (!completionReceipt.created) {
        throw new GovernedMcpBrokerError("COMPLETION_NOT_COMMITTED", "MCP completion evidence was not durably committed; output was withheld.");
      }
      if (completionReceipt.lateOrStale) {
        throw new GovernedMcpBrokerError("LATE_RESULT_WITHHELD", "MCP output completed after its Attempt authority became stale and was withheld.");
      }
      return { output, outputDigest, poisoningDetected };
    } catch (error) {
      if (error instanceof GovernedMcpBrokerError
        && (error.code === "LATE_RESULT_WITHHELD" || error.code === "COMPLETION_NOT_COMMITTED")) throw error;
      const normalized = normalizeFailure(error, input.signal);
      await this.receiptSink.append({
        ...base,
        phase: "COMPLETION",
        sequence: 2,
        status: normalized.status,
        reason: normalized.code,
        requestDigest: decision.requestDigest,
        redactionApplied: normalized.code === "OUTPUT_SECRET_DETECTED",
        occurredAt: this.now(),
        durationMs: Math.max(0, this.now() - startedAt),
      });
      throw error instanceof GovernedMcpBrokerError
        ? error
        : new GovernedMcpBrokerError(normalized.code, normalized.message);
    }
  }
}

function receiptBase(request: GovernedMcpCallRequest, authority: GovernedMcpAuthority) {
  return {
    schema: "governed-mcp-tool-call-receipt/v1" as const,
    callId: request.callId,
    projectId: authority.scope.projectId,
    workOrderId: authority.scope.workOrderId,
    workflowRunId: authority.scope.workflowRunId,
    attemptId: authority.scope.attemptId,
    // Preserve the attempted worker/lease tuple on denials. The control plane
    // independently requires it to be current before an ALLOWED receipt can
    // become the transport permit.
    attemptLeaseId: request.attemptLeaseId,
    workerId: request.workerId,
    workerSessionId: request.workerSessionId,
    workerGeneration: request.workerGeneration,
    executionProfileId: authority.executionProfile.id,
    executionProfileDigest: authority.executionProfile.digest,
    toolGrantId: authority.grant.id,
    toolGrantDigest: authority.grant.digest,
    toolVersionId: authority.toolVersion.id,
    toolVersionDigest: authority.toolVersion.digest,
    operation: request.operation,
    requestBytes: Buffer.byteLength(JSON.stringify(request.arguments), "utf8"),
    retryCount: 0 as const,
    costStatus: "UNKNOWN" as const,
    serverImplementationDigest: authority.toolVersion.snapshot.server.implementationDigest,
    authority: "HOST_BROKER" as const,
  };
}

function normalizeFailure(error: unknown, signal?: AbortSignal): { code: string; message: string; status: "FAILED" | "CANCELED" | "TIMED_OUT" } {
  if (signal?.aborted) return { code: "ATTEMPT_CANCELLED", message: "Attempt canceled the MCP call.", status: "CANCELED" };
  const message = error instanceof Error ? error.message : "MCP call failed.";
  const code = error instanceof GovernedMcpBrokerError
    ? error.code
    : /timed? out|timeout/i.test(message) ? "TOOL_TIMEOUT"
      : /spawn|ENOENT|closed|connect/i.test(message) ? "SERVER_UNAVAILABLE"
        : "TOOL_CALL_FAILED";
  return { code, message, status: code === "TOOL_TIMEOUT" ? "TIMED_OUT" : "FAILED" };
}

function containsSecret(value: string) {
  return /(-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|gh[opsu]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/.test(value);
}

function detectsInstructionPoisoning(value: string) {
  return /(ignore (all|any|the|previous) instructions|system prompt|grant me|change (the )?policy|call another tool)/i.test(value);
}

const defaultRuntime: GovernedMcpBrokerRuntime = {
  async implementationDigest(entrypoint) {
    return `sha256:${createHash("sha256").update(await readFile(entrypoint)).digest("hex")}`;
  },
  async invoke(input) {
    const source = await readFile(input.entrypoint);
    const observedDigest = `sha256:${createHash("sha256").update(source).digest("hex")}`;
    if (observedDigest !== input.expectedImplementationDigest) {
      throw new GovernedMcpBrokerError("IMPLEMENTATION_SUBSTITUTION", "MCP server changed after its initial identity check.");
    }
    const executionDirectory = await mkdtemp(join(tmpdir(), "mission-control-mcp-"));
    const executionArtifact = join(executionDirectory, "qualified-server.mjs");
    await writeFile(executionArtifact, source, { mode: 0o600 });
    const executionArtifactPath = await realpath(executionArtifact);
    const executionDirectoryPath = await realpath(executionDirectory);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        nodePermissionFlag(),
        `--allow-fs-read=${executionArtifactPath}`,
        executionArtifactPath,
      ],
      cwd: executionDirectoryPath,
      env: { NODE_NO_WARNINGS: "1" },
      stderr: "pipe",
    });
    const client = new Client({ name: "mission-control-governed-tool-broker", version: "1.0.0" }, { capabilities: {}, enforceStrictCapabilities: true });
    try {
      await client.connect(transport);
      const server = client.getServerVersion();
      if (server?.name !== QUALIFICATION_SERVER || server.version !== QUALIFICATION_SERVER_VERSION) {
        throw new GovernedMcpBrokerError("SERVER_SUBSTITUTION", "MCP handshake returned a substituted server identity.");
      }
      const result = await client.callTool({ name: input.operation, arguments: input.arguments }, undefined, {
        signal: input.signal,
        timeout: input.timeoutMs,
        maxTotalTimeout: input.timeoutMs,
      });
      return result.structuredContent;
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
      await rm(executionDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  },
};

export function nodePermissionFlag(
  allowedFlags: ReadonlySet<string> = process.allowedNodeEnvironmentFlags,
) {
  return allowedFlags.has("--permission") ? "--permission" : "--experimental-permission";
}
