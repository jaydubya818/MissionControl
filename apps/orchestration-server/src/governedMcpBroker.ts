import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { canonicalHash } from "@mission-control/shared";
import {
  evaluateGovernedMcpCall,
  CONTEXT7_ENDPOINT,
  CONTEXT7_INPUT_SCHEMA,
  CONTEXT7_SERVER_VERSION,
  QUALIFICATION_SERVER,
  QUALIFICATION_SERVER_VERSION,
  validOutput,
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
  expectedServerVersion?: string;
  observedServerVersion?: string;
  expectedInputSchemaDigest?: string;
  observedInputSchemaDigest?: string;
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
    transportKind?: "STDIO" | "STREAMABLE_HTTP";
    expectedInputSchema?: unknown;
    expectedInputSchemaDialect?: string;
    expectedProtocolVersion?: string;
    expectedServerVersion?: string;
    recordObservedContract?: (observed: { serverVersion: string; inputSchemaDigest?: string }) => void;
    signal?: AbortSignal;
  }): Promise<unknown>;
}

export class GovernedMcpBrokerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly observedServerVersion?: string,
    readonly observedInputSchemaDigest?: string,
  ) {
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
      const transport = authority.toolVersion.snapshot.transport;
      const serverEntrypoint = transport.kind === "STDIO"
        ? resolve(input.hostRoot, transport.entrypoint)
        : transport.endpoint;
      if (transport.kind === "STREAMABLE_HTTP") assertApprovedRemoteDestination(serverEntrypoint);
      const implementationDigest = transport.kind === "STDIO"
        ? await this.runtime.implementationDigest(serverEntrypoint)
        : authority.toolVersion.snapshot.server.implementationDigest;
      if (implementationDigest !== authority.toolVersion.snapshot.server.implementationDigest) {
        throw new GovernedMcpBrokerError("IMPLEMENTATION_SUBSTITUTION", "MCP server implementation digest does not match the qualified Tool Version.");
      }
      let observedContract: { serverVersion?: string; inputSchemaDigest?: string } = {};
      const output = await this.runtime.invoke({
        entrypoint: serverEntrypoint,
        operation: input.request.operation,
        arguments: input.request.arguments as Record<string, unknown>,
        timeoutMs: authority.toolVersion.snapshot.operation.timeoutMs,
        expectedImplementationDigest: implementationDigest,
        transportKind: transport.kind,
        expectedInputSchema: authority.toolVersion.snapshot.operation.inputSchema,
        expectedInputSchemaDialect: authority.toolVersion.snapshot.operation.inputSchemaDialect,
        expectedProtocolVersion: authority.toolVersion.snapshot.protocolVersion,
        expectedServerVersion: authority.toolVersion.snapshot.server.version,
        recordObservedContract: (observed) => { observedContract = observed; },
        signal: input.signal,
      });
      if (!validOutput(authority.toolVersion.snapshot, output)) throw new GovernedMcpBrokerError("RESPONSE_SCHEMA_INVALID", "MCP response failed the frozen output schema.");
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
        observedServerVersion: observedContract.serverVersion,
        observedInputSchemaDigest: observedContract.inputSchemaDigest,
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
        observedServerVersion: error instanceof GovernedMcpBrokerError ? error.observedServerVersion : undefined,
        observedInputSchemaDigest: error instanceof GovernedMcpBrokerError ? error.observedInputSchemaDigest : undefined,
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
    expectedServerVersion: authority.toolVersion.snapshot.server.version,
    expectedInputSchemaDigest: authority.toolVersion.snapshot.operation.inputSchemaDigest,
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
    if (input.transportKind === "STREAMABLE_HTTP") return invokeContext7(input);
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

async function invokeContext7(input: Parameters<GovernedMcpBrokerRuntime["invoke"]>[0]) {
  assertApprovedRemoteDestination(input.entrypoint);
  const deadline = brokerDeadline(input.timeoutMs, input.signal);
  const guardedFetch: typeof fetch = async (url, init) => {
    const target = typeof url === "string" || url instanceof URL ? String(url) : url.url;
    const addresses = await deadline.waitFor(assertApprovedRemoteDestinationWithDns(target));
    const response = await pinnedHttpsFetch(new URL(target), { ...init, signal: deadline.signal, redirect: "manual" }, addresses);
    if (response.status >= 300 && response.status < 400) throw new GovernedMcpBrokerError("REDIRECT_DENIED", "MCP transport redirect was denied.");
    return response;
  };
  const transport = new StreamableHTTPClientTransport(new URL(input.entrypoint), {
    fetch: guardedFetch,
    requestInit: { redirect: "manual" },
    reconnectionOptions: { maxReconnectionDelay: 250, initialReconnectionDelay: 100, reconnectionDelayGrowFactor: 1, maxRetries: 0 },
  });
  const client = new Client({ name: "mission-control-governed-tool-broker", version: "1.0.0" }, { capabilities: {}, enforceStrictCapabilities: true });
  try {
    await client.connect(transport, deadline.requestOptions());
    if (transport.protocolVersion !== input.expectedProtocolVersion) {
      throw new GovernedMcpBrokerError("SERVER_SUBSTITUTION", "MCP handshake negotiated a different protocol identity.");
    }
    const server = client.getServerVersion();
    if (server?.name !== "Context7" || server.version !== input.expectedServerVersion || server.version !== CONTEXT7_SERVER_VERSION) {
      throw new GovernedMcpBrokerError("SERVER_SUBSTITUTION", "MCP handshake returned an unexpected server identity.", server?.version);
    }
    input.recordObservedContract?.({ serverVersion: server.version });
    const catalog = await client.listTools(undefined, deadline.requestOptions());
    let observedInputSchemaDigest: string;
    try {
      observedInputSchemaDigest = assertAdvertisedTool(
        catalog.tools,
        input.operation,
        input.expectedInputSchema ?? CONTEXT7_INPUT_SCHEMA,
        input.expectedInputSchemaDialect,
      );
    } catch (error) {
      if (error instanceof GovernedMcpBrokerError) {
        throw new GovernedMcpBrokerError(error.code, error.message, server.version, error.observedInputSchemaDigest);
      }
      throw error;
    }
    input.recordObservedContract?.({ serverVersion: server.version, inputSchemaDigest: observedInputSchemaDigest });
    const result = await client.callTool({ name: input.operation, arguments: input.arguments }, undefined, deadline.requestOptions());
    if (result.isError) throw new GovernedMcpBrokerError("TOOL_CALL_FAILED", "MCP service returned a tool error.");
    const content = Array.isArray(result.content) ? result.content as Array<{ type?: string; text?: string }> : [];
    const contentText = content
      .map((item) => item.type === "text" && typeof item.text === "string" ? item.text : "")
      .filter(Boolean)
      .join("\n");
    return { contentText, classification: "PUBLIC", source: "CONTEXT7" };
  } catch (error) {
    if (deadline.didTimeout()) {
      throw new GovernedMcpBrokerError("TOOL_TIMEOUT", "MCP call exceeded its single end-to-end deadline.");
    }
    throw error;
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
    deadline.dispose();
  }
}

export function assertAdvertisedTool(catalog: Array<{ name: string; inputSchema: unknown }>, operation: string, expectedInputSchema: unknown, expectedInputSchemaDialect?: string) {
  const matches = catalog.filter((candidate) => candidate.name === operation);
  const tool = matches.length === 1 ? matches[0] : undefined;
  const observedInputSchemaDigest = tool ? canonicalHash(tool.inputSchema) : undefined;
  const reconstructedExpected = expectedInputSchemaDialect && expectedInputSchema && typeof expectedInputSchema === "object" && !Array.isArray(expectedInputSchema)
    ? { ...(expectedInputSchema as Record<string, unknown>), $schema: expectedInputSchemaDialect }
    : expectedInputSchema;
  if (!tool || observedInputSchemaDigest !== canonicalHash(reconstructedExpected)) {
    throw new GovernedMcpBrokerError("SERVER_SCHEMA_SUBSTITUTION", "MCP server advertised a different operation schema.", undefined, observedInputSchemaDigest);
  }
  return observedInputSchemaDigest;
}

export function assertApprovedRemoteDestination(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new GovernedMcpBrokerError("DESTINATION_DENIED", "MCP destination URL is invalid."); }
  if (value !== CONTEXT7_ENDPOINT || url.protocol !== "https:" || url.hostname !== "mcp.context7.com" || url.port !== "" || url.pathname !== "/mcp" || url.search || url.hash || isIP(url.hostname)) {
    throw new GovernedMcpBrokerError("DESTINATION_DENIED", "MCP destination is outside the exact qualified authority.");
  }
}

type AddressRecord = { address: string; family: number };

export async function assertApprovedRemoteDestinationWithDns(value: string, resolved?: readonly string[]): Promise<AddressRecord[]> {
  assertApprovedRemoteDestination(value);
  const addresses = resolved
    ? resolved.map((address) => ({ address, family: isIP(address) }))
    : await lookup("mcp.context7.com", { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address, family }) => !family || !publicAddress(address))) {
    throw new GovernedMcpBrokerError("DESTINATION_DENIED", "MCP destination DNS resolved outside public network authority.");
  }
  return addresses;
}

export function publicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99)
      || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  if (family === 6) {
    const bytes = ipv6Bytes(address);
    if (!bytes) return false;
    const mapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
    if (mapped) return publicAddress(bytes.slice(12).join("."));
    return !(bytes.every((byte) => byte === 0)
      || (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1)
      || (bytes[0] & 0xfe) === 0xfc
      || (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80)
      || bytes[0] === 0xff
      || (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8)
      || (bytes[0] === 0x01 && bytes.slice(1, 8).every((byte) => byte === 0)));
  }
  return false;
}

function ipv6Bytes(address: string): number[] | null {
  let normalized = address.toLowerCase().split("%")[0];
  const ipv4Tail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const octets = ipv4Tail.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    normalized = `${normalized.slice(0, -ipv4Tail.length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.flatMap((group) => {
    const word = Number.parseInt(group, 16);
    return [word >> 8, word & 0xff];
  });
}

async function pinnedHttpsFetch(url: URL, init: RequestInit, addresses: AddressRecord[]): Promise<Response> {
  const address = addresses[0];
  if (!address) throw new GovernedMcpBrokerError("DESTINATION_DENIED", "MCP destination DNS returned no approved public address.");
  const body = init.body == null ? undefined : Buffer.from(await new Response(init.body).arrayBuffer());
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, name) => { headers[name] = value; });
  return await new Promise<Response>((resolveResponse, rejectResponse) => {
    const request = httpsRequest({
      protocol: "https:",
      hostname: address.address,
      family: address.family,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: init.method ?? "GET",
      headers: { ...headers, host: url.host },
      servername: url.hostname,
      rejectUnauthorized: true,
      signal: init.signal ?? undefined,
      agent: false,
    }, (incoming) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
        else if (value !== undefined) responseHeaders.set(name, value);
      }
      const status = incoming.statusCode ?? 502;
      const noBody = (init.method ?? "GET").toUpperCase() === "HEAD" || status === 204 || status === 205 || status === 304;
      resolveResponse(new Response(noBody ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>, {
        status,
        statusText: incoming.statusMessage,
        headers: responseHeaders,
      }));
    });
    request.once("error", rejectResponse);
    request.end(body);
  });
}

function brokerDeadline(timeoutMs: number, callerSignal?: AbortSignal) {
  const controller = new AbortController();
  const deadlineAt = Date.now() + timeoutMs;
  let timedOut = false;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new GovernedMcpBrokerError("TOOL_TIMEOUT", "MCP call exceeded its single end-to-end deadline."));
  }, timeoutMs);
  const remaining = () => {
    const value = deadlineAt - Date.now();
    if (timedOut || value <= 0) throw new GovernedMcpBrokerError("TOOL_TIMEOUT", "MCP call exceeded its single end-to-end deadline.");
    if (callerSignal?.aborted) throw new GovernedMcpBrokerError("ATTEMPT_CANCELLED", "Attempt canceled the MCP call.");
    return Math.max(1, value);
  };
  return {
    signal: controller.signal,
    requestOptions: () => {
      const timeout = remaining();
      return { signal: controller.signal, timeout, maxTotalTimeout: timeout };
    },
    didTimeout: () => timedOut,
    waitFor: async <T>(promise: Promise<T>) => await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => controller.signal.addEventListener("abort", () => reject(
        timedOut
          ? new GovernedMcpBrokerError("TOOL_TIMEOUT", "MCP call exceeded its single end-to-end deadline.")
          : new GovernedMcpBrokerError("ATTEMPT_CANCELLED", "Attempt canceled the MCP call."),
      ), { once: true })),
    ]),
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

export function nodePermissionFlag(
  allowedFlags: ReadonlySet<string> = process.allowedNodeEnvironmentFlags,
) {
  return allowedFlags.has("--permission") ? "--permission" : "--experimental-permission";
}
