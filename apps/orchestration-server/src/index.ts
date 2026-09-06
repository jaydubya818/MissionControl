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
import { orchestrationUpgradeFailure, requireAuth } from "./auth.js";
import { ConvexActions, ConvexQueries, ConvexMutations } from "./convexCalls.js";
import { createSignedServiceCommand } from "./serviceCommandClient.js";
import { CoordinatorLoop } from "@mission-control/coordinator";
import { AgentLifecycle } from "@mission-control/agent-runtime";
import { MemoryManager } from "@mission-control/memory";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { createHash, randomUUID } from "node:crypto";
import { executeAutomation } from "./automationAdapter.js";
import { discoverLocalInference } from "./localInference.js";
import { readFileSync } from "node:fs";
import { FactoryAttemptWorker, DEFAULT_DEPENDENCIES } from "./factoryAttemptWorker.js";
import { bedrockFactoryProviderFactory, selectBedrockFactoryProvider } from "./bedrockFactoryComposition.js";
import { qualifiedBedrockTransport } from "./bedrockQualifiedTransport.js";
import {
  FactoryHostReporter,
  factorySandboxCapabilities,
  type FactoryHostReporterConfig,
} from "./factoryHostReporter.js";
import {
  fetchGithubPullRequestEvidence,
  loadGithubAppPrivateKey,
  mintInstallationToken,
} from "./githubAppRuntime.js";
import { configuredFactoryHarnessAdapters } from "./factoryHarnessComposition.js";
import { loadFabExecutorAdapter } from "./fabExecutorAdapter.js";
import { HarnessAdapterRegistry } from "./harnessAdapterRegistry.js";
import { MissionPlanningWorker } from "./missionPlanningWorker.js";
import {
  ConvexGovernedInferenceLedger,
  GovernedInferenceGateway,
  OpenAIChatCompletionsTransport,
} from "./governedInferenceGateway.js";
import { resolvePersonaPath, safeClientError } from "./orchestrationSecurity.js";
import os from "node:os";

// Fab enrollment/configuration is explicit startup input. Capture its selected source
// before MC's legacy dotenv loading so repository dotenv cannot enroll or override it.
const configuredFabAdapter = process.env.FAB_EXECUTOR_ENABLED === "1"
  ? loadFabExecutorAdapter(requiredRuntimeSetting("FAB_EXECUTOR_CONFIG"), requiredRuntimeSetting("FAB_EXECUTOR_STATE_DIR"))
  : undefined;
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
const AUTOMATION_REPOSITORY_ROOT = path.resolve(process.env.AUTOMATION_REPOSITORY_ROOT ?? process.cwd());
const CODEX_FACTORY_WORKER_ENABLED = process.env.CODEX_FACTORY_WORKER_ENABLED === "true";
const DEEPSEEK_HARNESS_EXECUTOR_ENABLED = process.env.DEEPSEEK_HARNESS_EXECUTOR_ENABLED === "1";
const LEGACY_FACTORY_WORKER_ENABLED = process.env.FACTORY_EXECUTION_ENABLED === "1";
const CODEX_BEDROCK_HARNESS_ENABLED = process.env.CODEX_BEDROCK_HARNESS_ENABLED === "1";
const DURABLE_FACTORY_WORKER_ENABLED = CODEX_FACTORY_WORKER_ENABLED || DEEPSEEK_HARNESS_EXECUTOR_ENABLED
  || Boolean(configuredFabAdapter) || CODEX_BEDROCK_HARNESS_ENABLED;
const FACTORY_WORKER_SCOPE = DURABLE_FACTORY_WORKER_ENABLED
  ? {
      projectId: requiredRuntimeSetting("CODEX_WORKER_PROJECT_ID"),
      repositoryId: requiredRuntimeSetting("CODEX_WORKER_REPOSITORY_ID"),
    }
  : undefined;
const FACTORY_WORKER_SESSION_ID = randomUUID();
const FACTORY_WORKER_ID = process.env.CODEX_WORKER_HOST_ID?.trim() || `orchestration:${os.hostname()}`;
const FACTORY_WORKER_MAX_CONCURRENT_RUNS = boundedPositiveInteger(process.env.CODEX_WORKER_MAX_CONCURRENT_RUNS, 1);
const GITHUB_APP_PUBLICATION_READY = process.env.CODEX_WORKER_GITHUB_APP_PUBLICATION_ENABLED === "1";
const bedrockConfigPath = CODEX_BEDROCK_HARNESS_ENABLED
  ? process.env.CODEX_BEDROCK_APPROVED_CONFIG_FILE?.trim()
  : undefined;
const bedrockConfig = bedrockConfigPath ? JSON.parse(readFileSync(bedrockConfigPath, "utf8")) : undefined;
const bedrockTransport = bedrockConfig?.callAuthorization
  ? qualifiedBedrockTransport(bedrockConfig.route, bedrockConfig.callAuthorization)
  : undefined;
const REMOTE_SANDBOX_BACKEND_READY = Boolean(bedrockTransport)
  || (process.env.CODEX_WORKER_REMOTE_SANDBOX_ENABLED === "1"
    && Boolean(process.env.EXEDEV_IDENTITY_FILE?.trim())
    && Boolean(process.env.OPENROUTER_MANAGEMENT_API_KEY?.trim()));
const FACTORY_WORKER_EXECUTION_BACKENDS = REMOTE_SANDBOX_BACKEND_READY
  ? ["persistent-worker", "remote-sandbox"] as const
  : ["persistent-worker"] as const;

if (!CONVEX_URL) {
  console.error("[orchestration] CONVEX_URL is required. Set it in .env or environment.");
  process.exit(1);
}

// ============================================================================
// STATE
// ============================================================================

const client = new ConvexHttpClient(CONVEX_URL);
const CONVEX_SERVICE_AUTH_TOKEN = process.env.CONVEX_SERVICE_AUTH_TOKEN?.trim();
if (CONVEX_SERVICE_AUTH_TOKEN) {
  client.setAuth(CONVEX_SERVICE_AUTH_TOKEN);
}
const factoryHarnessRegistry = new HarnessAdapterRegistry(
  [...configuredFactoryHarnessAdapters({
    codexEnabled: CODEX_FACTORY_WORKER_ENABLED,
    codexBedrockEnabled: CODEX_BEDROCK_HARNESS_ENABLED,
    deepseekEnabled: DEEPSEEK_HARNESS_EXECUTOR_ENABLED,
    legacyFactoryWorkerEnabled: LEGACY_FACTORY_WORKER_ENABLED,
  }), ...(configuredFabAdapter ? [configuredFabAdapter] : [])],
);
let occupiedFactoryWorkerSlots = 0;
const tryAcquireFactoryWorkerSlot = () => {
  if (occupiedFactoryWorkerSlots >= FACTORY_WORKER_MAX_CONCURRENT_RUNS) return null;
  occupiedFactoryWorkerSlots += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    occupiedFactoryWorkerSlots = Math.max(0, occupiedFactoryWorkerSlots - 1);
  };
};
const factoryAttemptWorker = new FactoryAttemptWorker(
  client,
  factoryHarnessRegistry,
  DURABLE_FACTORY_WORKER_ENABLED || LEGACY_FACTORY_WORKER_ENABLED,
  undefined,
  bedrockTransport ? {
    ...DEFAULT_DEPENDENCIES,
    createSandboxProvider: selectBedrockFactoryProvider(
      bedrockFactoryProviderFactory(client, bedrockConfig, bedrockTransport),
      DEFAULT_DEPENDENCIES.createSandboxProvider!,
    ),
  } : undefined,
  FACTORY_WORKER_SCOPE,
  FACTORY_WORKER_SCOPE ? {
    workerId: FACTORY_WORKER_ID,
    sessionId: FACTORY_WORKER_SESSION_ID,
    maxConcurrentRuns: FACTORY_WORKER_MAX_CONCURRENT_RUNS,
  } : undefined,
  tryAcquireFactoryWorkerSlot,
);
const missionPlanningWorker = new MissionPlanningWorker(
  client,
  factoryHarnessRegistry,
  DURABLE_FACTORY_WORKER_ENABLED,
  FACTORY_WORKER_SCOPE,
  FACTORY_WORKER_SCOPE ? {
    workerId: FACTORY_WORKER_ID,
    sessionId: FACTORY_WORKER_SESSION_ID,
  } : undefined,
  undefined,
  tryAcquireFactoryWorkerSlot,
);
const factoryHostReporter = FACTORY_WORKER_SCOPE
  ? new FactoryHostReporter(client, {
      projectId: FACTORY_WORKER_SCOPE.projectId,
      repositoryId: FACTORY_WORKER_SCOPE.repositoryId,
      hostId: FACTORY_WORKER_ID,
      sessionId: FACTORY_WORKER_SESSION_ID,
      checkoutRoot: path.resolve(process.env.CODEX_WORKER_CHECKOUT_ROOT?.trim() || process.cwd()),
      maxConcurrentRuns: FACTORY_WORKER_MAX_CONCURRENT_RUNS,
      getCurrentRuns: () => factoryAttemptWorker.status().activeRunIds.length
        + (missionPlanningWorker.status().activeRunId ? 1 : 0),
      approvedModelIds: commaSeparatedValues(process.env.CODEX_WORKER_APPROVED_MODEL_IDS),
      networkPolicyStatus: attestationStatus(process.env.CODEX_WORKER_NETWORK_POLICY_STATUS),
      secretPolicyStatus: attestationStatus(process.env.CODEX_WORKER_SECRET_POLICY_STATUS),
      hostRuntimeType: "persistent-worker",
      executionBackends: [...FACTORY_WORKER_EXECUTION_BACKENDS],
      supportedExecutors: factoryHarnessRegistry.registrations().map((registration) => {
        const manifest = registration.manifest;
        if (!manifest || !registration.capabilityManifestSha256 || !registration.effectiveConfigSha256) {
          throw new Error(`Factory harness ${registration.capabilities.adapter}/${registration.capabilities.version} is missing its frozen capability manifest.`);
        }
        return {
          adapter: manifest.identity.adapterId,
          version: manifest.identity.adapterVersion,
          capabilityManifestSha256: registration.capabilityManifestSha256,
          effectiveConfigSha256: registration.effectiveConfigSha256,
          runtimeArtifact: registration.runtimeArtifact,
          runtimeArtifactSha256: registration.runtimeArtifactSha256,
          capabilityManifest: manifest,
          supportsCancel: registration.capabilities.supportsCancel,
          supportsResume: registration.capabilities.supportsResume,
          isolationModes: [...registration.capabilities.isolationModes],
        };
      }),
      sandboxCapabilities: factorySandboxCapabilities({
        githubAppPublicationReady: GITHUB_APP_PUBLICATION_READY,
        remoteSandboxBackendReady: REMOTE_SANDBOX_BACKEND_READY,
      }),
      factoryVersionBindings: parseFactoryVersionBindings(
        process.env.CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON,
        FACTORY_WORKER_SCOPE.repositoryId,
      ),
      onError: (error) => console.error("[orchestration] Factory host report failed:", error),
    })
  : null;
const coordinator = new CoordinatorLoop({ pollIntervalMs: TICK_INTERVAL_MS });
const activeAgents = new Map<string, AgentLifecycle>();
const memoryManagers = new Map<string, MemoryManager>();
const activeAutomationExecutions = new Map<string, { claimId: string; controller: AbortController }>();
const READ_ONLY_EXECUTION_OWNER = "orchestration-server:read-only-automation";
const READ_ONLY_EXECUTION_LEASE_MS = 60_000;
const READ_ONLY_EXECUTION_HEARTBEAT_MS = 20_000;
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
  const personaPath = resolvePersonaPath(AGENTS_DIR, personaName);

  if (!fs.existsSync(personaPath)) {
    throw new Error(`Persona file not found for ${personaName}`);
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

// Default-deny every orchestration route except the explicit public health and
// connection-status probes declared in auth.ts. This avoids silently exposing
// new mutation routes when a path prefix is added in the future.
app.use("*", requireAuth());

// Health check (unauthenticated for load balancers)
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    uptime: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
    convexUrl: CONVEX_URL ? "configured" : "missing",
    tickCount,
    lastTickAt,
    activeAgents: Array.from(activeAgents.keys()),
    factoryAttemptWorker: factoryAttemptWorker.status(),
    missionPlanningWorker: missionPlanningWorker.status(),
    codexFactoryWorker: CODEX_FACTORY_WORKER_ENABLED ? "enabled" : "disabled",
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
    factoryAttemptWorker: factoryAttemptWorker.status(),
    missionPlanningWorker: missionPlanningWorker.status(),
  });
});

// Manual tick trigger
app.post("/tick", async (c) => {
  const result = await runTick();
  return c.json({ success: true, result });
});

app.post("/runs/factory-worker/tick", async (c) => {
  await factoryAttemptWorker.tick();
  return c.json({ success: true, status: factoryAttemptWorker.status() });
});

app.post("/runs/planning-worker/tick", async (c) => {
  await missionPlanningWorker.tick();
  return c.json({ success: true, status: missionPlanningWorker.status() });
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
    return c.json({ error: safeClientError(err) }, 400);
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
    return c.json({ error: safeClientError(err) }, 400);
  }
});

// Authoritative work-order dispatch path for orchestration consumers
app.post("/workorders/:workOrderId/dispatch", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    if (!body.projectId || !body.repositoryId || !body.factoryDefinitionVersionId) {
      return c.json({ error: "projectId, repositoryId, and factoryDefinitionVersionId are required" }, 400);
    }
    const command = createSignedServiceCommand({
      capability: "workorders.dispatch",
      projectId: body.projectId,
      repositoryId: body.repositoryId,
      commandId: body.commandId,
      payload: {
      workOrderId,
      taskId: body.taskId,
      workflowId: body.workflowId,
      factoryDefinitionVersionId: body.factoryDefinitionVersionId,
      idempotencyKey:
        body.idempotencyKey ??
        `orch-dispatch:${workOrderId}:${body.taskId ?? "legacy"}:${body.retryOfWorkflowRunId ?? "start"}`,
      runtime: body.runtime ?? "Hono Orchestration Server",
      repositoryId: body.repositoryId,
      codeScopeIds: body.codeScopeIds,
      owningTeamId: body.owningTeamId,
      ownerMemberId: body.ownerMemberId,
      executionEnvironment: body.executionEnvironment,
      executorHostId: body.executorHostId,
      model: body.model,
      worktree: body.worktree,
      retryOfWorkflowRunId: body.retryOfWorkflowRunId,
      retryReason: body.retryReason,
      },
    });
    const result = await client.action(ConvexActions.serviceCommands.dispatchWorkOrder as any, command);
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
    if ((result as any)?.reason === "scope-denied") {
      return c.json(
        {
          success: false,
          error: "Repository, code-scope, team, owner, environment, or host policy denied this dispatch",
          result,
        },
        403
      );
    }
    const run = (result as any)?.run;
    let executorBinding = null;
    if (body.executorHostId && body.executionEnvironment && run?._id) {
      executorBinding = await client.mutation(ConvexMutations.softwareFactoryControlPlane.bindExecutor as any, {
        workflowRunId: run._id,
        hostId: body.executorHostId,
        executionEnvironment: body.executionEnvironment,
        checkpointSummary: body.checkpointSummary ?? "Orchestration server accepted the executor binding.",
        budgetUsd: body.budgetUsd,
        stopCondition: body.stopCondition ?? "Stop on policy, budget, environment, or verification failure.",
        escalationOwner: body.escalationOwner ?? body.actorId ?? "orchestration-server",
      });
      if (!(executorBinding as any)?.success) {
        return c.json({ success: false, error: "Executor binding was denied", result, executorBinding }, 403);
      }
    }
    if (body.contextRepoSlug && run?._id) {
      const activation = await client.mutation(ConvexMutations.context.activateForWorkflowRun as any, {
        repoSlug: body.contextRepoSlug,
        workflowRunId: run._id,
        idempotencyKey: `${body.idempotencyKey ?? `orch-dispatch:${workOrderId}`}:context-activation`,
        actorId: body.actorId ?? "orchestration-server",
      });
      return c.json({ success: true, result, executorBinding, contextActivation: activation });
    }
    return c.json({ success: true, result, executorBinding });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
  }
});

// Trusted exact-head PR evidence stays behind the local orchestration boundary:
// the browser supplies lineage only, while this service reads the App key path,
// mints a repository-scoped token, and submits a signed service command.
app.post("/orchestration/workorders/:workOrderId/github-pr-evidence", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    if (!body.projectId || !body.repositoryId || !body.workflowRunId || !body.prUrl) {
      return c.json({ error: "projectId, repositoryId, workflowRunId, and prUrl are required" }, 400);
    }
    const activeFactory = await client.query(
      ConvexQueries.factoryConfiguration.getActiveForWorkOrder as any,
      { workOrderId },
    ) as any;
    const repository = activeFactory?.repository;
    if (!repository
      || String(repository._id) !== String(body.repositoryId)
      || String(repository.projectId) !== String(body.projectId)
      || repository.status !== "READY"
      || !repository.providerRepositoryId) {
      return c.json({ error: "The WorkOrder repository binding is unavailable or not ready" }, 409);
    }
    const readiness = await client.query(
      ConvexQueries.githubAppConnections.getRepositoryReadiness as any,
      { repositoryId: body.repositoryId },
    ) as any;
    const installation = readiness?.installation;
    if (readiness?.overall !== "VERIFIED" || installation?.status !== "CONNECTED") {
      return c.json({ error: "The repository-scoped GitHub App installation is not verified" }, 409);
    }
    const parsed = parseGithubPullRequestUrl(body.prUrl);
    if (!parsed || parsed.repository.toLowerCase() !== String(repository.repository).toLowerCase()) {
      return c.json({ error: "The pull request does not match the frozen WorkOrder repository" }, 400);
    }
    const configuredAppId = process.env.GITHUB_APP_ID?.trim();
    const privateKey = loadGithubAppPrivateKey();
    if (!configuredAppId || !privateKey || configuredAppId !== installation.appId) {
      return c.json({ error: "The file-scoped GitHub App runtime identity does not match the repository installation" }, 503);
    }
    const issued = await mintInstallationToken({
      appId: configuredAppId,
      installationId: installation.installationId,
      providerRepositoryId: repository.providerRepositoryId,
      privateKey,
    });
    let installationToken = issued.token;
    try {
      const evidence = await fetchGithubPullRequestEvidence({
        repository: parsed.repository,
        prNumber: parsed.prNumber,
        token: installationToken,
      });
      const attestationExpiresAt = Date.now() + 15 * 60_000;
      const command = createSignedServiceCommand({
        capability: "github.pr-evidence.ingest",
        projectId: body.projectId,
        repositoryId: body.repositoryId,
        payload: {
          projectId: body.projectId,
          repositoryId: body.repositoryId,
          workOrderId,
          workflowRunId: body.workflowRunId,
          evidence: {
            projectId: body.projectId,
            repositoryId: body.repositoryId,
            installationId: installation.installationId,
            workOrderId,
            workflowRunId: body.workflowRunId,
            lineageStatus: "EXPLICIT_ARTIFACT",
            prUrl: evidence.prUrl,
            prNumber: evidence.prNumber,
            repoFullName: evidence.repoFullName,
            branch: evidence.branch,
            title: evidence.title,
            prState: evidence.prState,
            mergeActor: evidence.mergeActor,
            mergedAt: evidence.mergedAt,
            mergeCommitSha: evidence.mergeCommitSha,
            ciStatus: evidence.ciStatus,
            ciRunUrl: evidence.ciRunUrl,
            headSha: evidence.headSha,
            checkRuns: evidence.checkRuns,
            signals: evidence.signals,
            sourceRef: evidence.headSha,
            provider: "GITHUB",
            providerRepositoryId: repository.providerRepositoryId,
            providerPullRequestId: evidence.providerPullRequestId,
            draft: evidence.draft,
            attestationExpiresAt,
          },
        },
      });
      const result = await client.action(
        ConvexActions.serviceCommands.ingestGithubPrEvidence as any,
        command,
      ) as any;
      return c.json({
        success: true,
        evaluationId: result?.evaluationId,
        prUrl: evidence.prUrl,
        headSha: evidence.headSha,
        ciStatus: evidence.ciStatus,
        checkCount: evidence.checkRuns.length,
        attestationExpiresAt,
      });
    } finally {
      installationToken = "";
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "GitHub PR evidence sync failed" }, 500);
  }
});

/**
 * Execute an already-dispatched Automation WorkOrder.
 *
 * This endpoint cannot evaluate, approve, or dispatch work. Convex returns an
 * execution manifest only when all of those governed transitions already
 * happened and the Definition remains approved, active, validated, LEVEL_1,
 * and read-only.
 */
app.post("/workorders/:workOrderId/automation-execution", async (c) => {
  const workOrderId = c.req.param("workOrderId");
  if (activeAutomationExecutions.has(workOrderId)) {
    return c.json({ error: "A read-only Automation execution is already active for this WorkOrder" }, 409);
  }
  const body = await c.req.json().catch(() => ({}));
  const claimId = randomUUID();
  const controller = new AbortController();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let heartbeatTask: Promise<void> | null = null;
  let claimHealthy = true;
  let claimAcquired = false;
  let claimedRunId: string | null = null;
  let claimedWorkflowRunId: string | null = null;
  try {
    const claim = await client.mutation(ConvexMutations.automationExecutions.claim as any, {
      workOrderId,
      claimId,
      ownerId: READ_ONLY_EXECUTION_OWNER,
      leaseDurationMs: READ_ONLY_EXECUTION_LEASE_MS,
      estimatedCostUsd: 0,
      retryOfClaimId: body.retryOfClaimId,
      retryReason: body.retryReason,
    }) as any;
    if (!claim?.claimed) {
      return c.json({
        error: `Read-only execution claim rejected (${claim?.reason ?? "unknown"})`,
        quarantined: Boolean(claim?.quarantined),
      }, 409);
    }
    claimAcquired = true;
    claimedRunId = claim.runId;
    claimedWorkflowRunId = claim.workflowRunId;
    activeAutomationExecutions.set(workOrderId, { claimId, controller });
    heartbeat = setInterval(() => {
      if (heartbeatTask || controller.signal.aborted) return;
      heartbeatTask = (async () => {
        const renewed = await client.mutation(ConvexMutations.automationExecutions.renew as any, {
          workOrderId,
          claimId,
          ownerId: READ_ONLY_EXECUTION_OWNER,
          leaseDurationMs: READ_ONLY_EXECUTION_LEASE_MS,
        }) as any;
        if (!renewed?.renewed) {
          const controlledAbort = renewed?.reason === "cancellation-requested"
            || String(renewed?.reason ?? "").startsWith("operator-mode-");
          if (!controlledAbort) claimHealthy = false;
          controller.abort();
        }
      })().catch(() => {
        claimHealthy = false;
        controller.abort();
      }).finally(() => {
        heartbeatTask = null;
      });
    }, READ_ONLY_EXECUTION_HEARTBEAT_MS);

    const manifest = await client.query(ConvexQueries.skillAutomations.getExecutionManifest as any, {
      workOrderId,
      claimId,
      ownerId: READ_ONLY_EXECUTION_OWNER,
    }) as any;
    const missingSecrets = (manifest.secretReferences as string[]).filter(name => !process.env[name]);
    if (missingSecrets.length) throw new Error(`Required secret references are unavailable: ${missingSecrets.join(", ")}`);
    const result = await executeAutomation({
      adapterType: manifest.adapterType,
      repository: manifest.repository,
      repositoryRoot: AUTOMATION_REPOSITORY_ROOT,
      workingDirectory: manifest.workingDirectory,
      artifactPath: manifest.artifactPath,
      artifactContent: manifest.artifactContent,
      artifactContentHash: manifest.artifactContentHash,
      timeoutMs: manifest.timeoutMs,
      secretReferences: manifest.secretReferences,
      configuration: manifest.configuration,
    }, controller.signal);
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    if (heartbeatTask) await heartbeatTask;
    if (!claimHealthy) {
      throw new Error("Read-only execution claim was lost before terminal evidence could be recorded");
    }
    const outcome = await client.mutation(ConvexMutations.automationExecutions.finish as any, {
      workOrderId,
      claimId,
      ownerId: READ_ONLY_EXECUTION_OWNER,
      status: result.status,
      result,
      costUsd: 0,
    }) as any;
    if (outcome.retryAllowed) {
      return c.json({
        success: false,
        result,
        disposition: outcome.disposition,
        retryRequired: true,
        retryOfClaimId: outcome.retryOfClaimId,
        attemptNumber: outcome.attemptNumber,
        workflowRunId: manifest.workflowRunId,
      }, 202);
    }
    await client.mutation(ConvexMutations.workflowRuns.updateStatus as any, {
      runId: manifest.runId,
      status: outcome.terminalStatus,
      failureReason: result.error ?? undefined,
    });
    return c.json({
      success: outcome.disposition === "AWAITING_VERIFICATION",
      result,
      disposition: outcome.disposition,
      verificationRequired: outcome.disposition === "AWAITING_VERIFICATION",
      workflowRunId: manifest.workflowRunId,
    }, outcome.disposition === "AWAITING_VERIFICATION" ? 200 : 422);
  } catch (err: any) {
    if (claimAcquired && claimHealthy) {
      const failureResult = {
        status: controller.signal.aborted ? "cancelled" : "infrastructure_error",
        exitCode: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
        artifacts: [],
        evidence: [],
        redactedLogs: [],
        error: safeClientError(err, "Read-only Automation execution failed"),
      };
      const recovery = await client.mutation(ConvexMutations.automationExecutions.finish as any, {
        workOrderId,
        claimId,
        ownerId: READ_ONLY_EXECUTION_OWNER,
        status: failureResult.status,
        result: failureResult,
        costUsd: 0,
      }).catch(() => null) as any;
      if (recovery?.terminalStatus && claimedRunId) {
        await client.mutation(ConvexMutations.workflowRuns.updateStatus as any, {
          runId: claimedRunId,
          status: recovery.terminalStatus,
          failureReason: failureResult.error,
        }).catch(() => undefined);
      }
      if (recovery?.retryAllowed) {
        return c.json({
          error: failureResult.error,
          disposition: recovery.disposition,
          retryRequired: true,
          retryOfClaimId: recovery.retryOfClaimId,
          workflowRunId: claimedWorkflowRunId,
        }, 202);
      }
    }
    return c.json({ error: safeClientError(err) }, 400);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await (heartbeatTask as Promise<void> | null)?.catch(() => undefined);
    const active = activeAutomationExecutions.get(workOrderId);
    if (active?.claimId === claimId) activeAutomationExecutions.delete(workOrderId);
  }
});

app.post("/workorders/:workOrderId/automation-cancel", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.automationExecutions.requestCancellation as any, {
      workOrderId,
      actorId: body.actorId ?? "operator",
      reason: body.reason ?? "Operator requested cancellation",
    }) as any;
    if (!result?.requested) return c.json({ success: false, result }, 409);
    const active = activeAutomationExecutions.get(workOrderId);
    if (active && (!result.claimId || active.claimId === result.claimId)) active.controller.abort();
    if (!result.activeLease) {
      await client.mutation(ConvexMutations.workflowRuns.updateStatus as any, {
        runId: result.runId,
        status: "CANCELED",
        failureReason: body.reason ?? "Operator requested cancellation",
      });
    }
    return c.json({
      success: true,
      cancellationRequested: true,
      activeAdapterSignaled: Boolean(active),
      workflowRunId: result.workflowRunId,
    });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
  }
});

/**
 * Independent verifier boundary. It consumes the completed run and evidence;
 * it never executes the approved adapter itself.
 */
app.post("/workorders/:workOrderId/automation-verification", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    const manifest = await client.query(ConvexQueries.skillAutomations.getExecutionManifest as any, { workOrderId, allowCompleted: true }) as any;
    const run = await client.query(ConvexQueries.workflowRuns.get as any, { runId: manifest.runId }) as any;
    if (run?.status !== "COMPLETED") return c.json({ error: "Independent verification requires a completed execution run" }, 409);
    if (body.status !== "PASSED" && body.status !== "FAILED") {
      return c.json({ error: "An explicit status of PASSED or FAILED is required; it is never defaulted." }, 400);
    }
    const observed = typeof body.observedResult === "string" ? body.observedResult.trim() : "";
    if (!observed) {
      return c.json({ error: "observedResult is required: the verifier must report what it actually observed." }, 400);
    }
    const evidenceLocation = typeof body.evidenceLocation === "string" ? body.evidenceLocation.trim() : "";
    if (!evidenceLocation) {
      return c.json({ error: "evidenceLocation is required: a verdict with no retrievable evidence is not evidence." }, 400);
    }
    const reportBindingHash = `sha256:${createHash("sha256").update(JSON.stringify({
      workOrderId, workflowRunId: manifest.workflowRunId, definitionId: manifest.definitionId,
      artifactHash: manifest.artifactContentHash, observed, evidenceLocation,
    })).digest("hex")}`;
    const receiptStatus = body.status;
    const receiptResults = [];
    for (const criterion of manifest.acceptanceCriteria as any[]) {
      receiptResults.push(await client.mutation(ConvexMutations.workOrders.recordVerificationReceipt as any, {
        workOrderId,
        workflowRunId: manifest.workflowRunId,
        acceptanceCriterionId: criterion.id,
        idempotencyKey: `automation-verifier:${manifest.workflowRunId}:${criterion.id}`,
        verificationMethod: "TEST",
        commandOrCheck: "independent normalized-result and artifact-integrity verification",
        result: observed,
        evidenceLocation,
        artifactReference: manifest.artifactPath,
        verifier: "independent-automation-verifier",
        status: receiptStatus,
        metadata: {
          definitionId: manifest.definitionId,
          evaluationId: manifest.evaluationId,
          correlationId: manifest.correlationId,
          ingestedVia: "orchestration:automation-verification",
          reportBindingHash,
          expectedResult: "Completed run using the approved immutable artifact with all acceptance criteria satisfied",
          observedResult: observed,
          recommendedFollowUp: receiptStatus === "PASSED" ? "None" : "Pause the Definition and inspect adapter evidence",
        },
      }));
    }
    const finalDecision = await client.mutation(ConvexMutations.skillAutomations.finalizeVerification as any, {
      workOrderId,
      workflowRunId: manifest.workflowRunId,
      receiptStatus,
      reason: receiptStatus === "PASSED"
        ? "Independent verification confirmed the expected result and artifact integrity"
        : body.reason ?? "Independent verification rejected the observed result",
    });
    return c.json({
      success: receiptStatus === "PASSED",
      receipts: receiptResults,
      finalDecision,
      accepted: false,
      acceptanceNote: "Receipts were recorded. Acceptance is a separate human-governed decision.",
    });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
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
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.get("/approval-decisions", async (c) => {
  try {
    const projectId = c.req.query("projectId")?.trim();
    if (!projectId) return c.json({ error: "projectId is required" }, 400);
    const requestedLimit = Number(c.req.query("limit") ?? 50);
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 100
      ? requestedLimit
      : 50;
    const rows = await client.query(ConvexQueries.workOrders.approvalQueue as any, {
      projectId,
      status: "PENDING",
      limit,
    }) as any[];
    const checkpoints = rows.filter((row) => (
      row.approvalType === "HUMAN_REVIEW"
      && row.latestRun?.factoryContinuationStatus === "AWAITING_HUMAN_REVIEW"
      && row.latestRun?.factoryApprovalDecisionId === row._id
    ));
    return c.json({ success: true, checkpoints });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.post("/approval-decisions/:approvalDecisionId/decide", async (c) => {
  try {
    const approvalDecisionId = c.req.param("approvalDecisionId");
    const body = await c.req.json().catch(() => ({}));
    const result = await client.mutation(ConvexMutations.workOrders.decideApprovalDecision as any, {
      approvalDecisionId,
      decision: body.decision,
      reason: body.reason,
      conditions: body.conditions,
      metadata: body.metadata,
    });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.post("/workorders/:workOrderId/receipt-packets", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const body = await c.req.json().catch(() => ({}));
    if (!body.projectId || !body.repositoryId || !body.factoryDefinitionVersionId) {
      return c.json({ error: "projectId, repositoryId, and factoryDefinitionVersionId are required" }, 400);
    }
    const command = createSignedServiceCommand({
      capability: "receipts.ingest",
      projectId: body.projectId,
      repositoryId: body.repositoryId,
      commandId: body.commandId,
      payload: {
      workOrderId,
      workflowRunId: body.workflowRunId,
      factoryDefinitionVersionId: body.factoryDefinitionVersionId,
      piSessionId: body.piSessionId,
      piExecutionId: body.piExecutionId,
      markRunCompleted: body.markRunCompleted,
      receipts: body.receipts ?? [],
      handoff: body.handoff,
      idempotencyKey: body.idempotencyKey,
      contextActivationReceiptId: body.contextActivationReceiptId,
      },
    });
    const result = await client.action(ConvexActions.serviceCommands.ingestReceiptPacket as any, command);
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
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
    return c.json({ error: safeClientError(err) }, 400);
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
    return c.json({ error: safeClientError(err) }, 400);
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
    return c.json({ error: safeClientError(err) }, 400);
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
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.post("/workorders/:workOrderId/accept", async (c) => {
  return c.json({
    error: "Acceptance requires an authenticated human operator through the canonical workOrders.accept mutation.",
  }, 410);
});

app.get("/workorders/:workOrderId/revisions", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const result = await client.query(ConvexQueries.workOrders.revisionHistory as any, { workOrderId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.get("/workorders/:workOrderId/verification", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const detail = await client.query(ConvexQueries.workOrders.get as any, { workOrderId }) as any;
    if (!detail) return c.json({ error: "WorkOrder not found" }, 404);
    const latestReceipt = (detail.verificationReceipts ?? [])
      .filter((receipt: any) => receipt.receiptScope === "WORK_ORDER")
      .sort((a: any, b: any) => (b.recordedAt ?? 0) - (a.recordedAt ?? 0))[0] ?? null;
    return c.json({
      success: true,
      result: {
        workOrderId,
        specificationVersion: detail.workOrder.specificationVersion ?? null,
        riskLevel: detail.workOrder.riskLevel,
        riskReasons: detail.workOrder.riskReasons ?? [],
        changeBudget: detail.workOrder.changeBudget ?? null,
        verificationContract: detail.workOrder.verificationContract ?? null,
        latestReceipt,
        verificationRuns: detail.verificationRuns ?? [],
        evidenceEnvelopes: detail.evidenceEnvelopes ?? [],
      },
    });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.get("/workorders/:workOrderId/governance", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const result = await client.query(ConvexQueries.workOrders.governanceValidity as any, { workOrderId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.get("/workorders/:workOrderId/expired-approvals", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const result = await client.query(ConvexQueries.workOrders.listExpiredApprovals as any, { workOrderId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.get("/workorders/:workOrderId/stale-evidence", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const result = await client.query(ConvexQueries.workOrders.listStaleEvidence as any, { workOrderId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
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
    return c.json({ error: safeClientError(err) }, 400);
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
    return c.json({ error: safeClientError(err) }, 400);
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
    return c.json({ error: safeClientError(err) }, 400);
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
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.post("/workorders/:workOrderId/governance/expire", async (c) => {
  try {
    const workOrderId = c.req.param("workOrderId");
    const result = await client.mutation(ConvexMutations.workOrders.expireGovernanceRecords as any, { workOrderId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
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
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.get("/runs/:workflowRunId/events", async (c) => {
  try {
    const workflowRunId = c.req.param("workflowRunId");
    const result = await client.query(ConvexQueries.workflowRuns.listEvents as any, { workflowRunId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.get("/runs/:workflowRunId/artifacts", async (c) => {
  try {
    const workflowRunId = c.req.param("workflowRunId");
    const result = await client.query(ConvexQueries.workflowRuns.listArtifacts as any, { workflowRunId });
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: safeClientError(err) }, 400);
  }
});

app.post("/runs/:workflowRunId/events", async (c) => {
  return c.json({
    error: "Direct execution-event writes are retired. Factory workers must use the signed attempts.report service command.",
  }, 410);
});

app.post("/runs/:workflowRunId/artifacts", async (c) => {
  return c.json({
    error: "Direct execution-artifact writes are retired. Factory workers must use the signed attempts.report service command.",
  }, 410);
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
    return c.json({ error: safeClientError(err) }, 400);
  }
});

// List available personas
app.get("/agents/personas", (c) => {
  try {
    const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".yaml"));
    return c.json({
      personas: files.map((f) => f.replace(".yaml", "")),
      directory: "[REDACTED]",
    });
  } catch {
    return c.json({ personas: [], directory: "[REDACTED]" });
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

app.get("/local-inference/discover", async (c) => {
  const providers = await discoverLocalInference();
  return c.json({ providers });
});

app.post("/local-inference/sync", async (c) => {
  return c.json(
    { error: "Local model sync requires a signed, workspace-scoped service command." },
    501,
  );
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
    if (openaiKey && process.env.MC_GOVERNED_INFERENCE_GATEWAY_ENABLED === "1") {
      const governed = governedInferenceScope(body.governedInference);
      const ledger = new ConvexGovernedInferenceLedger(client, governed.projectId, governed.repositoryId);
      const gateway = new GovernedInferenceGateway(ledger, new OpenAIChatCompletionsTransport(openaiKey));
      const { routeDigest, ...requestAuthority } = governed;
      llmClient = {
        complete: async (prompt: string) => {
          const response = await gateway.execute<{ choices?: Array<{ message?: { content?: unknown } }> }>({
            ...requestAuthority,
            routes: [{
              provider: "openai", providerRoute: "openai-chat-completions", modelId: "gpt-4o-mini-2024-07-18",
              routeDigest, adapter: "mission-control-openai-chat-completions",
              adapterVersion: "1.0.0", endpoint: "https://api.openai.com/v1/chat/completions",
            }],
            body: { messages: [{ role: "user", content: prompt }], max_completion_tokens: 1024 },
          }, c.req.raw.signal);
          const content = response?.choices?.[0]?.message?.content;
          return typeof content === "string" ? content : "";
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
  } catch (err: unknown) {
    console.error("[orchestration] /classify error:", err);
    return c.json({ error: safeClientError(err) }, 500);
  }
});

function governedInferenceScope(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("Governed inference scope is required while the gateway flag is enabled.");
  }
  const scope = value as Record<string, unknown>;
  const required = ["projectId", "repositoryId", "workflowRunId", "reservationId", "leaseId", "logicalRequestKey", "routeDigest"] as const;
  for (const key of required) {
    if (typeof scope[key] !== "string" || !(scope[key] as string).trim()) {
      throw new Error(`Governed inference ${key} is required.`);
    }
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(scope.routeDigest as string)) throw new Error("Governed inference routeDigest is invalid.");
  return Object.fromEntries(required.map((key) => [key, (scope[key] as string).trim()])) as Record<(typeof required)[number], string>;
}

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
  // Upgrades bypass Hono, so apply the same bearer rule as requireAuth() here.
  authorizeUpgrade: orchestrationUpgradeFailure,
  log: (msg) => console.log(`[gateway] ${msg}`),
  logError: (msg, err) => console.error(`[gateway] ${msg}`, err),
});

// ============================================================================
// START
// ============================================================================

export function startServer() {
  if (DURABLE_FACTORY_WORKER_ENABLED && LEGACY_FACTORY_WORKER_ENABLED) {
    throw new Error("Configure exactly one Factory execution worker; legacy and durable workers cannot run together.");
  }
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
  if (factoryHostReporter) {
    void assertHarnessAdaptersReady(factoryHarnessRegistry).then(() => factoryHostReporter.start())
      .then(() => {
        factoryAttemptWorker.start();
        missionPlanningWorker.start();
      })
      .catch((error) => console.error("[orchestration] Factory worker registration failed closed; execution did not start:", error));
  } else if (LEGACY_FACTORY_WORKER_ENABLED) {
    void assertHarnessAdaptersReady(factoryHarnessRegistry)
      .then(() => factoryAttemptWorker.start())
      .catch((error) => console.error("[orchestration] Factory adapter health check failed closed; execution did not start:", error));
  }

  if (CODEX_FACTORY_WORKER_ENABLED) {
    console.log(`[orchestration] Durable verification-first harness worker enabled for one governed repository (${factoryHarnessRegistry.capabilities().map((item) => `${item.adapter}/${item.version}`).join(", ")}).`);
  }
  if (DEEPSEEK_HARNESS_EXECUTOR_ENABLED) {
    console.log("[orchestration] Experimental pinned DeepSeek Harness executor explicitly enabled for local persistent-worker admission.");
  }

  process.on("SIGINT", async () => {
    console.log("\n[orchestration] Shutting down...");
    if (tickTimer) clearInterval(tickTimer);
    factoryHostReporter?.stop();
    await Promise.all([factoryAttemptWorker.stop(), missionPlanningWorker.stop()]);
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
    factoryHostReporter?.stop();
    await Promise.all([factoryAttemptWorker.stop(), missionPlanningWorker.stop()]);
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

function requiredRuntimeSetting(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when a durable Factory harness worker is enabled.`);
  return value;
}

async function assertHarnessAdaptersReady(registry: HarnessAdapterRegistry) {
  const health = await Promise.all(
    registry.registrations().map(async ({ adapter, capabilities, manifest }) => ({
      identity: manifest?.identity ?? { adapterId: capabilities.adapter, adapterVersion: capabilities.version },
      health: await adapter.health(),
    })),
  );
  const unavailable = health.filter(({ health: result }) => result.status !== "READY");
  if (unavailable.length > 0) {
    throw new Error(unavailable.map(({ identity, health: result }) =>
      `${identity.adapterId}/${identity.adapterVersion}: ${result.details ?? result.status}`
    ).join("; "));
  }
}

function boundedPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function commaSeparatedValues(value: string | undefined) {
  const values = value?.split(",").map((item) => item.trim()).filter(Boolean);
  return values?.length ? values : undefined;
}

function parseFactoryVersionBindings(
  value: string | undefined,
  repositoryId: string,
): FactoryHostReporterConfig["factoryVersionBindings"] {
  if (!value?.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON must be valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 32) {
    throw new Error("CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON must contain 1-32 bindings.");
  }
  return parsed.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Every Factory Version worker binding must be an object.");
    }
    const binding = item as Record<string, unknown>;
    if (binding.repositoryId !== repositoryId) {
      throw new Error("Factory Version worker bindings must use CODEX_WORKER_REPOSITORY_ID.");
    }
    return binding as unknown as NonNullable<FactoryHostReporterConfig["factoryVersionBindings"]>[number];
  });
}

function attestationStatus(value: string | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized === "READY" || normalized === "BLOCKED" || normalized === "UNKNOWN"
    ? normalized
    : undefined;
}

function parseGithubPullRequestUrl(value: unknown): { repository: string; prNumber: number } | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const match = url.hostname === "github.com"
      ? url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/)
      : null;
    if (!match) return null;
    const prNumber = Number(match[3]);
    return Number.isSafeInteger(prNumber) && prNumber > 0
      ? { repository: `${match[1]}/${match[2]}`, prNumber }
      : null;
  } catch {
    return null;
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (process.env.ORCHESTRATION_DISABLE_STARTUP !== "1" && entryUrl === import.meta.url) {
  startServer();
}
