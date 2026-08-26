#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  scanConvexAuthorization,
  toIdentifiers,
} from "./lib/convex-authorization-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scopedModules = new Set([
  "agentDocuments",
  "alerts",
  "approvals",
  "executionRequests",
  "executorRouter",
  "taskRouter",
  "tasks",
  "workflowRuns",
]);

const open = toIdentifiers(
  scanConvexAuthorization(repoRoot).unauthorized.filter((entry) =>
    scopedModules.has(entry.module),
  ),
);

if (open.length > 0) {
  console.error(
    `V1 Factory authorization closeout: FAIL\n${open.length} scoped public function(s) remain unauthorized:`,
  );
  for (const identifier of open) console.error(`  - ${identifier}`);
  process.exit(1);
}

const retiredPublicFunctions = [
  "agentDocuments:get",
  "agentDocuments:getDailyNote",
  "agentDocuments:getWorkingMd",
  "agentDocuments:set",
  "alerts:create",
  "alerts:listByAgent",
  "alerts:listBySeverity",
  "approvals:cancel",
  "approvals:get",
  "approvals:getDecisionChain",
  "approvals:listByRequestor",
  "approvals:listEscalated",
  "executionRequests:cancel",
  "executionRequests:enqueue",
  "executionRequests:get",
  "executionRequests:getRoutingRecommendation",
  "executionRequests:listByProject",
  "executionRequests:listByTask",
  "executionRequests:listPending",
  "executionRequests:updateStatus",
  "executorRouter:claimExecution",
  "executorRouter:getQueueForExecutor",
  "executorRouter:onExecutionComplete",
  "executorRouter:onExecutionStart",
  "taskRouter:autoAssign",
  "taskRouter:findBestAgent",
  "taskRouter:getRecommendations",
  "tasks:getByIdentifier",
  "tasks:getUnifiedTimeline",
  "tasks:resolveApprovedWorkflowGate",
  "tasks:supersedeWorkflowAttempt",
  "tasks:updateThreadRef",
  "workflowRuns:advance",
  "workflowRuns:checkpointExecution",
  "workflowRuns:claimExecution",
  "workflowRuns:createArtifact",
  "workflowRuns:heartbeatExecution",
  "workflowRuns:incrementRetry",
  "workflowRuns:recordEvent",
  "workflowRuns:releaseExecution",
  "workflowRuns:updateContext",
  "workflowRuns:updateStatus",
  "workflowRuns:updateStep",
];

const humanActions = [
  "agentDocuments:create",
  "agentDocuments:remove",
  "agentDocuments:update",
  "alerts:acknowledge",
  "alerts:ignore",
  "alerts:resolve",
  "approvals:approve",
  "approvals:deny",
  "approvals:request",
  "tasks:assign",
  "tasks:create",
  "tasks:linkToWorkOrder",
  "tasks:transition",
  "tasks:update",
  "workflowRuns:linkArtifactToVerificationReceipt",
  "workflowRuns:requestCancellation",
  "workflowRuns:start",
];

const listed = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr.trim()}`);

const activeRoots = /^(apps|packages|scripts|skills|tests)\//;
const sourceExtension = /\.(?:[cm]?[jt]sx?|md|sh)$/;
const referenceFindings = [];
for (const filePath of listed.stdout.split("\0").filter(Boolean)) {
  if (!activeRoots.test(filePath) || !sourceExtension.test(filePath)) continue;
  if (filePath === "scripts/check-v1-factory-authorization.mjs") continue;
  const absolutePath = path.join(repoRoot, filePath);
  if (!existsSync(absolutePath)) continue;
  const source = readFileSync(absolutePath, "utf8");

  for (const identifier of retiredPublicFunctions) {
    const [moduleName, functionName] = identifier.split(":");
    if (source.includes(`api.${moduleName}.${functionName}`)
      || source.includes(`"${identifier}"`)
      || source.includes(`'${identifier}'`)
      || source.includes(`\`${identifier}\``)) {
      referenceFindings.push(`${filePath}: retired ${identifier}`);
    }
  }

  for (const identifier of humanActions) {
    const [moduleName, functionName] = identifier.split(":");
    const directMutation = new RegExp(
      String.raw`(?:useMutation\s*\(|\.mutation\s*\()\s*(?:api\.${moduleName}\.${functionName}|["'\x60]${identifier}["'\x60])`,
    );
    if (directMutation.test(source)) {
      referenceFindings.push(`${filePath}: ${identifier} must use an authenticated action boundary`);
    }
  }
}

if (referenceFindings.length > 0) {
  console.error("V1 Factory authorization closeout: FAIL — active compatibility references remain:");
  for (const finding of [...new Set(referenceFindings)].sort()) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log("V1 Factory authorization closeout: PASS — scoped open count is 0 and retired callbacks have no active consumers.");
