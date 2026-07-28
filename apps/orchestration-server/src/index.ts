/**
 * Mission Control Orchestration Server
 *
 * Hono-based server that runs the Coordinator loop and Agent Runtime.
 * This is the long-running process that connects packages/coordinator,
 * packages/agent-runtime, and packages/memory to the Convex backend.
 *
 * Endpoints:
 *   GET /health          - Health check
 *   GET /status          - Coordinator + agent status
 *   GET /gateway/status  - Gateway connection configured (url + token presence)
 *   POST /tick           - Manually trigger a coordinator tick
 *   POST /agents/spawn   - Spawn an agent from a persona YAML
 *   POST /agents/stop    - Stop a running agent
 *
 * WebSocket:
 *   /gateway/ws          - Proxy to OpenClaw Gateway (Studio parity)
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { ConvexHttpClient } from "convex/browser";
import { createGatewayProxy } from "./gateway-proxy.js";
import { requireAuth } from "./auth.js";
import { ConvexQueries, ConvexMutations } from "./convexCalls.js";
import { CoordinatorLoop } from "@mission-control/coordinator";
import { AgentLifecycle } from "@mission-control/agent-runtime";
import { MemoryManager } from "@mission-control/memory";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

const envSearchPaths = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env.local"),
  path.resolve(process.cwd(), "../../.env"),
];

for (const envPath of envSearchPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// ============================================================================
// CONFIG
// ============================================================================

const PORT = parseInt(process.env.ORCHESTRATION_PORT ?? "4100", 10);
const CONVEX_URL = process.env.CONVEX_URL ?? "";
const PROJECT_SLUG = process.env.PROJECT_SLUG ?? "openclaw";
const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS ?? "30000", 10);
const AGENTS_DIR = process.env.AGENTS_DIR ?? path.resolve(process.cwd(), "../../agents");

if (!CONVEX_URL) {
  console.error("[orchestration] CONVEX_URL is required. Set it in .env or environment.");
  process.exit(1);
}

// ============================================================================
// STATE
// ============================================================================

const client = new ConvexHttpClient(CONVEX_URL);
const coordinator = new CoordinatorLoop({ pollIntervalMs: TICK_INTERVAL_MS });
const activeAgents = new Map<string, AgentLifecycle>();
const memoryManagers = new Map<string, MemoryManager>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
let lastTickAt: number | null = null;
let lastTickResult: any = null;
let tickCount = 0;
let startedAt: number | null = null;

// ============================================================================
// COORDINATOR TICK
// ============================================================================

/**
 * Run one coordinator tick:
 *   1. Fetch system state from Convex
 *   2. Run coordinator logic (decompose, delegate, detect stuck)
 *   3. Apply actions back to Convex
 */
async function runTick(): Promise<any> {
  try {
    // 1. Fetch current state from Convex
    const [inboxTasks, allTasks, agents] = await Promise.all([
      client.query(ConvexQueries.tasks.listByStatus as any, { status: "INBOX" }),
      client.query(ConvexQueries.tasks.listAll as any, {}),
      client.query(ConvexQueries.agents.listAll as any, {}),
    ]);
    const decomposedParentIds = new Set(
      (allTasks ?? [])
        .map((task: any) => task.parentTaskId)
        .filter((taskId: unknown): taskId is string => typeof taskId === "string")
    );

    // 2. Build coordinator state
    const state = {
      inboxTasks: (inboxTasks ?? [])
        .filter((task: any) => !task.parentTaskId && !decomposedParentIds.has(task._id))
        .map((t: any) => ({
          id: t._id,
          title: t.title,
          description: t.description ?? "",
          type: t.type,
          priority: t.priority,
        })),
      allTasks: (allTasks ?? []).map((t: any) => ({
        id: t._id,
        title: t.title,
        description: t.description ?? "",
        type: t.type,
        status: t.status,
        priority: t.priority,
        dependsOn: [],
        assigneeIds: (t.assigneeIds ?? []).map((id: any) => String(id)),
        lastActivityAt: t.startedAt ?? t._creationTime,
        hasSubtasks: decomposedParentIds.has(t._id),
      })),
      availableAgents: (agents ?? [])
        .filter((a: any) => a.status === "ACTIVE")
        .map((a: any) => ({
          id: a._id,
          name: a.name,
          role: a.role,
          capabilities: a.allowedTaskTypes ?? [],
          currentTaskCount:
            (allTasks ?? []).filter(
              (t: any) =>
                t.assigneeIds?.includes(a._id) &&
                (t.status === "ASSIGNED" || t.status === "IN_PROGRESS")
            ).length,
          maxConcurrentTasks: 3,
          budgetRemaining: a.budgetDaily - a.spendToday,
          performanceScore: 0.7, // Default; enhanced in Priority 7
        })),
    };

    // 3. Run coordinator tick
    const actions = coordinator.tick(state);

    // 4. Apply decomposition results transactionally in Convex
    let decompositionsApplied = 0;
    let decompositionErrors = 0;
    for (const decomp of actions.tasksToDecompose) {
      try {
        const result = await client.mutation(
          ConvexMutations.coordinator.decomposeTask as any,
          {
            taskId: decomp.parentTaskId,
            maxSubtasks: decomp.subtasks.length,
          }
        );
        if (result?.success) {
          decompositionsApplied++;
        } else {
          decompositionErrors++;
          console.error(
            `[orchestration] Failed to decompose task ${decomp.parentTaskId}: ${result?.error ?? "Unknown error"}`
          );
        }
      } catch (err) {
        decompositionErrors++;
        console.error(`[orchestration] Failed to decompose task ${decomp.parentTaskId}`, err);
      }
    }

    // 5. Apply delegations: assign agents to tasks
    for (const delegation of actions.delegations) {
      try {
        await client.mutation(ConvexMutations.taskRouter.autoAssign as any, {
          taskId: delegation.taskId,
          actorType: "SYSTEM",
          idempotencyKey: `delegate-${delegation.taskId}-${Date.now()}`,
        });
      } catch (err) {
        console.error(`[orchestration] Failed to delegate task ${delegation.taskId}`, err);
      }
    }

    // 6. Create alerts for stuck tasks
    for (const stuck of actions.stuckAlerts) {
      try {
        await client.mutation(ConvexMutations.alerts.create as any, {
          severity: "WARNING",
          type: "STUCK_TASK",
          title: `Task stuck: ${stuck.taskTitle}`,
          description: `Task has been in progress for ${Math.round(stuck.stuckDurationMs / 60000)} minutes without activity`,
          taskId: stuck.taskId,
          agentId: stuck.agentId ?? undefined,
        });
      } catch (err) {
        // Alert creation may not exist; log and continue
        console.warn(`[orchestration] Could not create stuck alert for ${stuck.taskId}`);
      }
    }

    // 7. Log escalations
    for (const esc of actions.escalations) {
      console.warn(`[orchestration] Escalation: ${esc.taskTitle} — ${esc.reason}`);
    }

    lastTickAt = Date.now();
    lastTickResult = {
      decompositions: decompositionsApplied,
      decompositionErrors,
      delegations: actions.delegations.length,
      stuckAlerts: actions.stuckAlerts.length,
      escalations: actions.escalations.length,
    };
    tickCount++;

    return lastTickResult;
  } catch (err) {
    console.error("[orchestration] Tick error:", err);
    lastTickResult = { error: String(err) };
    return lastTickResult;
  }
}

// ============================================================================
// AGENT MANAGEMENT
// ============================================================================

async function spawnAgent(personaName: string): Promise<string> {
  const personaPath = path.join(AGENTS_DIR, `${personaName}.yaml`);

  if (!fs.existsSync(personaPath)) {
    throw new Error(`Persona file not found: ${personaPath}`);
  }

  if (activeAgents.has(personaName)) {
    throw new Error(`Agent ${personaName} is already running`);
  }

  const lifecycle = new AgentLifecycle({
    personaPath,
    convexUrl: CONVEX_URL,
    projectSlug: PROJECT_SLUG,
    heartbeatIntervalMs: 30_000,
    errorQuarantineThreshold: 5,
  });

  activeAgents.set(personaName, lifecycle);

  // Note: lifecycle.start() requires the Convex API reference.
  // In a full integration, we'd pass the generated API object.
  // For now, we store the lifecycle for status tracking.
  console.log(`[orchestration] Agent ${personaName} spawned (persona loaded)`);

  return personaName;
}

async function stopAgent(personaName: string): Promise<void> {
  const lifecycle = activeAgents.get(personaName);
  if (!lifecycle) {
    throw new Error(`Agent ${personaName} is not running`);
  }

  activeAgents.delete(personaName);
  memoryManagers.delete(personaName);
  console.log(`[orchestration] Agent ${personaName} stopped`);
}

// ============================================================================
// HONO APP
// ============================================================================

export const app = new Hono();

// CORS so UI (different origin/port) can call gateway/status and other endpoints
app.use("*", cors());

// Health check (unauthenticated for load balancers)
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    uptime: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
    convexUrl: CONVEX_URL ? "configured" : "missing",
    tickCount,
    lastTickAt,
    activeAgents: Array.from(activeAgents.keys()),
  });
});

// Protected routes: require Bearer token when ORCHESTRATION_API_TOKEN or MC_API_TOKEN is set
// GET /gateway/status is left unauthenticated so the UI can check configured/token status (no secrets returned)
app.use("/status", requireAuth());
app.use("/tick", requireAuth());
app.use("/agents/*", requireAuth());
app.use("/workorders/*", requireAuth());
app.use("/runs/*", requireAuth());
app.use("/run-artifacts/*", requireAuth());

// Detailed status
app.get("/status", (c) => {
  return c.json({
    coordinator: {
      config: coordinator.getConfig(),
      tickCount,
      lastTickAt,
      lastTickResult,
    },
    agents: Array.from(activeAgents.entries()).map(([name, lifecycle]) => ({
      name,
      persona: lifecycle.getPersona().name,
      role: lifecycle.getPersona().role,
      running: lifecycle.isRunning(),
      agentId: lifecycle.getAgentId(),
    })),
    server: {
      startedAt,
      uptime: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
      port: PORT,
    },
  });
});

// Manual tick trigger
app.post("/tick", async (c) => {
  const result = await runTick();
  return c.json({ success: true, result });
});

// Spawn an agent
app.post("/agents/spawn", async (c) => {
  try {
    const body = await c.req.json();
    const personaName = body.persona;
    if (!personaName) {
      return c.json({ error: "Missing 'persona' field" }, 400);
    }
    const name = await spawnAgent(personaName);
    return c.json({ success: true, agent: name });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// Stop an agent
app.post("/agents/stop", async (c) => {
  try {
    const body = await c.req.json();
    const personaName = body.persona;
    if (!personaName) {
      return c.json({ error: "Missing 'persona' field" }, 400);
    }
    await stopAgent(personaName);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// Authoritative work-order dispatch path for orchestration consumers
app.post("/workorders/:workOrderId/dispatch", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workOrders.dispatch as any, {
      workOrderId,
      workflowId: body.workflowId,
      actorType: body.actorType ?? "SYSTEM",
      actorId: body.actorId ?? "orchestration-server",
      idempotencyKey: body.idempotencyKey ?? `orch-dispatch:${workOrderId}`,
      runtime: body.runtime ?? "Hono Orchestration Server",
      model: body.model,
      worktree: body.worktree,
    });
    if ((result as any)?.reason === "routing-exhausted") {
      return c.json(
        {
          success: false,
          error: "No safe model route satisfies this Work Order",
          result,
        },
        409
      );
    }
    const run = (result as any)?.run;
    if (body.contextRepoSlug && run?._id) {
      const activation = await client.mutation(ConvexMutations.context.activateForWorkflowRun as any, {
        repoSlug: body.contextRepoSlug,
        workflowRunId: run._id,
        idempotencyKey: `${body.idempotencyKey ?? `orch-dispatch:${workOrderId}`}:context-activation`,
        actorId: body.actorId ?? "orchestration-server",
      });
      return c.json({ success: true, result, contextActivation: activation });
    }
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/workorders/:workOrderId/approvals", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workOrders.requestApprovalDecision as any, {
      workOrderId,
      workflowRunId: body.workflowRunId,
      idempotencyKey: body.idempotencyKey ?? `orch-approval:${workOrderId}:${body.approvalType ?? "RISK_REVIEW"}`,
      approvalType: body.approvalType ?? "RISK_REVIEW",
      requestedAction: body.requestedAction ?? "Approve protected work-order action",
      riskLevel: body.riskLevel,
      requestedBy: body.requestedBy ?? "orchestration-server",
      expiresAt: body.expiresAt,
      metadata: body.metadata,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/approval-decisions/:approvalDecisionId/decide", async (c) => {
  try {
    const approvalDecisionId = c.req.param("approvalDecisionId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workOrders.decideApprovalDecision as any, {
      approvalDecisionId,
      decision: body.decision,
      approver: body.approver ?? "orchestration-server",
      reason: body.reason,
      conditions: body.conditions,
      metadata: body.metadata,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/workorders/:workOrderId/receipt-packets", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.factory.ingestReceiptPacket as any, {
      workOrderId,
      workflowRunId: body.workflowRunId,
      piSessionId: body.piSessionId,
      piExecutionId: body.piExecutionId,
      markRunCompleted: body.markRunCompleted,
      receipts: body.receipts ?? [],
      handoff: body.handoff,
      idempotencyKey: body.idempotencyKey,
      contextActivationReceiptId: body.contextActivationReceiptId,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// Mission handoffs preserve the worker/validator boundary without duplicating
// Convex lifecycle logic in the runtime adapter.
app.post("/missions/:missionId/handoffs", async (c) => {
  try {
    const missionId = c.req.param("missionId");
    const body = await c.req.json();
    const result = await client.mutation(ConvexMutations.missions.recordHandoff as any, {
      missionId,
      workOrderId: body.workOrderId,
      workflowRunId: body.workflowRunId,
      idempotencyKey: body.idempotencyKey,
      producingRole: body.producingRole,
      consumingRole: body.consumingRole,
      outcome: body.outcome,
      completedAssertionIds: body.completedAssertionIds ?? [],
      incompleteAssertionIds: body.incompleteAssertionIds ?? [],
      unknownAssertionIds: body.unknownAssertionIds ?? [],
      commands: body.commands ?? [],
      artifactIds: body.artifactIds ?? [],
      knownRisks: body.knownRisks ?? [],
      nextAction: body.nextAction,
      nextOwner: body.nextOwner,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/missions/:missionId/validation-results", async (c) => {
  try {
    const missionId = c.req.param("missionId");
    const body = await c.req.json();
    const result = await client.mutation(ConvexMutations.missions.recordValidationResult as any, {
      missionId,
      validationAssertionId: body.validationAssertionId,
      workflowRunId: body.workflowRunId,
      status: body.status,
      verificationReceiptId: body.verificationReceiptId,
      waiverApprovalDecisionId: body.waiverApprovalDecisionId,
      actorId: body.actorId ?? "orchestration-server",
      idempotencyKey: body.idempotencyKey,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/missions/:missionId/accept", async (c) => {
  try {
    const missionId = c.req.param("missionId");
    const body = await c.req.json();
    const result = await client.mutation(ConvexMutations.missions.accept as any, {
      missionId,
      acceptedBy: body.acceptedBy ?? "orchestration-server",
      idempotencyKey: body.idempotencyKey ?? `orch-mission-accept:${missionId}`,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/workorders/:workOrderId/verification-receipts", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workOrders.recordVerificationReceipt as any, {
      workOrderId,
      workflowRunId: body.workflowRunId,
      acceptanceCriterionId: body.acceptanceCriterionId,
      idempotencyKey: body.idempotencyKey,
      verificationMethod: body.verificationMethod,
      commandOrCheck: body.commandOrCheck,
      result: body.result,
      evidenceLocation: body.evidenceLocation,
      artifactReference: body.artifactReference,
      verifier: body.verifier ?? "orchestration-server",
      status: body.status,
      exceptionOrWaiver: body.exceptionOrWaiver,
      waiverApprovalDecisionId: body.waiverApprovalDecisionId,
      validUntil: body.validUntil,
      metadata: body.metadata,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/workorders/:workOrderId/accept", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workOrders.accept as any, {
      workOrderId,
      actorType: body.actorType ?? "SYSTEM",
      actorId: body.actorId ?? "orchestration-server",
      idempotencyKey: body.idempotencyKey ?? `orch-accept:${workOrderId}`,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.get("/workorders/:workOrderId/revisions", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const result = await client.query(ConvexQueries.workOrders.revisionHistory as any, { workOrderId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.get("/workorders/:workOrderId/governance", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const result = await client.query(ConvexQueries.workOrders.governanceValidity as any, { workOrderId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.get("/workorders/:workOrderId/expired-approvals", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const result = await client.query(ConvexQueries.workOrders.listExpiredApprovals as any, { workOrderId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.get("/workorders/:workOrderId/stale-evidence", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const result = await client.query(ConvexQueries.workOrders.listStaleEvidence as any, { workOrderId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/workorders/:workOrderId/revisions", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workOrders.requestWorkOrderRevision as any, {
      workOrderId,
      idempotencyKey: body.idempotencyKey ?? `orch-revision:${workOrderId}:${Date.now()}`,
      patch: body.patch ?? {},
      changeSummary: body.changeSummary ?? "Revise WorkOrder",
      reason: body.reason ?? "Revision requested",
      requestedBy: body.requestedBy ?? "orchestration-server",
      impactedAcceptanceCriteria: body.impactedAcceptanceCriteria,
      impactedApprovalTypes: body.impactedApprovalTypes,
      metadata: body.metadata,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/workorder-revisions/:workOrderRevisionId/approve", async (c) => {
  try {
    const workOrderRevisionId = c.req.param("workOrderRevisionId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workOrders.approveWorkOrderRevision as any, {
      workOrderRevisionId,
      approvedBy: body.approvedBy ?? "orchestration-server",
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/workorders/:workOrderId/reopen", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workOrders.reopenWorkOrder as any, {
      workOrderId,
      idempotencyKey: body.idempotencyKey ?? `orch-reopen:${workOrderId}:${Date.now()}`,
      reason: body.reason,
      sourceIssueOrDefect: body.sourceIssueOrDefect,
      requestedBy: body.requestedBy ?? "orchestration-server",
      approvedBy: body.approvedBy ?? body.requestedBy ?? "orchestration-server",
      reopenScope: body.reopenScope ?? "full-workorder",
      acceptanceCriteriaImpacted: body.acceptanceCriteriaImpacted,
      invalidatedReceiptIds: body.invalidatedReceiptIds,
      invalidatedApprovalIds: body.invalidatedApprovalIds,
      newRequiredActions: body.newRequiredActions,
      metadata: body.metadata,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/workorders/:workOrderId/supersede", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workOrders.supersedeWorkOrder as any, {
      workOrderId,
      replacementWorkOrderId: body.replacementWorkOrderId,
      idempotencyKey: body.idempotencyKey ?? `orch-supersede:${workOrderId}:${body.replacementWorkOrderId}`,
      reason: body.reason,
      actorType: body.actorType ?? "SYSTEM",
      actorId: body.actorId ?? "orchestration-server",
      metadata: body.metadata,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/workorders/:workOrderId/governance/expire", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const result = await client.mutation(ConvexMutations.workOrders.expireGovernanceRecords as any, { workOrderId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.get("/runs/:runId/summary", async (c) => {
  try {
    const runId = c.req.param("runId");
    const run = await client.query(ConvexQueries.workflowRuns.get as any, { runId });
    if (!run?._id) return c.json({ error: "Run not found" }, 404);
    const result = await client.query(ConvexQueries.workflowRuns.getInspector as any, { workflowRunId: run._id });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.get("/runs/:workflowRunId/events", async (c) => {
  try {
    const workflowRunId = c.req.param("workflowRunId");
    const result = await client.query(ConvexQueries.workflowRuns.listEvents as any, { workflowRunId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.get("/runs/:workflowRunId/artifacts", async (c) => {
  try {
    const workflowRunId = c.req.param("workflowRunId");
    const result = await client.query(ConvexQueries.workflowRuns.listArtifacts as any, { workflowRunId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/runs/:workflowRunId/events", async (c) => {
  try {
    const workflowRunId = c.req.param("workflowRunId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workflowRuns.recordEvent as any, {
      workflowRunId,
      idempotencyKey: body.idempotencyKey,
      eventType: body.eventType,
      workflowStep: body.workflowStep,
      actor: body.actor,
      agentId: body.agentId,
      toolName: body.toolName,
      commandSummary: body.commandSummary,
      status: body.status,
      startedAt: body.startedAt,
      endedAt: body.endedAt,
      durationMs: body.durationMs,
      retryNumber: body.retryNumber,
      verificationReceiptId: body.verificationReceiptId,
      evidenceArtifactIds: body.evidenceArtifactIds,
      errorCategory: body.errorCategory,
      errorSummary: body.errorSummary,
      metadata: body.metadata,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/runs/:workflowRunId/artifacts", async (c) => {
  try {
    const workflowRunId = c.req.param("workflowRunId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workflowRuns.createArtifact as any, {
      workflowRunId,
      idempotencyKey: body.idempotencyKey,
      artifactType: body.artifactType,
      name: body.name,
      description: body.description,
      repositoryPath: body.repositoryPath,
      externalLocation: body.externalLocation,
      contentHash: body.contentHash,
      producer: body.producer,
      verificationReceiptId: body.verificationReceiptId,
      acceptanceCriterionId: body.acceptanceCriterionId,
      producingEventId: body.producingEventId,
      retentionPolicy: body.retentionPolicy,
      sensitivity: body.sensitivity,
      metadata: body.metadata,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/run-artifacts/:runArtifactId/link-receipt", async (c) => {
  try {
    const runArtifactId = c.req.param("runArtifactId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workflowRuns.linkArtifactToVerificationReceipt as any, {
      runArtifactId,
      verificationReceiptId: body.verificationReceiptId,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// List available personas
app.get("/agents/personas", (c) => {
  try {
    const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".yaml"));
    return c.json({
      personas: files.map((f) => f.replace(".yaml", "")),
      directory: AGENTS_DIR,
    });
  } catch {
    return c.json({ personas: [], directory: AGENTS_DIR });
  }
});

// Gateway connection status (Studio parity: does not expose URL or token)
app.get("/gateway/status", async (c) => {
  try {
    const conn = await client.query(ConvexQueries.gatewayConnection.get as any, {});
    const urlConfigured = Boolean(conn?.url?.trim());
    const tokenConfigured = Boolean(
      typeof process.env.GATEWAY_TOKEN === "string" && process.env.GATEWAY_TOKEN.trim().length > 0
    );
    return c.json({
      configured: urlConfigured && tokenConfigured,
      urlConfigured,
      tokenConfigured,
    });
  } catch {
    return c.json({
      configured: false,
      urlConfigured: false,
      tokenConfigured: Boolean(
        typeof process.env.GATEWAY_TOKEN === "string" && process.env.GATEWAY_TOKEN.trim().length > 0
      ),
    });
  }
});

// Tier 2 context classification (LLM fallback when Tier 1 confidence is low)
app.post("/classify", requireAuth(), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const input = typeof body.input === "string" ? body.input.trim() : "";
    if (!input) return c.json({ error: "Missing or invalid 'input' field" }, 400);

    const { ContextRouter } = await import("@mission-control/context-router");
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    let llmClient: { complete: (p: string) => Promise<string> } | undefined;
    if (openaiKey) {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: openaiKey });
      llmClient = {
        complete: async (prompt: string) => {
          const res = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1024,
          });
          return res.choices[0]?.message?.content ?? "";
        },
      };
    }

    const router = new ContextRouter(
      { llmFallbackThreshold: 0.5 },
      llmClient ?? undefined
    );
    const context = {
      input,
      source: (body.source as "HUMAN" | "AGENT" | "SYSTEM") ?? "API",
      pendingTaskCount: typeof body.pendingTaskCount === "number" ? body.pendingTaskCount : undefined,
      maxConcurrentTasks: typeof body.maxConcurrentTasks === "number" ? body.maxConcurrentTasks : undefined,
      budgetRemaining: typeof body.budgetRemaining === "number" ? body.budgetRemaining : undefined,
    };
    const result = await router.routeAsync(context);
    return c.json(result);
  } catch (err: any) {
    console.error("[orchestration] /classify error:", err);
    return c.json({ error: err?.message ?? "Classification failed" }, 500);
  }
});

// ============================================================================
// GATEWAY WEBSOCKET PROXY (OpenClaw Studio parity)
// ============================================================================

const gatewayProxy = createGatewayProxy({
  loadUpstreamSettings: async () => {
    const conn = await client.query(ConvexQueries.gatewayConnection.get as any, {});
    const url = conn?.url?.trim() ?? "";
    const token = (process.env.GATEWAY_TOKEN ?? "").trim();
    return { url, token };
  },
  log: (msg) => console.log(`[gateway] ${msg}`),
  logError: (msg, err) => console.error(`[gateway] ${msg}`, err),
});

// ============================================================================
// START
// ============================================================================

export function startServer() {
  console.log(`[orchestration] Mission Control Orchestration Server`);
  console.log(`[orchestration] Convex URL: ${CONVEX_URL ? "configured" : "MISSING"}`);
  console.log(`[orchestration] Project: ${PROJECT_SLUG}`);
  console.log(`[orchestration] Tick interval: ${TICK_INTERVAL_MS}ms`);
  console.log(`[orchestration] Agents dir: ${AGENTS_DIR}`);

  startedAt = Date.now();

  tickTimer = setInterval(() => {
    runTick().catch((err) => {
      console.error("[orchestration] Tick loop error:", err);
    });
  }, TICK_INTERVAL_MS);

  runTick().then((result) => {
    console.log(`[orchestration] Initial tick complete:`, result);
  });

  process.on("SIGINT", async () => {
    console.log("\n[orchestration] Shutting down...");
    if (tickTimer) clearInterval(tickTimer);
    for (const [name] of activeAgents) {
      try {
        await stopAgent(name);
      } catch {
        // ignore
      }
    }
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n[orchestration] SIGTERM received, shutting down...");
    if (tickTimer) clearInterval(tickTimer);
    process.exit(0);
  });

  const server = serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`[orchestration] Server listening on http://localhost:${PORT}`);
    console.log(`[orchestration] Health: http://localhost:${PORT}/health`);
    console.log(`[orchestration] Gateway WS: ws://localhost:${PORT}/gateway/ws`);
  });

  server.on("upgrade", (req, socket, head) => {
    gatewayProxy.handleUpgrade(req, socket, head);
  });

  return server;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (process.env.ORCHESTRATION_DISABLE_STARTUP !== "1" && entryUrl === import.meta.url) {
  startServer();
}
