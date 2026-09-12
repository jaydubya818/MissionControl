import { computeCanonicalHash } from "./genomeHash.js";

export const MCP_TOOL_VERSION_SCHEMA = "governed-mcp/v1" as const;
export const MCP_TOOL_GRANT_SCHEMA = "governed-mcp-tool-grant/v1" as const;
export const MCP_QUALIFICATION_SERVER = "mission-control-readonly-qualification-fixture" as const;
export const MCP_QUALIFICATION_OPERATION = "read_factory_doctrine_excerpt" as const;
export const MCP_QUALIFICATION_PROTOCOL = "2025-11-25" as const;
export const MCP_CONTEXT7_SERVER = "context7-docs" as const;
export const MCP_CONTEXT7_SERVER_VERSION = "4.0.5" as const;
export const MCP_CONTEXT7_RELEASE_TAG = "@upstash/context7-mcp@4.0.5" as const;
export const MCP_CONTEXT7_RELEASE_COMMIT = "a37d30cf14f69341e12c226fcc729c62b4f0a900" as const;
export const MCP_CONTEXT7_NPM_INTEGRITY = "sha512-PHDDdCiu/H9d37R//g/s50f5/EBvGECABExSgz0ESsdpeEoPCfWj34xd21r/3zakWTapOOwqManMwd9j9W2Xow==" as const;
export const MCP_CONTEXT7_OPERATION = "query-docs" as const;
export const MCP_CONTEXT7_ENDPOINT = "https://mcp.context7.com/mcp" as const;
export const MCP_CONTEXT7_DESTINATION = "mcp.context7.com:443" as const;
export const MCP_CONTEXT7_ARGUMENTS = { libraryId: "/facebook/react", query: "useEffect cleanup for external subscriptions" } as const;
export const MCP_MAX_QUALIFICATION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

const FIXTURE_INPUT_SCHEMA = { type: "object", additionalProperties: false, required: ["section"], properties: { section: { type: "string", enum: ["authority-boundary"] } } };
const FIXTURE_OUTPUT_SCHEMA = { type: "object", additionalProperties: false, required: ["section", "excerpt", "classification"], properties: { section: { type: "string", const: "authority-boundary" }, excerpt: { type: "string", maxLength: 1_024 }, classification: { type: "string", const: "PUBLIC_FIXTURE" } } };
export const MCP_CONTEXT7_INPUT_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema" as const;
// Convex reserves object keys beginning with `$`. Store the dialect separately
// and reconstruct the provider-advertised schema before every exact comparison.
export const MCP_CONTEXT7_INPUT_SCHEMA = { type: "object", properties: { libraryId: { type: "string", description: "Exact Context7-compatible library ID (e.g., '/mongodb/docs', '/vercel/next.js', '/supabase/supabase', '/vercel/next.js/v14.3.0-canary.87') retrieved from 'resolve-library-id' or directly from user query in the format '/org/project' or '/org/project/version'." }, query: { type: "string", description: "What to look up in the library's documentation, scoped to a single concept. Be specific and include relevant details, but keep each query to one topic — if the user's question spans multiple distinct concepts, make a separate call per concept instead of combining them, unless the question is about how the concepts interact. Good: 'How to set up authentication with JWT in Express.js' or 'React useEffect cleanup function examples'. Bad (too vague): 'auth' or 'hooks'. Bad (too broad): 'routing and auth and caching in Next.js'. The query is sent to the Context7 API for processing. Do not include any sensitive or confidential information such as API keys, passwords, credentials, personal data, or proprietary code in your query." } }, required: ["libraryId", "query"] } as const;
export const MCP_CONTEXT7_OUTPUT_SCHEMA = { type: "object", additionalProperties: false, required: ["contentText", "classification", "source"], properties: { contentText: { type: "string", minLength: 1, maxLength: 65_536 }, classification: { type: "string", const: "PUBLIC" }, source: { type: "string", const: "CONTEXT7" } } } as const;

export function qualificationFixtureToolVersionSnapshot(implementationDigest: string) {
  if (!sha256(implementationDigest)) throw new Error("Tool implementation digest is invalid.");
  return { schema: MCP_TOOL_VERSION_SCHEMA, server: { key: MCP_QUALIFICATION_SERVER, version: "1.0.0", implementationDigest }, sdk: { package: "@modelcontextprotocol/sdk", version: "1.26.0" }, protocolVersion: MCP_QUALIFICATION_PROTOCOL,
    transport: { kind: "STDIO", destination: "LOCAL_PROCESS", entrypoint: "apps/orchestration-server/src/mcpQualificationFixture.mjs", redirects: false },
    operation: { name: MCP_QUALIFICATION_OPERATION, description: "Read one public Mission Control authority-boundary doctrine excerpt.", sideEffect: "READ_ONLY", inputSchema: FIXTURE_INPUT_SCHEMA, inputSchemaDigest: computeCanonicalHash(FIXTURE_INPUT_SCHEMA), outputSchema: FIXTURE_OUTPUT_SCHEMA, outputSchemaDigest: computeCanonicalHash(FIXTURE_OUTPUT_SCHEMA), maxRequestBytes: 256, maxResponseBytes: 2_048, timeoutMs: 2_000 },
    dataClassification: "PUBLIC_FIXTURE", credentialClass: "NONE", lifecycle: { oneProcessPerCall: true, oneRequestPerProcess: true, terminateAfterCall: true }, admission: "QUALIFICATION_FIXTURE", authority: noAuthority() };
}

export function context7ToolVersionSnapshot() {
  const publishedContract = { source: "NPM_RELEASE" as const, package: "@upstash/context7-mcp" as const, releaseTag: MCP_CONTEXT7_RELEASE_TAG, releaseCommit: MCP_CONTEXT7_RELEASE_COMMIT, artifactIntegrity: MCP_CONTEXT7_NPM_INTEGRITY };
  const advertisedInputSchema = { ...MCP_CONTEXT7_INPUT_SCHEMA, $schema: MCP_CONTEXT7_INPUT_SCHEMA_DIALECT };
  const identity = { endpoint: MCP_CONTEXT7_ENDPOINT, protocolVersion: MCP_QUALIFICATION_PROTOCOL, serverVersion: MCP_CONTEXT7_SERVER_VERSION, publishedContract, operation: MCP_CONTEXT7_OPERATION, inputSchema: advertisedInputSchema, outputSchema: MCP_CONTEXT7_OUTPUT_SCHEMA };
  return { schema: MCP_TOOL_VERSION_SCHEMA, server: { key: MCP_CONTEXT7_SERVER, version: MCP_CONTEXT7_SERVER_VERSION, implementationDigest: `sha256:${computeCanonicalHash(identity)}`, publishedContract }, sdk: { package: "@modelcontextprotocol/sdk", version: "1.26.0" }, protocolVersion: MCP_QUALIFICATION_PROTOCOL,
    transport: { kind: "STREAMABLE_HTTP", destination: MCP_CONTEXT7_DESTINATION, endpoint: MCP_CONTEXT7_ENDPOINT, tls: true, redirects: false, dnsPolicy: "PUBLIC_ONLY", maxTransportAttempts: 3 },
    operation: { name: MCP_CONTEXT7_OPERATION, description: "Query the approved public React documentation corpus through Context7.", sideEffect: "READ_ONLY", inputSchema: MCP_CONTEXT7_INPUT_SCHEMA, inputSchemaDialect: MCP_CONTEXT7_INPUT_SCHEMA_DIALECT, inputSchemaDigest: computeCanonicalHash(advertisedInputSchema), outputSchema: MCP_CONTEXT7_OUTPUT_SCHEMA, outputSchemaDigest: computeCanonicalHash(MCP_CONTEXT7_OUTPUT_SCHEMA), maxRequestBytes: 256, maxResponseBytes: 65_536, timeoutMs: 10_000 },
    dataClassification: "PUBLIC", dataScope: { corpus: "CONTEXT7_PUBLIC_REACT_DOCUMENTATION", approvedArguments: MCP_CONTEXT7_ARGUMENTS, approvedArgumentsDigest: computeCanonicalHash(MCP_CONTEXT7_ARGUMENTS) }, credentialClass: "NONE", lifecycle: { oneSessionPerCall: true, terminateAfterCall: true }, admission: "QUALIFIED_REAL_READ_ONLY_SERVICE", authority: noAuthority() };
}

export function mcpToolVersionIssues(input: unknown): string[] {
  if (!plainObject(input)) return ["tool-version-invalid"];
  const snapshot = input as Record<string, any>;
  if (!sha256(snapshot.server?.implementationDigest)) return ["tool-version-implementation-invalid"];
  const exact = snapshot.server?.key === MCP_QUALIFICATION_SERVER
    ? qualificationFixtureToolVersionSnapshot(snapshot.server.implementationDigest)
    : snapshot.server?.key === MCP_CONTEXT7_SERVER ? context7ToolVersionSnapshot() : undefined;
  return exact && computeCanonicalHash(snapshot) === computeCanonicalHash(exact) ? [] : ["tool-version-substituted"];
}
export function mcpToolVersionDigest(input: unknown) {
  if (mcpToolVersionIssues(input).length > 0) throw new Error("Tool Version identity is invalid.");
  return `sha256:${computeCanonicalHash({ namespace: MCP_TOOL_VERSION_SCHEMA, value: input })}`;
}
export function mcpToolGrantSnapshot(input: { grantKey: string; version: number; projectId: string; toolVersionId: string; toolVersionDigest: string; toolVersionSnapshot: unknown; issuedAt: number; expiresAt: number }) {
  if (mcpToolVersionIssues(input.toolVersionSnapshot).length > 0) throw new Error("Tool Version identity is invalid.");
  const tool = input.toolVersionSnapshot as Record<string, any>;
  const snapshot = { schema: MCP_TOOL_GRANT_SCHEMA, grantKey: input.grantKey.trim().toLowerCase(), version: input.version, projectId: input.projectId, toolVersionId: input.toolVersionId, toolVersionDigest: input.toolVersionDigest, toolVersionSnapshot: input.toolVersionSnapshot, operation: tool.operation.name, credentialClass: "NONE", destination: tool.transport.destination, issuedAt: input.issuedAt, expiresAt: input.expiresAt, maxCallsPerAttempt: 1, revocationMode: "DENY_NEW_CALLS" };
  if (mcpToolGrantIssues(snapshot).length > 0) throw new Error("Tool Grant identity is invalid.");
  return snapshot;
}
export function mcpToolGrantIssues(input: unknown): string[] {
  if (!plainObject(input)) return ["tool-grant-invalid"];
  const grant = input as Record<string, any>;
  const keys = ["schema", "grantKey", "version", "projectId", "toolVersionId", "toolVersionDigest", "toolVersionSnapshot", "operation", "credentialClass", "destination", "issuedAt", "expiresAt", "maxCallsPerAttempt", "revocationMode"];
  const issues: string[] = [];
  if (Object.keys(grant).sort().join("|") !== [...keys].sort().join("|")) issues.push("tool-grant-fields-invalid");
  if (grant.schema !== MCP_TOOL_GRANT_SCHEMA || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(grant.grantKey)) issues.push("tool-grant-identity-invalid");
  if (!Number.isSafeInteger(grant.version) || grant.version < 1 || !bounded(grant.projectId, 200) || !bounded(grant.toolVersionId, 200) || !sha256(grant.toolVersionDigest)) issues.push("tool-grant-binding-invalid");
  if (mcpToolVersionIssues(grant.toolVersionSnapshot).length > 0 || safeToolVersionDigest(grant.toolVersionSnapshot) !== grant.toolVersionDigest) issues.push("tool-grant-tool-version-invalid");
  const tool = plainObject(grant.toolVersionSnapshot) ? grant.toolVersionSnapshot as Record<string, any> : undefined;
  if (grant.operation !== tool?.operation?.name || grant.credentialClass !== "NONE" || grant.destination !== tool?.transport?.destination || grant.maxCallsPerAttempt !== 1 || grant.revocationMode !== "DENY_NEW_CALLS") issues.push("tool-grant-scope-invalid");
  if (!Number.isFinite(grant.issuedAt) || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= grant.issuedAt || grant.expiresAt - grant.issuedAt > MCP_MAX_QUALIFICATION_LIFETIME_MS) issues.push("tool-grant-lifecycle-invalid");
  return [...new Set(issues)];
}
export function mcpToolGrantDigest(input: unknown) { if (mcpToolGrantIssues(input).length > 0) throw new Error("Tool Grant identity is invalid."); return `sha256:${computeCanonicalHash({ namespace: MCP_TOOL_GRANT_SCHEMA, value: input })}`; }
export function executionProfileToolGrantBinding(grant: { _id: unknown; grantDigest: string; immutableSnapshot: unknown }) { return { grantId: String(grant._id), grantDigest: grant.grantDigest, grantSnapshot: grant.immutableSnapshot }; }
function noAuthority() { return { discovery: false, write: false, policyMutation: false, acceptance: false, routing: false } as const; }
function plainObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function sha256(value: unknown) { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }
function bounded(value: unknown, max: number) { return typeof value === "string" && value.length > 0 && value.length <= max && !/[\0\r\n]/.test(value); }
function safeToolVersionDigest(value: unknown) { try { return mcpToolVersionDigest(value); } catch { return ""; } }
