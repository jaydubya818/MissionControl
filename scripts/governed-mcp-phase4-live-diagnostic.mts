import { GovernedMcpBroker, type GovernedMcpReceipt } from "../apps/orchestration-server/src/governedMcpBroker.js";
import {
  CONTEXT7_ARGUMENTS,
  CONTEXT7_DESTINATION,
  CONTEXT7_OPERATION,
  mcpToolGrantDigest,
  mcpToolVersionDigest,
  context7ToolVersion,
  type GovernedMcpAuthority,
  type GovernedMcpCallRequest,
  type McpToolGrantSnapshot,
} from "../apps/orchestration-server/src/governedMcpContracts.js";

if (process.env.MC_PHASE4_REAL_MCP_CALL !== "1") {
  throw new Error("Real MCP diagnostic is disabled. Complete the recorded preflight, then set MC_PHASE4_REAL_MCP_CALL=1 for one bounded call.");
}

const startedAt = Date.now();
const tool = context7ToolVersion();
const toolVersionDigest = mcpToolVersionDigest(tool);
const grant: McpToolGrantSnapshot = {
  schema: "governed-mcp-tool-grant/v1",
  grantKey: "phase4-context7-query-docs",
  version: 1,
  projectId: "phase4-public-qualification",
  toolVersionId: "phase4-context7-tool-version",
  toolVersionDigest,
  toolVersionSnapshot: tool,
  operation: CONTEXT7_OPERATION,
  credentialClass: "NONE",
  destination: CONTEXT7_DESTINATION,
  issuedAt: startedAt - 1_000,
  expiresAt: startedAt + 60_000,
  maxCallsPerAttempt: 1,
  revocationMode: "DENY_NEW_CALLS",
};
const toolGrantDigest = mcpToolGrantDigest(grant);
const request: GovernedMcpCallRequest = {
  callId: `mcp:phase4-live-diagnostic:${startedAt}`,
  projectId: grant.projectId,
  workOrderId: "phase4-docs-maintenance-diagnostic",
  workflowRunId: "phase4-live-diagnostic-attempt",
  attemptId: "phase4-live-diagnostic-attempt",
  attemptLeaseId: "phase4-live-diagnostic-lease",
  workerId: "phase4-qualification-worker",
  workerSessionId: "phase4-qualification-session",
  workerGeneration: 1,
  executionProfileId: "phase4-context7-profile",
  executionProfileDigest: `sha256:${"a".repeat(64)}`,
  toolGrantId: "phase4-context7-grant",
  toolGrantDigest,
  toolVersionId: grant.toolVersionId,
  toolVersionDigest,
  operation: CONTEXT7_OPERATION,
  arguments: CONTEXT7_ARGUMENTS,
  requestedAt: startedAt,
};
const authority: GovernedMcpAuthority = {
  now: startedAt,
  scope: { projectId: request.projectId, workOrderId: request.workOrderId, workflowRunId: request.workflowRunId, attemptId: request.attemptId },
  lease: { leaseId: request.attemptLeaseId, workerId: request.workerId, workerSessionId: request.workerSessionId, workerGeneration: request.workerGeneration, expiresAt: startedAt + 60_000, cancelled: false },
  executionProfile: { id: request.executionProfileId, digest: request.executionProfileDigest, enabled: true, qualificationExpiresAt: startedAt + 60_000, toolGrant: { id: request.toolGrantId, digest: toolGrantDigest, snapshot: grant } },
  grant: { id: request.toolGrantId, digest: toolGrantDigest, snapshot: grant, state: "ACTIVE" },
  toolVersion: { id: request.toolVersionId, digest: toolVersionDigest, snapshot: tool, enabled: true, qualificationStatus: "EVIDENCE_QUALIFIED", qualificationExpiresAt: startedAt + 60_000 },
  replayed: false,
};
const receipts: GovernedMcpReceipt[] = [];
const broker = new GovernedMcpBroker({ append: async (receipt) => {
  receipts.push(receipt);
  return receipt.phase === "AUTHORIZATION" ? { created: true, permitted: true } : { created: true, lateOrStale: false };
} });
const result = await broker.call({ request, authority, hostRoot: process.cwd() });
process.stdout.write(`${JSON.stringify({
  status: "SUCCEEDED",
  service: tool.server.key,
  operation: request.operation,
  destination: tool.transport.destination,
  toolVersionDigest,
  toolGrantDigest,
  outputDigest: result.outputDigest,
  poisoningDetected: result.poisoningDetected,
  receipts: receipts.map(({ phase, status, reason, requestBytes, outputBytes, retryCount, costStatus, durationMs, serverImplementationDigest, expectedServerVersion, observedServerVersion, expectedInputSchemaDigest, observedInputSchemaDigest }) => ({ phase, status, reason, requestBytes, outputBytes, retryCount, costStatus, durationMs, serverImplementationDigest, expectedServerVersion, observedServerVersion, expectedInputSchemaDigest, observedInputSchemaDigest })),
}, null, 2)}\n`);
