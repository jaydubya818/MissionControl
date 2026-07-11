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

dotenv.config();

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
          await client.mutation(ConvexMutations.tasks.create as any, {
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
          console.error(`[orchestration] Failed to create subtask: ${sub.title}`, err);
        }
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
      decompositions: actions.tasksToDecompose.length,
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

const app = new Hono();

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

console.log(`[orchestration] Mission Control Orchestration Server`);
console.log(`[orchestration] Convex URL: ${CONVEX_URL ? "configured" : "MISSING"}`);
console.log(`[orchestration] Project: ${PROJECT_SLUG}`);
console.log(`[orchestration] Tick interval: ${TICK_INTERVAL_MS}ms`);
console.log(`[orchestration] Agents dir: ${AGENTS_DIR}`);

startedAt = Date.now();

// Start coordinator tick loop
tickTimer = setInterval(() => {
  runTick().catch((err) => {
    console.error("[orchestration] Tick loop error:", err);
  });
}, TICK_INTERVAL_MS);

// Run first tick immediately
runTick().then((result) => {
  console.log(`[orchestration] Initial tick complete:`, result);
});

// Graceful shutdown
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
