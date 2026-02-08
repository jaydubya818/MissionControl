/**
 * Policy — Convex Functions
 * 
 * Policy evaluation for tool calls and transitions.
 * Uses centralized risk classifier from convex/lib/riskClassifier.ts
 * (mirrors @mission-control/policy-engine logic).
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { classifyRisk, requiresApproval } from "./lib/riskClassifier";

// ============================================================================
// ALLOWLIST HELPERS
// ============================================================================

function checkAllowlists(
  toolName: string,
  toolArgs: any,
  policy: Doc<"policies">
): { allowed: boolean; reason?: string } {
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

function checkShellAllowlist(
  command: string,
  policy: Doc<"policies">
): { allowed: boolean; reason?: string } {
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

function checkNetworkAllowlist(
  url: string,
  policy: Doc<"policies">
): { allowed: boolean; reason?: string } {
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
  } catch (error) {
    return {
      allowed: false,
      reason: "Invalid URL",
    };
  }
}

function checkFileReadAllowlist(
  path: string,
  policy: Doc<"policies">
): { allowed: boolean; reason?: string } {
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

function checkFileWriteAllowlist(
  path: string,
  policy: Doc<"policies">
): { allowed: boolean; reason?: string } {
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

function matchesGlob(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*\*/g, ".*") // ** matches any path
    .replace(/\*/g, "[^/]*") // * matches any filename
    .replace(/\./g, "\\."); // Escape dots
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

function getTaskTypeRiskLevel(taskType: string): "GREEN" | "YELLOW" | "RED" {
  // Conservative defaults for task-level preview when no specific tool call is provided.
  if (taskType === "SOCIAL" || taskType === "EMAIL_MARKETING") {
    return "RED";
  }
  if (taskType === "OPS" || taskType === "ENGINEERING") {
    return "YELLOW";
  }
  return "GREEN";
}

// ============================================================================
// QUERIES
// ============================================================================

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("policies")
      .withIndex("by_active", (q) => q.eq("active", true))
      .first();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("policies").order("desc").collect();
  },
});

/**
 * Explain policy outcome for a task without executing anything.
 * Used by the "Why" panel and dry-run flows.
 */
export const explainTaskPolicy = query({
  args: {
    taskId: v.id("tasks"),
    plannedTransitionTo: v.optional(v.string()),
    plannedToolName: v.optional(v.string()),
    plannedToolArgs: v.optional(v.any()),
    estimatedCost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return {
        taskId: args.taskId,
        taskStatus: "NOT_FOUND" as const,
        assignee: null,
        decision: "DENY" as const,
        riskLevel: "RED" as const,
        reason: "Task not found",
        triggeredRules: ["task_not_found"],
        requiredApprovals: [],
        remediationHints: ["Verify the task ID and retry."],
        evaluatedAt: Date.now(),
      };
    }

    const policy = await ctx.db
      .query("policies")
      .withIndex("by_active", (q) => q.eq("active", true))
      .first();

    const primaryAssigneeId = task.assigneeIds?.[0];
    const assignee = primaryAssigneeId ? await ctx.db.get(primaryAssigneeId) : null;

    const triggeredRules: string[] = [];
    const requiredApprovals: Array<{ type: string; reason: string }> = [];
    const remediationHints: string[] = [];

    let decision: "ALLOW" | "NEEDS_APPROVAL" | "DENY" = "ALLOW";
    let reason = "No blocking policy rules triggered";
    let riskLevel: "GREEN" | "YELLOW" | "RED" = args.plannedToolName
      ? classifyRisk(args.plannedToolName, args.plannedToolArgs as Record<string, unknown> | undefined)
      : getTaskTypeRiskLevel(task.type);

    if (args.plannedToolName) {
      triggeredRules.push(`tool_risk:${args.plannedToolName}:${riskLevel}`);
    } else {
      triggeredRules.push(`task_type_risk:${task.type}:${riskLevel}`);
    }

    if (!assignee) {
      triggeredRules.push("task_unassigned");
      decision = "NEEDS_APPROVAL";
      reason = "Task has no assignee; operator confirmation required before execution";
      remediationHints.push("Assign an active agent to the task.");
      remediationHints.push("Use dry run again after assignment.");
    } else {
      if (assignee.status !== "ACTIVE") {
        triggeredRules.push(`assignee_not_active:${assignee.status}`);
        decision = "DENY";
        reason = `Assignee ${assignee.name} is ${assignee.status.toLowerCase()}`;
        remediationHints.push("Activate the assignee or reassign this task.");
      }

      const estimatedCost = args.estimatedCost ?? task.estimatedCost ?? 0;
      const budgetRemaining = assignee.budgetDaily - assignee.spendToday;
      if (estimatedCost > budgetRemaining) {
        triggeredRules.push("budget_exceeded");
        // Only escalate to NEEDS_APPROVAL if we haven't already DENY'd
        if (decision !== "DENY") {
          decision = "NEEDS_APPROVAL";
          reason = `Estimated cost ($${estimatedCost.toFixed(2)}) exceeds remaining agent budget ($${budgetRemaining.toFixed(2)})`;
        }
        requiredApprovals.push({
          type: "BUDGET_EXCEEDED",
          reason: "Budget overrun requires human approval",
        });
        remediationHints.push("Lower scope/cost or approve budget overrun.");
      }

      const approvalCheck = requiresApproval(
        riskLevel,
        assignee.role,
        estimatedCost,
        budgetRemaining
      );

      if (approvalCheck.required) {
        triggeredRules.push(`approval_required:${riskLevel}`);
        decision = "NEEDS_APPROVAL";
        reason = approvalCheck.reason;
        requiredApprovals.push({
          type: riskLevel === "RED" ? "RED_ACTION" : "RISK_ESCALATION",
          reason: approvalCheck.reason,
        });
      }
    }

    if (policy && args.plannedToolName && args.plannedToolArgs) {
      const allowlistCheck = checkAllowlists(
        args.plannedToolName,
        args.plannedToolArgs,
        policy
      );
      if (!allowlistCheck.allowed) {
        triggeredRules.push("allowlist_block");
        decision = "DENY";
        reason = allowlistCheck.reason || "Blocked by allowlist";
        riskLevel = "RED";
        remediationHints.push("Adjust tool args to match policy allowlists.");
      }
    }

    if (policy && args.plannedTransitionTo === "DONE") {
      const rules = policy.rules as Record<string, unknown> | undefined;
      if (rules?.reviewToDoneRequiresHuman === true) {
        triggeredRules.push("review_to_done_requires_human");
        // Only escalate to NEEDS_APPROVAL if we haven't already DENY'd
        if (decision !== "DENY") {
          decision = "NEEDS_APPROVAL";
          reason = "REVIEW -> DONE requires human approval by policy";
        }
        requiredApprovals.push({
          type: "TRANSITION_TO_DONE",
          reason: "Policy requires human review before completion",
        });
      }
    }

    if (decision === "ALLOW") {
      remediationHints.push("No remediation needed. Safe to proceed.");
    } else if (decision === "NEEDS_APPROVAL" && requiredApprovals.length === 0) {
      requiredApprovals.push({
        type: "OPERATOR_CONFIRMATION",
        reason: "Operator confirmation required",
      });
    }

    return {
      taskId: task._id,
      taskStatus: task.status,
      assignee: assignee
        ? { id: assignee._id, name: assignee.name, role: assignee.role, status: assignee.status }
        : null,
      decision,
      riskLevel,
      reason,
      triggeredRules,
      requiredApprovals,
      remediationHints,
      evaluatedAt: Date.now(),
    };
  },
});

// ============================================================================
// POLICY EVALUATION
// ============================================================================

export const evaluate = query({
  args: {
    agentId: v.id("agents"),
    actionType: v.string(), // "TOOL_CALL" | "TRANSITION" | "SPAWN"
    toolName: v.optional(v.string()),
    toolArgs: v.optional(v.any()),
    transitionTo: v.optional(v.string()),
    estimatedCost: v.optional(v.number()),
    metadata: v.optional(v.any()),
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
    
    // TOOL_CALL evaluation — uses centralized risk classifier
    if (args.actionType === "TOOL_CALL" && args.toolName) {
      // Classify risk using the centralized classifier
      const risk = classifyRisk(args.toolName, args.toolArgs as Record<string, unknown> | undefined);
      
      // Check allowlists for specific tools
      if (args.toolArgs) {
        const allowlistCheck = checkAllowlists(
          args.toolName,
          args.toolArgs,
          policy
        );
        
        if (!allowlistCheck.allowed) {
          return {
            decision: "DENY",
            reason: allowlistCheck.reason || "Action blocked by allowlist",
            riskLevel: "RED",
          };
        }
      }
      
      // Check approval requirement using centralized rules
      const approvalCheck = requiresApproval(
        risk,
        agent.role,
        estimatedCost,
        budgetRemaining
      );
      
      if (approvalCheck.required) {
        return {
          decision: "NEEDS_APPROVAL",
          reason: approvalCheck.reason,
          riskLevel: risk,
          approval: {
            type: risk === "RED" ? "RED_TOOL" : "YELLOW_TOOL_INTERN",
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
      const rules = policy.rules as any;
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
      
      const spawnLimits = policy.spawnLimits as any;
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

export const create = mutation({
  args: {
    name: v.string(),
    scopeType: v.string(),
    scopeId: v.optional(v.string()),
    rules: v.any(),
    toolRiskMap: v.optional(v.any()),
    budgetDefaults: v.optional(v.any()),
    spawnLimits: v.optional(v.any()),
    loopThresholds: v.optional(v.any()),
    notes: v.optional(v.string()),
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
      scopeType: args.scopeType as any,
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

export const deactivate = mutation({
  args: { policyId: v.id("policies") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.policyId, { active: false });
    return { success: true };
  },
});
