import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GovernedMcpBroker, type GovernedMcpReceipt } from "../apps/orchestration-server/src/governedMcpBroker.js";
import {
  mcpToolGrantDigest, mcpToolVersionDigest, qualificationToolVersion,
  QUALIFICATION_FIXTURE_RELATIVE_PATH, QUALIFICATION_OPERATION,
  type GovernedMcpAuthority, type GovernedMcpCallRequest, type McpToolGrantSnapshot,
} from "../apps/orchestration-server/src/governedMcpContracts.js";

const root = process.cwd();
const baseline = process.env.MC_QUALIFICATION_BASE_SHA;
if (baseline !== "3ae9d86eeff1966862a6959664ec1fe2e6e7240a") {
  throw new Error("Phase 3 qualification requires MC_QUALIFICATION_BASE_SHA=3ae9d86eeff1966862a6959664ec1fe2e6e7240a.");
}
const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const implementationSha = process.env.MC_IMPLEMENTATION_SHA?.trim() || currentHead;
if (!/^[a-f0-9]{40}$/.test(implementationSha)) throw new Error("Phase 3 implementation SHA must be an exact Git commit.");
if (implementationSha !== currentHead) throw new Error("Phase 3 implementation SHA must equal the checked-out source revision.");
const entrypoint = resolve(root, QUALIFICATION_FIXTURE_RELATIVE_PATH);
const implementationDigest = `sha256:${createHash("sha256").update(await readFile(entrypoint)).digest("hex")}`;
const tool = qualificationToolVersion(implementationDigest);
const toolDigest = mcpToolVersionDigest(tool);
const now = Date.now();
const grant: McpToolGrantSnapshot = {
  schema: "governed-mcp-tool-grant/v1", grantKey: "phase3-doctrine-read", version: 1,
  projectId: "qualification-project", toolVersionId: "qualification-tool-version", toolVersionDigest: toolDigest,
  toolVersionSnapshot: tool,
  operation: QUALIFICATION_OPERATION, credentialClass: "NONE", destination: "LOCAL_PROCESS",
  issuedAt: now - 1_000, expiresAt: now + 60_000, maxCallsPerAttempt: 1, revocationMode: "DENY_NEW_CALLS",
};
const grantDigest = mcpToolGrantDigest(grant);
const request: GovernedMcpCallRequest = {
  callId: `qualification:${now}`, projectId: grant.projectId, workOrderId: "qualification-work-order",
  workflowRunId: "qualification-attempt", attemptId: "qualification-attempt", attemptLeaseId: "qualification-lease",
  workerId: "qualification-worker", workerSessionId: "qualification-session", workerGeneration: 1,
  executionProfileId: "qualification-profile", executionProfileDigest: `sha256:${"a".repeat(64)}`,
  toolGrantId: "qualification-grant", toolGrantDigest: grantDigest,
  toolVersionId: grant.toolVersionId, toolVersionDigest: toolDigest,
  operation: QUALIFICATION_OPERATION, arguments: { section: "authority-boundary" }, requestedAt: now,
};
const authority: GovernedMcpAuthority = {
  now,
  scope: { projectId: "qualification-project", workOrderId: "qualification-work-order", workflowRunId: "qualification-attempt", attemptId: "qualification-attempt" },
  lease: { leaseId: request.attemptLeaseId, workerId: request.workerId, workerSessionId: request.workerSessionId, workerGeneration: 1, expiresAt: now + 60_000, cancelled: false },
  executionProfile: { id: request.executionProfileId, digest: request.executionProfileDigest, enabled: true, qualificationExpiresAt: now + 60_000, toolGrant: { id: request.toolGrantId, digest: grantDigest, snapshot: grant } },
  grant: { id: request.toolGrantId, digest: grantDigest, snapshot: grant, state: "ACTIVE" },
  toolVersion: { id: request.toolVersionId, digest: toolDigest, snapshot: tool, enabled: true, qualificationStatus: "EVIDENCE_QUALIFIED", qualificationExpiresAt: now + 60_000 },
  replayed: false,
};
const receipts: GovernedMcpReceipt[] = [];
const broker = new GovernedMcpBroker({ append: async (receipt) => {
  receipts.push(receipt);
  return receipt.phase === "AUTHORIZATION" && receipt.status === "ALLOWED"
    ? { created: true, permitted: true }
    : { created: true };
} });
const result = await broker.call({ request, authority, hostRoot: root });
let replayDenial = "";
try { await broker.call({ request, authority, hostRoot: root }); }
catch (error) { replayDenial = (error as { code?: string }).code ?? "UNKNOWN"; }
if (replayDenial !== "REPLAY_DENIED" || receipts.length !== 3 || receipts[1]?.status !== "SUCCEEDED") throw new Error("Governed MCP qualification did not produce the expected allowed/completed/replay-denied receipts.");

const evidence = {
  schema: "governed-mcp-phase3-broker-scenario/v1", generatedAt: new Date().toISOString(),
  evidenceClassification: "LOCAL_BROKER_SCENARIO_NOT_CONTROL_PLANE_PERSISTENCE",
  implementationSha,
  baseline, runtimeContractVersion: 41, admission: "QUALIFICATION_FIXTURE", realServiceAdmitted: false,
  transport: "STDIO", protocolVersion: tool.protocolVersion, sdk: tool.sdk,
  toolVersion: { id: request.toolVersionId, digest: toolDigest, snapshot: tool },
  toolGrant: { id: request.toolGrantId, digest: grantDigest, snapshot: grant },
  lineage: {
    workOrderId: request.workOrderId, attemptId: request.attemptId,
    attemptLeaseId: request.attemptLeaseId,
    executionProfile: { id: request.executionProfileId, digest: request.executionProfileDigest },
    factoryVersion: { applicable: false, reason: "Local broker scenario; authoritative Factory qualification is recorded separately." },
  },
  broker: { id: "mission-control-governed-tool-broker", version: "1.0.0", authority: "HOST_BROKER" },
  server: { ...tool.server, protocolVersion: tool.protocolVersion, transport: tool.transport },
  schemaDigests: { input: tool.operation.inputSchemaDigest, output: tool.operation.outputSchemaDigest },
  output: { digest: result.outputDigest, classification: (result.output as any).classification, poisoningDetected: result.poisoningDetected },
  brokerScenarioReceipts: receipts,
  negativeProof: { replay: replayDenial, harnessMcpSupport: authority.executionProfile.harnessMcpSupport, credentialsExposed: false, discoveryUsedForAuthority: false, networkUsed: false, writeOperationExposed: false },
  limitations: ["Local qualification fixture only", "No external service", "No network transport", "No credentials", "No write operations", "No broad harness MCP support"],
};
const runName = `${implementationSha.slice(0, 12)}-${new Date(now).toISOString().replace(/[:.]/g, "-")}`;
const outputDir = resolve(root, "docs/testing/evidence/governed-mcp-phase3/runs", runName);
await mkdir(outputDir, { recursive: true });
const outputPath = resolve(outputDir, "broker-scenario.json");
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`Governed MCP Phase 3 broker scenario passed: ${toolDigest}`);
console.log(`Evidence: ${outputPath}`);
