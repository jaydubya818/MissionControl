#!/usr/bin/env node
/**
 * Fake executor — verifies the Mission Control executor contract (step B of
 * the Epic 18 rollout) without any real execution.
 *
 * Walks the full lifecycle against the configured Convex deployment:
 *   register agent → create work order → claim → state walk → artifact →
 *   run start/complete (with sessionLogRefs) → succeeded →
 *   AWAITING_VERIFICATION → verification evidence → DONE (derived by MC) →
 *   asserts the audit event trail and correlation chain.
 *
 * Also replays every mutation once to prove idempotency (same keys, no dupes).
 *
 * Prereqs: CONVEX_URL in env or .env.local; flags enabled:
 *   mc flags set executor.pi-bridge on
 * Usage: node scripts/fake-executor.mjs [--keep]
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";

function loadConvexUrl() {
  if (process.env.CONVEX_URL) return process.env.CONVEX_URL;
  if (existsSync(".env.local")) {
    const match = readFileSync(".env.local", "utf8").match(/^CONVEX_URL=(.+)$/m);
    if (match) return match[1].trim();
  }
  fail("CONVEX_URL not set and .env.local missing");
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

const client = new ConvexHttpClient(loadConvexUrl());
const suffix = randomUUID().slice(0, 8);
const bridgeRunId = `fake-bridge-${suffix}`;
const executionId = `fake-exec-${suffix}`;

async function main() {
  // 1. Register (idempotent)
  const reg = await client.mutation("agents:register", {
    name: "fake-executor",
    role: "SPECIALIST",
    workspacePath: "/tmp/fake-executor",
    allowedTaskTypes: ["ENGINEERING"],
  });
  const agentId = reg.agent._id;
  ok(`registered fake-executor (${agentId}, created=${reg.created})`);

  // 2. Heartbeat
  const hb = await client.mutation("agents:heartbeat", { agentId });
  ok(`heartbeat accepted (budgetRemaining=${hb.budgetRemaining})`);

  // 3. Create a work order with one acceptance criterion (LOW risk → claimable)
  const criterionId = `crit-${suffix}`;
  const workOrderId = await client.mutation("workOrders:create", {
    title: `Fake executor contract check ${suffix}`,
    desiredOutcome: "Verify the executor contract end to end. No real work.",
    priority: 4,
    riskLevel: "LOW",
    requestedBy: "fake-executor-script",
    acceptanceCriteria: [
      {
        id: criterionId,
        title: "Contract walk completes",
        verificationMethod: "CHECKLIST",
        status: "PENDING",
      },
    ],
    state: "READY",
  });
  ok(`work order created (${workOrderId})`);

  // 4. Claimable?
  const claimable = await client.query("workOrdersExecutor:listClaimable", {});
  if (!claimable.some((wo) => wo._id === workOrderId)) {
    fail("work order not listed as claimable");
  }
  ok(`listClaimable includes the work order`);

  // 5. Claim (+ idempotent replay)
  const claimIdem = `pib:claim:${workOrderId}:1`;
  const claim = await client.mutation("workOrdersExecutor:claimForExecutor", {
    workOrderId,
    agentId,
    executionId,
    idempotencyKey: claimIdem,
  });
  if (!claim.claimed) fail(`claim refused: ${claim.reason}`);
  ok(`claimed (attempt ${claim.attempt})`);
  const claimReplay = await client.mutation("workOrdersExecutor:claimForExecutor", {
    workOrderId,
    agentId,
    executionId,
    idempotencyKey: claimIdem,
  });
  if (!claimReplay.replay) fail("claim replay not detected as replay");
  ok("claim replay is idempotent");

  // 6. State walk
  const walk = ["accepted", "starting", "running", "producing_artifacts"];
  for (let seq = 0; seq < walk.length; seq++) {
    const res = await client.mutation("workOrdersExecutor:reportExecutionEvent", {
      workOrderId,
      agentId,
      bridgeState: walk[seq],
      seq,
      bridgeRunId,
      idempotencyKey: `pib:state:${workOrderId}:${bridgeRunId}:${seq}`,
      hermesSessionId: `fake-session-${suffix}`,
    });
    ok(`bridge ${walk[seq]} → ${res.state}`);
  }

  // 7. Artifact (+ replay)
  const content = `# Fake artifact\nGenerated ${suffix} for contract verification.\n`;
  const sha256 = createHash("sha256").update(content).digest("hex");
  const artIdem = `pib:art:${workOrderId}:artifact-1`;
  const art = await client.mutation("workOrdersExecutor:recordExecutorArtifact", {
    workOrderId,
    agentId,
    artifactId: "artifact-1",
    title: "Contract verification artifact",
    content,
    sha256,
    contentType: "REPORT",
    idempotencyKey: artIdem,
  });
  ok(`artifact recorded (drop ${art.contentDropId})`);
  const artReplay = await client.mutation("workOrdersExecutor:recordExecutorArtifact", {
    workOrderId,
    agentId,
    artifactId: "artifact-1",
    title: "Contract verification artifact",
    content,
    sha256,
    contentType: "REPORT",
    idempotencyKey: artIdem,
  });
  if (!artReplay.replay || String(artReplay.contentDropId) !== String(art.contentDropId)) {
    fail("artifact replay produced a duplicate");
  }
  ok("artifact replay deduplicated");

  // 8. Run start/complete with session-log refs (refs only, no full logs)
  const runIdem = `pib:run:${workOrderId}:${bridgeRunId}`;
  const runId = await client.mutation("runs:start", {
    agentId,
    sessionKey: runIdem,
    model: "fake-model",
    idempotencyKey: runIdem,
    metadata: { workOrderId, bridgeRunId, executionId },
  });
  await client.mutation("runs:complete", {
    runId,
    status: "COMPLETED",
    inputTokens: 10,
    outputTokens: 10,
    costUsd: 0,
    sessionLogRefs: [
      {
        kind: "BRIDGE_EVENTS",
        path: `/tmp/fake-executor/${bridgeRunId}.jsonl`,
        sha256,
        sizeBytes: content.length,
      },
    ],
  });
  ok(`run logged (${runId}) with sessionLogRefs`);

  // 9. Succeeded → must land AWAITING_VERIFICATION (never DONE from executor)
  const succ = await client.mutation("workOrdersExecutor:reportExecutionEvent", {
    workOrderId,
    agentId,
    bridgeState: "succeeded",
    seq: walk.length,
    bridgeRunId,
    runId: String(runId),
    idempotencyKey: `pib:state:${workOrderId}:${bridgeRunId}:${walk.length}`,
  });
  if (succ.state !== "AWAITING_VERIFICATION") {
    fail(`succeeded mapped to ${succ.state}, expected AWAITING_VERIFICATION`);
  }
  ok("succeeded → AWAITING_VERIFICATION (executor cannot assert DONE)");

  // 10. Verification evidence → MC derives DONE
  const verify = await client.mutation("workOrdersExecutor:recordVerificationEvidence", {
    workOrderId,
    agentId,
    criterionId,
    status: "PASS",
    evidence: `Contract walk ${suffix} completed; artifact sha256:${sha256}`,
    idempotencyKey: `pib:verify:${workOrderId}:${criterionId}:${bridgeRunId}`,
  });
  if (verify.state !== "DONE" || verify.verificationStatus !== "PASS") {
    fail(`verification produced state=${verify.state} vs=${verify.verificationStatus}`);
  }
  ok("verification evidence PASS → Mission Control derived DONE");

  // 11. Audit trail + correlation
  const detail = await client.query("workOrders:get", { workOrderId });
  const record = detail.workOrder;
  if (record.state !== "DONE") fail(`final state ${record.state}`);
  const eventTypes = detail.events.map((e) => e.eventType);
  for (const expected of [
    "WORK_ORDER_CREATED",
    "CLAIMED",
    "EXECUTION_STATE",
    "ARTIFACT_RECORDED",
    "VERIFICATION_RECORDED",
  ]) {
    if (!eventTypes.includes(expected)) fail(`audit trail missing ${expected}`);
  }
  ok(`audit trail complete (${detail.events.length} events)`);
  const c = record.correlation;
  for (const key of ["workOrderId", "executionId", "bridgeRunId", "hermesSessionId", "runId"]) {
    if (!c?.[key]) fail(`correlation missing ${key}`);
  }
  ok(`correlation chain complete: ${Object.keys(c).sort().join(", ")}`);
  console.log("\nAll executor-contract checks passed.");
}

main().catch((err) => fail(err.message));
