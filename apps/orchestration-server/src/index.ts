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
 *   POST /tick           - Manually trigger a coordinator tick
 *   POST /agents/spawn   - Spawn an agent from a persona YAML
 *   POST /agents/stop    - Stop a running agent
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { ConvexHttpClient } from "convex/browser";
import { CoordinatorLoop } from "@mission-control/coordinator";
import { AgentLifecycle } from "@mission-control/agent-runtime";
import { MemoryManager } from "@mission-control/memory";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

// ============================================================================
// CONFIG
// ============================================================================

const PORT = parseInt(process.env.ORCH_PORT ?? "4100", 10);
const CONVEX_URL = process.env.CONVEX_URL ?? "";
const PROJECT_SLUG = process.env.PROJECT_SLUG ?? "openclaw";
const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS ?? "30000", 10);
const AGENTS_DIR = process.env.AGENTS_DIR ?? path.resolve(process.cwd(), "../../agents");

if (!CONVEX_URL) {
  console.error("[orch] CONVEX_URL is required. Set it in .env or environment.");
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
      client.query("tasks:listByStatus" as any, { status: "INBOX" }),
      client.query("tasks:listAll" as any, {}),
      client.query("agents:listAll" as any, {}),
    ]);

    // 2. Build coordinator state
    const state = {
      inboxTasks: (inboxTasks ?? []).map((t: any) => ({
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

    // 4. Apply decomposition results: create subtasks in Convex
    for (const decomp of actions.tasksToDecompose) {
      for (let i = 0; i < decomp.subtasks.length; i++) {
        const sub = decomp.subtasks[i];
        try {
          await client.mutation("tasks:create" as any, {
            title: sub.title,
            description: sub.description,
            type: sub.type,
            priority: sub.priority,
            parentTaskId: decomp.parentTaskId,
            source: "AGENT",
            createdBy: "SYSTEM",
            idempotencyKey: `decompose-${decomp.parentTaskId}-${i}-${Date.now()}`,
          });
        } catch (err) {
          console.error(`[orch] Failed to create subtask: ${sub.title}`, err);
        }
      }
    }

    // 5. Apply delegations: assign agents to tasks
    for (const delegation of actions.delegations) {
      try {
        await client.mutation("taskRouter:autoAssign" as any, {
          taskId: delegation.taskId,
          actorType: "SYSTEM",
          idempotencyKey: `delegate-${delegation.taskId}-${Date.now()}`,
        });
      } catch (err) {
        console.error(`[orch] Failed to delegate task ${delegation.taskId}`, err);
      }
    }

    // 6. Create alerts for stuck tasks
    for (const stuck of actions.stuckAlerts) {
      try {
        await client.mutation("alerts:create" as any, {
          severity: "WARNING",
          type: "STUCK_TASK",
          title: `Task stuck: ${stuck.taskTitle}`,
          description: `Task has been in progress for ${Math.round(stuck.stuckDurationMs / 60000)} minutes without activity`,
          taskId: stuck.taskId,
          agentId: stuck.agentId ?? undefined,
        });
      } catch (err) {
        // Alert creation may not exist; log and continue
        console.warn(`[orch] Could not create stuck alert for ${stuck.taskId}`);
      }
    }

    // 7. Log escalations
    for (const esc of actions.escalations) {
      console.warn(`[orch] Escalation: ${esc.taskTitle} — ${esc.reason}`);
    }

    lastTickAt = Date.now();
    lastTickResult = {
      decompositions: actions.tasksToDecompose.length,
      delegations: actions.delegations.length,
      stuckAlerts: actions.stuckAlerts.length,
      escalations: actions.escalations.length,
    };
    tickCount++;

    return lastTickResult;
  } catch (err) {
    console.error("[orch] Tick error:", err);
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
  console.log(`[orch] Agent ${personaName} spawned (persona loaded)`);

  return personaName;
}

async function stopAgent(personaName: string): Promise<void> {
  const lifecycle = activeAgents.get(personaName);
  if (!lifecycle) {
    throw new Error(`Agent ${personaName} is not running`);
  }

  activeAgents.delete(personaName);
  memoryManagers.delete(personaName);
  console.log(`[orch] Agent ${personaName} stopped`);
}

// ============================================================================
// HONO APP
// ============================================================================

const app = new Hono();

// Health check
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

// ============================================================================
// START
// ============================================================================

console.log(`[orch] Mission Control Orchestration Server`);
console.log(`[orch] Convex URL: ${CONVEX_URL ? "configured" : "MISSING"}`);
console.log(`[orch] Project: ${PROJECT_SLUG}`);
console.log(`[orch] Tick interval: ${TICK_INTERVAL_MS}ms`);
console.log(`[orch] Agents dir: ${AGENTS_DIR}`);

startedAt = Date.now();

// Start coordinator tick loop
tickTimer = setInterval(() => {
  runTick().catch((err) => {
    console.error("[orch] Tick loop error:", err);
  });
}, TICK_INTERVAL_MS);

// Run first tick immediately
runTick().then((result) => {
  console.log(`[orch] Initial tick complete:`, result);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[orch] Shutting down...");
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
  console.log("\n[orch] SIGTERM received, shutting down...");
  if (tickTimer) clearInterval(tickTimer);
  process.exit(0);
});

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[orch] Server listening on http://localhost:${PORT}`);
  console.log(`[orch] Health: http://localhost:${PORT}/health`);
});
