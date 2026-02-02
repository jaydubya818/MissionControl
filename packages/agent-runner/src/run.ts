#!/usr/bin/env node
/**
 * Agent runner — register, heartbeat loop, claim tasks, transition.
 * Run from repo root: pnpm --filter @mission-control/agent-runner run
 * Requires: CONVEX_URL, AGENT_NAME, AGENT_ROLE, AGENT_WORKSPACE (optional), AGENT_TYPES (comma-separated)
 */

import { ConvexHttpClient } from "convex/browser";
// @ts-ignore - ESM resolution issue with tsx
import { api } from "../../../convex/_generated/api.js";
// @ts-ignore
import type { Id } from "../../../convex/_generated/dataModel.js";

const CONVEX_URL = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "";
const AGENT_NAME = process.env.AGENT_NAME ?? "Scout";
const AGENT_ROLE = process.env.AGENT_ROLE ?? "INTERN";
const AGENT_WORKSPACE = process.env.AGENT_WORKSPACE ?? `/tmp/mc-agent-${AGENT_NAME.toLowerCase()}`;
const AGENT_TYPES = (process.env.AGENT_TYPES ?? "CUSTOMER_RESEARCH,SEO_RESEARCH").split(",").map((s) => s.trim());
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? "900000", 10); // 15 min default
const PROJECT_SLUG = process.env.PROJECT_SLUG ?? "openclaw"; // Default project

if (!CONVEX_URL) {
  console.error("Set CONVEX_URL or VITE_CONVEX_URL");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

async function getOrRegisterAgent(): Promise<{ agentId: Id<"agents">; projectId: Id<"projects"> }> {
  // Get project by slug
  const project = await client.query(api.projects.getBySlug, { slug: PROJECT_SLUG });
  if (!project) {
    throw new Error(`Project "${PROJECT_SLUG}" not found. Create it first or set PROJECT_SLUG env var.`);
  }
  
  const existing = await client.query(api.agents.getByName, { name: AGENT_NAME });
  if (existing) {
    console.log(`[${AGENT_NAME}] Already registered: ${existing._id} (Project: ${project.name})`);
    return { agentId: existing._id, projectId: project._id };
  }
  
  const result = await client.mutation(api.agents.register, {
    projectId: project._id,
    name: AGENT_NAME,
    role: AGENT_ROLE,
    workspacePath: AGENT_WORKSPACE,
    allowedTaskTypes: AGENT_TYPES,
    emoji: process.env.AGENT_EMOJI,
  });
  const agent = (result as { agent: { _id: Id<"agents"> } }).agent;
  console.log(`[${AGENT_NAME}] Registered: ${agent._id} (Project: ${project.name})`);
  return { agentId: agent._id, projectId: project._id };
}

async function heartbeat(agentId: Id<"agents">) {
  const result = await client.mutation(api.agents.heartbeat, {
    agentId,
    status: "ACTIVE",
  });
  return result as {
    success: boolean;
    pendingTasks: Array<{ _id: Id<"tasks">; title: string; status: string }>;
    claimableTasks: Array<{ _id: Id<"tasks">; title: string; type: string }>;
    pendingNotifications: Array<{ _id: Id<"notifications">; type: string; title: string }>;
    pendingApprovals: unknown[];
  };
}

async function claimTask(agentId: Id<"agents">, taskId: Id<"tasks">) {
  await client.mutation(api.tasks.assign, {
    taskId,
    agentIds: [agentId],
    actorType: "AGENT",
    idempotencyKey: `claim-${taskId}-${Date.now()}`,
  });
  console.log(`[${AGENT_NAME}] Claimed task ${taskId}`);
}

async function startTask(agentId: Id<"agents">, taskId: Id<"tasks">) {
  const bullets = ["1. Review requirements", "2. Gather inputs", "3. Execute and document"];
  await client.mutation(api.messages.postWorkPlan, {
    taskId,
    agentId,
    bullets,
    estimatedCost: 0.25,
    idempotencyKey: `workplan-${taskId}-${Date.now()}`,
  });
  await client.mutation(api.tasks.transition, {
    taskId,
    toStatus: "IN_PROGRESS",
    actorType: "AGENT",
    actorAgentId: agentId,
    idempotencyKey: `start-${taskId}-${Date.now()}`,
    workPlan: { bullets, estimatedCost: 0.25 },
  });
  console.log(`[${AGENT_NAME}] Started task ${taskId}`);
}

async function markNotificationsRead(agentId: Id<"agents">) {
  await client.mutation(api.notifications.markAllReadForAgent, { agentId });
}

async function runLoop(agentId: Id<"agents">) {
  const result = await heartbeat(agentId);
  if (!result.success) return;

  if (result.pendingNotifications?.length) {
    await markNotificationsRead(agentId);
    console.log(`[${AGENT_NAME}] Cleared ${result.pendingNotifications.length} notification(s)`);
  }

  const pending = result.pendingTasks ?? [];
  const claimable = result.claimableTasks ?? [];

  if (pending.length > 0) {
    const task = pending[0];
    if (task.status === "ASSIGNED") {
      await startTask(agentId, task._id);
      return;
    }
  }

  if (claimable.length > 0) {
    await claimTask(agentId, claimable[0]._id);
    return;
  }

  if (pending.length === 0 && claimable.length === 0 && (!result.pendingNotifications || result.pendingNotifications.length === 0)) {
    console.log(`[${AGENT_NAME}] HEARTBEAT_OK — No pending tasks or notifications. Standing by.`);
  }
}

async function main() {
  const { agentId, projectId } = await getOrRegisterAgent();
  console.log(`[${AGENT_NAME}] Heartbeat every ${HEARTBEAT_INTERVAL_MS / 1000}s`);
  console.log(`[${AGENT_NAME}] Project: ${PROJECT_SLUG} (${projectId})`);

  const tick = () => runLoop(agentId).catch((e) => console.error(`[${AGENT_NAME}]`, e));
  await tick();
  setInterval(tick, HEARTBEAT_INTERVAL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
