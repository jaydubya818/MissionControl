import { computeCanonicalHash } from "./genomeHash.js";

export const MCP_TOOL_VERSION_SCHEMA = "governed-mcp/v1" as const;
export const MCP_TOOL_GRANT_SCHEMA = "governed-mcp-tool-grant/v1" as const;
export const MCP_QUALIFICATION_SERVER = "mission-control-readonly-qualification-fixture" as const;
export const MCP_QUALIFICATION_OPERATION = "read_factory_doctrine_excerpt" as const;
export const MCP_QUALIFICATION_PROTOCOL = "2025-11-25" as const;
export const MCP_MAX_QUALIFICATION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

const INPUT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["section"],
  properties: { section: { type: "string", enum: ["authority-boundary"] } },
};
const OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["section", "excerpt", "classification"],
  properties: {
    section: { type: "string", const: "authority-boundary" },
    excerpt: { type: "string", maxLength: 1_024 },
    classification: { type: "string", const: "PUBLIC_FIXTURE" },
  },
};

export function qualificationFixtureToolVersionSnapshot(implementationDigest: string) {
  if (!sha256(implementationDigest)) throw new Error("Tool implementation digest is invalid.");
  return {
    schema: MCP_TOOL_VERSION_SCHEMA,
    server: { key: MCP_QUALIFICATION_SERVER, version: "1.0.0", implementationDigest },
    sdk: { package: "@modelcontextprotocol/sdk", version: "1.26.0" },
    protocolVersion: MCP_QUALIFICATION_PROTOCOL,
    transport: {
      kind: "STDIO", destination: "LOCAL_PROCESS",
      entrypoint: "apps/orchestration-server/src/mcpQualificationFixture.mjs", redirects: false,
    },
    operation: {
      name: MCP_QUALIFICATION_OPERATION,
      description: "Read one public Mission Control authority-boundary doctrine excerpt.",
      sideEffect: "READ_ONLY",
      inputSchema: INPUT_SCHEMA,
      inputSchemaDigest: computeCanonicalHash(INPUT_SCHEMA),
      outputSchema: OUTPUT_SCHEMA,
      outputSchemaDigest: computeCanonicalHash(OUTPUT_SCHEMA),
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

export function mcpToolVersionIssues(input: unknown): string[] {
  if (!plainObject(input)) return ["tool-version-invalid"];
  const snapshot = input as Record<string, any>;
  if (!sha256(snapshot.server?.implementationDigest)) return ["tool-version-implementation-invalid"];
  const exact = qualificationFixtureToolVersionSnapshot(snapshot.server?.implementationDigest ?? "invalid");
  return computeCanonicalHash(snapshot) === computeCanonicalHash(exact) ? [] : ["tool-version-substituted"];
}

export function mcpToolVersionDigest(input: unknown) {
  if (mcpToolVersionIssues(input).length > 0) throw new Error("Tool Version identity is invalid.");
  return `sha256:${computeCanonicalHash({ namespace: MCP_TOOL_VERSION_SCHEMA, value: input })}`;
}

export function mcpToolGrantSnapshot(input: {
  grantKey: string; version: number; projectId: string; toolVersionId: string;
  toolVersionDigest: string; toolVersionSnapshot: unknown; issuedAt: number; expiresAt: number;
}) {
  const snapshot = {
    schema: MCP_TOOL_GRANT_SCHEMA,
    grantKey: input.grantKey.trim().toLowerCase(),
    version: input.version,
    projectId: input.projectId,
    toolVersionId: input.toolVersionId,
    toolVersionDigest: input.toolVersionDigest,
    toolVersionSnapshot: input.toolVersionSnapshot,
    operation: MCP_QUALIFICATION_OPERATION,
    credentialClass: "NONE",
    destination: "LOCAL_PROCESS",
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    maxCallsPerAttempt: 1,
    revocationMode: "DENY_NEW_CALLS",
  };
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
  if (mcpToolVersionIssues(grant.toolVersionSnapshot).length > 0
    || safeToolVersionDigest(grant.toolVersionSnapshot) !== grant.toolVersionDigest) issues.push("tool-grant-tool-version-invalid");
  if (grant.operation !== MCP_QUALIFICATION_OPERATION || grant.credentialClass !== "NONE" || grant.destination !== "LOCAL_PROCESS" || grant.maxCallsPerAttempt !== 1 || grant.revocationMode !== "DENY_NEW_CALLS") issues.push("tool-grant-scope-invalid");
  if (!Number.isFinite(grant.issuedAt) || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= grant.issuedAt || grant.expiresAt - grant.issuedAt > MCP_MAX_QUALIFICATION_LIFETIME_MS) issues.push("tool-grant-lifecycle-invalid");
  return [...new Set(issues)];
}

export function mcpToolGrantDigest(input: unknown) {
  if (mcpToolGrantIssues(input).length > 0) throw new Error("Tool Grant identity is invalid.");
  return `sha256:${computeCanonicalHash({ namespace: MCP_TOOL_GRANT_SCHEMA, value: input })}`;
}

export function executionProfileToolGrantBinding(grant: { _id: unknown; grantDigest: string; immutableSnapshot: unknown }) {
  return { grantId: String(grant._id), grantDigest: grant.grantDigest, grantSnapshot: grant.immutableSnapshot };
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function sha256(value: unknown) { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }
function bounded(value: unknown, max: number) { return typeof value === "string" && value.length > 0 && value.length <= max && !/[\0\r\n]/.test(value); }
function safeToolVersionDigest(value: unknown) {
  try { return mcpToolVersionDigest(value); } catch { return ""; }
}
