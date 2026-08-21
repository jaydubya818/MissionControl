/**
 * OpenClaw Agent Discovery
 *
 * Discover agents from an OpenClaw Gateway and import them into the registry.
 * Gateway URL: canonical source is gatewayConnection table (set in UI Gateway settings);
 * fallback is OPENCLAW_GATEWAY_URL in Convex env. Token: OPENCLAW_GATEWAY_TOKEN or
 * GATEWAY_TOKEN in Convex env (same as orchestration server).
 */

import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export type DiscoveredAgent = {
  id: string;
  name: string;
  alias?: string;
  status?: string;
  capabilities?: string[];
  description?: string;
};

/**
 * Call the OpenClaw Gateway to list running agents.
 * URL: gatewayConnection table (canonical) then OPENCLAW_GATEWAY_URL env.
 * Token: OPENCLAW_GATEWAY_TOKEN or GATEWAY_TOKEN in Convex env.
 * Tries GET {baseUrl}/agents and GET {baseUrl}/api/agents.
 */
export const discoverAgents = action({
  args: {},
  handler: async (ctx): Promise<{ agents: DiscoveredAgent[]; error?: string }> => {
    // Administrator-only: this call attaches the deployment Gateway token to a
    // request built from operator-configured state.
    const conn = await ctx.runQuery(api.gatewayConnection.getAuthorized, {});
    const baseUrl =
      (conn?.url?.trim()) || process.env.OPENCLAW_GATEWAY_URL || "";
    const token =
      process.env.OPENCLAW_GATEWAY_TOKEN?.trim() ||
      process.env.GATEWAY_TOKEN?.trim() ||
      "";

    if (!baseUrl || !baseUrl.startsWith("http")) {
      return {
        agents: [],
        error:
          "Gateway URL is not set. Set it in Mission Control Gateway settings or OPENCLAW_GATEWAY_URL in Convex env (e.g. http://localhost:18789).",
      };
    }

    const url = baseUrl.replace(/\/$/, "");
    const candidates = [`${url}/agents`, `${url}/api/agents`, `${url}/api/v1/agents`];
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    for (const endpoint of candidates) {
      try {
        const res = await fetch(endpoint, { method: "GET", headers });
        if (!res.ok) continue;
        const data = (await res.json()) as unknown;
        const list = Array.isArray(data)
          ? data
          : Array.isArray((data as { agents?: unknown }).agents)
            ? (data as { agents: unknown[] }).agents
            : Array.isArray((data as { data?: unknown }).data)
              ? (data as { data: unknown[] }).data
              : [];
        const agents: DiscoveredAgent[] = list.map((item: any) => ({
          id: String(item.id ?? item.agentId ?? item.name ?? ""),
          name: String(item.name ?? item.id ?? "Unknown"),
          alias: item.alias ? String(item.alias) : undefined,
          status: item.status ? String(item.status) : undefined,
          capabilities: Array.isArray(item.capabilities)
            ? item.capabilities.map(String)
            : Array.isArray(item.allowedTaskTypes)
              ? item.allowedTaskTypes.map(String)
              : undefined,
          description: item.description ? String(item.description) : undefined,
        })).filter((a: DiscoveredAgent) => a.id && a.name);
        return { agents };
      } catch {
        continue;
      }
    }

    return {
      agents: [],
      error: "Gateway did not respond with an agents list. Ensure the gateway exposes GET /agents or GET /api/agents.",
    };
  },
});

/**
 * Import a discovered agent into the Mission Control registry.
 * Creates an agent with metadata.source = OPENCLAW_GATEWAY.
 */
export const importAgent = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    discovered: v.object({
      id: v.string(),
      name: v.string(),
      alias: v.optional(v.string()),
      status: v.optional(v.string()),
      capabilities: v.optional(v.array(v.string())),
      description: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const name = args.discovered.name.trim() || args.discovered.id;
    const workspacePath = `/gateway/agents/${(args.discovered.alias ?? args.discovered.id).replace(/\s+/g, "-").toLowerCase()}`;
    const allowedTaskTypes = args.discovered.capabilities?.length
      ? args.discovered.capabilities
      : ["ENGINEERING", "DOCS", "OPS", "CONTENT"];

    const project = args.projectId ? await ctx.db.get(args.projectId) : null;
    const budgetDaily = 5.0;
    const budgetPerRun = 0.75;

    const agentId = await ctx.db.insert("agents", {
      tenantId: project?.tenantId,
      projectId: args.projectId,
      name,
      role: "SPECIALIST",
      status: "ACTIVE",
      workspacePath,
      allowedTaskTypes,
      budgetDaily,
      budgetPerRun,
      spendToday: 0,
      canSpawn: false,
      maxSubAgents: 0,
      errorStreak: 0,
      lastHeartbeatAt: Date.now(),
      metadata: {
        source: "OPENCLAW_GATEWAY",
        gatewayId: args.discovered.id,
        alias: args.discovered.alias,
        description: args.discovered.description,
      },
    });

    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "SYSTEM",
      action: "AGENT_REGISTERED",
      description: `Agent "${name}" imported from OpenClaw Gateway`,
      targetType: "AGENT",
      targetId: agentId,
      agentId,
    });

    const agent = await ctx.db.get(agentId);
    return { agent, created: true };
  },
});
