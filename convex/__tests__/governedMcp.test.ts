import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MCP_QUALIFICATION_OPERATION,
  mcpToolGrantDigest,
  mcpToolGrantIssues,
  mcpToolGrantSnapshot,
  mcpToolVersionDigest,
  mcpToolVersionIssues,
  qualificationFixtureToolVersionSnapshot,
  context7ToolVersionSnapshot,
  MCP_CONTEXT7_OPERATION,
  MCP_CONTEXT7_DESTINATION,
} from "../lib/governedMcp";

const implementationDigest = `sha256:${"a".repeat(64)}`;
const persistenceSource = readFileSync(new URL("../factory/governedMcp.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../schema.ts", import.meta.url), "utf8");

describe("governed MCP control-plane identity", () => {
  it("constructs one closed read-only qualification Tool Version", () => {
    const snapshot = qualificationFixtureToolVersionSnapshot(implementationDigest);
    expect(snapshot).toMatchObject({
      protocolVersion: "2025-11-25",
      transport: { kind: "STDIO", destination: "LOCAL_PROCESS", redirects: false },
      operation: { name: MCP_QUALIFICATION_OPERATION, sideEffect: "READ_ONLY", timeoutMs: 2_000 },
      credentialClass: "NONE",
      admission: "QUALIFICATION_FIXTURE",
      authority: { discovery: false, write: false, policyMutation: false, acceptance: false, routing: false },
    });
    expect(mcpToolVersionIssues(snapshot)).toEqual([]);
    expect(mcpToolVersionDigest(snapshot)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(mcpToolVersionIssues({ ...snapshot, protocolVersion: "substituted" })).toContain("tool-version-substituted");
  });

  it("constructs exactly one qualified real read-only service contract", () => {
    const snapshot = context7ToolVersionSnapshot();
    expect(snapshot).toMatchObject({
      transport: { kind: "STREAMABLE_HTTP", destination: MCP_CONTEXT7_DESTINATION, endpoint: "https://mcp.context7.com/mcp", redirects: false },
      operation: { name: MCP_CONTEXT7_OPERATION, sideEffect: "READ_ONLY", inputSchemaDialect: "https://json-schema.org/draft/2020-12/schema" },
      credentialClass: "NONE",
      dataClassification: "PUBLIC",
      admission: "QUALIFIED_REAL_READ_ONLY_SERVICE",
      authority: { discovery: false, write: false },
    });
    expect(mcpToolVersionIssues(snapshot)).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain('"$schema"');
    expect(mcpToolVersionIssues({ ...snapshot, transport: { ...snapshot.transport, endpoint: "https://example.com/mcp" } })).toContain("tool-version-substituted");
    expect(persistenceSource).toContain("registerContext7QueryDocs");
  });

  it("binds one expiring workspace Tool Grant to exact Tool Version bytes", () => {
    const tool = qualificationFixtureToolVersionSnapshot(implementationDigest);
    const toolDigest = mcpToolVersionDigest(tool);
    const grant = mcpToolGrantSnapshot({
      grantKey: "doctrine-read", version: 1, projectId: "project-1",
      toolVersionId: "tool-1", toolVersionDigest: toolDigest,
      toolVersionSnapshot: tool,
      issuedAt: 1_000, expiresAt: 2_000,
    });
    expect(grant).toMatchObject({ operation: MCP_QUALIFICATION_OPERATION, credentialClass: "NONE", maxCallsPerAttempt: 1 });
    expect(mcpToolGrantIssues(grant)).toEqual([]);
    expect(mcpToolGrantDigest(grant)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(mcpToolGrantIssues({ ...grant, operation: "write" })).toContain("tool-grant-scope-invalid");
    expect(mcpToolGrantIssues({ ...grant, expiresAt: grant.issuedAt })).toContain("tool-grant-lifecycle-invalid");
  });

  it("keeps the persisted authorization receipt as the atomic transport permit", () => {
    expect(persistenceSource).toContain("args: { receipt: governedMcpReceiptValidator }");
    expect(persistenceSource).toContain('run.status !== "RUNNING" || run.cancellationRequestedAt');
    expect(persistenceSource).toContain('.eq("toolGrantId", grant._id)');
    expect(persistenceSource).toContain("priorAllowed.filter((item) => item.status === \"ALLOWED\").length >= grant.immutableSnapshot.maxCallsPerAttempt");
    expect(persistenceSource).toContain("MCP completion receipt has no matching allowed authorization");
    expect(persistenceSource).toContain("lateOrStale");
    expect(schemaSource).toContain('.index("by_attempt_grant_phase", ["workflowRunId", "toolGrantId", "phase"])');
  });
});
