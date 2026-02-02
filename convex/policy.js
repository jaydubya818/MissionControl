"use strict";
/**
 * Policy — Convex Functions
 *
 * Policy evaluation for tool calls and transitions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.create = exports.evaluate = exports.listAll = exports.getActive = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
// ============================================================================
// ALLOWLIST HELPERS
// ============================================================================
function checkAllowlists(toolName, toolArgs, policy) {
    // Shell command validation
    if (toolName === "shell" || toolName === "exec" || toolName === "bash") {
        const command = toolArgs.command || toolArgs.cmd || "";
        return checkShellAllowlist(command, policy);
    }
    // Network validation
    if (toolName === "web_fetch" || toolName === "http" || toolName === "fetch") {
        const url = toolArgs.url || "";
        return checkNetworkAllowlist(url, policy);
    }
    // File read validation
    if (toolName === "read" || toolName === "read_file") {
        const path = toolArgs.path || "";
        return checkFileReadAllowlist(path, policy);
    }
    // File write validation
    if (toolName === "write" || toolName === "write_file" || toolName === "edit") {
        const path = toolArgs.path || "";
        return checkFileWriteAllowlist(path, policy);
    }
    // No allowlist check needed for this tool
    return { allowed: true };
}
function checkShellAllowlist(command, policy) {
    const cmd = command.trim().toLowerCase();
    const blocklist = policy.shellBlocklist || [];
    const allowlist = policy.shellAllowlist || [];
    // Check blocklist first
    for (const blocked of blocklist) {
        if (cmd.includes(blocked.toLowerCase())) {
            return {
                allowed: false,
                reason: `Command contains blocked pattern: ${blocked}`,
            };
        }
    }
    // If allowlist is empty, allow all (permissive mode)
    if (allowlist.length === 0) {
        return { allowed: true };
    }
    // Check allowlist
    for (const allowed of allowlist) {
        if (cmd.startsWith(allowed.toLowerCase())) {
            return { allowed: true };
        }
    }
    return {
        allowed: false,
        reason: "Command not in allowlist",
    };
}
function checkNetworkAllowlist(url, policy) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const allowlist = policy.networkAllowlist || [];
        // If allowlist is empty, allow all (permissive mode)
        if (allowlist.length === 0) {
            return { allowed: true };
        }
        // Check allowlist
        for (const allowed of allowlist) {
            if (hostname === allowed.toLowerCase() || hostname.endsWith(`.${allowed.toLowerCase()}`)) {
                return { allowed: true };
            }
        }
        return {
            allowed: false,
            reason: `Domain ${hostname} not in allowlist`,
        };
    }
    catch (error) {
        return {
            allowed: false,
            reason: "Invalid URL",
        };
    }
}
function checkFileReadAllowlist(path, policy) {
    const normalizedPath = path.trim().toLowerCase();
    const allowlist = policy.fileReadPaths || [];
    // If allowlist is empty, allow all (permissive mode)
    if (allowlist.length === 0) {
        return { allowed: true };
    }
    // Check allowlist (glob patterns)
    for (const pattern of allowlist) {
        if (matchesGlob(normalizedPath, pattern.toLowerCase())) {
            return { allowed: true };
        }
    }
    return {
        allowed: false,
        reason: `Path ${path} not in read allowlist`,
    };
}
function checkFileWriteAllowlist(path, policy) {
    const normalizedPath = path.trim().toLowerCase();
    const allowlist = policy.fileWritePaths || [];
    // If allowlist is empty, allow all (permissive mode)
    if (allowlist.length === 0) {
        return { allowed: true };
    }
    // Check allowlist (glob patterns)
    for (const pattern of allowlist) {
        if (matchesGlob(normalizedPath, pattern.toLowerCase())) {
            return { allowed: true };
        }
    }
    return {
        allowed: false,
        reason: `Path ${path} not in write allowlist`,
    };
}
function matchesGlob(path, pattern) {
    // Convert glob pattern to regex
    const regexPattern = pattern
        .replace(/\*\*/g, ".*") // ** matches any path
        .replace(/\*/g, "[^/]*") // * matches any filename
        .replace(/\./g, "\\."); // Escape dots
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
}
// ============================================================================
// QUERIES
// ============================================================================
exports.getActive = (0, server_1.query)({
    args: {},
    handler: async (ctx) => {
        return await ctx.db
            .query("policies")
            .withIndex("by_active", (q) => q.eq("active", true))
            .first();
    },
});
exports.listAll = (0, server_1.query)({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("policies").order("desc").collect();
    },
});
// ============================================================================
// POLICY EVALUATION
// ============================================================================
exports.evaluate = (0, server_1.query)({
    args: {
        agentId: values_1.v.id("agents"),
        actionType: values_1.v.string(), // "TOOL_CALL" | "TRANSITION" | "SPAWN"
        toolName: values_1.v.optional(values_1.v.string()),
        toolArgs: values_1.v.optional(values_1.v.any()),
        transitionTo: values_1.v.optional(values_1.v.string()),
        estimatedCost: values_1.v.optional(values_1.v.number()),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: async (ctx, args) => {
        // Get active policy
        const policy = await ctx.db
            .query("policies")
            .withIndex("by_active", (q) => q.eq("active", true))
            .first();
        if (!policy) {
            return {
                decision: "ALLOW",
                reason: "No active policy found, allowing by default"
            };
        }
        // Get agent
        const agent = await ctx.db.get(args.agentId);
        if (!agent) {
            return {
                decision: "DENY",
                reason: "Agent not found"
            };
        }
        // Check agent status
        if (agent.status === "QUARANTINED") {
            return {
                decision: "DENY",
                reason: "Agent is quarantined"
            };
        }
        if (agent.status === "PAUSED" || agent.status === "DRAINED" || agent.status === "OFFLINE") {
            return {
                decision: "DENY",
                reason: `Agent is ${agent.status.toLowerCase()}`
            };
        }
        // Check budget
        const budgetRemaining = agent.budgetDaily - agent.spendToday;
        const estimatedCost = args.estimatedCost ?? 0;
        if (estimatedCost > budgetRemaining) {
            return {
                decision: "NEEDS_APPROVAL",
                reason: `Budget exceeded: need $${estimatedCost.toFixed(2)}, have $${budgetRemaining.toFixed(2)} remaining`,
                approval: {
                    type: "BUDGET_EXCEEDED",
                    estimatedCost,
                    budgetRemaining,
                },
            };
        }
        // TOOL_CALL evaluation
        if (args.actionType === "TOOL_CALL" && args.toolName) {
            const toolRiskMap = (policy.toolRiskMap || {});
            const risk = toolRiskMap[args.toolName] || "GREEN";
            // Check allowlists for specific tools
            if (args.toolArgs) {
                const allowlistCheck = checkAllowlists(args.toolName, args.toolArgs, policy);
                if (!allowlistCheck.allowed) {
                    return {
                        decision: "DENY",
                        reason: allowlistCheck.reason || "Action blocked by allowlist",
                        riskLevel: "RED",
                    };
                }
            }
            if (risk === "RED") {
                // RED tools always require approval
                return {
                    decision: "NEEDS_APPROVAL",
                    reason: `Tool '${args.toolName}' is RED-rated and requires approval`,
                    riskLevel: "RED",
                    approval: {
                        type: "RED_TOOL",
                        toolName: args.toolName,
                    },
                };
            }
            if (risk === "YELLOW" && agent.role === "INTERN") {
                // YELLOW tools require approval for INTERN
                return {
                    decision: "NEEDS_APPROVAL",
                    reason: `Tool '${args.toolName}' is YELLOW-rated and requires approval for INTERN role`,
                    riskLevel: "YELLOW",
                    approval: {
                        type: "YELLOW_TOOL_INTERN",
                        toolName: args.toolName,
                    },
                };
            }
            return {
                decision: "ALLOW",
                reason: `Tool '${args.toolName}' is ${risk}-rated, allowed for ${agent.role}`,
                riskLevel: risk,
            };
        }
        // TRANSITION evaluation
        if (args.actionType === "TRANSITION" && args.transitionTo === "DONE") {
            const rules = policy.rules;
            if (rules?.reviewToDoneRequiresHuman) {
                return {
                    decision: "NEEDS_APPROVAL",
                    reason: "REVIEW → DONE requires human approval",
                    approval: {
                        type: "TRANSITION_TO_DONE",
                    },
                };
            }
        }
        // SPAWN evaluation
        if (args.actionType === "SPAWN") {
            if (!agent.canSpawn) {
                return {
                    decision: "DENY",
                    reason: "Agent is not allowed to spawn sub-agents",
                };
            }
            const spawnLimits = policy.spawnLimits;
            if (spawnLimits) {
                // Check global active count
                const activeAgents = await ctx.db
                    .query("agents")
                    .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
                    .collect();
                if (activeAgents.length >= (spawnLimits.maxGlobalActive || 30)) {
                    return {
                        decision: "DENY",
                        reason: `Global agent limit reached (${activeAgents.length}/${spawnLimits.maxGlobalActive})`,
                    };
                }
                // Check per-parent count
                const childAgents = await ctx.db
                    .query("agents")
                    .filter((q) => q.eq(q.field("parentAgentId"), args.agentId))
                    .collect();
                if (childAgents.length >= (agent.maxSubAgents || spawnLimits.maxPerParent || 3)) {
                    return {
                        decision: "DENY",
                        reason: `Agent has reached sub-agent limit (${childAgents.length}/${agent.maxSubAgents})`,
                    };
                }
            }
            return {
                decision: "ALLOW",
                reason: "Spawn allowed",
            };
        }
        // Default allow
        return {
            decision: "ALLOW",
            reason: "No policy rules triggered",
        };
    },
});
// ============================================================================
// MUTATIONS
// ============================================================================
exports.create = (0, server_1.mutation)({
    args: {
        name: values_1.v.string(),
        scopeType: values_1.v.string(),
        scopeId: values_1.v.optional(values_1.v.string()),
        rules: values_1.v.any(),
        toolRiskMap: values_1.v.optional(values_1.v.any()),
        budgetDefaults: values_1.v.optional(values_1.v.any()),
        spawnLimits: values_1.v.optional(values_1.v.any()),
        loopThresholds: values_1.v.optional(values_1.v.any()),
        notes: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        // Get next version
        const existing = await ctx.db
            .query("policies")
            .withIndex("by_name", (q) => q.eq("name", args.name))
            .order("desc")
            .first();
        const version = existing ? existing.version + 1 : 1;
        // Deactivate old policies with same name
        if (existing) {
            await ctx.db.patch(existing._id, { active: false });
        }
        const policyId = await ctx.db.insert("policies", {
            version,
            name: args.name,
            scopeType: args.scopeType,
            scopeId: args.scopeId,
            rules: args.rules,
            toolRiskMap: args.toolRiskMap,
            budgetDefaults: args.budgetDefaults,
            spawnLimits: args.spawnLimits,
            loopThresholds: args.loopThresholds,
            active: true,
            notes: args.notes,
        });
        return { policy: await ctx.db.get(policyId) };
    },
});
exports.deactivate = (0, server_1.mutation)({
    args: { policyId: values_1.v.id("policies") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.policyId, { active: false });
        return { success: true };
    },
});
