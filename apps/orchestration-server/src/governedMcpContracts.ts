import { canonicalHash } from "@mission-control/shared";

export const GOVERNED_MCP_SCHEMA = "governed-mcp/v1" as const;
export const QUALIFICATION_OPERATION = "read_factory_doctrine_excerpt" as const;
export const QUALIFICATION_SERVER = "mission-control-readonly-qualification-fixture" as const;
export const QUALIFICATION_SERVER_VERSION = "1.0.0" as const;
export const QUALIFICATION_PROTOCOL_VERSION = "2025-11-25" as const;
export const QUALIFICATION_FIXTURE_RELATIVE_PATH = "apps/orchestration-server/src/mcpQualificationFixture.mjs" as const;
export const CONTEXT7_SERVER = "context7-docs" as const;
export const CONTEXT7_SERVER_VERSION = "4.0.5" as const;
export const CONTEXT7_RELEASE_TAG = "@upstash/context7-mcp@4.0.5" as const;
export const CONTEXT7_RELEASE_COMMIT = "a37d30cf14f69341e12c226fcc729c62b4f0a900" as const;
export const CONTEXT7_NPM_INTEGRITY = "sha512-PHDDdCiu/H9d37R//g/s50f5/EBvGECABExSgz0ESsdpeEoPCfWj34xd21r/3zakWTapOOwqManMwd9j9W2Xow==" as const;
export const CONTEXT7_OPERATION = "query-docs" as const;
export const CONTEXT7_ENDPOINT = "https://mcp.context7.com/mcp" as const;
export const CONTEXT7_DESTINATION = "mcp.context7.com:443" as const;
export const CONTEXT7_ARGUMENTS = {
  libraryId: "/facebook/react",
  query: "useEffect cleanup for external subscriptions",
} as const;
export const CONTEXT7_INPUT_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema" as const;
export const QUALIFICATION_INPUT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["section"],
  properties: { section: { type: "string", enum: ["authority-boundary"] } },
} as const;
export const QUALIFICATION_OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["section", "excerpt", "classification"],
  properties: { section: { type: "string", const: "authority-boundary" }, excerpt: { type: "string", maxLength: 1_024 }, classification: { type: "string", const: "PUBLIC_FIXTURE" } },
} as const;
export const CONTEXT7_PERSISTED_INPUT_SCHEMA = {
  type: "object",
  properties: {
    libraryId: {
      type: "string",
      description: "Exact Context7-compatible library ID (e.g., '/mongodb/docs', '/vercel/next.js', '/supabase/supabase', '/vercel/next.js/v14.3.0-canary.87') retrieved from 'resolve-library-id' or directly from user query in the format '/org/project' or '/org/project/version'.",
    },
    query: {
      type: "string",
      description: "What to look up in the library's documentation, scoped to a single concept. Be specific and include relevant details, but keep each query to one topic — if the user's question spans multiple distinct concepts, make a separate call per concept instead of combining them, unless the question is about how the concepts interact. Good: 'How to set up authentication with JWT in Express.js' or 'React useEffect cleanup function examples'. Bad (too vague): 'auth' or 'hooks'. Bad (too broad): 'routing and auth and caching in Next.js'. The query is sent to the Context7 API for processing. Do not include any sensitive or confidential information such as API keys, passwords, credentials, personal data, or proprietary code in your query.",
    },
  },
  required: ["libraryId", "query"],
} as const;
export const CONTEXT7_INPUT_SCHEMA = {
  ...CONTEXT7_PERSISTED_INPUT_SCHEMA,
  $schema: CONTEXT7_INPUT_SCHEMA_DIALECT,
} as const;
export const CONTEXT7_OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["contentText", "classification", "source"],
  properties: { contentText: { type: "string", minLength: 1, maxLength: 65_536 }, classification: { type: "string", const: "PUBLIC" }, source: { type: "string", const: "CONTEXT7" } },
} as const;

type McpOperation = {
  name: string; description: string; sideEffect: "READ_ONLY"; inputSchema: unknown; inputSchemaDigest: string;
  inputSchemaDialect?: string;
  outputSchema: unknown; outputSchemaDigest: string; maxRequestBytes: number; maxResponseBytes: number; timeoutMs: number;
};
export type McpToolVersionSnapshot = {
  schema: typeof GOVERNED_MCP_SCHEMA;
  server: { key: string; version: string; implementationDigest: string; publishedContract?: { source: "NPM_RELEASE"; package: "@upstash/context7-mcp"; releaseTag: typeof CONTEXT7_RELEASE_TAG; releaseCommit: typeof CONTEXT7_RELEASE_COMMIT; artifactIntegrity: typeof CONTEXT7_NPM_INTEGRITY } };
  sdk: { package: "@modelcontextprotocol/sdk"; version: "1.26.0" };
  protocolVersion: typeof QUALIFICATION_PROTOCOL_VERSION;
  transport:
    | { kind: "STDIO"; destination: "LOCAL_PROCESS"; entrypoint: string; redirects: false }
    | { kind: "STREAMABLE_HTTP"; destination: typeof CONTEXT7_DESTINATION; endpoint: typeof CONTEXT7_ENDPOINT; tls: true; redirects: false; dnsPolicy: "PUBLIC_ONLY"; maxTransportAttempts: 3 };
  operation: McpOperation;
  dataClassification: "PUBLIC_FIXTURE" | "PUBLIC";
  dataScope?: { corpus: "CONTEXT7_PUBLIC_REACT_DOCUMENTATION"; approvedArguments: typeof CONTEXT7_ARGUMENTS; approvedArgumentsDigest: string };
  credentialClass: "NONE";
  lifecycle: { oneProcessPerCall: true; oneRequestPerProcess: true; terminateAfterCall: true } | { oneSessionPerCall: true; terminateAfterCall: true };
  admission: "QUALIFICATION_FIXTURE" | "QUALIFIED_REAL_READ_ONLY_SERVICE";
  authority: { discovery: false; write: false; policyMutation: false; acceptance: false; routing: false };
};
export interface McpToolGrantSnapshot {
  schema: "governed-mcp-tool-grant/v1"; grantKey: string; version: number; projectId: string; toolVersionId: string;
  toolVersionDigest: string; toolVersionSnapshot: McpToolVersionSnapshot; operation: string; credentialClass: "NONE";
  destination: "LOCAL_PROCESS" | typeof CONTEXT7_DESTINATION; issuedAt: number; expiresAt: number;
  maxCallsPerAttempt: 1; revocationMode: "DENY_NEW_CALLS";
}
export interface GovernedMcpCallRequest {
  callId: string; projectId: string; workOrderId: string; workflowRunId: string; attemptId: string; attemptLeaseId: string;
  workerId: string; workerSessionId: string; workerGeneration: number; executionProfileId: string; executionProfileDigest: string;
  toolGrantId: string; toolGrantDigest: string; toolVersionId: string; toolVersionDigest: string; operation: string;
  arguments: unknown; requestedAt: number;
}
export interface GovernedMcpAuthority {
  now: number;
  scope: { projectId: string; workOrderId: string; workflowRunId: string; attemptId: string };
  lease: { leaseId: string; workerId: string; workerSessionId: string; workerGeneration: number; expiresAt: number; cancelled: boolean };
  executionProfile: { id: string; digest: string; enabled: boolean; qualificationExpiresAt: number; toolGrant?: { id: string; digest: string; snapshot: McpToolGrantSnapshot } };
  grant: { id: string; digest: string; snapshot: McpToolGrantSnapshot; state: "ACTIVE" | "REVOKED" | "EXPIRED" };
  toolVersion: { id: string; digest: string; snapshot: McpToolVersionSnapshot; enabled: boolean; qualificationStatus: "EVIDENCE_QUALIFIED" | "UNQUALIFIED"; qualificationExpiresAt: number };
  replayed: boolean;
}
export type GovernedMcpDenialCode = "CALL_ID_INVALID" | "REQUEST_TOO_LARGE" | "REQUEST_SCHEMA_INVALID" | "ATTEMPT_SCOPE_MISMATCH" | "LEASE_STALE" | "ATTEMPT_CANCELLED" | "EXECUTION_PROFILE_MISMATCH" | "EXECUTION_PROFILE_STALE" | "TOOL_GRANT_MISSING" | "TOOL_GRANT_MISMATCH" | "TOOL_GRANT_REVOKED" | "TOOL_GRANT_EXPIRED" | "TOOL_VERSION_MISMATCH" | "TOOL_VERSION_STALE" | "SERVER_SUBSTITUTION" | "OPERATION_DENIED" | "DESTINATION_DENIED" | "CREDENTIAL_CLASS_DENIED" | "REPLAY_DENIED";
export type GovernedMcpDecision = { allowed: true; requestDigest: string } | { allowed: false; code: GovernedMcpDenialCode; requestDigest: string };

export function qualificationToolVersion(implementationDigest: string): McpToolVersionSnapshot {
  return { schema: GOVERNED_MCP_SCHEMA, server: { key: QUALIFICATION_SERVER, version: QUALIFICATION_SERVER_VERSION, implementationDigest }, sdk: { package: "@modelcontextprotocol/sdk", version: "1.26.0" }, protocolVersion: QUALIFICATION_PROTOCOL_VERSION,
    transport: { kind: "STDIO", destination: "LOCAL_PROCESS", entrypoint: QUALIFICATION_FIXTURE_RELATIVE_PATH, redirects: false },
    operation: { name: QUALIFICATION_OPERATION, description: "Read one public Mission Control authority-boundary doctrine excerpt.", sideEffect: "READ_ONLY", inputSchema: QUALIFICATION_INPUT_SCHEMA, inputSchemaDigest: canonicalHash(QUALIFICATION_INPUT_SCHEMA), outputSchema: QUALIFICATION_OUTPUT_SCHEMA, outputSchemaDigest: canonicalHash(QUALIFICATION_OUTPUT_SCHEMA), maxRequestBytes: 256, maxResponseBytes: 2_048, timeoutMs: 2_000 },
    dataClassification: "PUBLIC_FIXTURE", credentialClass: "NONE", lifecycle: { oneProcessPerCall: true, oneRequestPerProcess: true, terminateAfterCall: true }, admission: "QUALIFICATION_FIXTURE", authority: noAuthority() };
}
export function context7ToolVersion(): McpToolVersionSnapshot {
  const publishedContract = { source: "NPM_RELEASE" as const, package: "@upstash/context7-mcp" as const, releaseTag: CONTEXT7_RELEASE_TAG, releaseCommit: CONTEXT7_RELEASE_COMMIT, artifactIntegrity: CONTEXT7_NPM_INTEGRITY };
  const identity = { endpoint: CONTEXT7_ENDPOINT, protocolVersion: QUALIFICATION_PROTOCOL_VERSION, serverVersion: CONTEXT7_SERVER_VERSION, publishedContract, operation: CONTEXT7_OPERATION, inputSchema: CONTEXT7_INPUT_SCHEMA, outputSchema: CONTEXT7_OUTPUT_SCHEMA };
  return { schema: GOVERNED_MCP_SCHEMA, server: { key: CONTEXT7_SERVER, version: CONTEXT7_SERVER_VERSION, implementationDigest: `sha256:${canonicalHash(identity)}`, publishedContract }, sdk: { package: "@modelcontextprotocol/sdk", version: "1.26.0" }, protocolVersion: QUALIFICATION_PROTOCOL_VERSION,
    transport: { kind: "STREAMABLE_HTTP", destination: CONTEXT7_DESTINATION, endpoint: CONTEXT7_ENDPOINT, tls: true, redirects: false, dnsPolicy: "PUBLIC_ONLY", maxTransportAttempts: 3 },
    operation: { name: CONTEXT7_OPERATION, description: "Query the approved public React documentation corpus through Context7.", sideEffect: "READ_ONLY", inputSchema: CONTEXT7_PERSISTED_INPUT_SCHEMA, inputSchemaDialect: CONTEXT7_INPUT_SCHEMA_DIALECT, inputSchemaDigest: canonicalHash(CONTEXT7_INPUT_SCHEMA), outputSchema: CONTEXT7_OUTPUT_SCHEMA, outputSchemaDigest: canonicalHash(CONTEXT7_OUTPUT_SCHEMA), maxRequestBytes: 256, maxResponseBytes: 65_536, timeoutMs: 10_000 },
    dataClassification: "PUBLIC", dataScope: { corpus: "CONTEXT7_PUBLIC_REACT_DOCUMENTATION", approvedArguments: CONTEXT7_ARGUMENTS, approvedArgumentsDigest: canonicalHash(CONTEXT7_ARGUMENTS) }, credentialClass: "NONE", lifecycle: { oneSessionPerCall: true, terminateAfterCall: true }, admission: "QUALIFIED_REAL_READ_ONLY_SERVICE", authority: noAuthority() };
}
function noAuthority() { return { discovery: false, write: false, policyMutation: false, acceptance: false, routing: false } as const; }
export const mcpToolVersionDigest = (snapshot: McpToolVersionSnapshot) => `sha256:${canonicalHash({ namespace: GOVERNED_MCP_SCHEMA, value: snapshot })}`;
export const mcpToolGrantDigest = (snapshot: McpToolGrantSnapshot) => `sha256:${canonicalHash({ namespace: "governed-mcp-tool-grant/v1", value: snapshot })}`;

export function evaluateGovernedMcpCall(request: GovernedMcpCallRequest, authority: GovernedMcpAuthority): GovernedMcpDecision {
  const requestDigest = canonicalHash(request);
  const deny = (code: GovernedMcpDenialCode): GovernedMcpDecision => ({ allowed: false, code, requestDigest });
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,199}$/.test(request.callId)) return deny("CALL_ID_INVALID");
  if (Buffer.byteLength(JSON.stringify(request.arguments), "utf8") > authority.toolVersion.snapshot.operation.maxRequestBytes) return deny("REQUEST_TOO_LARGE");
  if (!validArguments(authority.toolVersion.snapshot, request.arguments)) return deny("REQUEST_SCHEMA_INVALID");
  if (request.projectId !== authority.scope.projectId || request.workOrderId !== authority.scope.workOrderId || request.workflowRunId !== authority.scope.workflowRunId || request.attemptId !== authority.scope.attemptId || request.attemptId !== request.workflowRunId) return deny("ATTEMPT_SCOPE_MISMATCH");
  if (request.attemptLeaseId !== authority.lease.leaseId || request.workerId !== authority.lease.workerId || request.workerSessionId !== authority.lease.workerSessionId || request.workerGeneration !== authority.lease.workerGeneration || authority.lease.expiresAt <= authority.now) return deny("LEASE_STALE");
  if (authority.lease.cancelled) return deny("ATTEMPT_CANCELLED");
  if (request.executionProfileId !== authority.executionProfile.id || request.executionProfileDigest !== authority.executionProfile.digest) return deny("EXECUTION_PROFILE_MISMATCH");
  if (!authority.executionProfile.enabled || authority.executionProfile.qualificationExpiresAt <= authority.now) return deny("EXECUTION_PROFILE_STALE");
  if (!authority.executionProfile.toolGrant) return deny("TOOL_GRANT_MISSING");
  if (request.toolGrantId !== authority.executionProfile.toolGrant.id || request.toolGrantDigest !== authority.executionProfile.toolGrant.digest || request.toolGrantId !== authority.grant.id || request.toolGrantDigest !== authority.grant.digest || mcpToolGrantDigest(authority.grant.snapshot) !== authority.grant.digest) return deny("TOOL_GRANT_MISMATCH");
  if (authority.grant.state === "REVOKED") return deny("TOOL_GRANT_REVOKED");
  if (authority.grant.state === "EXPIRED" || authority.grant.snapshot.expiresAt <= authority.now) return deny("TOOL_GRANT_EXPIRED");
  if (authority.grant.snapshot.projectId !== request.projectId || authority.grant.snapshot.toolVersionId !== request.toolVersionId || authority.grant.snapshot.toolVersionDigest !== request.toolVersionDigest || mcpToolVersionDigest(authority.grant.snapshot.toolVersionSnapshot) !== request.toolVersionDigest) return deny("TOOL_GRANT_MISMATCH");
  if (request.toolVersionId !== authority.toolVersion.id || request.toolVersionDigest !== authority.toolVersion.digest || mcpToolVersionDigest(authority.toolVersion.snapshot) !== authority.toolVersion.digest) return deny("TOOL_VERSION_MISMATCH");
  if (!authority.toolVersion.enabled || authority.toolVersion.qualificationStatus !== "EVIDENCE_QUALIFIED" || authority.toolVersion.qualificationExpiresAt <= authority.now) return deny("TOOL_VERSION_STALE");
  const tool = authority.toolVersion.snapshot;
  if (!exactAdmittedTool(tool)) return deny("SERVER_SUBSTITUTION");
  if (request.operation !== authority.grant.snapshot.operation || request.operation !== tool.operation.name || tool.operation.sideEffect !== "READ_ONLY") return deny("OPERATION_DENIED");
  if (authority.grant.snapshot.destination !== tool.transport.destination || !validDestination(tool)) return deny("DESTINATION_DENIED");
  if (tool.credentialClass !== "NONE" || authority.grant.snapshot.credentialClass !== "NONE") return deny("CREDENTIAL_CLASS_DENIED");
  if (authority.replayed) return deny("REPLAY_DENIED");
  return { allowed: true, requestDigest };
}
export function validArguments(tool: McpToolVersionSnapshot, value: unknown) {
  if (tool.server.key === QUALIFICATION_SERVER) return validQualificationArguments(value);
  return tool.server.key === CONTEXT7_SERVER && canonicalHash(value) === canonicalHash(CONTEXT7_ARGUMENTS) && tool.dataScope?.approvedArgumentsDigest === canonicalHash(CONTEXT7_ARGUMENTS);
}
export function validOutput(tool: McpToolVersionSnapshot, value: unknown) {
  if (tool.server.key === QUALIFICATION_SERVER) return validQualificationOutput(value);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value as object).length !== 3) return false;
  const output = value as Record<string, unknown>;
  return tool.server.key === CONTEXT7_SERVER && output.classification === "PUBLIC" && output.source === "CONTEXT7" && typeof output.contentText === "string" && output.contentText.length > 0 && output.contentText.length <= 65_536;
}
export function validQualificationArguments(value: unknown): value is { section: "authority-boundary" } { return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 1 && (value as { section?: unknown }).section === "authority-boundary"; }
export function validQualificationOutput(value: unknown): value is { section: "authority-boundary"; excerpt: string; classification: "PUBLIC_FIXTURE" } {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value as object).length !== 3) return false;
  const output = value as Record<string, unknown>;
  return output.section === "authority-boundary" && output.classification === "PUBLIC_FIXTURE" && typeof output.excerpt === "string" && output.excerpt.length > 0 && output.excerpt.length <= 1_024;
}
function exactAdmittedTool(tool: McpToolVersionSnapshot) {
  const expected = tool.server.key === QUALIFICATION_SERVER ? qualificationToolVersion(tool.server.implementationDigest) : tool.server.key === CONTEXT7_SERVER ? context7ToolVersion() : undefined;
  return Boolean(expected) && canonicalHash(tool) === canonicalHash(expected);
}
function validDestination(tool: McpToolVersionSnapshot) {
  if (tool.transport.kind === "STDIO") return tool.transport.destination === "LOCAL_PROCESS" && !tool.transport.redirects && tool.transport.entrypoint === QUALIFICATION_FIXTURE_RELATIVE_PATH;
  return tool.transport.destination === CONTEXT7_DESTINATION && tool.transport.endpoint === CONTEXT7_ENDPOINT && tool.transport.tls && !tool.transport.redirects && tool.transport.dnsPolicy === "PUBLIC_ONLY";
}
