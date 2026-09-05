import { canonicalHash } from "@mission-control/shared";

export const GOVERNED_MCP_SCHEMA = "governed-mcp/v1" as const;
export const QUALIFICATION_OPERATION = "read_factory_doctrine_excerpt" as const;
export const QUALIFICATION_SERVER = "mission-control-readonly-qualification-fixture" as const;
export const QUALIFICATION_SERVER_VERSION = "1.0.0" as const;
export const QUALIFICATION_PROTOCOL_VERSION = "2025-11-25" as const;
export const QUALIFICATION_FIXTURE_RELATIVE_PATH = "apps/orchestration-server/src/mcpQualificationFixture.mjs" as const;
export const QUALIFICATION_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["section"],
  properties: { section: { type: "string", enum: ["authority-boundary"] } },
} as const;
export const QUALIFICATION_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["section", "excerpt", "classification"],
  properties: {
    section: { type: "string", const: "authority-boundary" },
    excerpt: { type: "string", maxLength: 1_024 },
    classification: { type: "string", const: "PUBLIC_FIXTURE" },
  },
} as const;

export interface McpToolVersionSnapshot {
  schema: typeof GOVERNED_MCP_SCHEMA;
  server: { key: string; version: string; implementationDigest: string };
  sdk: { package: "@modelcontextprotocol/sdk"; version: "1.26.0" };
  protocolVersion: typeof QUALIFICATION_PROTOCOL_VERSION;
  transport: { kind: "STDIO"; destination: "LOCAL_PROCESS"; entrypoint: string; redirects: false };
  operation: {
    name: string;
    description: string;
    sideEffect: "READ_ONLY";
    inputSchema: unknown;
    inputSchemaDigest: string;
    outputSchema: unknown;
    outputSchemaDigest: string;
    maxRequestBytes: number;
    maxResponseBytes: number;
    timeoutMs: number;
  };
  dataClassification: "PUBLIC_FIXTURE";
  credentialClass: "NONE";
  lifecycle: { oneProcessPerCall: true; oneRequestPerProcess: true; terminateAfterCall: true };
  admission: "QUALIFICATION_FIXTURE";
  authority: {
    discovery: false;
    write: false;
    policyMutation: false;
    acceptance: false;
    routing: false;
  };
}

export interface McpToolGrantSnapshot {
  schema: "governed-mcp-tool-grant/v1";
  grantKey: string;
  version: number;
  projectId: string;
  toolVersionId: string;
  toolVersionDigest: string;
  toolVersionSnapshot: McpToolVersionSnapshot;
  operation: string;
  credentialClass: "NONE";
  destination: "LOCAL_PROCESS";
  issuedAt: number;
  expiresAt: number;
  maxCallsPerAttempt: 1;
  revocationMode: "DENY_NEW_CALLS";
}

export interface GovernedMcpCallRequest {
  callId: string;
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
  arguments: unknown;
  requestedAt: number;
}

export interface GovernedMcpAuthority {
  now: number;
  scope: {
    projectId: string;
    workOrderId: string;
    workflowRunId: string;
    attemptId: string;
  };
  lease: {
    leaseId: string;
    workerId: string;
    workerSessionId: string;
    workerGeneration: number;
    expiresAt: number;
    cancelled: boolean;
  };
  executionProfile: {
    id: string;
    digest: string;
    enabled: boolean;
    qualificationExpiresAt: number;
    toolGrant?: { id: string; digest: string; snapshot: McpToolGrantSnapshot };
  };
  grant: {
    id: string;
    digest: string;
    snapshot: McpToolGrantSnapshot;
    state: "ACTIVE" | "REVOKED" | "EXPIRED";
  };
  toolVersion: {
    id: string;
    digest: string;
    snapshot: McpToolVersionSnapshot;
    enabled: boolean;
    qualificationStatus: "EVIDENCE_QUALIFIED" | "UNQUALIFIED";
    qualificationExpiresAt: number;
  };
  replayed: boolean;
}

export type GovernedMcpDenialCode =
  | "CALL_ID_INVALID" | "REQUEST_TOO_LARGE" | "REQUEST_SCHEMA_INVALID"
  | "ATTEMPT_SCOPE_MISMATCH" | "LEASE_STALE" | "ATTEMPT_CANCELLED"
  | "EXECUTION_PROFILE_MISMATCH" | "EXECUTION_PROFILE_STALE" | "TOOL_GRANT_MISSING"
  | "TOOL_GRANT_MISMATCH" | "TOOL_GRANT_REVOKED" | "TOOL_GRANT_EXPIRED"
  | "TOOL_VERSION_MISMATCH" | "TOOL_VERSION_STALE" | "SERVER_SUBSTITUTION"
  | "OPERATION_DENIED" | "DESTINATION_DENIED" | "CREDENTIAL_CLASS_DENIED" | "REPLAY_DENIED";

export type GovernedMcpDecision =
  | { allowed: true; requestDigest: string }
  | { allowed: false; code: GovernedMcpDenialCode; requestDigest: string };

export function qualificationToolVersion(implementationDigest: string): McpToolVersionSnapshot {
  return {
    schema: GOVERNED_MCP_SCHEMA,
    server: { key: QUALIFICATION_SERVER, version: QUALIFICATION_SERVER_VERSION, implementationDigest },
    sdk: { package: "@modelcontextprotocol/sdk", version: "1.26.0" },
    protocolVersion: QUALIFICATION_PROTOCOL_VERSION,
    transport: { kind: "STDIO", destination: "LOCAL_PROCESS", entrypoint: QUALIFICATION_FIXTURE_RELATIVE_PATH, redirects: false },
    operation: {
      name: QUALIFICATION_OPERATION,
      description: "Read one public Mission Control authority-boundary doctrine excerpt.",
      sideEffect: "READ_ONLY",
      inputSchema: QUALIFICATION_INPUT_SCHEMA,
      inputSchemaDigest: canonicalHash(QUALIFICATION_INPUT_SCHEMA),
      outputSchema: QUALIFICATION_OUTPUT_SCHEMA,
      outputSchemaDigest: canonicalHash(QUALIFICATION_OUTPUT_SCHEMA),
      maxRequestBytes: 256,
      maxResponseBytes: 2_048,
      timeoutMs: 2_000,
    },
    dataClassification: "PUBLIC_FIXTURE",
    credentialClass: "NONE",
    lifecycle: { oneProcessPerCall: true, oneRequestPerProcess: true, terminateAfterCall: true },
    admission: "QUALIFICATION_FIXTURE",
    authority: { discovery: false, write: false, policyMutation: false, acceptance: false, routing: false },
  };
}

export const mcpToolVersionDigest = (snapshot: McpToolVersionSnapshot) => `sha256:${canonicalHash({ namespace: GOVERNED_MCP_SCHEMA, value: snapshot })}`;
export const mcpToolGrantDigest = (snapshot: McpToolGrantSnapshot) => `sha256:${canonicalHash({ namespace: "governed-mcp-tool-grant/v1", value: snapshot })}`;

export function evaluateGovernedMcpCall(request: GovernedMcpCallRequest, authority: GovernedMcpAuthority): GovernedMcpDecision {
  const requestDigest = canonicalHash(request);
  const deny = (code: GovernedMcpDenialCode): GovernedMcpDecision => ({ allowed: false, code, requestDigest });
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,199}$/.test(request.callId)) return deny("CALL_ID_INVALID");
  if (Buffer.byteLength(JSON.stringify(request.arguments), "utf8") > authority.toolVersion.snapshot.operation.maxRequestBytes) return deny("REQUEST_TOO_LARGE");
  if (!validQualificationArguments(request.arguments)) return deny("REQUEST_SCHEMA_INVALID");
  if (request.projectId !== authority.scope.projectId
    || request.workOrderId !== authority.scope.workOrderId
    || request.workflowRunId !== authority.scope.workflowRunId
    || request.attemptId !== authority.scope.attemptId
    || request.attemptId !== request.workflowRunId) return deny("ATTEMPT_SCOPE_MISMATCH");
  if (request.attemptLeaseId !== authority.lease.leaseId
    || request.workerId !== authority.lease.workerId
    || request.workerSessionId !== authority.lease.workerSessionId
    || request.workerGeneration !== authority.lease.workerGeneration
    || authority.lease.expiresAt <= authority.now) return deny("LEASE_STALE");
  if (authority.lease.cancelled) return deny("ATTEMPT_CANCELLED");
  if (request.executionProfileId !== authority.executionProfile.id || request.executionProfileDigest !== authority.executionProfile.digest) return deny("EXECUTION_PROFILE_MISMATCH");
  if (!authority.executionProfile.enabled || authority.executionProfile.qualificationExpiresAt <= authority.now) return deny("EXECUTION_PROFILE_STALE");
  if (!authority.executionProfile.toolGrant) return deny("TOOL_GRANT_MISSING");
  if (request.toolGrantId !== authority.executionProfile.toolGrant.id
    || request.toolGrantDigest !== authority.executionProfile.toolGrant.digest
    || request.toolGrantId !== authority.grant.id
    || request.toolGrantDigest !== authority.grant.digest
    || mcpToolGrantDigest(authority.grant.snapshot) !== authority.grant.digest) return deny("TOOL_GRANT_MISMATCH");
  if (authority.grant.state === "REVOKED") return deny("TOOL_GRANT_REVOKED");
  if (authority.grant.state === "EXPIRED" || authority.grant.snapshot.expiresAt <= authority.now) return deny("TOOL_GRANT_EXPIRED");
  if (authority.grant.snapshot.projectId !== request.projectId
    || authority.grant.snapshot.toolVersionId !== request.toolVersionId
    || authority.grant.snapshot.toolVersionDigest !== request.toolVersionDigest
    || mcpToolVersionDigest(authority.grant.snapshot.toolVersionSnapshot) !== request.toolVersionDigest) return deny("TOOL_GRANT_MISMATCH");
  if (request.toolVersionId !== authority.toolVersion.id
    || request.toolVersionDigest !== authority.toolVersion.digest
    || mcpToolVersionDigest(authority.toolVersion.snapshot) !== authority.toolVersion.digest) return deny("TOOL_VERSION_MISMATCH");
  if (!authority.toolVersion.enabled
    || authority.toolVersion.qualificationStatus !== "EVIDENCE_QUALIFIED"
    || authority.toolVersion.qualificationExpiresAt <= authority.now) return deny("TOOL_VERSION_STALE");
  const tool = authority.toolVersion.snapshot;
  if (tool.server.key !== QUALIFICATION_SERVER || tool.server.version !== QUALIFICATION_SERVER_VERSION
    || tool.protocolVersion !== QUALIFICATION_PROTOCOL_VERSION) return deny("SERVER_SUBSTITUTION");
  if (request.operation !== QUALIFICATION_OPERATION || request.operation !== authority.grant.snapshot.operation
    || request.operation !== tool.operation.name || tool.operation.sideEffect !== "READ_ONLY") return deny("OPERATION_DENIED");
  if (tool.transport.kind !== "STDIO" || tool.transport.destination !== "LOCAL_PROCESS"
    || tool.transport.redirects || tool.transport.entrypoint !== QUALIFICATION_FIXTURE_RELATIVE_PATH) return deny("DESTINATION_DENIED");
  if (tool.credentialClass !== "NONE" || authority.grant.snapshot.credentialClass !== "NONE") return deny("CREDENTIAL_CLASS_DENIED");
  if (authority.replayed) return deny("REPLAY_DENIED");
  return { allowed: true, requestDigest };
}

export function validQualificationArguments(value: unknown): value is { section: "authority-boundary" } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value as object).length === 1
    && (value as { section?: unknown }).section === "authority-boundary";
}

export function validQualificationOutput(value: unknown): value is { section: "authority-boundary"; excerpt: string; classification: "PUBLIC_FIXTURE" } {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value as object).length !== 3) return false;
  const output = value as Record<string, unknown>;
  return output.section === "authority-boundary" && output.classification === "PUBLIC_FIXTURE"
    && typeof output.excerpt === "string" && output.excerpt.length > 0 && output.excerpt.length <= 1_024;
}
